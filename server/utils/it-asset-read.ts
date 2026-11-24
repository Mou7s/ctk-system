import { getQuery, getRouterParam, readBody, type H3Event } from 'h3'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { getAuthSession, hasPermission, type AuthSession } from './auth'
import { getMysqlPool, mysqlQueryOptions } from './mysql'
import { apiError, apiSuccess, errorMessage } from './response'
import {
  camelizeRows,
  dataResult,
  pageRequest,
  queryNumber,
  queryText,
  tableResult,
  withReadSession,
} from './read'
import {
  buildItAssetExportWorkbook,
  buildItAssetImportTemplateWorkbook,
  sendItAssetExcel,
} from './it-asset-excel'

const READ_PERMS = ['tk_custom:itAsset:list', 'tk_custom:itAsset:query']
const EXPORT_PERMS = ['tk_custom:itAsset:export', 'tk_custom:itAsset:list']
const EXPORT_MAX_ROWS = 20000

const SELECT_COLUMNS = `
  id,
  asset_no,
  asset_name,
  device_type,
  brand,
  model,
  serial_no,
  use_dept,
  user_userid,
  user_name,
  location,
  DATE_FORMAT(purchase_date, '%Y-%m-%d') AS purchase_date,
  status,
  cpu_spec,
  memory_spec,
  disk_spec,
  os_version,
  ip_address,
  mac_address,
  DATE_FORMAT(warranty_date, '%Y-%m-%d') AS warranty_date,
  print_count,
  DATE_FORMAT(last_printed_at, '%Y-%m-%d %H:%i:%s') AS last_printed_at,
  remark,
  created_by_id,
  created_by_name,
  DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
  updated_by_id,
  updated_by_name,
  DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
`

function hasAnyPerm(session: AuthSession, perms: string[]): boolean {
  return perms.some((perm) => hasPermission(session, perm))
}

export function formatItAssetNoFromSeq(seq: number): string {
  const normalized = Number.isFinite(seq) && seq > 0 ? Math.floor(seq) : 1
  return `TK-PC-${String(normalized).padStart(4, '0')}`
}

export async function peekNextItAssetNo(pool: Pool): Promise<string> {
  const [rows] = await pool.query<RowDataPacket[]>(
    mysqlQueryOptions(
      `SELECT asset_no FROM tk_it_asset
       WHERE asset_no REGEXP '^TK-PC-[0-9]+$'
       ORDER BY CAST(SUBSTRING(asset_no, 7) AS UNSIGNED) DESC
       LIMIT 1`,
    ),
  )
  const lastNo = String(rows[0]?.asset_no || '')
  const matched = lastNo.match(/^TK-PC-(\d+)$/)
  const nextSeq = matched ? Number(matched[1]) + 1 : 1
  return formatItAssetNoFromSeq(nextSeq)
}

export function buildItAssetFilter(query: Record<string, unknown>) {
  const conditions: string[] = []
  const params: unknown[] = []

  const keyword = queryText(query.keyword).trim()
  if (keyword) {
    conditions.push(`(
      asset_no LIKE CONCAT('%', ?, '%')
      OR asset_name LIKE CONCAT('%', ?, '%')
      OR brand LIKE CONCAT('%', ?, '%')
      OR model LIKE CONCAT('%', ?, '%')
      OR serial_no LIKE CONCAT('%', ?, '%')
      OR use_dept LIKE CONCAT('%', ?, '%')
      OR user_name LIKE CONCAT('%', ?, '%')
      OR location LIKE CONCAT('%', ?, '%')
      OR ip_address LIKE CONCAT('%', ?, '%')
      OR mac_address LIKE CONCAT('%', ?, '%')
      OR remark LIKE CONCAT('%', ?, '%')
    )`)
    for (let i = 0; i < 11; i += 1) params.push(keyword)
  }

  const deviceType = queryText(query.deviceType).trim()
  if (deviceType && deviceType !== 'all') {
    conditions.push('device_type = ?')
    params.push(deviceType)
  }

  const status = queryText(query.status).trim()
  if (status && status !== 'all') {
    conditions.push('status = ?')
    params.push(status)
  }

  const useDept = queryText(query.useDept).trim()
  if (useDept && useDept !== 'all') {
    conditions.push('use_dept = ?')
    params.push(useDept)
  }

  const beginDate = queryText(query.beginPurchaseDate || query['params[beginPurchaseDate]']).trim()
  const endDate = queryText(query.endPurchaseDate || query['params[endPurchaseDate]']).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(beginDate)) {
    conditions.push('purchase_date >= ?')
    params.push(beginDate)
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    conditions.push('purchase_date <= ?')
    params.push(endDate)
  }

  return {
    sql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  }
}

const ALL_QUERY_TRUE_VALUES = new Set(['true', '1', 'yes'])

export function isItAssetLoadAllQuery(query: Record<string, unknown>): boolean {
  const raw = queryText(query?.all).trim().toLowerCase()
  return ALL_QUERY_TRUE_VALUES.has(raw)
}

export async function listItAssets(event: H3Event) {
  return withReadSession(event, 'ItAssetList', async (session, pool) => {
    if (!hasAnyPerm(session, READ_PERMS)) return apiError('没有权限访问该接口', 403)
    const query = getQuery(event) as Record<string, unknown>
    const { sql, params } = buildItAssetFilter(query)
    if (isItAssetLoadAllQuery(query)) {
      const [rows] = await pool.query<RowDataPacket[]>(
        mysqlQueryOptions(`SELECT ${SELECT_COLUMNS} FROM tk_it_asset ${sql} ORDER BY id DESC`),
        params,
      )
      return tableResult(rows, rows.length)
    }

    const { pageSize, offset } = pageRequest(query)
    const [rows] = await pool.query<RowDataPacket[]>(
      mysqlQueryOptions(`SELECT ${SELECT_COLUMNS} FROM tk_it_asset ${sql} ORDER BY id DESC LIMIT ? OFFSET ?`),
      [...params, pageSize, offset],
    )
    const [countRows] = await pool.query<RowDataPacket[]>(
      mysqlQueryOptions(`SELECT COUNT(*) AS total FROM tk_it_asset ${sql}`),
      params,
    )
    return tableResult(rows, Number(countRows[0]?.total || 0))
  }, '查询IT资产台账失败')
}

export async function getItAsset(event: H3Event) {
  return withReadSession(event, 'ItAssetGet', async (session, pool) => {
    if (!hasAnyPerm(session, READ_PERMS)) return apiError('没有权限访问该接口', 403)
    const query = getQuery(event) as Record<string, unknown>
    const id = queryNumber(getRouterParam(event, 'id') ?? query.id, 0)
    if (!id) return apiSuccess(null, '参数错误')
    const [rows] = await pool.query<RowDataPacket[]>(
      mysqlQueryOptions(`SELECT ${SELECT_COLUMNS} FROM tk_it_asset WHERE id = ? LIMIT 1`),
      [id],
    )
    const normalized = camelizeRows(rows)
    return dataResult(normalized[0] || null)
  }, '查询IT资产详情失败')
}

export async function getItAssetSummary(event: H3Event) {
  return withReadSession(event, 'ItAssetSummary', async (session, pool) => {
    if (!hasAnyPerm(session, READ_PERMS)) return apiError('没有权限访问该接口', 403)
    const [statusRows] = await pool.query<RowDataPacket[]>(
      mysqlQueryOptions(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'in_use' THEN 1 ELSE 0 END) AS in_use,
          SUM(CASE WHEN status = 'idle' THEN 1 ELSE 0 END) AS idle,
          SUM(CASE WHEN status = 'repair' THEN 1 ELSE 0 END) AS repair,
          SUM(CASE WHEN status = 'scrapped' THEN 1 ELSE 0 END) AS scrapped,
          SUM(CASE WHEN print_count > 0 THEN 1 ELSE 0 END) AS printed_count,
          SUM(CASE WHEN print_count = 0 THEN 1 ELSE 0 END) AS unprinted_count
        FROM tk_it_asset
      `),
    )
    const [typeRows] = await pool.query<RowDataPacket[]>(
      mysqlQueryOptions(`SELECT device_type, COUNT(*) AS cnt FROM tk_it_asset GROUP BY device_type`),
    )
    const s = statusRows[0] || {}
    const byType: Record<string, number> = {}
    for (const row of typeRows) {
      byType[String(row.device_type || 'other')] = Number(row.cnt || 0)
    }
    return dataResult({
      total: Number(s.total || 0),
      inUse: Number(s.in_use || 0),
      idle: Number(s.idle || 0),
      repair: Number(s.repair || 0),
      scrapped: Number(s.scrapped || 0),
      printedCount: Number(s.printed_count || 0),
      unprintedCount: Number(s.unprinted_count || 0),
      byType,
    })
  }, '查询IT资产统计失败')
}

export async function getItAssetOptions(event: H3Event) {
  return withReadSession(event, 'ItAssetOptions', async (session, pool) => {
    if (!hasAnyPerm(session, READ_PERMS)) return apiError('没有权限访问该接口', 403)

    const [sysDepts] = await pool.query<RowDataPacket[]>(
      mysqlQueryOptions(`SELECT dept_name FROM sys_dept WHERE del_flag = '0' AND status = '0' AND parent_id > 0 ORDER BY order_num, dept_id`),
    )
    const [wxDepts] = await pool.query<RowDataPacket[]>(
      mysqlQueryOptions(`SELECT DISTINCT dept FROM wxuser WHERE status = 'active' AND dept IS NOT NULL AND dept <> '' ORDER BY dept`),
    )
    const [assetDepts] = await pool.query<RowDataPacket[]>(
      mysqlQueryOptions(`SELECT DISTINCT use_dept FROM tk_it_asset WHERE use_dept IS NOT NULL AND use_dept <> '' ORDER BY use_dept`),
    )
    const [employees] = await pool.query<RowDataPacket[]>(
      mysqlQueryOptions(`SELECT userid, name, dept, position FROM wxuser WHERE status = 'active' ORDER BY dept, name`),
    )
    const nextAssetNo = await peekNextItAssetNo(pool)

    const deptSet = new Set<string>()
    for (const row of wxDepts) {
      const val = String(row.dept || '').trim()
      if (val) deptSet.add(val)
    }
    for (const row of sysDepts) {
      const val = String(row.dept_name || '').trim()
      if (val) deptSet.add(val)
    }
    const assetDeptSet = new Set<string>()
    for (const row of assetDepts) {
      const val = String(row.use_dept || '').trim()
      if (val) {
        assetDeptSet.add(val)
        deptSet.add(val)
      }
    }

    const employeeOptions = employees.map((row) => ({
      userid: String(row.userid || ''),
      name: String(row.name || ''),
      dept: String(row.dept || ''),
      position: String(row.position || ''),
    }))

    return dataResult({
      deptOptions: Array.from(deptSet),
      assetDeptOptions: Array.from(assetDeptSet).sort((a, b) => a.localeCompare(b, 'zh-CN')),
      employeeOptions,
      nextAssetNo,
    })
  }, '查询IT资产选项失败')
}

export async function exportItAssets(event: H3Event) {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)
  if (!hasAnyPerm(authenticated.session, EXPORT_PERMS)) {
    return apiError('没有权限访问该接口', 403)
  }

  try {
    const query = getQuery(event) as Record<string, unknown>
    const body = (await readBody<Record<string, unknown>>(event).catch(() => ({}))) || {}
    const mergedFilter = { ...query, ...body }
    const { sql, params } = buildItAssetFilter(mergedFilter)
    const [rows] = await getMysqlPool().query<RowDataPacket[]>(
      mysqlQueryOptions(`SELECT ${SELECT_COLUMNS} FROM tk_it_asset ${sql} ORDER BY id DESC LIMIT ?`),
      [...params, EXPORT_MAX_ROWS],
    )
    const camelized = camelizeRows(rows)
    const wb = buildItAssetExportWorkbook(camelized)
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace(/-/g, '')
    return sendItAssetExcel(event, wb, `IT电脑资产台账_${today}.xlsx`)
  } catch (error) {
    console.error('[ItAssetExport] failed:', errorMessage(error, 'unknown error'))
    return apiError(errorMessage(error, '导出IT资产台账失败'), 500)
  }
}

export async function downloadItAssetTemplate(event: H3Event) {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)
  if (!hasAnyPerm(authenticated.session, ['tk_custom:itAsset:import', ...READ_PERMS])) {
    return apiError('没有权限访问该接口', 403)
  }

  try {
    const wb = buildItAssetImportTemplateWorkbook()
    return sendItAssetExcel(event, wb, 'IT资产导入模板.xlsx')
  } catch (error) {
    console.error('[ItAssetTemplate] failed:', errorMessage(error, 'unknown error'))
    return apiError(errorMessage(error, '生成IT资产导入模板失败'), 500)
  }
}
