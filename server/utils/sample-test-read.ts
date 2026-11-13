import type { H3Event } from 'h3'
import type { Pool } from 'mysql2/promise'
import { queryNumber, queryText, tableResult, dataResult, withReadPermissionSession, withReadSession, pageRequest } from './read'
import { getMysqlPool, mysqlQueryOptions } from './mysql'
import { apiSuccess } from './response'

const PERM_QUERY = 'tk_custom:sampleTest:query'

const statusLabels: Record<string, string> = {
  draft: '草稿',
  testing: '待测试',
  ipqc_review: '待IPQC',
  leader_review: '待组长',
  supervisor_review: '待主管',
  ren_review: '待总经理助理',
  approved: '已核准',
  rejected: '已驳回',
}

export const sampleTestStatusOptions = Object.entries(statusLabels).map(([value, label]) => ({ value, label }))

const columns = `
  id, test_no, product_name, material_name_spec, supplier_id, supplier_name, material_id, material_number, material_name, material_spec, material_model,
  test_qty, test_qty_unit, test_dept,
  DATE_FORMAT(apply_date, '%Y-%m-%d') AS apply_date,
  DATE_FORMAT(reply_date, '%Y-%m-%d') AS reply_date,
  applicant,
  tester_name,
  tester_target_qty, tester_actual_qty, tester_usage, tester_remark,
  tester_by, tester_by_id, tester_at,
  ipqc_opinion, ipqc_by, ipqc_by_id, ipqc_at,
  team_leader_opinion, team_leader_by, team_leader_by_id, team_leader_at,
  supervisor_opinion, supervisor_by, supervisor_by_id, supervisor_at,
  approver_opinion, approver_by, approver_by_id, approver_at,
  reviewer_name, reviewer_at,
  final_result, status, attachments, remark,
  created_by_id, created_by_name, created_at, updated_by_id, updated_by_name, updated_at
`

function buildFilter(query: Record<string, unknown>) {
  const conditions: string[] = []
  const params: unknown[] = []
  const keyword = queryText(query.keyword)
  if (keyword) {
    conditions.push(`(test_no LIKE CONCAT('%', ?, '%') OR product_name LIKE CONCAT('%', ?, '%') OR material_number LIKE CONCAT('%', ?, '%') OR material_name LIKE CONCAT('%', ?, '%') OR material_spec LIKE CONCAT('%', ?, '%') OR supplier_name LIKE CONCAT('%', ?, '%'))`)
    params.push(keyword, keyword, keyword, keyword, keyword, keyword)
  }
  const status = queryText(query.status)
  if (status) { conditions.push('status = ?'); params.push(status) }
  const supplier = queryText(query.supplierName)
  if (supplier) { conditions.push('supplier_name LIKE CONCAT(\'%\', ?, \'%\')'); params.push(supplier) }
  const finalResult = queryText(query.finalResult)
  if (finalResult) { conditions.push('final_result = ?'); params.push(finalResult) }
  const dateFrom = queryText(query.dateFrom)
  const dateTo = queryText(query.dateTo)
  if (dateFrom) { conditions.push('apply_date >= ?'); params.push(dateFrom) }
  if (dateTo) { conditions.push('apply_date <= ?'); params.push(dateTo) }
  return { sql: conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '', params }
}

export async function listSampleTest(event: H3Event) {
  return withReadPermissionSession(event, 'SampleTestList', PERM_QUERY, async (_session, pool: Pool) => {
    const query = event.context.query || {}
    const q: Record<string, unknown> = query as any
    const { pageNum, pageSize, offset } = pageRequest(q)
    const { sql, params } = buildFilter(q)
    const [rows]: any = await pool.query(mysqlQueryOptions(`SELECT ${columns} FROM tk_sample_test ${sql} ORDER BY id DESC LIMIT ? OFFSET ?`), [...params, pageSize, offset])
    const [countRows]: any = await pool.query(mysqlQueryOptions(`SELECT COUNT(*) AS total FROM tk_sample_test ${sql}`), params)
    return tableResult(rows, countRows[0]?.total || 0)
  }, '查询样品测试失败')
}

export async function getSampleTest(event: H3Event) {
  return withReadSession(event, 'SampleTestGet', async (_session, pool: Pool) => {
    const id = queryNumber(event.context.params?.id || (event.context.query as any)?.id, 0)
    if (!id) return apiSuccess(null, '参数错误')
    const [rows]: any = await pool.query(mysqlQueryOptions(`SELECT ${columns} FROM tk_sample_test WHERE id = ?`), [id])
    return dataResult(rows[0] || null)
  }, '查询样品测试详情失败')
}

export async function getSampleTestOptions(event: H3Event) {
  return withReadSession(event, 'SampleTestOptions', async (_session, pool: Pool) => {
    const [statusRows]: any = await pool.query(mysqlQueryOptions(`SELECT status AS value, COUNT(*) AS count FROM tk_sample_test GROUP BY status`))
    return dataResult({ statusOptions: sampleTestStatusOptions, statusCounts: statusRows })
  }, '查询选项失败')
}

export async function getSampleTestSummary(event: H3Event) {
  return withReadPermissionSession(event, 'SampleTestSummary', PERM_QUERY, async (_session, pool: Pool) => {
    const [rows]: any = await pool.query(mysqlQueryOptions(`SELECT status, COUNT(*) AS cnt FROM tk_sample_test GROUP BY status`))
    const map: Record<string, number> = {}
    let total = 0
    for (const r of rows) { map[r.status] = Number(r.cnt); total += Number(r.cnt) }
    return dataResult({ total, draft: map.draft || 0, testing: map.testing || 0, ipqc_review: map.ipqc_review || 0, leader_review: map.leader_review || 0, supervisor_review: map.supervisor_review || 0, ren_review: map.ren_review || 0, approved: map.approved || 0, rejected: map.rejected || 0 })
  }, '查询汇总失败')
}
