import { errorMessage } from './response'
import { loadMssql } from './lazy-deps'
import { withK3SqlServerTransaction, queryK3SqlServer, sqlBigIntParameter } from './sqlserver'
import { getMysqlPool, mysqlQueryOptions } from './mysql'

/**
 * 金蝶安全库存写入（修改安全库存 / 移除预警），口径还原自退役 Java
 * KucunWarningUtil.updateMaterialSafeStock / disableMaterialSafeStockWarning：
 *
 * - 老账套 WebAPI Save 对 FSafeStock 会「成功但不落库」，因此与 Java 一致走
 *   金蝶 SQL Server 直连 UPDATE，再以 SQL 查询回读校验（非 WebAPI）。
 * - 前置校验：物料必须已审核（FDOCUMENTSTATUS='C'）且未禁用（FFORBIDSTATUS='A'）。
 * - 修改安全库存：UPDATE FSAFESTOCK=@v, FISENABLESAFESTOCK='1'，回读必须等于期望值。
 * - 移除预警：UPDATE FISENABLESAFESTOCK='0'，回读必须为 0；随后删除本地快照行。
 * - 两者都只按 FMATERIALID 更新（T_BD_MATERIALSTOCK 每物料一行，与 Java 一致）。
 */

export interface K3MaterialInfo {
  materialId: number
  number: string
  orgNumber: string
  documentStatus: string
  forbidStatus: string
  safeStock: number
  enableSafeStock: boolean
}

function num(value: unknown): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

async function fetchMaterial(materialCode: string, stockOrgCode: string): Promise<K3MaterialInfo> {
  const code = materialCode.trim().replaceAll("'", "''")
  const org = stockOrgCode.trim().replaceAll("'", "''")
  const rows = await queryK3SqlServer((request) => request.query(`
    SELECT TOP 1
      m.FMATERIALID,
      m.FNUMBER,
      m.FDOCUMENTSTATUS,
      m.FFORBIDSTATUS,
      ISNULL(ms.FSAFESTOCK, 0) AS FSAFESTOCK,
      ISNULL(ms.FISENABLESAFESTOCK, '0') AS FISENABLESAFESTOCK,
      o.FNUMBER AS ORGNUMBER
    FROM T_BD_MATERIAL m
    LEFT JOIN T_BD_MATERIALSTOCK ms ON ms.FMATERIALID = m.FMATERIALID
    LEFT JOIN T_ORG_ORGANIZATIONS o ON o.FORGID = ms.FUSEORGID
    WHERE m.FNUMBER = '${code}' AND o.FNUMBER = '${org}'
  `))
  const row = rows[0]
  if (!row || !row.FMATERIALID) throw new Error(`金蝶未找到物料 ${materialCode}（组织 ${stockOrgCode}）`)
  return {
    materialId: Number(row.FMATERIALID),
    number: String(row.FNUMBER || ''),
    orgNumber: String(row.ORGNUMBER || ''),
    documentStatus: String(row.FDOCUMENTSTATUS || ''),
    forbidStatus: String(row.FFORBIDSTATUS || ''),
    safeStock: num(row.FSAFESTOCK),
    enableSafeStock: String(row.FISENABLESAFESTOCK).trim() === '1',
  }
}

async function readBack(materialId: number): Promise<{ safeStock: number; enableSafeStock: boolean }> {
  const rows = await queryK3SqlServer((request) => {
    sqlBigIntParameter(request, 'materialId', materialId)
    return request.query(`
      SELECT ISNULL(FSAFESTOCK, 0) AS FSAFESTOCK, ISNULL(FISENABLESAFESTOCK, '0') AS FISENABLESAFESTOCK
      FROM T_BD_MATERIALSTOCK WHERE FMATERIALID = @materialId
    `)
  })
  const row = rows[0]
  if (!row) throw new Error('保存后无法回读金蝶库存子表')
  return { safeStock: num(row.FSAFESTOCK), enableSafeStock: String(row.FISENABLESAFESTOCK).trim() === '1' }
}

function assertWritable(info: K3MaterialInfo, materialCode: string, stockOrgCode: string): void {
  if (info.documentStatus !== 'C') throw new Error(`物料 ${materialCode} 未审核，无法修改安全库存`)
  if (info.forbidStatus !== 'A') throw new Error(`物料 ${materialCode} 已禁用，无法修改安全库存`)
  if (!info.materialId) throw new Error(`物料内码无效（${materialCode} / ${stockOrgCode}）`)
}

/** 修改安全库存：写金蝶 + 回读校验 + 更新本地快照行。返回回读到的最终值。 */
export async function updateMaterialSafeStock(
  materialCode: string,
  stockOrgCode: string,
  safeStock: number,
): Promise<{ materialId: number; safeStock: number; warningStatus: string; actualTotal: number }> {
  if (!materialCode?.trim()) throw new Error('物料编码不能为空')
  if (!stockOrgCode?.trim()) throw new Error('库存组织不能为空')
  if (!Number.isFinite(safeStock) || safeStock < 0) throw new Error('安全库存不能为负数')

  const info = await fetchMaterial(materialCode, stockOrgCode)
  assertWritable(info, materialCode, stockOrgCode)

  await withK3SqlServerTransaction(async (transaction) => {
    const sql = await loadMssql()
    const request = transaction.request()
    request.input('safeStock', sql.Decimal(18, 6), safeStock)
    sqlBigIntParameter(request, 'materialId', info.materialId)
    const result = await request.query(`
      UPDATE T_BD_MATERIALSTOCK
      SET FSAFESTOCK = @safeStock, FISENABLESAFESTOCK = '1'
      WHERE FMATERIALID = @materialId
    `)
    if (Number(result?.rowsAffected?.[0] ?? 0) <= 0) {
      throw new Error(`金蝶库存子表无记录，无法写入安全库存（物料内码 ${info.materialId}）`)
    }
  })

  const back = await readBack(info.materialId)
  if (Math.abs(back.safeStock - safeStock) > 0.000001 || !back.enableSafeStock) {
    throw new Error(`金蝶安全库存未更新成功，当前值=${back.safeStock}，期望=${safeStock}（请关闭金蝶中已打开的该物料资料后重试）`)
  }

  // 同步本地快照行（无行不影响金蝶已写入）
  let actualTotal = 0
  try {
    const pool = getMysqlPool()
    const [result] = await pool.query<Record<string, unknown>[]>(
      mysqlQueryOptions('SELECT actual_total FROM kucun_warning WHERE material_code = ? AND stock_org_code = ? LIMIT 1'),
      [materialCode, stockOrgCode],
    )
    // mysql2 返回 [rows, fields]；mock/某些驱动可能只返回 [result] 单层
    const rows = Array.isArray(result) ? result : []
    actualTotal = num(rows[0]?.actual_total)
    const status = actualTotal < safeStock ? '低于安全库存 (偏低)' : '正常'
    await pool.query(
      mysqlQueryOptions(
        'UPDATE kucun_warning SET safe_stock = ?, safe_warning_enabled = 1, warning_status = ?, sync_time = NOW() WHERE material_code = ? AND stock_org_code = ?',
      ),
      [safeStock, status, materialCode, stockOrgCode],
    )
    return { materialId: info.materialId, safeStock, warningStatus: status, actualTotal }
  } catch (localError) {
    // 本地快照更新失败不回滚金蝶（金蝶是主账），只带上实际值
    console.error('[kucunWarningWrite] local snapshot update failed:', errorMessage(localError, '本地快照更新失败'))
    return { materialId: info.materialId, safeStock, warningStatus: '', actualTotal }
  }
}

/** 移除预警：关闭金蝶安全库存预警开关（回读必须为 0），并删除本地快照行。 */
export async function disableMaterialSafeStockWarning(
  materialCode: string,
  stockOrgCode: string,
): Promise<{ materialId: number; localDeleted: boolean }> {
  if (!materialCode?.trim()) throw new Error('物料编码不能为空')
  if (!stockOrgCode?.trim()) throw new Error('库存组织不能为空')

  const info = await fetchMaterial(materialCode, stockOrgCode)
  assertWritable(info, materialCode, stockOrgCode)

  await withK3SqlServerTransaction(async (transaction) => {
    const request = transaction.request()
    sqlBigIntParameter(request, 'materialId', info.materialId)
    const result = await request.query(`
      UPDATE T_BD_MATERIALSTOCK
      SET FISENABLESAFESTOCK = '0'
      WHERE FMATERIALID = @materialId
    `)
    if (Number(result?.rowsAffected?.[0] ?? 0) <= 0) {
      throw new Error(`金蝶库存子表无记录，无法关闭安全库存预警（物料内码 ${info.materialId}）`)
    }
  })

  const back = await readBack(info.materialId)
  if (back.enableSafeStock) throw new Error('金蝶安全库存预警开关未关闭成功')

  const pool = getMysqlPool()
  const [result] = await pool.query<any>(
    mysqlQueryOptions('DELETE FROM kucun_warning WHERE material_code = ? AND stock_org_code = ?'),
    [materialCode, stockOrgCode],
  )
  // mysql2 返回 [ResultSetHeader, fields]；mock 返回 [{affectedRows}] 时解构 result 即 header
  const header = Array.isArray(result) ? result[0] : result
  const affected = Number(header?.affectedRows ?? 0)
  return { materialId: info.materialId, localDeleted: affected > 0 }
}

/**
 * 新增/开启物料预警：任意已审核未禁用的金蝶物料，设安全库存并开启预警开关。
 * 与修改安全库存同一条 UPDATE（本账套所有已审核物料都有库存子表行，无需 INSERT）；
 * 写金蝶成功后按「可参与预警即时库存」口径算出即时库存，UPSERT 本地快照行让物料立即出现在列表。
 */
export async function enableMaterialSafeStockWarning(
  materialCode: string,
  stockOrgCode: string,
  safeStock: number,
): Promise<{ materialId: number; safeStock: number; warningStatus: string; actualTotal: number; materialName: string; specification: string }> {
  if (!materialCode?.trim()) throw new Error('物料编码不能为空')
  if (!stockOrgCode?.trim()) throw new Error('库存组织不能为空')
  if (!Number.isFinite(safeStock) || safeStock < 0) throw new Error('安全库存不能为负数')

  const info = await fetchMaterial(materialCode, stockOrgCode)
  assertWritable(info, materialCode, stockOrgCode)

  await withK3SqlServerTransaction(async (transaction) => {
    const sql = await loadMssql()
    const request = transaction.request()
    request.input('safeStock', sql.Decimal(18, 6), safeStock)
    sqlBigIntParameter(request, 'materialId', info.materialId)
    const result = await request.query(`
      UPDATE T_BD_MATERIALSTOCK
      SET FSAFESTOCK = @safeStock, FISENABLESAFESTOCK = '1'
      WHERE FMATERIALID = @materialId
    `)
    if (Number(result?.rowsAffected?.[0] ?? 0) <= 0) {
      throw new Error(`金蝶库存子表无记录，无法开启安全库存预警（物料内码 ${info.materialId}）`)
    }
  })

  const back = await readBack(info.materialId)
  if (Math.abs(back.safeStock - safeStock) > 0.000001 || !back.enableSafeStock) {
    throw new Error(`金蝶安全库存预警未开启成功，当前值=${back.safeStock}，期望=${safeStock}（请关闭金蝶中已打开的该物料资料后重试）`)
  }

  // 取物料名称/规格/单位 + 可参与预警即时库存，UPSERT 本地快照行
  const detailRows = await queryK3SqlServer((request) => {
    sqlBigIntParameter(request, 'materialId', info.materialId)
    return request.query(`
      SELECT TOP 1
        ml.FNAME AS material_name,
        ml.FSPECIFICATION AS specification,
        u.FNAME AS unit_name,
        ol.FNAME AS org_name,
        (SELECT ISNULL(SUM(i.FBaseQty), 0)
           FROM T_STK_INVENTORY i
           LEFT JOIN T_BD_STOCKSTATUS ss ON ss.FSTOCKSTATUSID = i.FSTOCKSTATUSID
           LEFT JOIN T_BD_STOCK s ON s.FSTOCKID = i.FSTOCKID
          WHERE i.FMaterialID = m.FMATERIALID
            AND i.FSTOCKORGID = m.FUSEORGID
            AND ss.FAVAILABLEALERT = 1
            AND s.FAVAILABLEALERT = 1) AS actual_total
      FROM T_BD_MATERIAL m
      LEFT JOIN T_BD_MATERIAL_L ml ON ml.FMATERIALID = m.FMATERIALID AND ml.FLOCALEID = 2052
      LEFT JOIN T_BD_UNIT_L u ON u.FUNITID = (SELECT TOP 1 FSTOREUNITID FROM T_BD_MATERIALSTOCK WHERE FMATERIALID = m.FMATERIALID) AND u.FLOCALEID = 2052
      LEFT JOIN T_ORG_ORGANIZATIONS_L ol ON ol.FORGID = m.FUSEORGID AND ol.FLOCALEID = 2052
      WHERE m.FMATERIALID = @materialId
    `)
  })
  const detail = detailRows[0] || {}
  const materialName = String(detail.material_name || '').trim()
  const specification = String(detail.specification || '').trim()
  const unitName = String(detail.unit_name || '').trim()
  const orgName = String(detail.org_name || stockOrgCode).trim()
  const actualTotal = num(detail.actual_total)
  const warningStatus = actualTotal < safeStock ? '低于安全库存 (偏低)' : '正常'

  const pool = getMysqlPool()
  await pool.query(
    mysqlQueryOptions(`
      INSERT INTO kucun_warning
        (stock_org_code, stock_org_name, material_code, material_name, specification,
         unit, safe_stock, actual_total, safe_warning_enabled, warning_status, sync_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NOW())
      ON DUPLICATE KEY UPDATE
        safe_stock = VALUES(safe_stock),
        actual_total = VALUES(actual_total),
        safe_warning_enabled = 1,
        warning_status = VALUES(warning_status),
        sync_time = NOW()
    `),
    [stockOrgCode, orgName, materialCode, materialName || null, specification || null, unitName || null, safeStock, actualTotal, warningStatus],
  )

  return { materialId: info.materialId, safeStock, warningStatus, actualTotal, materialName, specification }
}

/** 批量设置安全库存：逐条调用单条写入（每条独立回读校验），返回逐条结果。 */
export async function batchUpdateSafeStock(
  items: Array<{ materialCode: string; stockOrgCode: string; safeStock: number }>,
): Promise<{ results: Array<{ materialCode: string; ok: boolean; safeStock?: number; warningStatus?: string; error?: string }> }> {
  const results: Array<{ materialCode: string; ok: boolean; safeStock?: number; warningStatus?: string; error?: string }> = []
  for (const item of items) {
    try {
      const r = await updateMaterialSafeStock(item.materialCode, item.stockOrgCode, item.safeStock)
      results.push({ materialCode: item.materialCode, ok: true, safeStock: r.safeStock, warningStatus: r.warningStatus })
    } catch (error) {
      results.push({ materialCode: item.materialCode, ok: false, error: errorMessage(error, '写入失败') })
    }
  }
  return { results }
}

/** 批量移除预警：逐条调用单条移除，返回逐条结果。 */
export async function batchRemoveWarning(
  items: Array<{ materialCode: string; stockOrgCode: string }>,
): Promise<{ results: Array<{ materialCode: string; ok: boolean; error?: string }> }> {
  const results: Array<{ materialCode: string; ok: boolean; error?: string }> = []
  for (const item of items) {
    try {
      await disableMaterialSafeStockWarning(item.materialCode, item.stockOrgCode)
      results.push({ materialCode: item.materialCode, ok: true })
    } catch (error) {
      results.push({ materialCode: item.materialCode, ok: false, error: errorMessage(error, '移除失败') })
    }
  }
  return { results }
}
