import { getQuery, type H3Event } from 'h3'
import { queryK3SqlServer, sqlBigIntParameter, sqlStringParameter } from './sqlserver'
import { getAuthSession } from './auth'
import { apiError, apiSuccess } from './response'

export interface K3MaterialSelection {
  id: number
  number: string
  name: string
  spec: string
  packageName: string
  minPackCount: number | null
}

export function extractK3PackageName(specification: unknown): string {
  const spec = String(specification || '').trim()
  if (!spec) return ''
  if (spec.startsWith('LL-34')) return 'LL-34'
  if (spec.startsWith('LL-41')) return 'LL-41'
  const slashIndex = spec.search(/[\/／]/)
  if (slashIndex > 0) {
    return spec.slice(0, slashIndex).trim()
  }
  return spec
}

function mapMaterial(row: any): K3MaterialSelection {
  const spec = String(row.spec || '')
  return {
    id: Number(row.id),
    number: String(row.number || ''),
    name: String(row.name || ''),
    spec,
    packageName: extractK3PackageName(spec),
    minPackCount: Number(row.minPackCount) > 0 ? Number(row.minPackCount) : null,
  }
}

export async function resolveMaterialById(materialId: number): Promise<K3MaterialSelection | null> {
  if (!Number.isSafeInteger(materialId) || materialId <= 0) return null
  const rows = await queryK3SqlServer(async (request) => {
    sqlBigIntParameter(request, 'materialId', materialId)
    return request.query(`
      SELECT TOP 1 m.FMATERIALID AS id, m.FNUMBER AS number, l.FNAME AS name, l.FSPECIFICATION AS spec, p.FMINPACKCOUNT AS minPackCount
      FROM T_BD_MATERIAL m
      JOIN T_BD_MATERIAL_L l ON l.FMATERIALID = m.FMATERIALID AND l.FLOCALEID = 2052
      LEFT JOIN T_BD_MATERIALPURCHASE p ON p.FMATERIALID = m.FMATERIALID
      WHERE m.FMATERIALID = @materialId
        AND m.FDOCUMENTSTATUS = 'C'
        AND m.FFORBIDSTATUS = 'A'
        AND m.FNUMBER LIKE 'N%'
    `)
  })
  return rows[0] ? mapMaterial(rows[0]) : null
}

export async function listMaterialOptions(event: H3Event) {
  const session = await getAuthSession(event)
  if (!session) return apiSuccess([])
  const query = getQuery(event) as Record<string, unknown>
  const keyword = String(query.keyword || query.q || '').trim().slice(0, 50)
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 100)
  let rows: any[] = []
  try {
    rows = await queryK3SqlServer(async (request) => {
      sqlStringParameter(request, 'kw', keyword)
      sqlStringParameter(request, 'kwLike', `%${keyword.replace(/[%_]/g, '')}%`)
      request.input('limit', (await import('mssql')).default.Int, limit)
      const sql = `
        WITH FinishedGroups AS (
          SELECT g.FID
          FROM T_BD_MATERIALGROUP g
          WHERE (g.FPARENTID = 0 OR g.FPARENTID IS NULL)
            AND g.FNUMBER IN ('A', 'B', 'D')
          UNION ALL
          SELECT c.FID
          FROM T_BD_MATERIALGROUP c
          INNER JOIN FinishedGroups p ON c.FPARENTID = p.FID
        )
        SELECT TOP (@limit) m.FMATERIALID AS id, m.FNUMBER AS number, l.FNAME AS name, l.FSPECIFICATION AS spec, p.FMINPACKCOUNT AS minPackCount
        FROM T_BD_MATERIAL m
        JOIN T_BD_MATERIAL_L l ON l.FMATERIALID = m.FMATERIALID AND l.FLOCALEID = 2052
        LEFT JOIN T_BD_MATERIALPURCHASE p ON p.FMATERIALID = m.FMATERIALID
        JOIN FinishedGroups fg ON fg.FID = m.FMATERIALGROUP
        WHERE m.FDOCUMENTSTATUS = 'C' AND m.FFORBIDSTATUS = 'A'
          AND m.FNUMBER LIKE 'N%'
          AND (@kw = '' OR m.FNUMBER LIKE @kwLike OR l.FNAME LIKE @kwLike OR l.FSPECIFICATION LIKE @kwLike)
        ORDER BY
          CASE
            WHEN @kw = '' THEN 9
            WHEN l.FNAME = @kw THEN 0
            WHEN l.FNAME LIKE @kw + '%' THEN 1
            WHEN l.FNAME LIKE '%' + @kw + '%' THEN 2
            WHEN l.FSPECIFICATION = @kw THEN 3
            WHEN l.FSPECIFICATION LIKE @kw + '%' THEN 4
            WHEN l.FSPECIFICATION LIKE '%' + @kw + '%' THEN 5
            WHEN m.FNUMBER = @kw THEN 6
            WHEN m.FNUMBER LIKE @kw + '%' THEN 7
            WHEN m.FNUMBER LIKE '%' + @kw + '%' THEN 8
            ELSE 9
          END,
          m.FNUMBER
      `
      return request.query(sql)
    })
  } catch (sqlError) {
    const sqlKind = typeof sqlError === 'object' && sqlError !== null && 'kind' in sqlError
      ? String((sqlError as { kind: unknown }).kind)
      : 'unknown'
    console.error('[MaterialOptions] SQL Server lookup failed', { kind: sqlKind })
    return apiError('物料数据库暂时无法查询，请稍后重试或联系管理员检查 SQL Server 连接', 502)
  }

  const mapped = (rows || []).map((row: any) => {
    const material = mapMaterial(row)
    return {
      value: material.number,
      id: material.id,
      label: `${material.number} ${material.name}`.trim(),
      name: material.name,
      spec: material.spec,
      number: material.number,
      packageName: material.packageName,
      minPackCount: material.minPackCount,
      ctkMpn: material.name || material.number,
    }
  }).filter((r: any) => r.value && String(r.number || '').toUpperCase().startsWith('N'))
  return apiSuccess(mapped)
}
