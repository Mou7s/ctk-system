import { executeBillQuery } from './k3'

export const STOCK_DOCUMENT_MAX_ROWS = 20_000
export const STOCK_DOCUMENT_BATCH_SIZE = 1_000

const REALTIME_INVENTORY_FIELDS = [
  'FMaterialId.FNumber',
  'FMaterialId.FName',
  'FMaterialId.FSpecification',
  'FBaseUnitId.FNumber',
  'FBaseUnitId.FName',
  'FStockID.FNumber',
  'FStockID.FName',
  'FStockLocID.FF100008.FNumber',
  'FStockLocID.FF100008.FName',
  'FLot.FNumber',
  'FBaseQty',
  'FAVBQty',
  'FStockStatusId.FNumber',
  'FStockStatusId.FName',
  'FBaseLockQty',
]

const WAREHOUSE_FIELDS = ['FNumber', 'FName']
const LOCATION_FIELDS = ['FStockLocID.FF100008.FNumber', 'FStockLocID.FF100008.FName']
const FLEX_VALUE_FIELDS = ['FID', 'FNUMBER', 'FNAME', 'FFlexValueNumber', 'FFlexValueName']
const INVENTORY_FIELDS = [
  'FMaterialId.FNumber', 'FMaterialId.FName', 'FStockID.FNumber', 'FStockID.FName',
  'FStockLocID.FF100008.FNumber', 'FStockLocID.FF100008.FName', 'FLot.FNumber', 'FAVBQty', 'FBaseQty',
  'FStockStatusId.FNumber', 'FStockStatusId.FName', 'FBaseLockQty',
]
const SALES_OUTBOUND_FIELDS = [
  'FID', 'FEntity_FEntryId', 'FBillNo', 'FEntity_FSeq', 'FDate',
  'FMaterialID.FNumber', 'FMaterialName', 'FMateriaModel', 'FBaseUnitQty', 'FRealQty',
  'FDocumentStatus', 'FApproveDate', 'FCustomerID.FNumber', 'FCustomerID.FName',
  'FStockID.FNumber', 'FStockID.FName', 'FStockLocID.FF100008.FNumber',
  'FStockLocID.FF100008.FName', 'FLot.FNumber',
]
const PRODUCTION_RECEIPT_FIELDS = [
  'FID', 'FEntity_FEntryId', 'FBillNo', 'FEntity_FSeq', 'FDate',
  'FMaterialId.FNumber', 'FMaterialId.FName', 'FMaterialId.FSpecification', 'FRealQty',
  'FDocumentStatus', 'FApproveDate', 'FStockId.FNumber', 'FStockId.FName',
  'FStockLocID.FF100008.FNumber', 'FStockLocID.FF100008.FName', 'FMoBillNo',
]
const PURCHASE_ORDER_FIELDS = [
  'FID', 'FPOOrderEntry_FEntryID', 'FBillNo', 'FPOOrderEntry_FSeq', 'FDate',
  'FMaterialId.FNumber', 'FMaterialName', 'FModel', 'FQty', 'FRemainStockINQty',
  'FDocumentStatus', 'FApproveDate', 'FSupplierId.FNumber', 'FSupplierId.FName',
]
const PURCHASE_INBOUND_FIELDS = [
  'FID', 'FInStockEntry_FEntryID', 'FBillNo', 'FInStockEntry_FSeq', 'FDate',
  'FMaterialId.FNumber', 'FMaterialId.FName', 'FMaterialId.FSpecification', 'FRealQty',
  'FDocumentStatus', 'FApproveDate', 'FSupplierId.FNumber', 'FSupplierId.FName',
  'FStockId.FNumber', 'FStockId.FName', 'FPOOrderNo',
]

type StockDocumentInput = Record<string, unknown>

export type K3DocumentType = 'salesOutbound' | 'productionReceipt' | 'purchaseOrder' | 'purchaseInbound'

/**
 * 查询条件本身不合法（格式、状态码、缺少条件等）。路由层据此返回 400，
 * 不能和「金蝶连接失败」一起混成 502。
 */
export class StockDocumentInputError extends Error {
  readonly statusCode = 400

  constructor(message: string) {
    super(message)
    this.name = 'StockDocumentInputError'
  }
}

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

const LINE_BREAK_PATTERN = new RegExp(`[${String.fromCharCode(10)}${String.fromCharCode(13)}]`)

function hasLineBreak(value: string): boolean {
  return LINE_BREAK_PATTERN.test(value)
}

function escapeFilterValue(value: unknown): string {
  const normalized = trimmed(value)
  if (hasLineBreak(normalized)) throw new StockDocumentInputError('金蝶库存筛选参数包含非法字符')
  return normalized.replace(/'/g, "''")
}

function validateRows(fieldCount: number, rows: unknown[]): unknown[][] {
  return rows.map((row) => {
    if (!Array.isArray(row)) throw new Error('金蝶查询返回字段数量异常')
    // K3Cloud may omit trailing optional values (for example location/lot) or
    // append extension columns. Keep the requested prefix and normalize the row
    // width so one incomplete optional row does not discard the whole inventory.
    return row.length === fieldCount
      ? row
      : row.length > fieldCount
        ? row.slice(0, fieldCount)
        : [...row, ...Array.from({ length: fieldCount - row.length }, () => null)]
  })
}

async function queryFormRows(formId: string, fields: string[], filterString: string, orderString: string): Promise<unknown[][]> {
  const rows: unknown[][] = []
  let startRow = 0
  while (rows.length < STOCK_DOCUMENT_MAX_ROWS) {
    const limit = Math.min(STOCK_DOCUMENT_BATCH_SIZE, STOCK_DOCUMENT_MAX_ROWS - rows.length)
    const batch = await executeBillQuery({
      formId,
      fieldKeys: fields,
      filterString,
      orderString,
      startRow,
      limit,
    })
    if (!Array.isArray(batch)) throw new Error('金蝶查询返回异常')
    const validated = validateRows(fields.length, batch)
    rows.push(...validated)
    if (validated.length < limit) break
    startRow += validated.length
  }
  return rows
}

async function queryStockLocationFlexIds(): Promise<string[]> {
  const result = await executeBillQuery({
    formId: 'BD_FLEXVALUES',
    fieldKeys: FLEX_VALUE_FIELDS,
    startRow: 0,
    limit: 200,
  })
  if (!Array.isArray(result)) throw new Error('金蝶仓位维度查询返回异常')
  return [...new Set(validateRows(FLEX_VALUE_FIELDS.length, result)
    .map((row) => trimmed(row[0]))
    .filter(Boolean))]
}

function dynamicSalesOutboundFields(flexIds: string[]): string[] {
  return [
    ...SALES_OUTBOUND_FIELDS.slice(0, 16),
    ...flexIds.flatMap((id) => [`FStockLocID.FF${id}.FNumber`, `FStockLocID.FF${id}.FName`]),
    'FLot.FNumber',
  ]
}

function normalizeDynamicSalesOutboundRow(values: unknown[], flexIds: string[]): unknown[] {
  const locationStart = 16
  let locationNumber = ''
  let locationName = ''
  for (let index = 0; index < flexIds.length; index += 1) {
    const number = trimmed(values[locationStart + index * 2])
    const name = trimmed(values[locationStart + index * 2 + 1])
    if (!locationNumber && number) locationNumber = number
    if (!locationName && name) locationName = name
    if (locationNumber && locationName) break
  }
  const lotNumber = values[locationStart + flexIds.length * 2]
  return [...values.slice(0, 16), locationNumber || null, locationName || null, lotNumber]
}

export async function queryK3Warehouses(): Promise<Array<{ label: string; value: string }>> {
  const rows = await queryFormRows('BD_Stock', WAREHOUSE_FIELDS, '', 'FNumber ASC')
  const result: Array<{ label: string; value: string }> = []
  for (const row of rows) {
    const number = trimmed(row[0])
    const name = trimmed(row[1])
    if (!number) continue
    result.push({ label: name ? `${name}（${number}）` : number, value: number })
  }
  return result
}

export async function queryK3Locations(input: StockDocumentInput = {}): Promise<Array<{ label: string; value: string }>> {
  const filters = ['FBaseQty<>0']
  const stocks = parseList(input.stock)
  if (stocks.length === 1) {
    filters.push(`FStockID.FNumber='${escapeFilterValue(stocks[0])}'`)
  } else if (stocks.length > 1) {
    filters.push(`FStockID.FNumber in (${stocks.map((s) => `'${escapeFilterValue(s)}'`).join(',')})`)
  }
  const rows = await queryFormRows('STK_Inventory', LOCATION_FIELDS, filters.join(' and '), 'FStockLocID.FF100008.FNumber ASC')
  const namesByNumber = new Map<string, string>()
  for (const row of rows) {
    const number = trimmed(row[0])
    const name = trimmed(row[1])
    if (!number) continue
    const existing = namesByNumber.get(number)
    if (existing === undefined || (!existing && name)) namesByNumber.set(number, name)
  }
  return [...namesByNumber.entries()].map(([value, name]) => ({
    label: name ? `${name}（${value}）` : value,
    value,
  }))
}

function addKeyword(filters: string[], value: unknown, field: string): void {
  if (hasText(value)) filters.push(`${field} like '%${escapeFilterValue(value)}%'`)
}

function parseList(value: unknown): string[] {
  if (value == null) return []
  if (Array.isArray(value)) {
    return value.flatMap((item) => parseList(item)).filter(Boolean)
  }
  if (typeof value === 'object' && 'value' in (value as Record<string, unknown>)) {
    return parseList((value as Record<string, unknown>).value)
  }
  if (typeof value === 'string') {
    return value.split(',').map((item) => trimmed(item)).filter(Boolean)
  }
  const textVal = trimmed(value)
  return textVal ? [textVal] : []
}

export function buildInventoryFilter(input: StockDocumentInput = {}, locationFields: string | string[] = 'FStockLocID.FF100008.FNumber'): string {
  // FAVBQty is not the usable quantity shown by this K3 account.  It can be 0
  // while a row is in the "可用" status with an unlocked on-hand quantity.
  // Fetch on-hand rows first; queryK3Inventory applies the status/lock-aware
  // availability calculation after the response is normalized.
  const filters = ['FBaseQty<>0']
  addKeyword(filters, input.material, 'FMaterialId.FNumber')
  addKeyword(filters, input.materialName, 'FMaterialId.FName')
  addKeyword(filters, input.specification, 'FMaterialId.FSpecification')
  const stocks = parseList(input.stock)
  if (stocks.length === 1) {
    filters.push(`FStockID.FNumber='${escapeFilterValue(stocks[0])}'`)
  } else if (stocks.length > 1) {
    filters.push(`FStockID.FNumber in (${stocks.map((s) => `'${escapeFilterValue(s)}'`).join(',')})`)
  }
  const locations = parseList(input.location)
  if (locations.length > 0) {
    const fields = Array.isArray(locationFields) ? locationFields : [locationFields]
    if (locations.length === 1) {
      const locationValue = escapeFilterValue(locations[0])
      filters.push(fields.length === 1
        ? `${fields[0]}='${locationValue}'`
        : `(${fields.map((field) => `${field}='${locationValue}'`).join(' or ')})`)
    } else {
      const locationList = locations.map((l) => `'${escapeFilterValue(l)}'`).join(',')
      filters.push(fields.length === 1
        ? `${fields[0]} in (${locationList})`
        : `(${fields.map((field) => `${field} in (${locationList})`).join(' or ')})`)
    }
  }
  addKeyword(filters, input.lot, 'FLot.FNumber')
  return filters.join(' and ')
}

function booleanValue(value: unknown, defaultValue: boolean): boolean {
  if (value == null || value === '') return defaultValue
  return !['false', '0', 'no'].includes(trimmed(value).toLowerCase())
}

function parseDate(value: unknown, label: string): string {
  const normalized = trimmed(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new StockDocumentInputError(`${label}格式不正确`)
  const date = new Date(`${normalized}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) throw new StockDocumentInputError(`${label}格式不正确`)
  return normalized
}

function nextDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

export function buildDocumentFilter(type: K3DocumentType, input: StockDocumentInput = {}): string {
  const filters = ['1=1']
  if (type === 'purchaseOrder') filters.push("FDocumentStatus='C'")
  if (type === 'purchaseOrder' && booleanValue(input.remainOnly, true)) filters.push('FRemainStockINQty > 0')
  if (hasText(input.documentStatus)) {
    const status = trimmed(input.documentStatus).toUpperCase()
    if (!/^[A-DZ]$/.test(status)) throw new StockDocumentInputError('单据状态参数不正确')
    if (type !== 'purchaseOrder' || status !== 'C') {
      const existing = filters.findIndex((value) => value.startsWith('FDocumentStatus='))
      if (existing >= 0) filters.splice(existing, 1)
      filters.push(`FDocumentStatus='${status}'`)
    }
  }
  if (hasText(input.billNo)) {
    const keyword = escapeFilterValue(input.billNo)
    filters.push(type === 'purchaseInbound'
      ? `(FBillNo like '%${keyword}%' or FPOOrderNo like '%${keyword}%')`
      : `FBillNo like '%${keyword}%'`)
  }
  if (hasText(input.material)) {
    const keyword = escapeFilterValue(input.material)
    const numberField = type === 'salesOutbound' ? 'FMaterialID.FNumber' : 'FMaterialId.FNumber'
    const nameField = type === 'salesOutbound' ? 'FMaterialName' : 'FMaterialId.FName'
    const modelField = type === 'purchaseOrder' ? 'FModel' : ''
    const materialFields = [`${numberField} like '%${keyword}%'`, `${nameField} like '%${keyword}%'`]
    if (modelField) materialFields.push(`${modelField} like '%${keyword}%'`)
    filters.push(`(${materialFields.join(' or ')})`)
  }
  if (hasText(input.packageName)) {
    const field = type === 'salesOutbound' ? 'FMateriaModel' : type === 'purchaseOrder' ? 'FModel' : 'FMaterialId.FSpecification'
    filters.push(`${field} like '${escapeFilterValue(input.packageName)}%'`)
  }
  if (hasText(input.relatedParty)) {
    const keyword = escapeFilterValue(input.relatedParty)
    if (type === 'salesOutbound') {
      filters.push(`(FCustomerID.FNumber like '%${keyword}%' or FCustomerID.FName like '%${keyword}%')`)
    } else if (type === 'purchaseOrder' || type === 'purchaseInbound') {
      filters.push(`(FSupplierId.FNumber like '%${keyword}%' or FSupplierId.FName like '%${keyword}%')`)
    } else {
      filters.push(`FMoBillNo like '%${keyword}%'`)
    }
  }
  if (hasText(input.stock)) {
    const keyword = escapeFilterValue(input.stock)
    const fieldPrefix = type === 'salesOutbound' ? 'FStockID' : 'FStockId'
    filters.push(`(${fieldPrefix}.FNumber like '%${keyword}%' or ${fieldPrefix}.FName like '%${keyword}%')`)
  }
  if (hasText(input.beginDate)) filters.push(`FDate>='${parseDate(input.beginDate, '开始日期')}'`)
  if (hasText(input.endDate)) filters.push(`FDate<'${nextDate(parseDate(input.endDate, '结束日期'))}'`)
  if (hasText(input.beginApproveDate)) filters.push(`FApproveDate>='${parseDate(input.beginApproveDate, '审核开始日期')}'`)
  if (hasText(input.endApproveDate)) filters.push(`FApproveDate<'${nextDate(parseDate(input.endApproveDate, '审核结束日期'))}'`)
  if (hasText(input.beginDate) && hasText(input.endDate)
    && parseDate(input.endDate, '结束日期') < parseDate(input.beginDate, '开始日期')) {
    throw new Error('结束日期不能早于开始日期')
  }
  if (hasText(input.beginApproveDate) && hasText(input.endApproveDate)
    && parseDate(input.endApproveDate, '审核结束日期') < parseDate(input.beginApproveDate, '审核开始日期')) {
    throw new Error('审核结束日期不能早于审核开始日期')
  }
  return filters.join(' and ')
}

function pageValue(value: unknown, defaultValue: number): number {
  if (value == null || value === '') return defaultValue
  const parsed = Number(scalar(value))
  if (!Number.isInteger(parsed) || parsed < 0) throw new StockDocumentInputError('分页参数不正确')
  return parsed
}

function localDateTime(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

function numericQuantity(value: unknown): number {
  const parsed = Number(scalar(value))
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Calculate the quantity that can be selected for WMS work.
 *
 * In this K3 account FAVBQty/FBaseAVBQty may be zero even when the inventory
 * row is explicitly in the 可用 status.  The reliable row-level rule is the
 * available stock status less the row's locked quantity.  Unknown statuses
 * remain unavailable so a missing/ambiguous status cannot unlock inventory.
 */
export function calculateK3AvailableQty(
  baseQty: unknown,
  lockQty: unknown,
  statusNumber: unknown,
  statusName: unknown,
): number {
  const status = trimmed(statusNumber).toUpperCase()
  const name = trimmed(statusName)
  if (status !== 'KCZT01_SYS' && name !== '可用') return 0
  const base = numericQuantity(baseQty)
  const locked = Math.max(numericQuantity(lockQty), 0)
  return Math.max(0, Math.round((base - locked + Number.EPSILON) * 1000) / 1000)
}

function toRealtimeInventoryRow(values: unknown[]): Record<string, unknown> {
  return {
    materialNumber: values[0],
    materialName: values[1],
    specification: values[2],
    unitNumber: values[3],
    unitName: values[4],
    stockNumber: values[5],
    stockName: values[6],
    stockLocationNumber: values[7],
    stockLocationName: values[8],
    stockLocationFlexId: values[15] || '100008',
    lotNumber: values[9],
    baseQty: values[10],
    availableQty: calculateK3AvailableQty(values[10], values[14], values[12], values[13]),
    kingdeeAvailableQty: values[11],
    stockStatusNumber: values[12],
    stockStatusName: values[13],
    lockedQty: values[14],
  }
}

function toInventoryRow(values: unknown[]): Record<string, unknown> {
  return {
    materialNumber: values[0],
    materialName: values[1],
    stockNumber: values[2],
    stockName: values[3],
    stockLocationNumber: values[4],
    stockLocationName: values[5],
    lotNumber: values[6],
    availableQty: calculateK3AvailableQty(values[8], values[11], values[9], values[10]),
    kingdeeAvailableQty: values[7],
    baseQty: values[8],
    stockStatusNumber: values[9],
    stockStatusName: values[10],
    lockedQty: values[11],
  }
}

function dynamicInventoryFields(flexIds: string[]): string[] {
  return [
    ...REALTIME_INVENTORY_FIELDS.slice(0, 7),
    ...flexIds.flatMap((id) => [`FStockLocID.FF${id}.FNumber`, `FStockLocID.FF${id}.FName`]),
    'FLot.FNumber', 'FBaseQty', 'FAVBQty', 'FStockStatusId.FNumber', 'FStockStatusId.FName', 'FBaseLockQty',
  ]
}

function normalizeDynamicInventoryRow(values: unknown[], flexIds: string[]): unknown[] {
  const locationStart = 7
  let locationNumber = ''
  let locationName = ''
  let locationFlexId = ''
  for (let index = 0; index < flexIds.length; index += 1) {
    const number = trimmed(values[locationStart + index * 2])
    const name = trimmed(values[locationStart + index * 2 + 1])
    if (!locationNumber && number) locationNumber = number
    if (!locationName && name) locationName = name
    if (!locationFlexId && (number || name)) locationFlexId = flexIds[index]
    if (locationNumber && locationName) break
  }
  const lotIndex = locationStart + flexIds.length * 2
  return [
    ...values.slice(0, 7),
    locationNumber || null,
    locationName || null,
    values[lotIndex],
    values[lotIndex + 1],
    values[lotIndex + 2],
    values[lotIndex + 3],
    values[lotIndex + 4],
    values[lotIndex + 5],
    locationFlexId || null,
  ]
}

export async function queryK3Inventory(input: StockDocumentInput = {}, allowedMaterials?: readonly string[]): Promise<Record<string, unknown>> {
  const pageNum = Math.max(pageValue(input.pageNum, 1), 1)
  const pageSize = Math.min(Math.max(pageValue(input.pageSize, 50), 10), 100)
  let rawRows = await queryFormRows(
    'STK_Inventory',
    REALTIME_INVENTORY_FIELDS,
    buildInventoryFilter(input),
    'FMaterialId.FNumber ASC,FStockID.FNumber ASC,FStockLocID.FF100008.FNumber ASC,FLot.FNumber ASC',
  )
  if (rawRows.some((row) => !hasText(row[7]) && !hasText(row[8]))) {
    try {
      const flexIds = await queryStockLocationFlexIds()
      if (flexIds.length) {
        const dynamicRows = await queryFormRows(
          'STK_Inventory',
          dynamicInventoryFields(flexIds),
          buildInventoryFilter(input, flexIds.map((id) => `FStockLocID.FF${id}.FNumber`)),
          'FMaterialId.FNumber ASC,FStockID.FNumber ASC,FLot.FNumber ASC',
        )
        if (dynamicRows.length) rawRows = dynamicRows.map((row) => normalizeDynamicInventoryRow(row, flexIds))
      }
    } catch {
      // A missing location is valid inventory data; keep the static result if
      // the optional warehouse-specific dimension lookup is unavailable.
    }
  }
  const visibleMaterials = allowedMaterials === undefined ? null : new Set(allowedMaterials)
  const allRows = rawRows
    .filter(row => !visibleMaterials || visibleMaterials.has(String(row[0] ?? '')))
    .map(toRealtimeInventoryRow)
  const selectableRows = allRows
    .filter((row) => !booleanValue(input.availableOnly, false) || numericQuantity(row.availableQty) > 0)
  const materialNumbers = new Set(selectableRows.map((row) => trimmed(row.materialNumber)).filter(Boolean))
  const fromIndex = Math.min((pageNum - 1) * pageSize, selectableRows.length)
  const toIndex = Math.min(fromIndex + pageSize, selectableRows.length)
  return {
    rows: selectableRows.slice(fromIndex, toIndex),
    pageNum,
    pageSize,
    total: selectableRows.length,
    truncated: rawRows.length >= STOCK_DOCUMENT_MAX_ROWS,
    summary: {
      lineCount: selectableRows.length,
      materialCount: materialNumbers.size,
    },
    queriedAt: localDateTime(),
    source: 'K3Cloud / STK_Inventory',
  }
}

async function queryInventoryOptions(materialCode: string, stockNumber: string, lotNumber: string): Promise<Record<string, unknown>[]> {
  if (!materialCode || !stockNumber) return []
  const filters = [
    `FMaterialId.FNumber='${escapeFilterValue(materialCode)}'`,
    `FStockID.FNumber='${escapeFilterValue(stockNumber)}'`,
    'FBaseQty<>0',
  ]
  if (lotNumber) filters.push(`FLot.FNumber='${escapeFilterValue(lotNumber)}'`)
  const result = await executeBillQuery({
    formId: 'STK_Inventory',
    fieldKeys: INVENTORY_FIELDS,
    filterString: filters.join(' and '),
    orderString: 'FBaseQty DESC',
    startRow: 0,
    limit: 200,
  })
  if (!Array.isArray(result)) throw new Error('金蝶查询返回异常')
  return validateRows(INVENTORY_FIELDS.length, result)
    .map(toInventoryRow)
    .filter((row) => numericQuantity(row.availableQty) > 0)
}

export async function queryK3SalesOutboundPicking(billNo: unknown): Promise<Record<string, unknown>> {
  const normalizedBillNo = trimmed(billNo)
  if (!normalizedBillNo) throw new Error('销售出库单号不能为空')
  let rawRows = await queryFormRows(
    'SAL_OUTSTOCK',
    SALES_OUTBOUND_FIELDS,
    `FBillNo='${escapeFilterValue(normalizedBillNo)}'`,
    'FDate DESC,FBillNo DESC,FEntity_FSeq ASC',
  )
  if (!rawRows.length) throw new Error(`金蝶中未找到销售出库单 ${normalizedBillNo}`)
  if (rawRows.some((row) => !hasText(row[16]) && !hasText(row[17]))) {
    try {
      const flexIds = await queryStockLocationFlexIds()
      if (flexIds.length) {
        const dynamicRows = await queryFormRows(
          'SAL_OUTSTOCK',
          dynamicSalesOutboundFields(flexIds),
          `FBillNo='${escapeFilterValue(normalizedBillNo)}'`,
          'FDate DESC,FBillNo DESC,FEntity_FSeq ASC',
        )
        if (dynamicRows.length) rawRows = dynamicRows.map((row) => normalizeDynamicSalesOutboundRow(row, flexIds))
      }
    } catch {
      // A missing location is a valid sales-outbound state; keep the base rows
      // if the optional dynamic location lookup is unavailable.
    }
  }
  const rows: Record<string, unknown>[] = []
  for (const rawRow of rawRows) {
    const row = toDocumentRow('salesOutbound', rawRow)
    row.inventoryOptions = await queryInventoryOptions(trimmed(row.materialNumber), trimmed(row.stockNumber), trimmed(row.lotNumber))
    rows.push(row)
  }
  return { billNo: normalizedBillNo, rows }
}

function documentFields(type: K3DocumentType): string[] {
  return type === 'salesOutbound'
    ? SALES_OUTBOUND_FIELDS
    : type === 'productionReceipt'
      ? PRODUCTION_RECEIPT_FIELDS
      : type === 'purchaseOrder'
        ? PURCHASE_ORDER_FIELDS
        : PURCHASE_INBOUND_FIELDS
}

function documentForm(type: K3DocumentType): string {
  return type === 'salesOutbound'
    ? 'SAL_OUTSTOCK'
    : type === 'productionReceipt'
      ? 'PRD_INSTOCK'
      : type === 'purchaseOrder'
        ? 'PUR_PurchaseOrder'
        : 'STK_InStock'
}

function documentOrder(type: K3DocumentType, filter: string): string {
  if (type === 'purchaseOrder') return 'FDate DESC,FBillNo DESC,FPOOrderEntry_FSeq ASC'
  if (type === 'purchaseInbound') {
    return filter.includes("FDocumentStatus='C'")
      ? 'FApproveDate DESC,FBillNo DESC,FInStockEntry_FSeq ASC'
      : 'FDate DESC,FBillNo DESC,FInStockEntry_FSeq ASC'
  }
  return filter.includes("FDocumentStatus='C'")
    ? 'FApproveDate DESC,FBillNo DESC,FEntity_FSeq ASC'
    : 'FDate DESC,FBillNo DESC,FEntity_FSeq ASC'
}

function toDocumentRow(type: K3DocumentType, values: unknown[]): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: values[0],
    entryId: values[1],
    billNo: values[2],
    seq: values[3],
    date: values[4],
    materialNumber: values[5],
    materialName: values[6],
    specification: values[7],
  }
  if (type === 'salesOutbound') {
    Object.assign(row, {
      qty: values[8], realQty: values[9], baseQty: values[8], documentStatus: values[10], approveDate: values[11],
      relatedNumber: values[12], relatedName: values[13], stockNumber: values[14], stockName: values[15],
      stockLocationNumber: values[16], stockLocationName: values[17], lotNumber: values[18],
    })
  } else if (type === 'purchaseOrder') {
    Object.assign(row, {
      qty: values[8], remainQty: values[9], documentStatus: values[10], approveDate: values[11],
      relatedNumber: values[12], relatedName: values[13],
    })
  } else if (type === 'purchaseInbound') {
    Object.assign(row, {
      qty: values[8], realQty: values[8], documentStatus: values[9], approveDate: values[10],
      relatedNumber: values[11], relatedName: values[12], stockNumber: values[13], stockName: values[14],
      purchaseOrderNo: values[15],
    })
  } else {
    Object.assign(row, {
      qty: values[8], realQty: values[8], documentStatus: values[9], approveDate: values[10],
      stockNumber: values[11], stockName: values[12], stockLocationNumber: values[13], stockLocationName: values[14],
      relatedNumber: values[15], relatedName: '',
    })
  }
  return row
}

function numericValue(value: unknown): number {
  const parsed = Number(scalar(value))
  return Number.isFinite(parsed) ? parsed : 0
}

function pageResult(type: K3DocumentType, rows: Record<string, unknown>[], rawCount: number, pageNum: number, pageSize: number): Record<string, unknown> {
  const fromIndex = Math.min((pageNum - 1) * pageSize, rows.length)
  const pageRows = rows.slice(fromIndex, Math.min(fromIndex + pageSize, rows.length))
  const bills = new Set<string>()
  const approvedBills = new Set<string>()
  let totalQty = 0
  let approvedQty = 0
  for (const row of rows) {
    const billNo = text(row.billNo)
    bills.add(billNo)
    const qty = numericValue('remainQty' in row ? row.remainQty : row.qty)
    totalQty += qty
    if (text(row.documentStatus) === 'C') {
      approvedBills.add(billNo)
      approvedQty += qty
    }
  }
  return {
    rows: pageRows,
    pageNum,
    pageSize,
    total: rows.length,
    truncated: rawCount >= STOCK_DOCUMENT_MAX_ROWS,
    summary: {
      billCount: bills.size,
      lineCount: rows.length,
      totalQty,
      approvedBillCount: approvedBills.size,
      approvedQty,
    },
    source: `K3Cloud / ${documentForm(type)}`,
  }
}

/**
 * 列表查询必须至少有一个条件：该接口按 1000 行/批最多拉 20000 行，
 * 无条件下查询会做 20 次分批全表扫描。销售出库单被 WMS 出库页以
 * 「仅按单据状态」的方式调用（不传日期），因此对 salesOutbound 放行。
 */
export function assertDocumentFilterUsable(type: K3DocumentType, input: StockDocumentInput = {}): void {
  if (type === 'purchaseOrder') return
  if (type === 'salesOutbound' && hasText(input.documentStatus)) return
  const hasDate = hasText(input.beginDate) || hasText(input.endDate)
    || hasText(input.beginApproveDate) || hasText(input.endApproveDate)
  const hasKeyword = ['billNo', 'material', 'packageName', 'relatedParty', 'stock'].some((key) => hasText(input[key]))
  if (!hasDate && !hasKeyword) throw new StockDocumentInputError('请至少填写日期范围或关键字')
}

export async function queryK3DocumentList(type: K3DocumentType, input: StockDocumentInput = {}): Promise<Record<string, unknown>> {
  const pageNum = Math.max(pageValue(input.pageNum, 1), 1)
  const pageSize = Math.min(Math.max(pageValue(input.pageSize, 10), 10), 1_000)
  assertDocumentFilterUsable(type, input)
  const filter = buildDocumentFilter(type, input)
  const rawRows = await queryFormRows(documentForm(type), documentFields(type), filter, documentOrder(type, filter))
  return pageResult(type, rawRows.map((row) => toDocumentRow(type, row)), rawRows.length, pageNum, pageSize)
}
