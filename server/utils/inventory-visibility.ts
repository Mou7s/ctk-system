import type { AuthSession } from './auth'
import { queryK3SqlServer } from './sqlserver'

const LIMITED_ROLES = new Set(['domestic_trade_sales', 'foreign_trade_sales', 'domestic_merchandiser', 'merchandiser', 'domestic_order_followup_quotation'])

export function finishedInventoryOnly(session: AuthSession): boolean {
  return session.userId !== 1 && (session.roles || []).some(role => LIMITED_ROLES.has(role))
}

// Use the actual group hierarchy, never material-number prefixes or warehouse names.
const FINISHED_GROUPS = `WITH FinishedGroups AS (
  SELECT FID, FNUMBER FROM T_BD_MATERIALGROUP
  WHERE (FPARENTID = 0 OR FPARENTID IS NULL) AND FNUMBER IN ('A', 'B', 'D')
  UNION ALL
  SELECT c.FID, c.FNUMBER FROM T_BD_MATERIALGROUP c
  JOIN FinishedGroups p ON c.FPARENTID = p.FID
)`

export async function finishedInventoryMaterials(): Promise<string[]> {
  const rows = await queryK3SqlServer(request => request.query(`${FINISHED_GROUPS}
    SELECT DISTINCT m.FNUMBER AS number FROM T_BD_MATERIAL m
    JOIN FinishedGroups g ON g.FID = m.FMATERIALGROUP`))
  return [...new Set(rows.map(row => String(row.number || '')).filter(Boolean))]
}

export function inventoryMaterialPredicate(materials?: readonly string[], column = 'kd_wlbm') {
  if (materials === undefined) return { sql: '', params: [] as string[] }
  if (!materials.length) return { sql: '1 = 0', params: [] as string[] }
  return { sql: `${column} IN (${materials.map(() => '?').join(',')})`, params: [...materials] }
}
