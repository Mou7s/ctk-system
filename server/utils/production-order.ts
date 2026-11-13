import { executeBillQuery } from './k3'

export const PRODUCTION_ORDER_FORM = 'PRD_MO'
export const PRODUCTION_ORDER_SUMMARY_BATCH_SIZE = 1_000
export const PRODUCTION_ORDER_SUMMARY_MAX_ROWS = 20_000

const FIELD_KEYS = [
  'FID',
  'FTreeEntity_FEntryId',
  'FBillNo',
  'FTreeEntity_FSeq',
  'FDate',
  'FMaterialId.FNumber',
  'FMaterialId.FName',
  'FMaterialId.FSpecification',
  'FQty',
  'FRepQuaAuxQty',
  'FStockInQuaAuxQty',
  'FStatus',
  'FDocumentStatus',
  'FCreateDate',
  'FApproveDate',
]

export class ProductionOrderInputError extends Error {
  readonly statusCode = 400

  constructor(message: string) {
    super(message)
    this.name = 'ProductionOrderInputError'
  }
}

type ProductionOrderInput = Record<string, unknown>

function scalar(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value
}

function text(value: unknown): string {
  return String(scalar(value) ?? '')
}

function trimmed(value: unknown): string {
  return text(value).trim()
}

function hasText(value: unknown): boolean {
  return trimmed(value) !== ''
}

function escapeFilterValue(value: unknown): string {
  const normalized = trimmed(value)
  if (/[[\]\r\n]/.test(normalized)) throw new ProductionOrderInputError('生产订单筛选参数包含非法字符')
  return normalized.replace(/'/g, "''")
}

function parseDate(value: unknown, label: string): string {
  const normalized = trimmed(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new ProductionOrderInputError(`${label}格式不正确`)
  const date = new Date(`${normalized}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
    throw new ProductionOrderInputError(`${label}格式不正确`)
  }
  return normalized
}

function nextDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

function dateRangeFilter(field: string, begin: string | null, endExclusive: string | null): string {
  const clauses: string[] = []
  if (begin) clauses.push(`${field}>='${begin}'`)
  if (endExclusive) clauses.push(`${field}<'${endExclusive}'`)
  return `(${clauses.join(' and ')})`
}

function parseDateBounds(input: ProductionOrderInput): { begin: string | null; end: string | null; endExclusive: string | null } {
  const begin = hasText(input.beginDate) ? parseDate(input.beginDate, '开始日期') : null
  const end = hasText(input.endDate) ? parseDate(input.endDate, '结束日期') : null
  if (begin && end && end < begin) throw new ProductionOrderInputError('结束日期不能早于开始日期')
  return { begin, end, endExclusive: end ? nextDate(end) : null }
}

export function buildProductionOrderFilter(input: ProductionOrderInput = {}): string {
  const filters = ['1=1']
  if (hasText(input.billNo)) filters.push(`FBillNo like '%${escapeFilterValue(input.billNo)}%'`)
  if (hasText(input.material)) {
    const keyword = escapeFilterValue(input.material)
    filters.push(`(FMaterialId.FNumber like '%${keyword}%' or FMaterialId.FName like '%${keyword}%')`)
  }
  if (hasText(input.packageName)) filters.push(`FMaterialId.FSpecification like '${escapeFilterValue(input.packageName)}%'`)
  if (hasText(input.status)) {
    const status = trimmed(input.status)
    if (!/^[1-7]$/.test(status)) throw new ProductionOrderInputError('生产状态参数不正确')
    filters.push(`FStatus='${status}'`)
  }
  if (hasText(input.documentStatus)) {
    const documentStatus = trimmed(input.documentStatus).toUpperCase()
    if (!/^[A-DZ]$/.test(documentStatus)) throw new ProductionOrderInputError('生产订单单据状态参数不正确')
    filters.push(`FDocumentStatus='${documentStatus}'`)
  }

  const range = parseDateBounds(input)
  if (range.begin || range.endExclusive) {
    filters.push(`(${dateRangeFilter('FCreateDate', range.begin, range.endExclusive)} or ${dateRangeFilter('FApproveDate', range.begin, range.endExclusive)})`)
  }
  return filters.join(' and ')
}

function pageValue(value: unknown, defaultValue: number, minimum: number, maximum: number): number {
  if (value == null || value === '') return defaultValue
  const parsed = Number(scalar(value))
  if (!Number.isInteger(parsed) || parsed < 0) throw new ProductionOrderInputError('分页参数不正确')
  return Math.min(Math.max(parsed, minimum), maximum)
}

function rowValues(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('金蝶查询返回异常')
  if (value.length !== FIELD_KEYS.length) throw new Error('金蝶查询返回字段数量异常')
  return value
}

async function queryRows(filter: string, startRow: number, limit: number): Promise<unknown[][]> {
  const result = await executeBillQuery({
    formId: PRODUCTION_ORDER_FORM,
    fieldKeys: FIELD_KEYS,
    filterString: filter,
    orderString: 'FDate DESC,FBillNo DESC,FTreeEntity_FSeq ASC',
    startRow,
    limit,
  })
  if (!Array.isArray(result)) throw new Error('金蝶查询返回异常')
  return result.map(rowValues)
}

function toRow(values: unknown[]): Record<string, unknown> {
  return {
    id: values[0],
    entryId: values[1],
    billNo: values[2],
    seq: values[3],
    date: values[4],
    materialNumber: values[5],
    materialName: values[6],
    specification: values[7],
    qty: values[8],
    reportedQty: values[9],
    stockInQty: values[10],
    status: values[11],
    documentStatus: values[12],
    createDate: values[13],
    approveDate: values[14],
  }
}

function formatDate(value: unknown): string {
  const normalized = text(value)
  return normalized ? normalized.slice(0, 10) : '未知日期'
}

function isEventDateInRange(value: unknown, beginDate: unknown, endDate: unknown): boolean {
  if (!hasText(value)) return false
  const date = formatDate(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const begin = hasText(beginDate) ? parseDate(beginDate, '开始日期') : null
  const end = hasText(endDate) ? parseDate(endDate, '结束日期') : null
  return (!begin || date >= begin) && (!end || date <= end)
}

function packageName(value: unknown): string {
  const normalized = hasText(value) ? trimmed(value) : '未维护封装'
  const slash = normalized.search(/[\/／]/)
  return slash > 0 ? normalized.slice(0, slash).trim() : normalized
}

function numberValue(value: unknown): number {
  const parsed = Number(scalar(value))
  return Number.isFinite(parsed) ? parsed : 0
}

type SummaryBucket = {
  date: string
  packageName: string
  createdOrders: Set<string>
  approvedOrders: Set<string>
  createdLineCount: number
  approvedLineCount: number
  createdQty: number
  approvedQty: number
}

function bucketFor(buckets: Map<string, SummaryBucket>, date: string, name: string): SummaryBucket {
  const key = `${date}\u0000${name}`
  const existing = buckets.get(key)
  if (existing) return existing
  const created: SummaryBucket = {
    date,
    packageName: name,
    createdOrders: new Set(),
    approvedOrders: new Set(),
    createdLineCount: 0,
    approvedLineCount: 0,
    createdQty: 0,
    approvedQty: 0,
  }
  buckets.set(key, created)
  return created
}

export async function queryProductionOrderList(input: ProductionOrderInput = {}): Promise<Record<string, unknown>> {
  const pageNum = pageValue(input.pageNum, 1, 1, Number.MAX_SAFE_INTEGER)
  const pageSize = pageValue(input.pageSize, 10, 10, 100)
  const rows = await queryRows(buildProductionOrderFilter(input), (pageNum - 1) * pageSize, pageSize + 1)
  const hasMore = rows.length > pageSize
  return {
    rows: (hasMore ? rows.slice(0, pageSize) : rows).map(toRow),
    pageNum,
    pageSize,
    hasMore,
    source: 'K3Cloud / PRD_MO',
  }
}

export async function queryProductionOrderSummary(input: ProductionOrderInput = {}): Promise<Record<string, unknown>> {
  const filter = buildProductionOrderFilter(input)
  const rows: unknown[][] = []
  let startRow = 0
  while (rows.length < PRODUCTION_ORDER_SUMMARY_MAX_ROWS) {
    const limit = Math.min(PRODUCTION_ORDER_SUMMARY_BATCH_SIZE, PRODUCTION_ORDER_SUMMARY_MAX_ROWS - rows.length)
    const batch = await queryRows(filter, startRow, limit)
    rows.push(...batch)
    if (batch.length < limit) break
    startRow += batch.length
  }

  const buckets = new Map<string, SummaryBucket>()
  const createdOrders = new Set<string>()
  const approvedOrders = new Set<string>()
  let createdQty = 0
  let approvedQty = 0
  for (const values of rows) {
    const row = toRow(values)
    const billNo = text(row.billNo)
    const qty = numberValue(row.qty)
    const name = packageName(row.specification)
    if (isEventDateInRange(row.createDate, input.beginDate, input.endDate)) {
      const bucket = bucketFor(buckets, formatDate(row.createDate), name)
      bucket.createdOrders.add(billNo)
      bucket.createdLineCount += 1
      bucket.createdQty += qty
      createdOrders.add(billNo)
      createdQty += qty
    }
    if (isEventDateInRange(row.approveDate, input.beginDate, input.endDate)) {
      const bucket = bucketFor(buckets, formatDate(row.approveDate), name)
      bucket.approvedOrders.add(billNo)
      bucket.approvedLineCount += 1
      bucket.approvedQty += qty
      approvedOrders.add(billNo)
      approvedQty += qty
    }
  }

  const roundQty = (value: number) => Math.round((value + Number.EPSILON) * 1000) / 1000

  const summaryRows = [...buckets.values()]
    .sort((left, right) => right.date.localeCompare(left.date) || left.packageName.localeCompare(right.packageName))
    .map((row) => ({
      date: row.date,
      packageName: row.packageName,
      createdOrderCount: row.createdOrders.size,
      createdLineCount: row.createdLineCount,
      createdQty: roundQty(row.createdQty),
      approvedOrderCount: row.approvedOrders.size,
      approvedLineCount: row.approvedLineCount,
      approvedQty: roundQty(row.approvedQty),
    }))

  return {
    rows: summaryRows,
    totals: {
      createdOrderCount: createdOrders.size,
      createdQty: roundQty(createdQty),
      approvedOrderCount: approvedOrders.size,
      approvedQty: roundQty(approvedQty),
    },
    sourceRowCount: rows.length,
    truncated: rows.length >= PRODUCTION_ORDER_SUMMARY_MAX_ROWS,
    source: 'K3Cloud / PRD_MO',
  }
}
