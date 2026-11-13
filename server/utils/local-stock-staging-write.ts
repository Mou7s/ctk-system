import { randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'
import { getHeader } from 'h3'
import type { PoolConnection, RowDataPacket } from 'mysql2/promise'
import { apiError, apiSuccess, errorMessage } from './response'
import { getAuthSession, hasPermission, type AuthSession } from './auth'
import {
  auditBill,
  executeBillQuery,
  K3CloudError,
  saveBill,
  submitBill,
} from './k3'
import { getMysqlPool, mysqlQueryOptions } from './mysql'
import {
  claimWriteRequest,
  finishWriteRequest,
  recordStandaloneOperationLog,
  releaseWriteRequest,
  bodyOf,
  type IdempotencyClaim,
  NitroWriteError,
  queryOne,
  text,
  writeFail,
} from './write'
import { queryLocalStockLegacyStaging } from './local-stock-staging-read'
import { normalizeLocationCode, queryWmsLocation } from './wms-structure'
import {
  sourceLocationFlexId,
  sourceStockConfig,
  sourceStockName,
  STAGING_TARGET_LOCATION_FLEX_ID,
  STAGING_TARGET_STOCK,
} from './local-stock-staging-config'

const FORM_ID = 'STK_TransferDirect'
const BILL_TYPE = 'ZJDB01_SYS'
const STOCK_ORG = '100'
const TARGET_STOCK = STAGING_TARGET_STOCK
const TARGET_STOCK_LOCATION_FLEX_ID = STAGING_TARGET_LOCATION_FLEX_ID
const DEFAULT_STOCK_STATUS = 'KCZT01_SYS'
const TRANSFER_LABEL = 'local-stock:staging-transfer'
const STAGING_TRANSFER_PERMISSION = 'tk_custom:localStock:inbound'

type TransferBody = Record<string, any>

interface TransferLine {
  sourceBillNo: string | null
  sourceEntryId: number | null
  materialCode: string
  materialName: string
  specification: string
  packageName: string
  marking: string
  lotNumber: string
  unitNumber: string
  receiptQty: number
  sourceStockNumber: string
  sourceStockName: string
  sourceStockLocationNumber: string
  sourceStockLocationName: string
  sourceStockLocationFlexId: string
  transferredQty: number
  sourceOnHandQty: number
  transferableQty: number
}

interface TransferRecord {
  request_id: string
  label_id: string | null
  source_bill_no: string | null
  source_entry_id: number | null
  source_kingdee_stock_number: string | null
  source_kingdee_stock_location_number: string | null
  material_code: string
  material_name: string | null
  specification: string | null
  package_name: string | null
  marking: string | null
  lot_number: string | null
  unit_number: string
  receipt_qty: number
  transfer_qty: number
  location_code: string
  kingdee_stock_number: string
  kingdee_stock_location_number: string
  kingdee_bill_id: number | string | null
  kingdee_bill_no: string | null
  status: string
  error_message?: string | null
  operator: string | null
  remark: string | null
}

interface DirectTransferState {
  id: number | string | null
  billNo: string
  status: string
  note: string
}

function scalar(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value
}

function numberValue(value: unknown): number {
  const parsed = Number(scalar(value) ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeQty(value: unknown): number {
  return Number(numberValue(value).toFixed(3))
}

function rowValue(row: unknown, index: number, ...fields: string[]): unknown {
  if (Array.isArray(row)) return row[index]
  if (!row || typeof row !== 'object') return undefined
  const source = row as Record<string, unknown>
  for (const field of fields) {
    if (field in source) return source[field]
    const lower = field.toLowerCase()
    if (lower in source) return source[lower]
  }
  return undefined
}

function stringValue(value: unknown): string {
  return String(scalar(value) ?? '').trim()
}

function packageName(specification: string): string {
  return specification.trim().split('/')[0]?.trim() || ''
}

function marking(specification: string): string {
  const parts = specification.trim().split('/')
  return parts.length > 1 ? parts.at(-1)?.trim() || '' : ''
}

function baseData(number: string): Record<string, string> {
  return { FNumber: number }
}

function nowK3(): string {
  const date = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function escapeK3(value: string): string {
  return value.replaceAll("'", "''")
}

function statusFromRow(row: unknown): string {
  return stringValue(rowValue(row, 2, 'FDocumentStatus', 'FDOCUMENTSTATUS'))
}

function normalizeRows(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('金蝶直接调拨查询返回异常')
  return value
}

async function withTransaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await getMysqlPool().getConnection()
  try {
    await connection.beginTransaction()
    const result = await work(connection)
    await connection.commit()
    return result
  } catch (error) {
    try { await connection.rollback() } catch { /* preserve original failure */ }
    throw error
  } finally {
    connection.release()
  }
}

async function selectTransfer(requestId: string): Promise<TransferRecord | null> {
  const pool = getMysqlPool()
  const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(
    'SELECT * FROM tk_staging_transfer WHERE request_id = ? LIMIT 1',
  ), [requestId])
  return rows[0] ? rows[0] as TransferRecord : null
}

async function updateTransferStatus(
  requestId: string,
  status: string,
  fields: { billId?: number | string | null; billNo?: string | null; errorMessage?: string | null } = {},
): Promise<void> {
  const assignments = ['status = ?', 'update_time = NOW()']
  const values: unknown[] = [status]
  if ('billId' in fields) {
    assignments.push('kingdee_bill_id = ?')
    values.push(fields.billId ?? null)
  }
  if ('billNo' in fields) {
    assignments.push('kingdee_bill_no = ?')
    values.push(fields.billNo ?? null)
  }
  if ('errorMessage' in fields) {
    assignments.push('error_message = ?')
    values.push(fields.errorMessage ?? null)
  }
  values.push(requestId)
  await withTransaction(async (connection) => {
    await connection.query(mysqlQueryOptions(
      `UPDATE tk_staging_transfer SET ${assignments.join(', ')} WHERE request_id = ?`,
    ), values)
  })
}

function lineFromLegacyRow(row: Record<string, any>): TransferLine {
  return {
    sourceBillNo: text(row.sourceBillNo) || null,
    sourceEntryId: row.sourceEntryId == null || row.sourceEntryId === '' ? null : Number(row.sourceEntryId),
    materialCode: text(row.materialCode).toUpperCase(),
    materialName: text(row.materialName),
    specification: text(row.specification),
    packageName: text(row.packageName) || packageName(text(row.specification)),
    marking: text(row.marking) || marking(text(row.specification)),
    lotNumber: text(row.lotNumber),
    unitNumber: text(row.unitNumber),
    receiptQty: normalizeQty(row.receiptQty),
    sourceStockNumber: text(row.sourceStockNumber).toUpperCase(),
    sourceStockName: text(row.sourceStockName),
    sourceStockLocationNumber: text(row.sourceStockLocationNumber),
    sourceStockLocationName: text(row.sourceStockLocationName),
    sourceStockLocationFlexId: text(row.sourceStockLocationFlexId),
    transferredQty: normalizeQty(row.transferredQty),
    sourceOnHandQty: normalizeQty(row.sourceOnHandQty ?? row.sourceAvailableQty),
    transferableQty: normalizeQty(row.transferableQty),
  }
}

async function resolveLegacyLine(body: TransferBody): Promise<TransferLine> {
  const materialCode = text(body.legacyMaterialCode).toUpperCase()
  if (!materialCode) writeFail('旧标签物料编码不能为空')
  const sourceStock = text(body.sourceStockNumber).toUpperCase()
  if (!sourceStock) writeFail('请选择来源仓库')
  const rows = await queryLocalStockLegacyStaging(materialCode)
  const sourceLocation = text(body.sourceStockLocationNumber).toUpperCase()
  const sourceLot = text(body.sourceLotNumber)
  const stockRows = rows.filter((row) => text(row.sourceStockNumber).toUpperCase() === sourceStock)
  if (!stockRows.length) writeFail(`物料 ${materialCode} 当前没有可用的来源仓库：${sourceStock}`)
  const locationRows = sourceLocation
    ? stockRows.filter((row) => text(row.sourceStockLocationNumber).toUpperCase() === sourceLocation)
    : stockRows
  if (sourceLocation && !locationRows.length) writeFail(`来源仓库 ${sourceStock} 当前没有可用库位：${sourceLocation}`)
  if (!sourceLocation && new Set(stockRows.map((row) => text(row.sourceStockLocationNumber).toUpperCase())).size > 1) {
    writeFail(`来源仓库 ${sourceStock} 存在多个库位，请先选择库位`)
  }
  const lotRows = sourceLot
    ? locationRows.filter((row) => text(row.lotNumber).toUpperCase() === sourceLot.toUpperCase())
    : locationRows
  if (!sourceLot && lotRows.length > 1) writeFail(`来源仓库 ${sourceStock} 存在多个批次，请先选择批次`)
  const match = lotRows[0]
  if (!match) writeFail(`来源仓库 ${sourceStock} 当前没有可用批次：${sourceLot}`)
  return lineFromLegacyRow(match as Record<string, any>)
}

async function resolveLine(body: TransferBody): Promise<TransferLine> {
  if (text(body.labelId)) writeFail('正式标签上架已停用，请使用旧标签物料上架')
  return resolveLegacyLine(body)
}

async function validateAndBuildRecord(session: AuthSession, body: TransferBody, requestId: string): Promise<TransferRecord> {
  const line = await resolveLine(body)
  const requestedSourceBillNo = text(body.sourceBillNo)
  const requestedSourceEntryId = text(body.sourceEntryId)
  if (requestedSourceBillNo && requestedSourceBillNo.toUpperCase() !== text(line.sourceBillNo).toUpperCase()) {
    writeFail('请求来源单据与当前上架明细不一致', 409)
  }
  if (requestedSourceEntryId && String(line.sourceEntryId ?? '') !== requestedSourceEntryId) {
    writeFail('请求来源单据明细与当前上架明细不一致', 409)
  }
  const locationCode = normalizeLocationCode(body.locationCode)
  if (!locationCode) writeFail('库位编码不能为空')
  const pool = getMysqlPool()
  const location = await queryWmsLocation(pool, locationCode)
  if (!location) writeFail(`库位不存在或已停用：${locationCode}`)
  if (String(location.status) !== '0') writeFail(`库位不存在或已停用：${locationCode}`)
  if (text(location.kingdeeStockNumber).toUpperCase() !== TARGET_STOCK) {
    writeFail(`实际库位未映射到 CTK10 塑封成品仓：${locationCode}`)
  }
  if (!text(location.kingdeeStockLocationNumber)) writeFail(`库位缺少金蝶仓位映射：${locationCode}`)
  if (!line.sourceStockLocationNumber) writeFail('来源明细未带金蝶封装仓位，不能执行库位上架')

  const qty = normalizeQty(body.qty)
  if (qty <= 0) writeFail('上架数量必须大于 0')
  if (qty > line.transferableQty) writeFail(`上架数量超过可上架剩余数量：${line.transferableQty}`)

  return {
    request_id: requestId,
    label_id: null,
    source_bill_no: line.sourceBillNo,
    source_entry_id: line.sourceEntryId,
    source_kingdee_stock_number: line.sourceStockNumber,
    source_kingdee_stock_location_number: line.sourceStockLocationNumber,
    material_code: line.materialCode,
    material_name: line.materialName,
    specification: line.specification,
    package_name: line.packageName,
    marking: line.marking,
    lot_number: line.lotNumber || null,
    unit_number: line.unitNumber,
    receipt_qty: line.receiptQty,
    transfer_qty: qty,
    location_code: locationCode,
    kingdee_stock_number: text(location.kingdeeStockNumber).toUpperCase(),
    kingdee_stock_location_number: text(location.kingdeeStockLocationNumber),
    kingdee_bill_id: null,
    kingdee_bill_no: null,
    status: 'PROCESSING',
    operator: session.userName,
    remark: text(body.remark) || null,
  }
}

function assertExistingRequestMatches(record: TransferRecord, body: TransferBody): void {
  const requestedMaterial = text(body.legacyMaterialCode).toUpperCase()
  const requestedSourceStock = text(body.sourceStockNumber).toUpperCase()
  const requestedSourceLocation = text(body.sourceStockLocationNumber).toUpperCase()
  const requestedLot = text(body.sourceLotNumber)
  const requestedSourceBillNo = text(body.sourceBillNo).toUpperCase()
  const requestedSourceEntryId = text(body.sourceEntryId)
  const requestedLocation = normalizeLocationCode(body.locationCode)
  const requestedQty = normalizeQty(body.qty)
  if (text(record.label_id)) writeFail('正式标签上架已停用，请使用旧标签物料上架')
  const same = (!requestedMaterial || requestedMaterial === text(record.material_code).toUpperCase())
    && requestedSourceStock === text(record.source_kingdee_stock_number).toUpperCase()
    && (!requestedSourceLocation || requestedSourceLocation === text(record.source_kingdee_stock_location_number).toUpperCase())
    && requestedLot.toUpperCase() === text(record.lot_number).toUpperCase()
    && (!requestedSourceBillNo || requestedSourceBillNo === text(record.source_bill_no).toUpperCase())
    && (!requestedSourceEntryId || requestedSourceEntryId === String(record.source_entry_id ?? ''))
    && (!requestedLocation || requestedLocation === text(record.location_code).toUpperCase())
    && (!requestedQty || requestedQty === normalizeQty(record.transfer_qty))
  if (!same) writeFail('同一幂等键对应的请求内容不一致', 409)
}

async function getOrCreateTransfer(session: AuthSession, body: TransferBody, requestId: string): Promise<TransferRecord> {
  const existing = await selectTransfer(requestId)
  if (existing) {
    assertExistingRequestMatches(existing, body)
    return existing
  }
  const record = await validateAndBuildRecord(session, body, requestId)
  try {
    await withTransaction(async (connection) => {
      await connection.query(mysqlQueryOptions(`
        INSERT INTO tk_staging_transfer (
          request_id, label_id, source_bill_no, source_entry_id,
          source_kingdee_stock_number, source_kingdee_stock_location_number,
          material_code, material_name, specification, package_name, marking,
          lot_number, unit_number, receipt_qty, transfer_qty, location_code,
          kingdee_stock_number, kingdee_stock_location_number, status,
          operator, remark, create_time, update_time
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `), [
        record.request_id, record.label_id, record.source_bill_no, record.source_entry_id,
        record.source_kingdee_stock_number, record.source_kingdee_stock_location_number,
        record.material_code, record.material_name, record.specification, record.package_name,
        record.marking, record.lot_number, record.unit_number, record.receipt_qty,
        record.transfer_qty, record.location_code, record.kingdee_stock_number,
        record.kingdee_stock_location_number, record.status, record.operator, record.remark,
      ])
    })
  } catch (error) {
    const concurrent = await selectTransfer(requestId)
    if (concurrent) {
      assertExistingRequestMatches(concurrent, body)
      return concurrent
    }
    throw error
  }
  return (await selectTransfer(requestId)) || record
}

function traceNote(record: TransferRecord): string {
  if (!record.source_bill_no) {
    return `WMS:${record.request_id};来源旧标签物料:${record.material_code}`
  }
  return `WMS:${record.request_id};来源:${record.source_bill_no}-${record.source_entry_id}`
}

async function resolveRecordSourceLocationFlexId(record: TransferRecord): Promise<string> {
  const configured = sourceStockConfig(record.source_kingdee_stock_number)?.locationFlexId
  if (configured) return configured
  const rows = await queryLocalStockLegacyStaging(record.material_code)
  const match = rows.find((row) => text(row.sourceStockNumber).toUpperCase() === text(record.source_kingdee_stock_number).toUpperCase()
    && text(row.sourceStockLocationNumber).toUpperCase() === text(record.source_kingdee_stock_location_number).toUpperCase()
    && text(row.lotNumber).toUpperCase() === text(record.lot_number).toUpperCase())
  return text(match?.sourceStockLocationFlexId) || sourceLocationFlexId(record.source_kingdee_stock_number)
}

async function buildDirectTransferPayload(record: TransferRecord) {
  const sourceStock = text(record.source_kingdee_stock_number).toUpperCase()
  const sourceLocationField = `FSRCSTOCKLOCID__FF${await resolveRecordSourceLocationFlexId(record)}`
  const destinationLocationField = `FDESTSTOCKLOCID__FF${TARGET_STOCK_LOCATION_FLEX_ID}`
  const entry: Record<string, any> = {
    FMaterialId: baseData(record.material_code),
    FUnitID: baseData(record.unit_number),
    FQty: record.transfer_qty,
    FBaseUnitId: baseData(record.unit_number),
    FBaseQty: record.transfer_qty,
    FSrcStockId: baseData(sourceStock),
    FSrcStockLocId: { [sourceLocationField]: baseData(text(record.source_kingdee_stock_location_number)) },
    FDestStockId: baseData(record.kingdee_stock_number),
    FDestStockLocId: { [destinationLocationField]: baseData(record.kingdee_stock_location_number) },
    FSrcStockStatusId: baseData(DEFAULT_STOCK_STATUS),
    FDestStockStatusId: baseData(DEFAULT_STOCK_STATUS),
    FOwnerTypeId: 'BD_OwnerOrg',
    FOwnerId: baseData(STOCK_ORG),
    FKeeperTypeId: 'BD_KeeperOrg',
    FKeeperId: baseData(STOCK_ORG),
  }
  if (record.lot_number) entry.FLot = baseData(text(record.lot_number))
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
      FBillTypeID: baseData(BILL_TYPE),
      FStockOrgId: baseData(STOCK_ORG),
      FStockOutOrgId: baseData(STOCK_ORG),
      FDate: nowK3(),
      FTransferDirect: 'GENERAL',
      FTransferBizType: 'InnerOrgTransfer',
      FBizType: 'NORMAL',
      FOwnerTypeInIdHead: 'BD_OwnerOrg',
      FOwnerInIdHead: baseData(STOCK_ORG),
      FOwnerTypeOutIdHead: 'BD_OwnerOrg',
      FOwnerOutIdHead: baseData(STOCK_ORG),
      FNote: traceNote(record),
      FBillEntry: [entry],
    },
  }
}

async function queryDirectTransfer(condition: string): Promise<DirectTransferState | null> {
  const rows = normalizeRows(await executeBillQuery({
    formId: FORM_ID,
    fieldKeys: ['FID', 'FBillNo', 'FDocumentStatus', 'FNote'],
    filterString: condition,
    orderString: 'FID DESC',
    startRow: 0,
    limit: 1,
  }))
  const row = rows[0]
  if (!row) return null
  return {
    id: rowValue(row, 0, 'FID'),
    billNo: stringValue(rowValue(row, 1, 'FBillNo', 'FBILLNO')),
    status: statusFromRow(row),
    note: stringValue(rowValue(row, 3, 'FNote', 'FNOTE')),
  }
}

async function queryDirectTransferByBillNo(billNo: string): Promise<DirectTransferState | null> {
  return queryDirectTransfer(`FBillNo = '${escapeK3(billNo)}'`)
}

async function queryDirectTransferByTrace(note: string): Promise<DirectTransferState | null> {
  return queryDirectTransfer(`FNote = '${escapeK3(note)}'`)
}

async function saveDirectTransfer(record: TransferRecord): Promise<DirectTransferState> {
  const result = await saveBill(FORM_ID, await buildDirectTransferPayload(record), '保存金蝶直接调拨单', true)
  const entity = result.successEntities[0] || {}
  const billNo = stringValue(entity.Number ?? entity.number ?? entity.FBillNo ?? entity.FBILLNO)
  const id = entity.Id ?? entity.id ?? entity.FID ?? entity.fid ?? null
  if (!billNo) throw new Error('保存金蝶直接调拨单成功但未返回单据号')
  return { id, billNo, status: 'A', note: traceNote(record) }
}

async function ensureAudited(state: DirectTransferState): Promise<DirectTransferState> {
  let current = await queryDirectTransferByBillNo(state.billNo)
  if (!current) throw new Error(`金蝶中未找到直接调拨单：${state.billNo}`)
  if (current.status === 'C') return current
  if (current.status === 'A' || current.status === 'Z') {
    try {
      await submitBill(FORM_ID, [state.billNo], '提交金蝶直接调拨单')
    } catch (error) {
      const afterSubmit = await queryDirectTransferByBillNo(state.billNo)
      if (!afterSubmit || !['B', 'C'].includes(afterSubmit.status)) throw error
    }
  }
  current = await queryDirectTransferByBillNo(state.billNo)
  if (current?.status === 'C') return current
  try {
    await auditBill(FORM_ID, [state.billNo], '审核金蝶直接调拨单')
  } catch (error) {
    // 审核超时但金蝶可能已审核：复核状态后再定，避免重复审核报错
    current = await queryDirectTransferByBillNo(state.billNo)
    if (current?.status === 'C') return current
    throw error
  }
  current = await queryDirectTransferByBillNo(state.billNo)
  if (!current || current.status !== 'C') throw new Error(`金蝶直接调拨单未进入已审核状态：${state.billNo}`)
  return current
}

async function markK3Saved(record: TransferRecord, state: DirectTransferState): Promise<TransferRecord> {
  await updateTransferStatus(record.request_id, 'K3_SAVED', { billId: state.id, billNo: state.billNo, errorMessage: null })
  return (await selectTransfer(record.request_id)) || { ...record, status: 'K3_SAVED', kingdee_bill_id: state.id, kingdee_bill_no: state.billNo }
}

async function markTransferSuccess(record: TransferRecord, state: DirectTransferState): Promise<TransferRecord> {
  const billId = state.id || record.kingdee_bill_id
  const billNo = state.billNo || record.kingdee_bill_no
  await withTransaction(async (connection) => {
    await connection.query(mysqlQueryOptions(`
      UPDATE tk_staging_transfer
      SET status = 'SUCCESS', kingdee_bill_id = ?, kingdee_bill_no = ?,
          error_message = NULL, update_time = NOW()
      WHERE request_id = ?
    `), [billId, billNo, record.request_id])
  })
  return (await selectTransfer(record.request_id)) || {
    ...record,
    status: 'SUCCESS',
    kingdee_bill_id: billId,
    kingdee_bill_no: billNo,
  }
}

async function reverseDeletedTransfer(record: TransferRecord): Promise<void> {
  await withTransaction(async (connection) => {
    const currentTransfer = await queryOne(
      connection,
      'SELECT status FROM tk_staging_transfer WHERE request_id = ? FOR UPDATE',
      [record.request_id],
    )
    if (!currentTransfer || text(currentTransfer.status) !== 'SUCCESS') return

    const [transferResult] = await connection.query<any>(mysqlQueryOptions(`
      UPDATE tk_staging_transfer
      SET status = 'REVERSED', error_message = ?, update_time = NOW()
      WHERE request_id = ? AND status = 'SUCCESS'
    `), [
      `金蝶直接调拨单 ${record.kingdee_bill_no} 已删除，已撤回上架记录`.slice(0, 1000),
      record.request_id,
    ])
    if (Number(transferResult?.affectedRows || 0) !== 1) return

  })
}

function resultOf(record: TransferRecord) {
  return apiSuccess({
    requestId: record.request_id,
    sourceBillNo: record.source_bill_no,
    sourceEntryId: record.source_entry_id,
    materialCode: record.material_code,
    qty: record.transfer_qty,
    lotNumber: record.lot_number,
    sourceStockNumber: record.source_kingdee_stock_number,
    sourceStockName: sourceStockName(record.source_kingdee_stock_number),
    sourceStockLocationNumber: record.source_kingdee_stock_location_number,
    targetStockNumber: record.kingdee_stock_number,
    targetStockLocationNumber: record.kingdee_stock_location_number,
    locationCode: record.location_code,
    kingdeeBillId: record.kingdee_bill_id,
    kingdeeBillNo: record.kingdee_bill_no,
    status: 'SUCCESS',
  }, '金蝶已调拨到实际库位')
}

async function resumeTransfer(record: TransferRecord): Promise<Record<string, any>> {
  if (record.status === 'SUCCESS') {
    if (record.kingdee_bill_no) {
      const state = await queryDirectTransferByBillNo(record.kingdee_bill_no)
      if (!state) {
        await reverseDeletedTransfer(record)
        writeFail(`金蝶直接调拨单 ${record.kingdee_bill_no} 已删除，上架记录已撤回，请使用新的请求编号重新上架`, 409)
      }
    }
    return resultOf(record)
  }
  try {
    let state: DirectTransferState | null = null
    if (record.kingdee_bill_no) {
      state = await queryDirectTransferByBillNo(record.kingdee_bill_no)
      if (!state) {
        await updateTransferStatus(record.request_id, 'PROCESSING', { billId: null, billNo: null, errorMessage: null })
        record = (await selectTransfer(record.request_id)) || { ...record, status: 'PROCESSING', kingdee_bill_id: null, kingdee_bill_no: null }
      }
    }
    if (!record.kingdee_bill_no) {
      state = await queryDirectTransferByTrace(traceNote(record))
      if (!state) {
        try {
          state = await saveDirectTransfer(record)
        } catch (error) {
          // 保存超时但金蝶可能已建单：用备注追踪找回孤儿单，避免重复建单
          let recovered: DirectTransferState | null = null
          try {
            recovered = await queryDirectTransferByTrace(traceNote(record))
          } catch {
            recovered = null
          }
          if (!recovered) throw error
          state = recovered
        }
      }
      record = await markK3Saved(record, state)
    }
    state = await ensureAudited({
      id: record.kingdee_bill_id,
      billNo: text(record.kingdee_bill_no),
      status: state?.status || 'A',
      note: traceNote(record),
    })
    record = await markTransferSuccess(record, state)
    return resultOf(record)
  } catch (error) {
    await updateTransferStatus(record.request_id, 'FAILED', { errorMessage: errorMessage(error, '库位上架失败').slice(0, 1000) })
    throw error
  }
}

function requestId(event: H3Event, body: TransferBody): string {
  const value = text(getHeader(event, 'idempotency-key')) || text(body.requestId) || randomUUID()
  if (value.length > 64) writeFail('幂等键长度不能超过 64 个字符')
  return value
}

function apiErrorFrom(error: unknown) {
  if (error instanceof NitroWriteError) return apiError(error.message, error.statusCode)
  if (error instanceof K3CloudError) return apiError(error.message, error.statusCode)
  return apiError(errorMessage(error, '库位上架失败'), 502)
}

export async function transferStagingStock(event: H3Event) {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)
  if (!hasPermission(authenticated.session, STAGING_TRANSFER_PERMISSION)) {
    return apiError('没有权限访问该接口', 403)
  }
  let body: TransferBody
  let key: string
  try {
    body = await bodyOf(event)
    key = requestId(event, body)
  } catch (error) {
    return apiErrorFrom(error)
  }
  const requestBody = { ...body, requestId: key }
  let claim: IdempotencyClaim
  try {
    claim = await claimWriteRequest(authenticated.session, TRANSFER_LABEL, key, requestBody)
  } catch (error) {
    return apiErrorFrom(error)
  }
  if ('replay' in claim) return claim.replay

  try {
    const record = await getOrCreateTransfer(authenticated.session, body, key)
    const response = await resumeTransfer(record)
    await finishWriteRequest(claim, response)
    await recordStandaloneOperationLog(event, authenticated.session, '库位上架', 1, requestBody, response)
    return response
  } catch (error) {
    try { await releaseWriteRequest(claim) } catch { /* preserve business failure */ }
    return apiErrorFrom(error)
  }
}
