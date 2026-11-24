import type { H3Event } from 'h3'
import { getQuery, getRouterParam, readBody } from 'h3'
import type { RowDataPacket } from 'mysql2/promise'
import { mysqlQueryOptions } from './mysql'
import { apiError, apiSuccess } from './response'
import {
  camelizeRows,
  pageRequest,
  queryPage,
  queryText,
  tableResult,
  withReadSession,
} from './read'

const exceptionColumns = `
  id, report_no, plan_no,
  DATE_FORMAT(report_date, '%Y-%m-%d') AS report_date,
  shift_name, finder_name, send_dept, generate_process_name, process_name,
  DATE_FORMAT(occur_date, '%Y-%m-%d') AS occur_date,
  product_name, product_spec, mo_number, chip_code, chip_no, risk_batch,
  batch_defect_total, batch_unit, processing_method, machine_no,
  sample_qty, sample_unit, defect_qty, defect_unit, defect_rate,
  defect_item, defect_desc, defect_images, report_images, defect_category,
  operator_name, technician_name, quality_name, cause_analysis, reason_analysis,
  corrective_action, preventive_action, handler_name, qc_confirm, status, del_flag,
  remark, create_by,
  DATE_FORMAT(create_time, '%Y-%m-%d %H:%i:%s') AS create_time,
  update_by,
  DATE_FORMAT(update_time, '%Y-%m-%d %H:%i:%s') AS update_time`

const numericFields = ['batchDefectTotal', 'sampleQty', 'defectQty', 'defectRate'] as const

function like(conditions: string[], params: unknown[], column: string, value: unknown) {
  const text = queryText(value)
  if (text) {
    conditions.push(`${column} LIKE CONCAT('%', ?, '%')`)
    params.push(text)
  }
}

function exact(conditions: string[], params: unknown[], column: string, value: unknown) {
  const text = queryText(value)
  if (text) {
    conditions.push(`${column} = ?`)
    params.push(text)
  }
}

function dateEquals(conditions: string[], params: unknown[], column: string, value: unknown) {
  const text = queryText(value)
  if (text) {
    conditions.push(`DATE_FORMAT(${column}, '%Y-%m-%d') = DATE_FORMAT(?, '%Y-%m-%d')`)
    params.push(text)
  }
}

function dateRange(conditions: string[], params: unknown[], column: string, begin: unknown, end: unknown) {
  const beginText = queryText(begin)
  const endText = queryText(end)
  if (beginText) {
    conditions.push(`DATE_FORMAT(${column}, '%Y-%m-%d') >= ?`)
    params.push(beginText)
  }
  if (endText) {
    conditions.push(`DATE_FORMAT(${column}, '%Y-%m-%d') <= ?`)
    params.push(endText)
  }
}

function csvIds(value: unknown): string[] {
  return queryText(value).split(',').map((item) => item.trim()).filter(Boolean)
}

function where(conditions: string[]) {
  return conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''
}

async function requestQuery(event: H3Event): Promise<Record<string, unknown>> {
  const query = { ...(getQuery(event) as Record<string, unknown>) }
  const body = await readBody(event)
  if (typeof body === 'string') {
    Object.assign(query, Object.fromEntries(new URLSearchParams(body)))
  } else if (body && typeof body === 'object' && !Array.isArray(body)) {
    Object.assign(query, body)
  }
  return query
}

function formatQuantity(value: unknown, unit: unknown): string {
  if (value === null || value === undefined || String(value) === '') return ''
  let quantity = String(value).trim()
  if (/^-?\d+(?:\.\d+)?$/.test(quantity)) {
    quantity = quantity.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
    if (quantity === '-0') quantity = '0'
  }
  const unitText = String(unit || '').trim() || 'PCS'
  return `${quantity} ${unitText}`
}

function formatPercent(value: unknown): string {
  if (value === null || value === undefined || String(value) === '') return '0.00%'
  const number = Number(value)
  return Number.isFinite(number) ? `${(number * 100).toFixed(2)}%` : '0.00%'
}

function mapExceptionRow(raw: RowDataPacket): Record<string, unknown> {
  const row = camelizeRows<Record<string, unknown>>([raw])[0]
  const result: Record<string, unknown> = { ...row, exportIds: null }
  for (const field of numericFields) {
    const value = result[field]
    if (value !== null && value !== undefined && String(value) !== '') {
      const number = Number(value)
      result[field] = Number.isFinite(number) ? number : value
    }
  }
  result.batchDefectTotalDisplay = formatQuantity(result.batchDefectTotal, result.batchUnit)
  result.sampleQtyDisplay = formatQuantity(result.sampleQty, result.sampleUnit)
  result.defectQtyDisplay = formatQuantity(result.defectQty, result.defectUnit)
  result.defectRatePercent = formatPercent(result.defectRate)
  return result
}

function buildListWhere(query: Record<string, unknown>) {
  const conditions = [`del_flag = ?`]
  const params: unknown[] = [queryText(query.delFlag) || '0']

  like(conditions, params, 'report_no', query.reportNo)
  like(conditions, params, 'plan_no', query.planNo)
  dateEquals(conditions, params, 'report_date', query.reportDate)
  exact(conditions, params, 'shift_name', query.shiftName)
  like(conditions, params, 'finder_name', query.finderName)
  like(conditions, params, 'send_dept', query.sendDept)
  like(conditions, params, 'generate_process_name', query.generateProcessName)
  like(conditions, params, 'process_name', query.processName)
  dateEquals(conditions, params, 'occur_date', query.occurDate)
  dateRange(conditions, params, 'occur_date', query.beginOccurDate, query.endOccurDate)
  like(conditions, params, 'product_name', query.productName)
  like(conditions, params, 'product_spec', query.productSpec)
  like(conditions, params, 'mo_number', query.moNumber)
  like(conditions, params, 'risk_batch', query.riskBatch)
  if (query.batchDefectTotal !== null && query.batchDefectTotal !== undefined && String(query.batchDefectTotal) !== '') {
    conditions.push('batch_defect_total = ?')
    params.push(query.batchDefectTotal)
  }
  like(conditions, params, 'machine_no', query.machineNo)
  exact(conditions, params, 'defect_category', query.defectCategory)
  like(conditions, params, 'defect_item', query.defectItem)
  like(conditions, params, 'operator_name', query.operatorName)
  like(conditions, params, 'technician_name', query.technicianName)
  like(conditions, params, 'quality_name', query.qualityName)
  like(conditions, params, 'handler_name', query.handlerName)
  like(conditions, params, 'qc_confirm', query.qcConfirm)
  exact(conditions, params, 'status', query.status)

  const ids = csvIds(query.exportIds)
  if (ids.length) {
    conditions.push(`id IN (${ids.map(() => '?').join(', ')})`)
    params.push(...ids)
  }
  return { sql: where(conditions), params }
}

export async function listExceptionReports(event: H3Event) {
  return withReadSession(event, 'ExceptionList', async (_, pool) => {
    const query = getQuery(event) as Record<string, unknown>
    const page = pageRequest(query)
    const filter = buildListWhere(query)
    const result = await queryPage(
      pool,
      `SELECT COUNT(*) AS total FROM tk_exception_report${filter.sql}`,
      `SELECT ${exceptionColumns} FROM tk_exception_report${filter.sql} ORDER BY report_no DESC, create_time DESC, id DESC LIMIT ?, ?`,
      filter.params,
      [...filter.params, page.offset, page.pageSize],
    )
    return {
      code: 200,
      msg: '查询成功',
      rows: result.rows.map(mapExceptionRow),
      total: result.total,
    }
  }, '获取异常单列表失败')
}

export async function getExceptionReport(event: H3Event) {
  return withReadSession(event, 'ExceptionDetail', async (_, pool) => {
    const id = queryText(getRouterParam(event, 'id')).trim()
    if (!id) return apiError('参数不符合规范，不能进行查询', 500)

    const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`
      SELECT ${exceptionColumns}
      FROM tk_exception_report
      WHERE id = ?
      LIMIT 1`), [id])
    return apiSuccess(rows[0] ? mapExceptionRow(rows[0]) : null)
  }, '获取异常单详情失败')
}

const exportColumns: Array<[string, string]> = [
  ['报告编号', 'reportNo'],
  ['流程卡号', 'planNo'],
  ['报告生成日期', 'reportDate'],
  ['班别', 'shiftName'],
  ['发现人', 'finderName'],
  ['发出部门', 'sendDept'],
  ['产生工序', 'generateProcessName'],
  ['发现工序', 'processName'],
  ['发生日期', 'occurDate'],
  ['物料名称', 'productName'],
  ['封装', 'productSpec'],
  ['生产订单编号', 'moNumber'],
  ['芯片代码', 'chipCode'],
  ['芯片编号', 'chipNo'],
  ['涉及风险批', 'riskBatch'],
  ['批不良总数', 'batchDefectTotalDisplay'],
  ['处理方式', 'processingMethod'],
  ['发生机台', 'machineNo'],
  ['抽检数量', 'sampleQtyDisplay'],
  ['不良数量', 'defectQtyDisplay'],
  ['不良率', 'defectRatePercent'],
  ['不良项目', 'defectItem'],
  ['不良描述', 'defectDesc'],
  ['异常类别', 'defectCategory'],
  ['作业员', 'operatorName'],
  ['技术员', 'technicianName'],
  ['品质员', 'qualityName'],
  ['纠正及预防措施', 'causeAnalysis'],
  ['原因分析', 'reasonAnalysis'],
  ['处理人', 'handlerName'],
  ['QC确认', 'qcConfirm'],
  ['状态', 'status'],
]

export const exceptionExportHeaders = exportColumns.map(([label]) => label)

const categoryLabels: Record<string, string> = { P: '人', M: '机', L: '料', F: '法', E: '环', O: '人/机' }
const statusLabels: Record<string, string> = { '0': '待处理', '1': '处理中', '2': '已完成', '3': '已关闭' }

function exportValue(row: Record<string, unknown>, field: string): unknown {
  const value = row[field]
  if (field === 'defectCategory') return categoryLabels[String(value || '')] || value || ''
  if (field === 'status') return statusLabels[String(value || '')] || value || ''
  return value === null || value === undefined ? '' : value
}

export function exceptionExportRows(rows: RowDataPacket[]): Array<Record<string, unknown>> {
  return rows.map((raw) => {
    const row = mapExceptionRow(raw)
    return Object.fromEntries(exportColumns.map(([label, field]) => [label, exportValue(row, field)]))
  })
}

export async function exportExceptionReports(event: H3Event, sendExcel: (event: H3Event, rows: Array<Record<string, unknown>>) => unknown) {
  const query = await requestQuery(event)
  return withReadSession(event, 'ExceptionExport', async (_, pool) => {
    const filter = buildListWhere(query)
    const [countRows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(
      `SELECT COUNT(*) AS total FROM tk_exception_report${filter.sql}`,
    ), filter.params)
    const total = Number(countRows[0]?.total || 0)
    const rows: RowDataPacket[] = []
    const pageSize = 5000
    for (let offset = 0; offset < total; offset += pageSize) {
      const [pageRows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(
        `SELECT ${exceptionColumns} FROM tk_exception_report${filter.sql} ORDER BY report_no DESC, create_time DESC, id DESC LIMIT ?, ?`,
      ), [...filter.params, offset, pageSize])
      rows.push(...pageRows)
      if (!pageRows.length) break
    }
    return sendExcel(event, exceptionExportRows(rows))
  }, '导出异常单失败')
}

export async function getExceptionStats(event: H3Event) {
  return withReadSession(event, 'ExceptionStats', async (_, pool) => {
    const [categoryResult, processResult, trendResult] = await Promise.all([
      pool.query<RowDataPacket[]>(mysqlQueryOptions(`
        SELECT defect_category AS name, COUNT(*) AS value
        FROM tk_exception_report
        WHERE del_flag = '0'
        GROUP BY defect_category`)),
      pool.query<RowDataPacket[]>(mysqlQueryOptions(`
        SELECT process_name AS name, COUNT(*) AS value
        FROM tk_exception_report
        WHERE del_flag = '0'
        GROUP BY process_name
        ORDER BY value DESC
        LIMIT 10`)),
      pool.query<RowDataPacket[]>(mysqlQueryOptions(`
        SELECT DATE_FORMAT(occur_date, '%Y-%m-%d') AS day, COUNT(*) AS value
        FROM tk_exception_report
        WHERE del_flag = '0'
          AND occur_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        GROUP BY day
        ORDER BY day ASC`)),
    ])
    return apiSuccess({
      category: camelizeRows(categoryResult[0]),
      process: camelizeRows(processResult[0]),
      trend: camelizeRows(trendResult[0]),
    })
  }, '获取异常单统计失败')
}

const dashboardDays = new Set([7, 30, 90])

function localDateOnly(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function shiftLocalDate(date: Date, offset: number): string {
  const shifted = new Date(date)
  shifted.setDate(shifted.getDate() + offset)
  return localDateOnly(shifted)
}

function dashboardWindow(days: number) {
  // The SQL interval is derived only from the allow-listed values above.
  // Keeping the boundary in every query makes the dashboard bounded even when
  // the table contains years of historical exception reports.
  const intervalDays = days - 1
  return `
    del_flag = '0'
    AND occur_date >= DATE_SUB(CURDATE(), INTERVAL ${intervalDays} DAY)
    AND occur_date < DATE_ADD(CURDATE(), INTERVAL 1 DAY)`
}

function dashboardNumber(value: unknown): number {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function dashboardRankRows(rows: RowDataPacket[]) {
  return rows.map((row) => ({
    name: String(row.name || '未填写'),
    total: dashboardNumber(row.total),
    pending: dashboardNumber(row.pending),
  }))
}

function dashboardTrendRows(rows: RowDataPacket[]) {
  return rows.map((row) => ({
    day: String(row.day || ''),
    total: dashboardNumber(row.total),
    pending: dashboardNumber(row.pending),
    processing: dashboardNumber(row.processing),
    resolved: dashboardNumber(row.resolved),
  }))
}

function dashboardLatestRows(rows: RowDataPacket[]) {
  return rows.map((row) => ({
    id: row.id,
    reportNo: row.report_no || '',
    planNo: row.plan_no || '',
    occurDate: row.occur_date || '',
    processName: row.process_name || '',
    machineNo: row.machine_no || '',
    productName: row.product_name || '',
    productSpec: row.product_spec || '',
    defectItem: row.defect_item || '',
    defectCategory: row.defect_category || '',
    riskBatch: row.risk_batch || '',
    status: String(row.status ?? '0'),
    createTime: row.create_time || '',
  }))
}

export async function getExceptionDashboard(event: H3Event) {
  return withReadSession(event, 'ExceptionDashboard', async (_, pool) => {
    const query = getQuery(event) as Record<string, unknown>
    const requestedDays = Number(queryText(query.days || 30))
    if (!dashboardDays.has(requestedDays)) {
      return apiError('时间范围只支持 7、30 或 90 天', 400)
    }

    const windowSql = dashboardWindow(requestedDays)
    const [summaryResult, trendResult, categoryResult, processResult, machineResult, productResult, latestResult] = await Promise.all([
      pool.query<RowDataPacket[]>(mysqlQueryOptions(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN occur_date >= CURDATE() AND occur_date < DATE_ADD(CURDATE(), INTERVAL 1 DAY) THEN 1 ELSE 0 END) AS today,
          SUM(CASE WHEN status = '0' THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN status = '1' THEN 1 ELSE 0 END) AS processing,
          SUM(CASE WHEN status IN ('2', '3') THEN 1 ELSE 0 END) AS resolved
        FROM tk_exception_report
        WHERE ${windowSql}`)),
      pool.query<RowDataPacket[]>(mysqlQueryOptions(`
        SELECT
          DATE_FORMAT(occur_date, '%Y-%m-%d') AS day,
          COUNT(*) AS total,
          SUM(CASE WHEN status = '0' THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN status = '1' THEN 1 ELSE 0 END) AS processing,
          SUM(CASE WHEN status IN ('2', '3') THEN 1 ELSE 0 END) AS resolved
        FROM tk_exception_report
        WHERE ${windowSql}
        GROUP BY DATE_FORMAT(occur_date, '%Y-%m-%d')
        ORDER BY day ASC`)),
      pool.query<RowDataPacket[]>(mysqlQueryOptions(`
        SELECT
          COALESCE(NULLIF(TRIM(defect_category), ''), '未填写') AS name,
          COUNT(*) AS total,
          SUM(CASE WHEN status IN ('0', '1') THEN 1 ELSE 0 END) AS pending
        FROM tk_exception_report
        WHERE ${windowSql}
        GROUP BY COALESCE(NULLIF(TRIM(defect_category), ''), '未填写')
        ORDER BY total DESC, pending DESC, name ASC
        LIMIT 10`)),
      pool.query<RowDataPacket[]>(mysqlQueryOptions(`
        SELECT
          COALESCE(NULLIF(TRIM(process_name), ''), '未填写') AS name,
          COUNT(*) AS total,
          SUM(CASE WHEN status IN ('0', '1') THEN 1 ELSE 0 END) AS pending
        FROM tk_exception_report
        WHERE ${windowSql}
        GROUP BY COALESCE(NULLIF(TRIM(process_name), ''), '未填写')
        ORDER BY total DESC, pending DESC, name ASC
        LIMIT 10`)),
      pool.query<RowDataPacket[]>(mysqlQueryOptions(`
        SELECT
          COALESCE(NULLIF(TRIM(machine_no), ''), '未填写') AS name,
          COUNT(*) AS total,
          SUM(CASE WHEN status IN ('0', '1') THEN 1 ELSE 0 END) AS pending
        FROM tk_exception_report
        WHERE ${windowSql}
        GROUP BY COALESCE(NULLIF(TRIM(machine_no), ''), '未填写')
        ORDER BY total DESC, pending DESC, name ASC
        LIMIT 10`)),
      pool.query<RowDataPacket[]>(mysqlQueryOptions(`
        SELECT
          COALESCE(NULLIF(TRIM(product_name), ''), '未填写') AS name,
          COUNT(*) AS total,
          SUM(CASE WHEN status IN ('0', '1') THEN 1 ELSE 0 END) AS pending
        FROM tk_exception_report
        WHERE ${windowSql}
        GROUP BY COALESCE(NULLIF(TRIM(product_name), ''), '未填写')
        ORDER BY total DESC, pending DESC, name ASC
        LIMIT 10`)),
      pool.query<RowDataPacket[]>(mysqlQueryOptions(`
        SELECT
          id, report_no, plan_no,
          DATE_FORMAT(occur_date, '%Y-%m-%d') AS occur_date,
          process_name, machine_no, product_name, product_spec,
          defect_item, defect_category, risk_batch, status,
          DATE_FORMAT(create_time, '%Y-%m-%d %H:%i:%s') AS create_time
        FROM tk_exception_report
        WHERE ${windowSql}
          AND status IN ('0', '1')
        ORDER BY create_time DESC, id DESC
        LIMIT 12`)),
    ])

    const summaryRow = summaryResult[0][0] || {}
    const total = dashboardNumber(summaryRow.total)
    const today = dashboardNumber(summaryRow.today)
    const pending = dashboardNumber(summaryRow.pending)
    const processing = dashboardNumber(summaryRow.processing)
    const resolved = dashboardNumber(summaryRow.resolved)
    const now = new Date()

    return apiSuccess({
      period: {
        days: requestedDays,
        startDate: shiftLocalDate(now, -(requestedDays - 1)),
        endDate: localDateOnly(now),
      },
      generatedAt: now.toISOString(),
      summary: {
        total,
        today,
        pending,
        processing,
        resolved,
        resolutionRate: total > 0 ? Number((resolved / total).toFixed(4)) : 0,
      },
      trend: dashboardTrendRows(trendResult[0]),
      category: dashboardRankRows(categoryResult[0]),
      process: dashboardRankRows(processResult[0]),
      machine: dashboardRankRows(machineResult[0]),
      product: dashboardRankRows(productResult[0]),
      latest: dashboardLatestRows(latestResult[0]),
    })
  }, '获取异常看板数据失败')
}
