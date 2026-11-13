import type { H3Event } from 'h3'
import type { Pool } from 'mysql2/promise'
import { queryNumber, queryText, tableResult, dataResult, withReadPermissionSession, withReadSession, pageRequest } from './read'
import { getMysqlPool, mysqlQueryOptions } from './mysql'
import { apiSuccess } from './response'

const PERM_QUERY = 'tk_custom:supplierAccess:query'

const statusLabels: Record<string, string> = {
  draft: '草稿',
  purchaser_review: '待采购评审',
  quality_review: '待品质评审',
  engineer_review: '待工程评审',
  manager_review: '待总经理评审',
  approved: '已准入',
  rejected: '已驳回',
}

export const supplierAccessStatusOptions = Object.entries(statusLabels).map(([value, label]) => ({ value, label }))

const columns = `
  id, access_no, supplier_name, contact_name, contact_phone, contact_email, main_materials, address,
  business_license_no, certificates, supply_capacity,
  DATE_FORMAT(apply_date, '%Y-%m-%d') AS apply_date, applicant,
  purchaser_opinion, purchaser_by, purchaser_by_id, purchaser_at,
  quality_opinion, quality_by, quality_by_id, quality_at,
  engineer_opinion, engineer_by, engineer_by_id, engineer_at,
  manager_opinion, manager_by, manager_by_id, manager_at,
  final_result, is_avl, status, attachments, remark,
  created_by_id, created_by_name, created_at, updated_by_id, updated_by_name, updated_at
`

function buildFilter(query: Record<string, unknown>) {
  const conditions: string[] = []
  const params: unknown[] = []
  const keyword = queryText(query.keyword)
  if (keyword) {
    conditions.push(`(access_no LIKE CONCAT('%', ?, '%') OR supplier_name LIKE CONCAT('%', ?, '%') OR contact_name LIKE CONCAT('%', ?, '%') OR main_materials LIKE CONCAT('%', ?, '%'))`)
    params.push(keyword, keyword, keyword, keyword)
  }
  const status = queryText(query.status)
  if (status) { conditions.push('status = ?'); params.push(status) }
  const finalResult = queryText(query.finalResult)
  if (finalResult) { conditions.push('final_result = ?'); params.push(finalResult) }
  const dateFrom = queryText(query.dateFrom)
  const dateTo = queryText(query.dateTo)
  if (dateFrom) { conditions.push('apply_date >= ?'); params.push(dateFrom) }
  if (dateTo) { conditions.push('apply_date <= ?'); params.push(dateTo) }
  return { sql: conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '', params }
}

export async function listSupplierAccess(event: H3Event) {
  return withReadPermissionSession(event, 'SupplierAccessList', PERM_QUERY, async (_session, pool: Pool) => {
    const query = event.context.query || {}
    const q: Record<string, unknown> = query as any
    const { pageNum, pageSize, offset } = pageRequest(q)
    const { sql, params } = buildFilter(q)
    const [rows]: any = await pool.query(mysqlQueryOptions(`SELECT ${columns} FROM tk_supplier_access ${sql} ORDER BY id DESC LIMIT ? OFFSET ?`), [...params, pageSize, offset])
    const [countRows]: any = await pool.query(mysqlQueryOptions(`SELECT COUNT(*) AS total FROM tk_supplier_access ${sql}`), params)
    return tableResult(rows, countRows[0]?.total || 0)
  }, '查询供应商准入失败')
}

export async function getSupplierAccess(event: H3Event) {
  return withReadSession(event, 'SupplierAccessGet', async (_session, pool: Pool) => {
    const id = queryNumber(event.context.params?.id || (event.context.query as any)?.id, 0)
    if (!id) return apiSuccess(null, '参数错误')
    const [rows]: any = await pool.query(mysqlQueryOptions(`SELECT ${columns} FROM tk_supplier_access WHERE id = ?`), [id])
    return dataResult(rows[0] || null)
  }, '查询详情失败')
}

export async function getSupplierAccessOptions(event: H3Event) {
  return withReadSession(event, 'SupplierAccessOptions', async (_session, pool: Pool) => {
    const [statusRows]: any = await pool.query(mysqlQueryOptions(`SELECT status AS value, COUNT(*) AS count FROM tk_supplier_access GROUP BY status`))
    return dataResult({ statusOptions: supplierAccessStatusOptions, statusCounts: statusRows })
  }, '查询选项失败')
}

export async function getSupplierAccessSummary(event: H3Event) {
  return withReadPermissionSession(event, 'SupplierAccessSummary', PERM_QUERY, async (_session, pool: Pool) => {
    const [rows]: any = await pool.query(mysqlQueryOptions(`SELECT status, COUNT(*) AS cnt FROM tk_supplier_access GROUP BY status`))
    const map: Record<string, number> = {}
    let total = 0
    for (const r of rows) { map[r.status] = Number(r.cnt); total += Number(r.cnt) }
    return dataResult({ total, draft: map.draft || 0, purchaser_review: map.purchaser_review || 0, quality_review: map.quality_review || 0, engineer_review: map.engineer_review || 0, manager_review: map.manager_review || 0, approved: map.approved || 0, rejected: map.rejected || 0 })
  }, '查询汇总失败')
}

export async function getAvlSuppliers(event: H3Event) {
  return withReadSession(event, 'SupplierAvlList', async (_session, pool: Pool) => {
    const [rows]: any = await pool.query(mysqlQueryOptions(`SELECT id AS value, supplier_name AS label FROM tk_supplier_access WHERE status = 'approved' AND is_avl = 1 AND supplier_name IS NOT NULL AND supplier_name != '' ORDER BY supplier_name`))
    return dataResult(rows)
  }, '查询AVL供应商失败')
}
