import type { Pool } from 'mysql2/promise'
import { getMysqlPool, mysqlQueryOptions } from './mysql'
import { queryK3SqlServer } from './sqlserver'

/**
 * 金蝶库存预警快照同步（本地 kucun_warning <- 安全库存 + 即时库存）。
 *
 * 口径还原自退役 Java TkTask.syncKucunWarningSnapshot（建表 SQL 20260723 的设计：
 * 每 30 分钟从金蝶拉取物料安全库存与即时库存，写入 kucun_warning；页面只读本地库）。
 *
 * - 安全库存：T_BD_MATERIALSTOCK.FSAFESTOCK，取默认库存组织（编码 100）、
 *   且 FISENABLESAFESTOCK='1'（启用安全库存预警）的物料。
 * - 即时库存：T_STK_INVENTORY.FBASEQTY 按物料 FSTOCKORGID=100 汇总。
 * - warning_status：即时库存 < 安全库存 → '低于安全库存 (偏低)'，否则 '正常'。
 * - 写库：全过程在 MySQL 单事务内 DELETE（仅本库存组织）+ 批量 INSERT，sync_time 统一为当前时间。
 */

const STOCK_ORG = '100'
const WRITE_CHUNK = 500

interface SourceRow {
  materialCode: string
  materialName: string | null
  specification: string | null
  unitName: string | null
  safeStock: number
}

function dateTimeNow(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 查询 org 100 启用安全库存预警的物料与安全库存（金蝶 SQL Server 直连）。 */
async function fetchSafeStockRows(): Promise<{
  rows: SourceRow[]
  stockOrgName: string
  invByMaterial: Map<number, number>
  materialIdMap: Map<string, number>
}> {
  const [safeRows, orgRows, invRows] = await Promise.all([
    queryK3SqlServer((request) => request.query(`
      SELECT
        m.FNUMBER AS material_code,
        ml.FNAME AS material_name,
        ml.FSPECIFICATION AS specification,
        u.FNAME AS unit_name,
        ms.FSAFESTOCK AS safe_stock
      FROM T_BD_MATERIALSTOCK ms
      JOIN T_BD_MATERIAL m ON m.FMATERIALID = ms.FMATERIALID
      LEFT JOIN T_BD_MATERIAL_L ml ON ml.FMATERIALID = m.FMATERIALID AND ml.FLOCALEID = 2052
      LEFT JOIN T_BD_UNIT_L u ON u.FUNITID = ms.FSTOREUNITID AND u.FLOCALEID = 2052
      WHERE ms.FUSEORGID = (SELECT FORGID FROM T_ORG_ORGANIZATIONS WHERE FNUMBER = '${STOCK_ORG}')
        AND ms.FISENABLESAFESTOCK = '1'
        AND m.FDOCUMENTSTATUS = 'C'
        AND m.FFORBIDSTATUS = 'A'
    `)),
    queryK3SqlServer((request) => request.query(`
      SELECT L.FNAME AS name
      FROM T_ORG_ORGANIZATIONS O
      JOIN T_ORG_ORGANIZATIONS_L L ON L.FORGID = O.FORGID AND L.FLOCALEID = 2052
      WHERE O.FNUMBER = '${STOCK_ORG}'
    `)),
    queryK3SqlServer((request) => request.query(`
      SELECT i.FMaterialID AS material_id, ISNULL(SUM(i.FBaseQty), 0) AS qty
      FROM T_STK_INVENTORY i
      LEFT JOIN T_BD_STOCKSTATUS ss ON ss.FSTOCKSTATUSID = i.FSTOCKSTATUSID
      LEFT JOIN T_BD_STOCK s ON s.FSTOCKID = i.FSTOCKID
      WHERE i.FSTOCKORGID = (SELECT FORGID FROM T_ORG_ORGANIZATIONS WHERE FNUMBER = '${STOCK_ORG}')
        AND ss.FAVAILABLEALERT = 1
        AND s.FAVAILABLEALERT = 1
      GROUP BY i.FMaterialID
    `)),
  ])

  const stockOrgName = String(orgRows[0]?.name || STOCK_ORG)
  const invByMaterial = new Map<number, number>()
  for (const row of invRows) {
    const qty = Number(row.qty ?? 0)
    invByMaterial.set(Number(row.material_id), Number.isFinite(qty) ? qty : 0)
  }

  // 把 materialCode 映射到 materialId，以关联即时库存。
  const codes = safeRows.map((row) => String(row.material_code || '')).filter(Boolean)
  let materialIdMap = new Map<string, number>()
  if (codes.length) {
    const idRows = await queryK3SqlServer((request) => request.query(`
      SELECT FMATERIALID AS material_id, FNUMBER AS material_code
      FROM T_BD_MATERIAL
      WHERE FNUMBER IN (${codes.map((c) => `'${c.replaceAll("'", "''")}'`).join(',')})
    `))
    materialIdMap = new Map(idRows.map((row) => [String(row.material_code), Number(row.material_id)]))
  }

  const rows: SourceRow[] = []
  for (const row of safeRows) {
    const materialCode = String(row.material_code || '')
    if (!materialCode) continue
    rows.push({
      materialCode,
      materialName: row.material_name != null ? String(row.material_name).trim() || null : null,
      specification: row.specification != null ? String(row.specification).trim() || null : null,
      unitName: row.unit_name != null ? String(row.unit_name).trim() || null : null,
      safeStock: Number(row.safe_stock ?? 0),
    })
  }
  return { rows, stockOrgName, invByMaterial, materialIdMap }
}

/** 从金蝶刷新快照并写库；返回写入条数与同步时间。 */
export async function syncKucunWarningsFromK3(): Promise<{
  rows: number
  syncTime: string
  stockOrgName: string
}> {
  const { rows, stockOrgName, invByMaterial, materialIdMap } = await fetchSafeStockRows()
  const now = dateTimeNow()

  const values: unknown[][] = []
  for (const row of rows) {
    const materialId = materialIdMap.get(row.materialCode)
    const safeStock = row.safeStock
    const actualTotal = (materialId != null ? invByMaterial.get(materialId) : undefined) ?? 0
    const warningStatus = actualTotal < safeStock ? '低于安全库存 (偏低)' : '正常'
    values.push([
      STOCK_ORG,
      stockOrgName,
      row.materialCode,
      row.materialName,
      row.specification,
      row.unitName,
      safeStock,
      actualTotal,
      1,
      warningStatus,
      now,
    ])
  }

  const pool: Pool = getMysqlPool()
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    await connection.query(
      mysqlQueryOptions('DELETE FROM kucun_warning WHERE stock_org_code = ?'),
      [STOCK_ORG],
    )
    for (let i = 0; i < values.length; i += WRITE_CHUNK) {
      const part = values.slice(i, i + WRITE_CHUNK)
      if (!part.length) continue
      await connection.query(
        mysqlQueryOptions(
          `INSERT INTO kucun_warning
            (stock_org_code, stock_org_name, material_code, material_name, specification,
             unit, safe_stock, actual_total, safe_warning_enabled, warning_status, sync_time)
           VALUES ?`,
        ),
        [part],
      )
    }
    await connection.commit()
  } catch (error) {
    try {
      await connection.rollback()
    } catch {
      /* ignore */
    }
    throw error
  } finally {
    connection.release()
  }

  return { rows: values.length, syncTime: now, stockOrgName }
}