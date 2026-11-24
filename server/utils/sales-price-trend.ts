import { queryK3SqlServer, sqlDateParameter, sqlParameterName, sqlStringParameter } from './sqlserver'

export const MAX_ROWS = 20_000
export const MAX_OPTION_ROWS = 50
export const MAX_SERIES = 200

export class SalesPriceTrendInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SalesPriceTrendInputError'
  }
}

type TrendPoint = {
  billNo: string
  date: string
  customerNumber: string
  customerName: string
  materialNumber: string
  materialName: string
  qty: number | null
  preTaxPrice: number | null
  taxPrice: number | null
  amount: number | null
}

type OptionRow = {
  number: string
  name: string
  specification?: string
  orderCount: number
}

function hasText(value: unknown): boolean {
  return value != null && String(value).trim() !== ''
}

export function splitCodes(raw: unknown, label: string): string[] {
  if (!hasText(raw)) return []
  const values = new Set<string>()
  for (const value of String(raw).split(',')) {
    const normalized = value.trim()
    if (!normalized) continue
    if (/[,\r\n]/.test(normalized)) throw new SalesPriceTrendInputError(`${label}编码格式不正确`)
    values.add(normalized)
  }
  return [...values]
}

export function parseDate(value: unknown, label: string): string {
  const normalized = String(value ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new SalesPriceTrendInputError(`${label}格式不正确，应为 YYYY-MM-DD`)
  }
  const date = new Date(`${normalized}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
    throw new SalesPriceTrendInputError(`${label}格式不正确，应为 YYYY-MM-DD`)
  }
  return normalized
}

function nextDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

function validateDateRange(beginDate: unknown, endDate: unknown): { begin: string; end: string; endExclusive: string } {
  const begin = parseDate(beginDate, '开始日期')
  const end = parseDate(endDate, '结束日期')
  if (end < begin) throw new SalesPriceTrendInputError('结束日期不能早于开始日期')
  return { begin, end, endExclusive: nextDate(end) }
}

function normalizeNumber(value: unknown): number | null {
  if (value == null || String(value).trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function normalizeDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value ?? '').slice(0, 10)
}

function placeholders(prefix: string, values: string[]): string {
  return values.map((_, index) => `@${sqlParameterName(prefix, index)}`).join(', ')
}

function bindCodes(request: any, prefix: string, values: string[]): void {
  values.forEach((value, index) => sqlStringParameter(request, sqlParameterName(prefix, index), value))
}

export async function querySalesPriceTrendOptions(input: {
  type: unknown
  keyword?: unknown
  limit?: unknown
  beginDate?: unknown
  endDate?: unknown
  customerNumbers?: unknown
}): Promise<OptionRow[]> {
  const type = String(input.type || '').trim().toLowerCase()
  if (type !== 'customer' && type !== 'material') {
    throw new SalesPriceTrendInputError('选项类型必须是 customer 或 material')
  }

  const keyword = hasText(input.keyword) ? String(input.keyword).trim() : ''
  const customerNumbers = splitCodes(input.customerNumbers, '客户')
  let dateRange: { begin: string; endExclusive: string } | null = null
  if (hasText(input.beginDate) || hasText(input.endDate)) {
    if (!hasText(input.beginDate) || !hasText(input.endDate)) {
      throw new SalesPriceTrendInputError('客户订单日期范围必须同时提供开始日期和结束日期')
    }
    const range = validateDateRange(input.beginDate, input.endDate)
    dateRange = { begin: range.begin, endExclusive: range.endExclusive }
  }

  const requestedLimit = Number(input.limit ?? 50)
  const limit = keyword ? Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 50, 1), MAX_OPTION_ROWS) : 0
  const customer = type === 'customer'
  const baseTable = customer ? 'T_BD_CUSTOMER' : 'T_BD_MATERIAL'
  const localeTable = customer ? 'T_BD_CUSTOMER_L' : 'T_BD_MATERIAL_L'
  const idColumn = customer ? 'FCUSTID' : 'FMATERIALID'
  const localeColumns = customer ? 'localeRow.FNAME' : 'localeRow.FNAME, localeRow.FSPECIFICATION'
  const resultSpecification = customer ? '' : ", COALESCE(locale.FSPECIFICATION, '') AS specification"
  const topClause = limit > 0 ? ` TOP ${limit}` : ''
  const params: Array<{ name: string; value: unknown }> = []
  let orderSummaryJoin = ''

  if (dateRange) {
    const entityExpression = customer ? 'saleOrder.FCUSTID' : 'saleEntry.FMATERIALID'
    const customerScopeJoin = !customer && customerNumbers.length
      ? ' JOIN dbo.T_BD_CUSTOMER optionCustomer ON optionCustomer.FCUSTID = saleOrder.FCUSTID'
      : ''
    const customerScopeClause = !customer && customerNumbers.length
      ? ` AND optionCustomer.FNUMBER IN (${placeholders('customer', customerNumbers)})`
      : ''
    const summaryFrom = customer
      ? ' FROM dbo.T_SAL_ORDER saleOrder'
      : ` FROM dbo.T_SAL_ORDER saleOrder JOIN dbo.T_SAL_ORDERENTRY saleEntry ON saleEntry.FID = saleOrder.FID${customerScopeJoin}`
    orderSummaryJoin = ` JOIN (SELECT ${entityExpression} AS entityId, COUNT(DISTINCT saleOrder.FID) AS orderCount${summaryFrom} WHERE saleOrder.FDOCUMENTSTATUS = 'C' AND saleOrder.FDATE >= @optionBegin AND saleOrder.FDATE < @optionEnd${customerScopeClause} GROUP BY ${entityExpression}) orderSummary ON orderSummary.entityId = base.${idColumn}`
    params.push({ name: 'optionBegin', value: dateRange.begin }, { name: 'optionEnd', value: dateRange.endExclusive })
    if (!customer && customerNumbers.length) customerNumbers.forEach((value, index) => params.push({ name: sqlParameterName('customer', index), value }))
  }

  const keywordFilter = keyword
    ? customer
      ? "(base.FNUMBER LIKE @keyword OR COALESCE(locale.FNAME, '') LIKE @keyword)"
      : "(base.FNUMBER LIKE @keyword OR COALESCE(locale.FNAME, '') LIKE @keyword OR COALESCE(locale.FSPECIFICATION, '') LIKE @keyword)"
    : ''
  const filterClause = keyword ? ` WHERE ${keywordFilter}` : ''
  const orderClause = dateRange ? ' ORDER BY orderSummary.orderCount DESC, base.FNUMBER ASC' : ' ORDER BY base.FNUMBER ASC'
  const query = `SELECT${topClause} base.FNUMBER AS number, COALESCE(locale.FNAME, '') AS name${resultSpecification}, ${dateRange ? 'COALESCE(orderSummary.orderCount, 0)' : '0'} AS orderCount FROM dbo.${baseTable} base${orderSummaryJoin} OUTER APPLY (SELECT TOP 1 ${localeColumns} FROM dbo.${localeTable} localeRow WHERE localeRow.${idColumn} = base.${idColumn} ORDER BY CASE WHEN localeRow.FLOCALEID = 2052 THEN 0 ELSE 1 END, localeRow.FLOCALEID) locale${filterClause}${orderClause}`
  if (keyword) params.push({ name: 'keyword', value: `%${keyword}%` })

  return queryK3SqlServer(async (request) => {
    for (const param of params) {
      if (param.name === 'optionBegin' || param.name === 'optionEnd') sqlDateParameter(request, param.name, String(param.value))
      else sqlStringParameter(request, param.name, String(param.value))
    }
    return request.query(query)
  }).then((rows) => rows.map((row: any) => ({
    number: String(row.number ?? ''),
    name: String(row.name ?? ''),
    ...(customer ? {} : { specification: String(row.specification ?? '') }),
    orderCount: Number(row.orderCount ?? 0),
  })))
}

export async function querySalesPriceTrend(input: {
  customerNumbers?: unknown
  materialNumbers?: unknown
  beginDate?: unknown
  endDate?: unknown
}): Promise<Record<string, unknown>> {
  const customers = splitCodes(input.customerNumbers, '客户')
  const materials = splitCodes(input.materialNumbers, '物料')
  if (!customers.length && !materials.length) throw new SalesPriceTrendInputError('客户和物料至少选择一项')
  if (customers.length && materials.length && customers.length * materials.length > MAX_SERIES) {
    throw new SalesPriceTrendInputError('客户×物料组合最多查询 200 条曲线，请减少选择')
  }
  const range = validateDateRange(input.beginDate, input.endDate)
  const customerClause = customers.length ? ` AND customer.FNUMBER IN (${placeholders('customer', customers)})` : ''
  const materialClause = materials.length ? ` AND material.FNUMBER IN (${placeholders('material', materials)})` : ''
  const query = `SELECT TOP ${MAX_ROWS + 1} saleOrder.FBILLNO AS billNo, saleOrder.FDATE AS orderDate, customer.FNUMBER AS customerNumber, COALESCE(customerLocale.FNAME, '') AS customerName, material.FNUMBER AS materialNumber, COALESCE(materialLocale.FNAME, '') AS materialName, entry.FQTY AS qty, entryFinance.FPRICE AS preTaxPrice, entryFinance.FTAXPRICE AS taxPrice, entryFinance.FALLAMOUNT AS amount FROM dbo.T_SAL_ORDER saleOrder JOIN dbo.T_SAL_ORDERENTRY entry ON entry.FID = saleOrder.FID LEFT JOIN dbo.T_SAL_ORDERENTRY_F entryFinance ON entryFinance.FENTRYID = entry.FENTRYID LEFT JOIN dbo.T_BD_CUSTOMER customer ON customer.FCUSTID = saleOrder.FCUSTID OUTER APPLY (SELECT TOP 1 localeRow.FNAME FROM dbo.T_BD_CUSTOMER_L localeRow WHERE localeRow.FCUSTID = customer.FCUSTID ORDER BY CASE WHEN localeRow.FLOCALEID = 2052 THEN 0 ELSE 1 END, localeRow.FLOCALEID) customerLocale LEFT JOIN dbo.T_BD_MATERIAL material ON material.FMATERIALID = entry.FMATERIALID OUTER APPLY (SELECT TOP 1 localeRow.FNAME FROM dbo.T_BD_MATERIAL_L localeRow WHERE localeRow.FMATERIALID = material.FMATERIALID ORDER BY CASE WHEN localeRow.FLOCALEID = 2052 THEN 0 ELSE 1 END, localeRow.FLOCALEID) materialLocale WHERE saleOrder.FDOCUMENTSTATUS = 'C' AND saleOrder.FDATE >= @beginDate AND saleOrder.FDATE < @endDate${customerClause}${materialClause} ORDER BY saleOrder.FDATE ASC, saleOrder.FBILLNO ASC, entry.FSEQ ASC`
  const rows = await queryK3SqlServer(async (request) => {
    sqlDateParameter(request, 'beginDate', range.begin)
    sqlDateParameter(request, 'endDate', range.endExclusive)
    bindCodes(request, 'customer', customers)
    bindCodes(request, 'material', materials)
    return request.query(query)
  })
  const rawRows = rows.map((row: any): TrendPoint => ({
    billNo: String(row.billNo ?? '').trim(),
    date: normalizeDate(row.orderDate),
    customerNumber: String(row.customerNumber ?? '').trim(),
    customerName: String(row.customerName ?? '').trim(),
    materialNumber: String(row.materialNumber ?? '').trim(),
    materialName: String(row.materialName ?? '').trim(),
    qty: normalizeNumber(row.qty),
    preTaxPrice: normalizeNumber(row.preTaxPrice),
    taxPrice: normalizeNumber(row.taxPrice),
    amount: normalizeNumber(row.amount),
  }))
  const truncated = rawRows.length > MAX_ROWS
  const points = truncated ? rawRows.slice(0, MAX_ROWS) : rawRows
  const grouped = new Map<string, TrendPoint[]>()
  for (const point of points) {
    const key = `${point.customerNumber}\u0000${point.materialNumber}`
    const bucket = grouped.get(key) || []
    bucket.push(point)
    grouped.set(key, bucket)
  }
  if (grouped.size > MAX_SERIES) {
    throw new SalesPriceTrendInputError('当前筛选匹配到超过 200 条曲线，请再选择一个客户或物料，或缩小日期范围')
  }

  const series = [...grouped.entries()]
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, bucket]) => {
      const first = bucket[0]
      const latest = bucket[bucket.length - 1]
      return {
        key,
        customerNumber: first.customerNumber,
        customerName: first.customerName,
        materialNumber: first.materialNumber,
        materialName: first.materialName,
        points: bucket.map(pointMap),
        first: pointMap(first),
        latest: pointMap(latest),
        change: {
          preTax: difference(first.preTaxPrice, latest.preTaxPrice),
          tax: difference(first.taxPrice, latest.taxPrice),
          preTaxPercent: percentChange(first.preTaxPrice, latest.preTaxPrice),
          taxPercent: percentChange(first.taxPrice, latest.taxPrice),
        },
      }
    })

  return {
    series,
    seriesCount: series.length,
    pointCount: points.length,
    truncated,
    beginDate: range.begin,
    endDate: range.end,
    source: 'K3 SQL Server / T_SAL_ORDER',
    documentStatus: 'C',
  }
}

function pointMap(point: TrendPoint) {
  return {
    date: point.date,
    billNo: point.billNo,
    qty: point.qty,
    preTaxPrice: point.preTaxPrice,
    taxPrice: point.taxPrice,
    amount: point.amount,
  }
}

function difference(first: number | null, latest: number | null): number | null {
  if (first == null || latest == null) return null
  return Number((latest - first).toFixed(6))
}

export function percentChange(first: number | null, latest: number | null): number | null {
  if (first == null || latest == null || first === 0) return null
  return Number((((latest - first) / first) * 100).toFixed(2))
}
