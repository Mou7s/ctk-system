import type { H3Event } from 'h3'
import type { PoolConnection } from 'mysql2/promise'
import { apiError, apiSuccess, errorMessage } from './response'
import { auditBill, executeBillQuery, K3CloudError, saveBill, submitBill } from './k3'
import { mysqlQueryOptions } from './mysql'
import { insertOperationLog, queryOne, text, withIdempotentWriteSession, writeFail } from './write'
import { calculateK3AvailableQty, queryK3DocumentList } from './stock-document'

const SALES_OUTBOUND_FORM = 'SAL_OUTSTOCK'
const ASSEMBLY_FORM = 'STK_AssembledApp'
const ASSEMBLY_BILL_TYPE = 'ZZCX01_SYS'
const TRANSFER_FORM = 'STK_TransferDirect'
const TRANSFER_BILL_TYPE = 'ZJDB01_SYS'
const STOCK_ORG = '100'
const STOCK_STATUS = 'KCZT01_SYS'
const OUTBOUND_PICK_STALE_MS = 15 * 60 * 1000
const SALES_OUTBOUND_COMPLETE_PERMISSION = 'tk_custom:wmsOutbound:complete'
const MAX_QUERY_ROWS = 20_000
const QUERY_BATCH_SIZE = 1_000

const MATERIAL_FIELDS = ['FNUMBER', 'FNAME', 'FSPECIFICATION', 'FBaseUnitId.FNumber']
const FLEX_VALUE_FIELDS = ['FID', 'FNUMBER', 'FNAME', 'FFlexValueNumber', 'FFlexValueName']
const TRANSFER_FIELDS = ['FID', 'FBillNo', 'FDocumentStatus', 'FNote']

type AnyRecord = Record<string, any>

interface PickRecord {
  billNo: string
  requestId: string
  status: string
  conversionResult: string
  updateTime: unknown
}

interface PickSegment {
  segmentId: string
  sourceMaterialCode: string
  qty: number
  stockNumber: string
  sourceLocationNumber: string
  sourceLotNumber: string
  businessConfirmed: boolean
  businessConfirmReason: string
}

interface PreparedLine {
  entryId: string
  targetMaterialCode: string
  actualQty: number
  stockNumber: string
  targetLocationNumber: string
  outboundLotNumber: string
  segments: PickSegment[]
}

interface ConversionPlan {
  traceKey: string
  entryId: string
  segment: PickSegment
  targetMaterialCode: string
  sourceStockNumber: string
  stockNumber: string
  targetLocationNumber: string
  targetLotNumber: string
}

interface Material {
  code: string
  unitNumber: string
}

interface AssemblyBill {
  billNo: string
  status: string
  entryId: number
  materialCode: string
  qty: number
  stockNumber: string
  stockLocationNumber: string
  lotNumber: string
}

interface DirectTransferBill {
  billNo: string
  status: string
  note: string
}

const stockLocationFlexIdCache = new Map<string, string>()

function same(left: unknown, right: unknown): boolean {
  return text(left).trim().toUpperCase() === text(right).trim().toUpperCase()
}

function hasText(value: unknown): boolean {
  return text(value) !== ''
}

function roundQty(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000
}

function quantity(value: unknown, label: string, options: { required?: boolean; positive?: boolean } = {}): number {
  if (value == null || text(value) === '') {
    if (options.required) writeFail(`${label}不能为空`, 400)
    return 0
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || (options.positive ? parsed <= 0 : parsed < 0)) {
    writeFail(options.positive ? `${label}必须大于0` : `${label}不能小于0`, 400)
  }
  return roundQty(parsed)
}

function equalQty(left: number, right: number): boolean {
  return Math.abs(roundQty(left) - roundQty(right)) < 0.000001
}

function displayQty(value: number): string {
  return roundQty(value).toString()
}

function booleanValue(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  return ['true', '1', 'yes'].includes(text(value).toLowerCase())
}

function escapeFilterValue(value: unknown): string {
  const normalized = text(value)
  if (/[\r\n]/.test(normalized)) writeFail('金蝶筛选参数包含非法字符', 400)
  return normalized.replace(/'/g, "''")
}

function normalizeRows(fieldCount: number, rows: unknown[]): unknown[][] {
  return rows.map((row) => {
    if (!Array.isArray(row)) throw new Error('金蝶查询返回字段数量异常')
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
  while (rows.length < MAX_QUERY_ROWS) {
    const limit = Math.min(QUERY_BATCH_SIZE, MAX_QUERY_ROWS - rows.length)
    const batch = await executeBillQuery({
      formId,
      fieldKeys: fields,
      filterString,
      orderString,
      startRow,
      limit,
    })
    if (!Array.isArray(batch)) throw new Error('金蝶查询返回异常')
    const normalized = normalizeRows(fields.length, batch)
    rows.push(...normalized)
    if (normalized.length < limit) break
    startRow += normalized.length
  }
  return rows
}

function rowText(row: unknown[], index: number): string {
  return text(row[index])
}

function rowQty(row: unknown[], index: number): number {
  const parsed = Number(row[index])
  return Number.isFinite(parsed) ? roundQty(parsed) : 0
}

function inventoryFields(flexId: string): string[] {
  return [
    'FMaterialId.FNumber', 'FMaterialId.FName', 'FStockID.FNumber', 'FStockID.FName',
    `FStockLocID.FF${flexId}.FNumber`, `FStockLocID.FF${flexId}.FName`,
    'FLot.FNumber', 'FAVBQty', 'FBaseQty', 'FStockStatusId.FNumber', 'FStockStatusId.FName', 'FBaseLockQty',
  ]
}

function assemblyFields(flexId: string): string[] {
  return [
    'FID', 'FBillNo', 'FDocumentStatus', 'FNote', 'FEntity_FEntryID', 'FMaterialID.FNumber',
    'FMaterialID.FName', 'FMaterialID.FSpecification', 'FUnitID.FNumber', 'FQty', 'FStockID.FNumber',
    `FStockLocID.FF${flexId}.FNumber`, `FStockLocID.FF${flexId}.FName`, 'FLot.FNumber',
  ]
}

async function queryStockLocationFlexId(stockNumber: string, stockName = ''): Promise<string> {
  const normalizedStock = text(stockNumber).trim().toUpperCase()
  if (!normalizedStock) writeFail('仓库不能为空', 400)
  const cached = stockLocationFlexIdCache.get(normalizedStock)
  if (cached) return cached
  const rows = await queryFormRows('BD_FLEXVALUES', FLEX_VALUE_FIELDS, '', 'FID ASC')
  const normalizedName = text(stockName).trim().toUpperCase()
  const match = rows.find((row) => {
    const number = rowText(row, 1).toUpperCase()
    const name = rowText(row, 2).toUpperCase()
    return number === normalizedStock || (normalizedName && name === normalizedName)
  })
  const flexId = match ? rowText(match, 0) : ''
  if (!flexId) writeFail(`未找到仓库对应的仓位维度：${normalizedStock}`, 502)
  stockLocationFlexIdCache.set(normalizedStock, flexId)
  return flexId
}

function mapAssembly(row: unknown[]): AssemblyBill {
  return {
    billNo: rowText(row, 1),
    status: rowText(row, 2),
    entryId: Number(row[4]) || 0,
    materialCode: rowText(row, 5),
    qty: rowQty(row, 9),
    stockNumber: rowText(row, 10),
    stockLocationNumber: rowText(row, 11),
    lotNumber: rowText(row, 13),
  }
}

function baseNumber(value: string): Record<string, string> {
  return { FNumber: value }
}

function locationValue(value: string, field: string): Record<string, Record<string, string>> {
  return { [field]: baseNumber(value) }
}

function localDateTime(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

function stalePick(updateTime: unknown): boolean {
  const parsed = updateTime instanceof Date
    ? updateTime.getTime()
    : Date.parse(text(updateTime).replace(' ', 'T'))
  return !Number.isFinite(parsed) || Date.now() - parsed > OUTBOUND_PICK_STALE_MS
}

async function claimOutboundPick(
  connection: PoolConnection,
  billNo: string,
  requestId: string,
  requestPayload: string,
  operator: string,
): Promise<PickRecord> {
  let existing = await queryOne(connection, `
    SELECT bill_no, request_id, status, conversion_result, update_time
    FROM tk_wms_outbound_pick
    WHERE bill_no = ?
    FOR UPDATE
  `, [billNo])

  if (existing) {
    if (text(existing.status) === 'SUCCESS') {
      return {
        billNo: text(existing.bill_no),
        requestId: text(existing.request_id),
        status: 'SUCCESS',
        conversionResult: text(existing.conversion_result),
        updateTime: existing.update_time,
      }
    }
    if (text(existing.status) === 'PROCESSING'
      && !same(existing.request_id, requestId)
      && !stalePick(existing.update_time)) {
      writeFail('该销售出库单正在被其他人员处理，请稍后刷新', 409)
    }
    await connection.query(mysqlQueryOptions(`
      UPDATE tk_wms_outbound_pick
      SET request_id = ?, status = 'PROCESSING', request_payload = ?,
          error_message = NULL, operator = ?, update_time = NOW()
      WHERE bill_no = ?
    `), [requestId, requestPayload, operator, billNo])
    existing = await queryOne(connection, `
      SELECT bill_no, request_id, status, conversion_result, update_time
      FROM tk_wms_outbound_pick
      WHERE bill_no = ?
      FOR UPDATE
    `, [billNo])
    if (!existing) writeFail('无法锁定销售出库单，请刷新后重试', 409)
    return {
      billNo: text(existing.bill_no),
      requestId: text(existing.request_id),
      status: text(existing.status),
      conversionResult: text(existing.conversion_result),
      updateTime: existing.update_time,
    }
  }

  try {
    await connection.query(mysqlQueryOptions(`
      INSERT INTO tk_wms_outbound_pick
        (bill_no, request_id, status, request_payload, error_message, operator, create_time, update_time)
      VALUES (?, ?, 'PROCESSING', ?, NULL, ?, NOW(), NOW())
    `), [billNo, requestId, requestPayload, operator])
  } catch (error) {
    // A concurrent insert may win the bill-level lock. Re-read it under the
    // transaction so the caller receives the same deterministic conflict or
    // idempotent result as an already-existing row.
    existing = await queryOne(connection, `
      SELECT bill_no, request_id, status, conversion_result, update_time
      FROM tk_wms_outbound_pick
      WHERE bill_no = ?
      FOR UPDATE
    `, [billNo])
    if (!existing) throw error
    if (text(existing.status) === 'SUCCESS') {
      return {
        billNo: text(existing.bill_no),
        requestId: text(existing.request_id),
        status: 'SUCCESS',
        conversionResult: text(existing.conversion_result),
        updateTime: existing.update_time,
      }
    }
    if (text(existing.status) === 'PROCESSING'
      && !same(existing.request_id, requestId)
      && !stalePick(existing.update_time)) {
      writeFail('该销售出库单正在被其他人员处理，请稍后刷新', 409)
    }
    await connection.query(mysqlQueryOptions(`
      UPDATE tk_wms_outbound_pick
      SET request_id = ?, status = 'PROCESSING', request_payload = ?,
          error_message = NULL, operator = ?, update_time = NOW()
      WHERE bill_no = ?
    `), [requestId, requestPayload, operator, billNo])
    existing = await queryOne(connection, `
      SELECT bill_no, request_id, status, conversion_result, update_time
      FROM tk_wms_outbound_pick
      WHERE bill_no = ?
      FOR UPDATE
    `, [billNo])
    if (!existing) writeFail('无法锁定销售出库单，请刷新后重试', 409)
    return {
      billNo: text(existing.bill_no),
      requestId: text(existing.request_id),
      status: text(existing.status),
      conversionResult: text(existing.conversion_result),
      updateTime: existing.update_time,
    }
  }

  return { billNo, requestId, status: 'PROCESSING', conversionResult: '', updateTime: new Date() }
}

async function markPickFailed(connection: PoolConnection, billNo: string, message: string): Promise<void> {
  await connection.query(mysqlQueryOptions(`
    UPDATE tk_wms_outbound_pick
    SET status = 'FAILED', error_message = ?, update_time = NOW()
    WHERE bill_no = ?
  `), [message.slice(0, 1000), billNo])
}

async function markPickSuccess(connection: PoolConnection, billNo: string): Promise<void> {
  await connection.query(mysqlQueryOptions(`
    UPDATE tk_wms_outbound_pick
    SET status = 'SUCCESS', error_message = NULL, update_time = NOW()
    WHERE bill_no = ?
  `), [billNo])
}

async function persistConversionAudit(connection: PoolConnection, billNo: string, audits: AnyRecord[]): Promise<void> {
  await connection.query(mysqlQueryOptions(`
    UPDATE tk_wms_outbound_pick
    SET conversion_result = ?, update_time = NOW()
    WHERE bill_no = ?
  `), [JSON.stringify(audits), billNo])
}

function parsePickSegments(
  item: AnyRecord,
  actualQty: number,
  entryId: string,
  targetMaterialCode: string,
  stockNumber: string,
  targetLocationNumber: string,
  itemLotNumber: string,
  documentLotNumber: string,
): PickSegment[] {
  if (!Object.prototype.hasOwnProperty.call(item, 'picks')) {
    if (equalQty(actualQty, 0)) return []
    const materialCode = text(item.materialCode).toUpperCase()
    if (!materialCode) writeFail('实发数量大于 0 时必须完成物料扫码', 400)
    if (!same(materialCode, targetMaterialCode)) writeFail('旧版出库请求不支持物料转换，请刷新出库页面', 400)
    return [{
      segmentId: `${entryId}-legacy`,
      sourceMaterialCode: materialCode,
      qty: actualQty,
      stockNumber,
      sourceLocationNumber: targetLocationNumber,
      sourceLotNumber: itemLotNumber || documentLotNumber,
      businessConfirmed: true,
      businessConfirmReason: '',
    }]
  }

  if (!Array.isArray(item.picks)) writeFail('拣货来源段格式不正确', 400)
  return item.picks.map((rawSegment: unknown, index: number) => {
    if (!rawSegment || typeof rawSegment !== 'object' || Array.isArray(rawSegment)) {
      writeFail('拣货来源段格式不正确', 400)
    }
    const segment = rawSegment as AnyRecord
    const segmentQty = quantity(segment.qty, '拣货来源数量', { required: true, positive: true })
    const sourceMaterialCode = text(segment.sourceMaterialCode).toUpperCase()
    if (!sourceMaterialCode) writeFail('拣货来源物料不能为空', 400)
    const segmentStock = text(segment.stockNumber) || stockNumber
    const sourceLocationNumber = text(segment.sourceLocationNumber)
      || text(segment.stockLocationNumber)
    const sourceLotNumber = text(segment.sourceLotNumber)
      || text(segment.lotNumber)
      || documentLotNumber
    return {
      segmentId: text(segment.segmentId) || `${entryId}-segment-${index}`,
      sourceMaterialCode,
      qty: segmentQty,
      stockNumber: segmentStock,
      sourceLocationNumber,
      sourceLotNumber,
      businessConfirmed: booleanValue(segment.businessConfirmed),
      businessConfirmReason: text(segment.businessConfirmReason),
    }
  })
}

function resolveOutboundLot(itemLotNumber: string, documentLotNumber: string, segments: PickSegment[]): string {
  let result = itemLotNumber || documentLotNumber
  const lots = new Set(segments.map((segment) => segment.sourceLotNumber).filter(Boolean))
  if (!result && lots.size === 1) result = [...lots][0]
  if (lots.size > 1) writeFail('同一出库明细不能混用多个批次，请拆分后出库', 400)
  if (result && lots.size === 1 && !same(result, [...lots][0])) {
    writeFail(`拣货批次与最终出库批次不一致：${result}`, 400)
  }
  return result
}

function conversionTraceKey(
  billNo: string,
  entryId: string,
  segmentIndex: number,
  segment: PickSegment,
  targetMaterialCode: string,
  stockNumber: string,
  targetLocationNumber: string,
  targetLotNumber: string,
): string {
  return [
    'OUTBOUND', billNo, entryId, segmentIndex, segment.sourceMaterialCode, targetMaterialCode,
    displayQty(segment.qty), stockNumber, segment.sourceLocationNumber, targetLocationNumber,
    segment.sourceLotNumber, targetLotNumber,
    ...(same(segment.stockNumber, stockNumber) ? [] : [segment.stockNumber]),
  ].join('|')
}

function conversionNoteToken(value: string): string {
  return text(value).replace(/\|/g, '_')
}

function buildConversionNote(input: {
  traceKey: string
  sourceMaterialCode: string
  targetMaterialCode: string
  qty: number
  sourceStockNumber: string
  targetStockNumber: string
  sourceLocationNumber: string
  targetLocationNumber: string
  sourceLotNumber: string
  targetLotNumber: string
}): string {
  return [
    `TK-OUTBOUND|TRACE:${conversionNoteToken(input.traceKey)}`,
    `SRC:${conversionNoteToken(input.sourceMaterialCode)}`,
    `DST:${conversionNoteToken(input.targetMaterialCode)}`,
    `QTY:${displayQty(input.qty)}`,
    ...(same(input.sourceStockNumber, input.targetStockNumber)
      ? [`STOCK:${conversionNoteToken(input.targetStockNumber)}`]
      : [
          `SRCSTOCK:${conversionNoteToken(input.sourceStockNumber)}`,
          `DSTSTOCK:${conversionNoteToken(input.targetStockNumber)}`,
        ]),
    `SRCLOC:${conversionNoteToken(input.sourceLocationNumber)}`,
    `DSTLOC:${conversionNoteToken(input.targetLocationNumber)}`,
    `SRCLOT:${conversionNoteToken(input.sourceLotNumber)}`,
    `DSTLOT:${conversionNoteToken(input.targetLotNumber)}`,
  ].join('|')
}

async function requireMaterial(code: string): Promise<Material> {
  const rows = await queryFormRows(
    'BD_MATERIAL',
    MATERIAL_FIELDS,
    `FNUMBER='${escapeFilterValue(code)}'`,
    'FNUMBER ASC',
  )
  if (!rows.length) writeFail(`未找到物料：${code}`, 400)
  return { code: rowText(rows[0], 0), unitNumber: rowText(rows[0], 3) }
}

async function queryAvailableQty(
  materialCode: string,
  stockNumber: string,
  locationNumber: string,
  lotNumber: string,
): Promise<number> {
  const flexId = await queryStockLocationFlexId(stockNumber)
  const fields = inventoryFields(flexId)
  const filters = [
    `FMaterialId.FNumber='${escapeFilterValue(materialCode)}'`,
    `FStockID.FNumber='${escapeFilterValue(stockNumber)}'`,
    `FStockLocID.FF${flexId}.FNumber='${escapeFilterValue(locationNumber)}'`,
    'FBaseQty<>0',
  ]
  if (lotNumber) filters.push(`FLot.FNumber='${escapeFilterValue(lotNumber)}'`)
  const rows = await queryFormRows('STK_Inventory', fields, filters.join(' and '), 'FBaseQty DESC')
  const lots = new Set<string>()
  let available = 0
  for (const row of rows.slice(0, 200)) {
    const rowLot = rowText(row, 6)
    if (rowLot) lots.add(rowLot)
    available += calculateK3AvailableQty(row[8], row[11], row[9], row[10])
  }
  if (!lotNumber && lots.size > 1) writeFail(`库位存在多个批次，请先选择具体批次：${locationNumber}`, 400)
  return roundQty(available)
}

async function queryAssemblyByNote(note: string, flexId: string): Promise<AssemblyBill | null> {
  const rows = await queryFormRows(
    ASSEMBLY_FORM,
    assemblyFields(flexId),
    `FNote='${escapeFilterValue(note)}'`,
    'FDate DESC',
  )
  return rows.length ? mapAssembly(rows[0]) : null
}

async function requireAssembly(billNo: string, flexId: string): Promise<AssemblyBill> {
  const rows = await queryFormRows(
    ASSEMBLY_FORM,
    assemblyFields(flexId),
    `FBillNo='${escapeFilterValue(billNo)}'`,
    'FDate DESC',
  )
  if (!rows.length) writeFail(`未找到组装拆卸单：${billNo}`, 502)
  return mapAssembly(rows[0])
}

async function saveAssembly(input: {
  source: Material
  target: Material
  qty: number
  sourceStockNumber: string
  targetStockNumber: string
  sourceLocationFlexId: string
  targetLocationFlexId: string
  sourceLocationNumber: string
  targetLocationNumber: string
  sourceLotNumber: string
  targetLotNumber: string
  note: string
}): Promise<AssemblyBill> {
  const child: AnyRecord = {
    FRowTypeSETY: 'SubItem',
    FMaterialIDSETY: baseNumber(input.source.code),
    FUnitIDSETY: baseNumber(input.source.unitNumber),
    FQtySETY: input.qty,
    FBaseUnitIDSETY: baseNumber(input.source.unitNumber),
    FBaseQtySETY: input.qty,
    FStockIDSETY: baseNumber(input.sourceStockNumber),
    ...locationValue(input.sourceLocationNumber, `FSTOCKLOCIDSETY__FF${input.sourceLocationFlexId}`),
    FStockStatusIDSETY: baseNumber(STOCK_STATUS),
    FOwnerTypeIDSETY: 'BD_OwnerOrg',
    FOwnerIDSETY: baseNumber(STOCK_ORG),
    FKeeperTypeIDSETY: 'BD_KeeperOrg',
    FKeeperIDSETY: baseNumber(STOCK_ORG),
  }
  if (input.sourceLotNumber) child.FLotSETY = baseNumber(input.sourceLotNumber)

  const product: AnyRecord = {
    FRowType: 'Product',
    FMaterialID: baseNumber(input.target.code),
    FUnitID: baseNumber(input.target.unitNumber),
    FQty: input.qty,
    FBaseUnitID: baseNumber(input.target.unitNumber),
    FBaseQty: input.qty,
    FStockID: baseNumber(input.targetStockNumber),
    ...locationValue(input.targetLocationNumber, `FSTOCKLOCID__FF${input.targetLocationFlexId}`),
    FStockStatusID: baseNumber(STOCK_STATUS),
    FOwnerTypeID: 'BD_OwnerOrg',
    FOwnerID: baseNumber(STOCK_ORG),
    FKeeperTypeID: 'BD_KeeperOrg',
    FKeeperID: baseNumber(STOCK_ORG),
    FSubEntity: [child],
  }
  if (input.targetLotNumber) product.FLot = baseNumber(input.targetLotNumber)

  const saved = await saveBill(ASSEMBLY_FORM, {
    NeedUpDateFields: [],
    NeedReturnFields: ['FBillNo', 'FID', 'FEntity.FEntryID'],
    IsDeleteEntry: true,
    IsVerifyBaseDataField: true,
    ValidateFlag: true,
    NumberSearch: true,
    IsAutoSubmitAndAudit: false,
    Model: {
      FID: 0,
      FBillTypeID: baseNumber(ASSEMBLY_BILL_TYPE),
      FStockOrgId: baseNumber(STOCK_ORG),
      FDate: localDateTime(),
      FOwnerTypeIdHead: 'BD_OwnerOrg',
      FOwnerIdHead: baseNumber(STOCK_ORG),
      FSubProOwnTypeIdH: 'BD_OwnerOrg',
      FSubProOwnerIdH: baseNumber(STOCK_ORG),
      FAffairType: 'Assembly',
      FNote: input.note,
      FEntity: [product],
    },
  }, '保存组装拆卸单', true)
  const entity = saved.successEntities[0] || {}
  const billNo = text(entity.Number ?? entity.number)
  if (!billNo) writeFail('组装拆卸单保存成功但未返回单号', 502)
  return requireAssembly(billNo, input.targetLocationFlexId)
}

async function ensureAssemblyAudited(billNo: string, flexId: string): Promise<void> {
  let state = await requireAssembly(billNo, flexId)
  if (state.status === 'C') return
  if (state.status === 'Z' || state.status === 'A') {
    await submitBill(ASSEMBLY_FORM, [billNo], '提交组装拆卸单')
  }
  state = await requireAssembly(billNo, flexId)
  if (state.status !== 'C') await auditBill(ASSEMBLY_FORM, [billNo], '审核组装拆卸单')
  state = await requireAssembly(billNo, flexId)
  if (state.status !== 'C') writeFail(`组装拆卸单未进入已审核状态：${billNo}`, 502)
}

function buildTransferNote(input: {
  traceKey: string
  sourceStockNumber: string
  sourceLocationNumber: string
  targetStockNumber: string
  targetLocationNumber: string
  targetLotNumber: string
}): string {
  return [
    `TK-OUTBOUND-TRANSFER|TRACE:${conversionNoteToken(input.traceKey)}`,
    `SRCSTOCK:${conversionNoteToken(input.sourceStockNumber)}`,
    `SRCLOC:${conversionNoteToken(input.sourceLocationNumber)}`,
    `DSTSTOCK:${conversionNoteToken(input.targetStockNumber)}`,
    `DSTLOC:${conversionNoteToken(input.targetLocationNumber)}`,
    `LOT:${conversionNoteToken(input.targetLotNumber)}`,
  ].join('|')
}

function transferPayload(input: {
  material: Material
  qty: number
  sourceStockNumber: string
  sourceLocationNumber: string
  sourceLocationFlexId: string
  targetStockNumber: string
  targetLocationNumber: string
  targetLocationFlexId: string
  targetLotNumber: string
  note: string
}): AnyRecord {
  const entry: AnyRecord = {
    FMaterialId: baseNumber(input.material.code),
    FUnitID: baseNumber(input.material.unitNumber),
    FQty: input.qty,
    FBaseUnitId: baseNumber(input.material.unitNumber),
    FBaseQty: input.qty,
    FSrcStockId: baseNumber(input.sourceStockNumber),
    FSrcStockLocId: {
      [`FSRCSTOCKLOCID__FF${input.sourceLocationFlexId}`]: baseNumber(input.sourceLocationNumber),
    },
    FDestStockId: baseNumber(input.targetStockNumber),
    FDestStockLocId: {
      [`FDESTSTOCKLOCID__FF${input.targetLocationFlexId}`]: baseNumber(input.targetLocationNumber),
    },
    FSrcStockStatusId: baseNumber(STOCK_STATUS),
    FDestStockStatusId: baseNumber(STOCK_STATUS),
    FOwnerTypeId: 'BD_OwnerOrg',
    FOwnerId: baseNumber(STOCK_ORG),
    FKeeperTypeId: 'BD_KeeperOrg',
    FKeeperId: baseNumber(STOCK_ORG),
  }
  if (input.targetLotNumber) entry.FLot = baseNumber(input.targetLotNumber)
  return {
    NeedUpDateFields: [],
    NeedReturnFields: ['FBillNo', 'FID', 'FBillEntry.FEntryID'],
    IsDeleteEntry: true,
    IsVerifyBaseDataField: true,
    IsEntryBatchFill: false,
    ValidateFlag: true,
    NumberSearch: true,
    IsAutoSubmitAndAudit: false,
    Model: {
      FID: 0,
      FBillTypeID: baseNumber(TRANSFER_BILL_TYPE),
      FStockOrgId: baseNumber(STOCK_ORG),
      FStockOutOrgId: baseNumber(STOCK_ORG),
      FDate: localDateTime(),
      FTransferDirect: 'GENERAL',
      FTransferBizType: 'InnerOrgTransfer',
      FBizType: 'NORMAL',
      FOwnerTypeInIdHead: 'BD_OwnerOrg',
      FOwnerInIdHead: baseNumber(STOCK_ORG),
      FOwnerTypeOutIdHead: 'BD_OwnerOrg',
      FOwnerOutIdHead: baseNumber(STOCK_ORG),
      FNote: input.note,
      FBillEntry: [entry],
    },
  }
}

async function queryDirectTransfer(condition: string): Promise<DirectTransferBill | null> {
  const rows = await queryFormRows(TRANSFER_FORM, TRANSFER_FIELDS, condition, 'FID DESC')
  if (!rows.length) return null
  return {
    billNo: rowText(rows[0], 1),
    status: rowText(rows[0], 2),
    note: rowText(rows[0], 3),
  }
}

async function requireDirectTransfer(billNo: string): Promise<DirectTransferBill> {
  const state = await queryDirectTransfer(`FBillNo='${escapeFilterValue(billNo)}'`)
  if (!state) writeFail(`未找到直接调拨单：${billNo}`, 502)
  return state
}

async function ensureDirectTransferAudited(input: {
  material: Material
  qty: number
  sourceStockNumber: string
  sourceLocationNumber: string
  sourceLocationFlexId: string
  targetStockNumber: string
  targetLocationNumber: string
  targetLocationFlexId: string
  targetLotNumber: string
  note: string
}): Promise<DirectTransferBill> {
  let state = await queryDirectTransfer(`FNote='${escapeFilterValue(input.note)}'`)
  if (!state) {
    const saved = await saveBill(
      TRANSFER_FORM,
      transferPayload(input),
      '保存直接调拨单',
      true,
    )
    const entity = saved.successEntities[0] || {}
    const billNo = text(entity.Number ?? entity.number ?? entity.FBillNo ?? entity.FBILLNO)
    if (!billNo) writeFail('直接调拨单保存成功但未返回单号', 502)
    state = await requireDirectTransfer(billNo)
  }
  if (state.status === 'C') return state
  if (state.status === 'A' || state.status === 'Z') {
    await submitBill(TRANSFER_FORM, [state.billNo], '提交直接调拨单')
  }
  state = await requireDirectTransfer(state.billNo)
  if (state.status !== 'C') await auditBill(TRANSFER_FORM, [state.billNo], '审核直接调拨单')
  state = await requireDirectTransfer(state.billNo)
  if (state.status !== 'C') writeFail(`直接调拨单未进入已审核状态：${state.billNo}`, 502)
  return state
}

async function convertMaterial(input: {
  traceKey: string
  sourceMaterialCode: string
  targetMaterialCode: string
  sourceStockNumber: string
  targetStockNumber: string
  sourceLocationNumber: string
  targetLocationNumber: string
  sourceLotNumber: string
  targetLotNumber: string
  qty: number
}): Promise<AnyRecord> {
  const sourceMaterialCode = text(input.sourceMaterialCode).toUpperCase()
  const targetMaterialCode = text(input.targetMaterialCode).toUpperCase()
  const targetLotNumber = input.targetLotNumber || input.sourceLotNumber
  if (same(sourceMaterialCode, targetMaterialCode)) {
    return {
      conversionRequired: false,
      traceKey: input.traceKey,
      assemblyBillNo: '',
      assemblyEntryId: null,
      sourceMaterialCode: targetMaterialCode,
      targetMaterialCode,
      qty: input.qty,
      sourceLocationNumber: input.targetLocationNumber,
      targetLocationNumber: input.targetLocationNumber,
      sourceLotNumber: '',
      targetLotNumber: '',
      status: 'NOT_REQUIRED',
    }
  }

  const source = await requireMaterial(sourceMaterialCode)
  const target = await requireMaterial(targetMaterialCode)
  if (!same(source.unitNumber, target.unitNumber)) {
    writeFail(`业务转换的原物料和目标物料单位不同，暂不支持自动换算：${source.unitNumber} → ${target.unitNumber}`, 400)
  }

  const sourceLocationFlexId = await queryStockLocationFlexId(input.sourceStockNumber)
  const targetLocationFlexId = await queryStockLocationFlexId(input.targetStockNumber)
  const requiresTransfer = !same(input.sourceStockNumber, input.targetStockNumber)
  const assemblyStockNumber = requiresTransfer ? input.sourceStockNumber : input.targetStockNumber
  const assemblyLocationNumber = requiresTransfer ? input.sourceLocationNumber : input.targetLocationNumber
  const assemblyLocationFlexId = requiresTransfer ? sourceLocationFlexId : targetLocationFlexId
  const note = buildConversionNote({ ...input, sourceMaterialCode, targetMaterialCode, targetLotNumber })
  let assembly = await queryAssemblyByNote(note, assemblyLocationFlexId)
  if (!assembly) {
    const sourceAvailable = await queryAvailableQty(
      source.code, input.sourceStockNumber, input.sourceLocationNumber, input.sourceLotNumber,
    )
    if (sourceAvailable < input.qty && !equalQty(sourceAvailable, input.qty)) {
      writeFail(`转换前来源库存不足：${source.code} / ${input.sourceLocationNumber}，可用 ${displayQty(sourceAvailable)}`, 400)
    }
    assembly = await saveAssembly({
      source,
      target,
      qty: input.qty,
      sourceStockNumber: input.sourceStockNumber,
      targetStockNumber: assemblyStockNumber,
      sourceLocationFlexId,
      targetLocationFlexId: assemblyLocationFlexId,
      sourceLocationNumber: input.sourceLocationNumber,
      targetLocationNumber: assemblyLocationNumber,
      sourceLotNumber: input.sourceLotNumber,
      targetLotNumber,
      note,
    })
  }
  await ensureAssemblyAudited(assembly.billNo, assemblyLocationFlexId)
  assembly = await requireAssembly(assembly.billNo, assemblyLocationFlexId)
  if (!same(assembly.materialCode, target.code)
    || !equalQty(assembly.qty, input.qty)
    || !same(assembly.stockNumber, assemblyStockNumber)
    || !same(assembly.stockLocationNumber, assemblyLocationNumber)) {
    writeFail(`已存在的转换单与本次出库转换明细不一致：${assembly.billNo}`, 409)
  }
  const assemblyTargetAvailable = await queryAvailableQty(
    target.code, assemblyStockNumber, assemblyLocationNumber, targetLotNumber,
  )
  if (assemblyTargetAvailable < input.qty && !equalQty(assemblyTargetAvailable, input.qty)) {
    writeFail(`组装拆卸单已审核，但目标物料库存尚未刷新，请稍后重试：${assembly.billNo}`, 409)
  }
  let transfer: DirectTransferBill | null = null
  if (requiresTransfer) {
    const transferNote = buildTransferNote({
      traceKey: input.traceKey,
      sourceStockNumber: input.sourceStockNumber,
      sourceLocationNumber: input.sourceLocationNumber,
      targetStockNumber: input.targetStockNumber,
      targetLocationNumber: input.targetLocationNumber,
      targetLotNumber,
    })
    transfer = await ensureDirectTransferAudited({
      material: target,
      qty: input.qty,
      sourceStockNumber: input.sourceStockNumber,
      sourceLocationNumber: assemblyLocationNumber,
      sourceLocationFlexId: sourceLocationFlexId,
      targetStockNumber: input.targetStockNumber,
      targetLocationNumber: input.targetLocationNumber,
      targetLocationFlexId,
      targetLotNumber,
      note: transferNote,
    })
  }
  const targetAvailable = await queryAvailableQty(
    target.code, input.targetStockNumber, input.targetLocationNumber, targetLotNumber,
  )
  if (targetAvailable < input.qty && !equalQty(targetAvailable, input.qty)) {
    writeFail(`${requiresTransfer ? '直接调拨单已审核，但' : ''}目标物料库存尚未刷新，请稍后重试：${transfer?.billNo || assembly.billNo}`, 409)
  }
  return {
    conversionRequired: true,
    traceKey: input.traceKey,
    assemblyBillNo: assembly.billNo,
    assemblyEntryId: assembly.entryId,
    sourceMaterialCode: source.code,
    targetMaterialCode: target.code,
    qty: input.qty,
    sourceLocationNumber: input.sourceLocationNumber,
    targetLocationNumber: input.targetLocationNumber,
    sourceLotNumber: input.sourceLotNumber,
    targetLotNumber,
    sourceStockNumber: input.sourceStockNumber,
    targetStockNumber: input.targetStockNumber,
    transferBillNo: transfer?.billNo || '',
    transferStatus: transfer?.status || '',
    status: 'AUDITED',
  }
}

function conversionAudit(plan: ConversionPlan, conversion: AnyRecord): AnyRecord {
  return {
    entryId: plan.entryId,
    traceKey: plan.traceKey,
    segmentId: plan.segment.segmentId,
    sourceMaterialCode: conversion.sourceMaterialCode,
    targetMaterialCode: conversion.targetMaterialCode,
    qty: conversion.qty,
    sourceStockNumber: conversion.sourceStockNumber,
    targetStockNumber: conversion.targetStockNumber,
    sourceLocationNumber: conversion.sourceLocationNumber,
    targetLocationNumber: conversion.targetLocationNumber,
    sourceLotNumber: conversion.sourceLotNumber,
    targetLotNumber: conversion.targetLotNumber,
    assemblyBillNo: conversion.assemblyBillNo,
    assemblyEntryId: conversion.assemblyEntryId,
    transferBillNo: conversion.transferBillNo,
    transferStatus: conversion.transferStatus,
    businessConfirmReason: plan.segment.businessConfirmReason,
    status: conversion.status,
  }
}

function verifyPersistedConversions(pickRecord: PickRecord, currentPlans: ConversionPlan[]): void {
  const persisted = text(pickRecord.conversionResult)
  if (!persisted) return
  let audits: unknown
  try {
    audits = JSON.parse(persisted)
  } catch {
    writeFail('历史物料转换审计记录格式异常，请联系管理员', 500)
  }
  if (!Array.isArray(audits)) writeFail('历史物料转换审计记录格式异常，请联系管理员', 500)
  const currentByTrace = new Map(currentPlans.map((plan) => [plan.traceKey, plan]))
  for (const rawAudit of audits) {
    if (!rawAudit || typeof rawAudit !== 'object') writeFail('历史物料转换审计记录格式异常，请联系管理员', 500)
    const audit = rawAudit as AnyRecord
    const current = currentByTrace.get(text(audit.traceKey))
    if (!current) writeFail('本单已有物料转换完成，不能更改已确认的混出明细；请沿用原拣货选择重试', 409)
    if (text(audit.businessConfirmReason) !== current.segment.businessConfirmReason) {
      writeFail('本单已有物料转换完成，不能更改业务确认原因；请沿用原确认信息重试', 409)
    }
  }
}

function savedQuantitiesMatch(rows: AnyRecord[], items: AnyRecord[]): boolean {
  const quantities = new Map(rows.map((row) => [text(row.entryId), quantity(row.realQty, '金蝶实发数量')]))
  return items.every((item) => quantities.has(text(item.entryId))
    && equalQty(quantities.get(text(item.entryId)) || 0, quantity(item.actualQty, '实发数量')))
}

async function currentSalesOutboundRows(billNo: string): Promise<AnyRecord[]> {
  const result = await queryK3DocumentList('salesOutbound', { billNo, pageNum: 1, pageSize: 1_000 })
  if (result.truncated) writeFail('销售出库单明细超过系统处理上限，请拆分单据后重试', 400)
  if (Number(result.total || 0) > 1_000) writeFail('销售出库单明细超过单次处理上限，请拆分单据后重试', 400)
  return Array.isArray(result.rows)
    ? result.rows.filter((row: AnyRecord) => same(row.billNo, billNo))
    : []
}

async function completeSalesOutboundWithinSession(
  event: H3Event,
  body: AnyRecord,
  requestKey: string,
  session: AnyRecord,
  connection: PoolConnection,
): Promise<ReturnType<typeof apiSuccess> | ReturnType<typeof apiError>> {
  const billNo = text(body.billNo)
  let pickRecord: PickRecord | null = null
  try {
    const currentRows = await currentSalesOutboundRows(billNo)
    if (!currentRows.length) writeFail(`金蝶中未找到销售出库单 ${billNo}`, 400)

    pickRecord = await claimOutboundPick(connection, billNo, requestKey, JSON.stringify(body), text(session.userName))
    if (pickRecord.status === 'SUCCESS') {
      return apiSuccess({ billNo, status: 'C', idempotent: true }, '该销售出库单已经完成出库')
    }

    const status = text(currentRows[0].documentStatus).toUpperCase()
    if (status === 'C') {
      await markPickSuccess(connection, billNo)
      return apiSuccess({ billNo, status: 'C', idempotent: true }, '销售出库单已在金蝶完成审核')
    }
    if (!['Z', 'A', 'B'].includes(status)) writeFail('该单据当前状态不允许出库，请刷新后重试', 409)

    const rowsByEntryId = new Map(currentRows.map((row) => [text(row.entryId), row]))
    const items = Array.isArray(body.items) ? body.items : []
    if (!items.length) writeFail('销售出库单号、请求号和实发明细不能为空', 400)
    const submitted = new Set<string>()
    const preparedLines: PreparedLine[] = []
    const conversionPlans: ConversionPlan[] = []
    const sourceDemand = new Map<string, { materialCode: string; stockNumber: string; locationNumber: string; lotNumber: string; qty: number }>()

    for (const rawItem of items) {
      if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) writeFail('实发明细格式不正确', 400)
      const item = rawItem as AnyRecord
      const entryId = text(item.entryId)
      const currentRow = rowsByEntryId.get(entryId)
      if (!currentRow) writeFail('出库单明细已变化，请刷新后重新核对', 409)
      if (submitted.has(entryId)) writeFail(`出库单明细不能重复提交：${entryId}`, 400)
      submitted.add(entryId)

      const actualQty = quantity(item.actualQty, '实发数量', { required: true })
      const planQty = quantity(currentRow.qty, '计划数量')
      if (actualQty > planQty && !equalQty(actualQty, planQty)) {
        writeFail(`实发数量不能超过计划数量：${text(currentRow.materialNumber)}`, 400)
      }
      if (status === 'B' && !equalQty(actualQty, quantity(currentRow.realQty, '金蝶实发数量'))) {
        writeFail('该单据已提交，实发数量已锁定；请在金蝶提交前修改后再拣货', 409)
      }

      const targetMaterialCode = text(currentRow.materialNumber).toUpperCase()
      let stockNumber = text(item.stockNumber) || text(currentRow.stockNumber)
      if (text(currentRow.stockNumber) && !same(text(currentRow.stockNumber), stockNumber)) {
        writeFail(`拣货仓库与出库单仓库不一致：${stockNumber}`, 400)
      }
      const targetLocationNumber = text(item.stockLocationNumber).toUpperCase()
      const itemLotNumber = text(item.lotNumber)
      const documentLotNumber = text(currentRow.lotNumber)
      if (documentLotNumber && itemLotNumber && !same(documentLotNumber, itemLotNumber)) {
        writeFail(`拣货批次与出库单批次不一致：${itemLotNumber}`, 400)
      }

      const segments = parsePickSegments(
        item, actualQty, entryId, targetMaterialCode, stockNumber, targetLocationNumber, itemLotNumber, documentLotNumber,
      )
      const outboundLotNumber = resolveOutboundLot(itemLotNumber, documentLotNumber, segments)
      if (actualQty > 0) {
        if (!stockNumber || !targetLocationNumber) writeFail('实发数量大于 0 时必须指定仓库和最终出库库位', 400)
        const segmentTotal = segments.reduce((sum, segment) => sum + segment.qty, 0)
        if (!equalQty(segmentTotal, actualQty)) writeFail(`拣货来源数量合计必须等于实发数量：${targetMaterialCode}`, 400)
        segments.forEach((segment, segmentIndex) => {
          if (!segment.sourceLocationNumber) writeFail(`来源物料必须指定实际库位：${segment.sourceMaterialCode}`, 400)
          const converted = !same(segment.sourceMaterialCode, targetMaterialCode)
          if (!converted) {
            if (!same(stockNumber, segment.stockNumber)) writeFail(`普通物料拣货来源仓库与出库仓库不一致：${segment.sourceMaterialCode}`, 400)
            const demandKey = [segment.sourceMaterialCode, stockNumber, segment.sourceLocationNumber, segment.sourceLotNumber].join('|')
            const demand = sourceDemand.get(demandKey) || {
              materialCode: segment.sourceMaterialCode,
              stockNumber,
              locationNumber: segment.sourceLocationNumber,
              lotNumber: segment.sourceLotNumber,
              qty: 0,
            }
            demand.qty = roundQty(demand.qty + segment.qty)
            sourceDemand.set(demandKey, demand)
            if (!same(targetLocationNumber, segment.sourceLocationNumber)) {
              writeFail(`同一出库明细只能使用一个最终库位；普通物料来源库位必须等于最终出库库位：${targetMaterialCode}`, 400)
            }
          } else {
            if (!segment.businessConfirmed || !segment.businessConfirmReason) {
              writeFail(`物料不一致时必须填写业务确认原因：${segment.sourceMaterialCode} → ${targetMaterialCode}`, 400)
            }
            conversionPlans.push({
              traceKey: conversionTraceKey(
                billNo, entryId, segmentIndex, segment, targetMaterialCode, stockNumber, targetLocationNumber, outboundLotNumber,
              ),
              entryId,
              segment,
              targetMaterialCode,
              sourceStockNumber: segment.stockNumber,
              stockNumber,
              targetLocationNumber,
              targetLotNumber: outboundLotNumber,
            })
          }
        })
      }
      preparedLines.push({ entryId, targetMaterialCode, actualQty, stockNumber, targetLocationNumber, outboundLotNumber, segments })
    }

    if (submitted.size !== rowsByEntryId.size) writeFail('必须核对并提交出库单的全部物料明细', 400)
    verifyPersistedConversions(pickRecord, conversionPlans)

    for (const demand of sourceDemand.values()) {
      const available = await queryAvailableQty(demand.materialCode, demand.stockNumber, demand.locationNumber, demand.lotNumber)
      if (available < demand.qty && !equalQty(available, demand.qty)) {
        writeFail(`来源库位可用库存不足：${demand.materialCode} / ${demand.locationNumber}，可用 ${displayQty(available)}`, 400)
      }
    }

    const conversionAudits: AnyRecord[] = []
    for (const plan of conversionPlans) {
      const conversion = await convertMaterial({
        traceKey: plan.traceKey,
        sourceMaterialCode: plan.segment.sourceMaterialCode,
        targetMaterialCode: plan.targetMaterialCode,
        sourceStockNumber: plan.sourceStockNumber,
        targetStockNumber: plan.stockNumber,
        sourceLocationNumber: plan.segment.sourceLocationNumber,
        targetLocationNumber: plan.targetLocationNumber,
        sourceLotNumber: plan.segment.sourceLotNumber,
        targetLotNumber: plan.targetLotNumber,
        qty: plan.segment.qty,
      })
      conversionAudits.push(conversionAudit(plan, conversion))
      await persistConversionAudit(connection, billNo, conversionAudits)
    }

    const entries = preparedLines.map((line) => ({ FEntryID: line.entryId, FRealQty: line.actualQty }))
    for (const line of preparedLines) {
      if (line.actualQty > 0) {
        const available = await queryAvailableQty(line.targetMaterialCode, line.stockNumber, line.targetLocationNumber, line.outboundLotNumber)
        if (available < line.actualQty && !equalQty(available, line.actualQty)) {
          writeFail(`最终出库库位可用库存不足：${line.targetMaterialCode} / ${line.targetLocationNumber}，可用 ${displayQty(available)}`, 400)
        }
      }
    }

    if (status !== 'B') {
      await saveBill(SALES_OUTBOUND_FORM, {
        NeedUpDateFields: ['FEntity.FRealQty'],
        NeedReturnFields: ['FBillNo', 'FEntity.FEntryID', 'FEntity.FRealQty'],
        IsDeleteEntry: false,
        IsVerifyBaseDataField: false,
        IsEntryBatchFill: false,
        ValidateFlag: true,
        NumberSearch: true,
        Model: { FID: currentRows[0].id, FBillNo: billNo, FEntity: entries },
      }, '更新实发数量')
      const savedRows = await currentSalesOutboundRows(billNo)
      if (!savedQuantitiesMatch(savedRows, items)) writeFail('金蝶保存后的实发数量与拣货结果不一致，请勿继续审核', 409)
      await submitBill(SALES_OUTBOUND_FORM, [billNo], '提交销售出库单')
    }
    await auditBill(SALES_OUTBOUND_FORM, [billNo], '审核销售出库单')

    const auditedRows = await queryK3DocumentList('salesOutbound', {
      billNo,
      pageNum: 1,
      pageSize: 1_000,
      documentStatus: 'C',
    })
    const audited = Array.isArray(auditedRows.rows)
      ? auditedRows.rows.filter((row: AnyRecord) => same(row.billNo, billNo))
      : []
    if (!audited.length) writeFail(`销售出库单未进入已审核状态：${billNo}`, 409)

    await markPickSuccess(connection, billNo)
    const result = apiSuccess({
      billNo,
      lineCount: entries.length,
      conversionCount: conversionAudits.length,
      conversions: conversionAudits,
      status: 'C',
    }, `销售出库已完成：${billNo}`)
    await insertOperationLog(event, connection, session, '销售出库审核', 2, { ...body, requestId: requestKey }, result)
    return result
  } catch (error) {
    if (pickRecord && pickRecord.status !== 'SUCCESS') {
      try {
        await markPickFailed(connection, billNo, errorMessage(error, '金蝶出库失败'))
      } catch (markError) {
        console.error('[NitroStockDocument] failed to mark outbound pick:', errorMessage(markError, 'unknown error'))
      }
    }
    if (error instanceof K3CloudError) return apiError(error.message, error.statusCode)
    if (error instanceof Error && error.name === 'NitroWriteError') {
      const statusCode = Number((error as Error & { statusCode?: number }).statusCode || 500)
      return apiError(error.message, statusCode)
    }
    console.error('[NitroStockDocument] sales outbound failed:', errorMessage(error, 'unknown error'))
    return apiError('金蝶出库失败，请检查单据状态或稍后重试', 502)
  }
}

export async function completeSalesOutbound(event: H3Event, body: AnyRecord, requestKey: string) {
  const billNo = text(body.billNo)
  const items = body.items
  if (!billNo || !requestKey || !Array.isArray(items) || !items.length) {
    return apiError('销售出库单号、请求号和实发明细不能为空', 400)
  }
  return withIdempotentWriteSession(
    event,
    'stock-document:sales-outbound',
    SALES_OUTBOUND_COMPLETE_PERMISSION,
    requestKey,
    { ...body, billNo, requestId: requestKey },
    async (session, connection) => completeSalesOutboundWithinSession(event, body, requestKey, session, connection),
    '金蝶出库失败，请检查单据状态或稍后重试',
  )
}
