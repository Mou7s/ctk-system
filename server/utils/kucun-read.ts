import { inventoryMaterialPredicate } from './inventory-visibility'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { mysqlQueryOptions } from './mysql'
import { pageRequest, queryText } from './read'

export interface KucunQuery {
  pageNum?: unknown
  pageSize?: unknown
  kdBillno?: unknown
  kdWlbm?: unknown
  kdWumc?: unknown
  kdGgxh?: unknown
  kdCangkuName?: unknown
  kdKuweiName?: unknown
  kdChukuTime?: unknown
  syncTime?: unknown
  status?: unknown
}

export interface KucunPage {
  pageNum: number
  pageSize: number
  offset: number
}

const LIKE_FILTERS: Array<[keyof KucunQuery, string]> = [
  ['kdBillno', 'kd_billno'],
  ['kdWlbm', 'kd_wlbm'],
  ['kdWumc', 'kd_wumc'],
  ['kdGgxh', 'kd_ggxh'],
  ['kdCangkuName', 'kd_cangku_name'],
  ['kdKuweiName', 'kd_kuwei_name'],
]

const GROUP_COLUMNS = [
  'kd_wlbm',
  'kd_wumc',
  'kd_ggxh',
  "SUBSTRING_INDEX(kd_cangku_name, '/', 1)",
  'kd_kuwei_name',
]

function boundedPage(query: KucunQuery, maximum = 5000): KucunPage {
  const page = pageRequest(query as Record<string, unknown>)
  const pageSize = Math.min(page.pageSize, maximum)
  return {
    pageNum: page.pageNum,
    pageSize,
    offset: (page.pageNum - 1) * pageSize,
  }
}

function buildWhere(query: KucunQuery, forcedStatus?: string, materials?: readonly string[]) {
  const conditions: string[] = []
  const params: unknown[] = []
  const scope = inventoryMaterialPredicate(materials)
  if (scope.sql) { conditions.push(scope.sql); params.push(...scope.params) }

  if (forcedStatus !== undefined) {
    conditions.push('status = ?')
    params.push(forcedStatus)
  } else {
    const status = queryText(query.status)
    if (status) {
      conditions.push('status = ?')
      params.push(status)
    }
  }

  for (const [key, column] of LIKE_FILTERS) {
    const value = queryText(query[key])
    if (!value) continue
    conditions.push(`${column} LIKE CONCAT('%', ?, '%')`)
    params.push(value)
  }

  for (const [key, column] of [
    ['kdChukuTime', 'kd_chuku_time'],
    ['syncTime', 'sync_time'],
  ] as const) {
    const value = queryText(query[key])
    if (!value) continue
    conditions.push(`${column} = ?`)
    params.push(value)
  }

  return {
    sql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  }
}

export async function queryKucunList(pool: Pool, query: KucunQuery, materials?: readonly string[]) {
  const page = boundedPage(query)
  const { sql: whereSql, params } = buildWhere(query, undefined, materials)
  const countSql = `SELECT COUNT(*) AS total FROM kucun ${whereSql}`
  const selectSql = `
    SELECT id, kd_billno, kd_wlbm, kd_wumc, kd_ggxh,
           kd_cangku_id, kd_cangku_name, kd_kuwei_id, kd_kuwei_name,
           kd_chuku_number, kd_chuku_time, sync_time, status
    FROM kucun
    ${whereSql}
    ORDER BY kd_chuku_time DESC, id DESC
    LIMIT ?, ?`

  const [countRows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(countSql), params)
  const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(selectSql), [...params, page.offset, page.pageSize])
  return { rows, total: Number(countRows[0]?.total || 0) }
}

export async function queryKucunSummaryPage(pool: Pool, query: KucunQuery, materials?: readonly string[]) {
  const page = boundedPage(query)
  const { sql: whereSql, params } = buildWhere(query, 'C', materials)
  const groupSql = GROUP_COLUMNS.join(', ')
  const countSql = `
    SELECT COUNT(*) AS total
    FROM (
      SELECT 1
      FROM kucun
      ${whereSql}
      GROUP BY ${groupSql}
    ) grouped`
  const selectSql = `
    SELECT
      kd_wlbm,
      kd_wumc,
      kd_ggxh,
      SUBSTRING_INDEX(kd_cangku_name, '/', 1) AS kd_cangku_name,
      kd_kuwei_name,
      SUM(kd_chuku_number) AS kdChukuNumber
    FROM kucun
    ${whereSql}
    GROUP BY ${groupSql}
    ORDER BY kd_wlbm, kd_wumc, kd_ggxh, kd_cangku_name, kd_kuwei_name
    LIMIT ?, ?`

  const [countRows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(countSql), params)
  const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(selectSql), [...params, page.offset, page.pageSize])
  return { rows, total: Number(countRows[0]?.total || 0) }
}

export async function queryKucunSummaryRows(pool: Pool, query: KucunQuery, materials?: readonly string[]) {
  const { sql: whereSql, params } = buildWhere(query, 'C', materials)
  const groupSql = GROUP_COLUMNS.join(', ')
  const selectSql = `
    SELECT
      kd_wlbm,
      kd_wumc,
      kd_ggxh,
      SUBSTRING_INDEX(kd_cangku_name, '/', 1) AS kd_cangku_name,
      kd_kuwei_name,
      SUM(kd_chuku_number) AS kdChukuNumber
    FROM kucun
    ${whereSql}
    GROUP BY ${groupSql}
    ORDER BY kd_wlbm, kd_wumc, kd_ggxh, kd_cangku_name, kd_kuwei_name`
  const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(selectSql), params)
  return rows
}

export async function queryKucunTotals(pool: Pool, query: KucunQuery, materials?: readonly string[]) {
  const { sql: whereSql, params } = buildWhere(query, 'C', materials)
  const totalSql = `
    SELECT
      COALESCE(SUM(CASE WHEN kd_billno LIKE 'XSTH%' THEN kd_chuku_number ELSE 0 END), 0) AS xsth,
      COALESCE(SUM(CASE WHEN kd_billno NOT LIKE 'XSTH%' THEN kd_chuku_number ELSE 0 END), 0) AS xsch
    FROM kucun
    ${whereSql}`
  const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(totalSql), params)
  const xsth = Number(rows[0]?.xsth || 0)
  const xsch = Number(rows[0]?.xsch || 0)
  return { xsth, xsch, total: xsth + xsch }
}

export async function queryKucunLastSyncTime(pool: Pool) {
  const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(
    'SELECT MAX(sync_time) AS syncTime FROM kucun',
  ))
  return rows[0]?.syncTime ?? null
}

export function kucunSummaryExportRows(rows: RowDataPacket[]) {
  return rows.map((row) => ({
    '物料编码': row.kd_wlbm ?? '',
    '物料名称': row.kd_wumc ?? '',
    '规格型号': row.kd_ggxh ?? '',
    '仓库': row.kd_cangku_name ?? '',
    '库位': row.kd_kuwei_name ?? '',
    '库存数量 (K)': row.kdChukuNumber ?? 0,
  }))
}

export function kucunDetailExportRows(rows: RowDataPacket[]) {
  return rows.map((row) => ({
    '出入库单号': row.kd_billno ?? '',
    '物料编码': row.kd_wlbm ?? '',
    '物料名称': row.kd_wumc ?? '',
    '规格型号': row.kd_ggxh ?? '',
    '仓库': row.kd_cangku_name ?? '',
    '库位': row.kd_kuwei_name ?? '',
    '数量 (K)': row.kd_chuku_number ?? 0,
    '时间': row.kd_chuku_time ?? '',
    '状态': row.status ?? '',
  }))
}
