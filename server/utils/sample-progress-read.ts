import { getQuery, getRouterParam, type H3Event } from 'h3'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { apiSuccess } from './response'
import { mysqlQueryOptions } from './mysql'
import { dataResult, pageRequest, queryPage, queryText, tableResult, withReadPermissionSession } from './read'

const SAMPLE_PROGRESS_QUERY_PERMISSION = 'tk_custom:sampleProgress:query'

export const sampleProgressStatusOptions = [
  { value: 'registered', label: '已登记' },
  { value: 'purchasing', label: '采购中' },
  { value: 'waiting_sample', label: '待到样' },
  { value: 'received', label: '已到样' },
  { value: 'testing', label: '测试中' },
  { value: 'shipped', label: '已寄出' },
  { value: 'converted', label: '已转订单' },
  { value: 'closed', label: '已关闭' },
  { value: 'abnormal', label: '异常' },
] as const

export const sampleProgressStatusLabels = Object.fromEntries(
  sampleProgressStatusOptions.map((item) => [item.value, item.label]),
)

const columns = `
  id, customer_received, salesperson, country, city, customer_name, customer_type,
  product_application, brand_requirement, grade_requirement, part_no, package_name,
  quantity, unit, datasheet, DATE_FORMAT(sample_order_date, '%Y-%m-%d') AS sample_order_date,
  DATE_FORMAT(sample_required_date, '%Y-%m-%d') AS sample_required_date, buyer, supplier_code,
  chip_size, wafer_factory_code, DATE_FORMAT(sample_due_date, '%Y-%m-%d') AS sample_due_date,
  merchandiser, actual_arrival_qty, delivery_status,
  DATE_FORMAT(actual_delivery_date, '%Y-%m-%d') AS actual_delivery_date,
  test_qty, retained_qty, shipping_status, test_owner, test_result, order_status,
  progress_status, remark, source_file, source_row, created_by_id, created_by_name,
  created_at, updated_by_id, updated_by_name, updated_at
`

type Query = Record<string, unknown>

function text(value: unknown): string {
  return String(Array.isArray(value) ? value[0] ?? '' : value ?? '').trim()
}

function like(conditions: string[], params: unknown[], column: string, value: unknown) {
  const valueText = text(value)
  if (valueText) {
    conditions.push(`${column} LIKE CONCAT('%', ?, '%')`)
    params.push(valueText)
  }
}

function equal(conditions: string[], params: unknown[], column: string, value: unknown) {
  const valueText = text(value)
  if (valueText) {
    conditions.push(`${column} = ?`)
    params.push(valueText)
  }
}

function filter(query: Query) {
  const conditions: string[] = []
  const params: unknown[] = []
  const keyword = text(query.keyword)
  if (keyword) {
    conditions.push(`(
      customer_name LIKE CONCAT('%', ?, '%')
      OR part_no LIKE CONCAT('%', ?, '%')
      OR salesperson LIKE CONCAT('%', ?, '%')
      OR country LIKE CONCAT('%', ?, '%')
      OR city LIKE CONCAT('%', ?, '%')
      OR test_result LIKE CONCAT('%', ?, '%')
      OR order_status LIKE CONCAT('%', ?, '%')
    )`)
    params.push(keyword, keyword, keyword, keyword, keyword, keyword, keyword)
  }
  equal(conditions, params, 'progress_status', query.status)
  equal(conditions, params, 'salesperson', query.salesperson)
  equal(conditions, params, 'country', query.country)
  like(conditions, params, 'customer_name', query.customerName)
  like(conditions, params, 'part_no', query.partNo)

  const beginDate = text(query.sampleOrderDateFrom)
  const endDate = text(query.sampleOrderDateTo)
  if (beginDate) { conditions.push('sample_order_date >= ?'); params.push(beginDate) }
  if (endDate) { conditions.push('sample_order_date <= ?'); params.push(endDate) }
  if (text(query.overdue) === '1') {
    conditions.push("sample_required_date < CURDATE() AND progress_status NOT IN ('closed', 'converted')")
  }
  return {
    sql: conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '',
    params,
  }
}

function mapRow(row: RowDataPacket): Record<string, unknown> {
  const status = String(row.progress_status || 'registered')
  return {
    id: row.id,
    customerReceived: row.customer_received,
    salesperson: row.salesperson,
    country: row.country,
    city: row.city,
    customerName: row.customer_name,
    customerType: row.customer_type,
    productApplication: row.product_application,
    brandRequirement: row.brand_requirement,
    gradeRequirement: row.grade_requirement,
    partNo: row.part_no,
    packageName: row.package_name,
    quantity: row.quantity,
    unit: row.unit,
    datasheet: row.datasheet,
    sampleOrderDate: row.sample_order_date,
    sampleRequiredDate: row.sample_required_date,
    buyer: row.buyer,
    supplierCode: row.supplier_code,
    chipSize: row.chip_size,
    waferFactoryCode: row.wafer_factory_code,
    sampleDueDate: row.sample_due_date,
    merchandiser: row.merchandiser,
    actualArrivalQty: row.actual_arrival_qty,
    deliveryStatus: row.delivery_status,
    actualDeliveryDate: row.actual_delivery_date,
    testQty: row.test_qty,
    retainedQty: row.retained_qty,
    shippingStatus: row.shipping_status,
    testOwner: row.test_owner,
    testResult: row.test_result,
    orderStatus: row.order_status,
    progressStatus: status,
    progressStatusLabel: sampleProgressStatusLabels[status] || status,
    remark: row.remark,
    sourceFile: row.source_file,
    sourceRow: row.source_row,
    createdById: row.created_by_id,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedById: row.updated_by_id,
    updatedByName: row.updated_by_name,
    updatedAt: row.updated_at,
  }
}

export async function listSampleProgress(event: H3Event) {
  return withReadPermissionSession(event, 'SampleProgressList', SAMPLE_PROGRESS_QUERY_PERMISSION, async (_, pool) => {
    const query = getQuery(event) as Query
    const page = pageRequest(query)
    const where = filter(query)
    const result = await queryPage(
      pool,
      `SELECT COUNT(*) AS total FROM tk_sample_progress${where.sql}`,
      `SELECT ${columns} FROM tk_sample_progress${where.sql} ORDER BY created_at DESC, COALESCE(sample_required_date, sample_order_date, created_at) DESC, id DESC LIMIT ?, ?`,
      where.params,
      [...where.params, page.offset, page.pageSize],
    )
    return tableResult(result.rows.map(mapRow), result.total)
  }, '获取客户样品进度列表失败')
}

export async function sampleProgressOptions(event: H3Event) {
  return withReadPermissionSession(event, 'SampleProgressOptions', SAMPLE_PROGRESS_QUERY_PERMISSION, async (_, pool) => {
    const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`
      SELECT 'salesperson' AS field, TRIM(salesperson) AS value
      FROM tk_sample_progress
      WHERE salesperson IS NOT NULL AND TRIM(salesperson) <> ''
      GROUP BY TRIM(salesperson)
      UNION ALL
      SELECT 'country' AS field, TRIM(country) AS value
      FROM tk_sample_progress
      WHERE country IS NOT NULL AND TRIM(country) <> ''
      GROUP BY TRIM(country)
      ORDER BY field, value
    `), [])
    const options = { salesperson: [] as string[], country: [] as string[] }
    for (const row of rows) {
      const field = String(row.field || '')
      const value = String(row.value || '').trim()
      if ((field === 'salesperson' || field === 'country') && value) options[field].push(value)
    }
    return apiSuccess(options)
  }, '获取客户样品筛选项失败')
}

export async function getSampleProgress(event: H3Event) {
  return withReadPermissionSession(event, 'SampleProgressDetail', SAMPLE_PROGRESS_QUERY_PERMISSION, async (_, pool) => {
    const id = text(getRouterParam(event, 'id'))
    if (!id) return apiSuccess(null)
    const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(
      `SELECT ${columns} FROM tk_sample_progress WHERE id = ? LIMIT 1`,
    ), [id])
    return dataResult(rows[0] ? mapRow(rows[0]) : null)
  }, '获取客户样品进度详情失败')
}

export async function sampleProgressSummary(event: H3Event) {
  return withReadPermissionSession(event, 'SampleProgressSummary', SAMPLE_PROGRESS_QUERY_PERMISSION, async (_, pool) => {
    // 统计卡跟随列表筛选条件（关键词/状态/业务员/国家/下单日期/逾期），避免筛后数字对不上。
    const query = getQuery(event) as Query
    const where = filter(query)
    const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`
      SELECT
        COUNT(*) AS total,
        SUM(progress_status = 'registered') AS registered,
        SUM(progress_status IN ('purchasing', 'waiting_sample')) AS waiting,
        SUM(progress_status IN ('received', 'testing', 'shipped')) AS processing,
        SUM(progress_status IN ('converted', 'closed')) AS completed,
        SUM(progress_status = 'abnormal') AS abnormal,
        SUM(sample_required_date < CURDATE() AND progress_status NOT IN ('closed', 'converted')) AS overdue
      FROM tk_sample_progress${where.sql}
    `), where.params)
    return apiSuccess(Object.fromEntries(Object.entries(rows[0] || {}).map(([key, value]) => [key, Number(value || 0)])))
  }, '获取客户样品进度统计失败')
}

export async function querySampleProgressExportRows(pool: Pool, query: Query) {
  const where = filter(query)
  const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(
    `SELECT ${columns} FROM tk_sample_progress${where.sql} ORDER BY created_at DESC, COALESCE(sample_required_date, sample_order_date, created_at) DESC, id DESC`,
  ), where.params)
  return rows.map(mapRow)
}
