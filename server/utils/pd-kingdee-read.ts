import { getRouterParam, type H3Event } from 'h3'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { executeBillQuery } from './k3'
import { getMysqlPool, mysqlQueryOptions } from './mysql'
import { queryText } from './read'

type QueryRow = unknown[] | Record<string, unknown>

const OPERATION_FIELDS = [
  'FSubEntity_FSeq',
  'FBillNo',
  'FMONumber',
  'FProductId.FNumber',
  'FProductName',
  'FProSpecification',
  'FQualifiedQty',
  'FTransOutQty',
  'FTransInQty',
  'FOperQty',
]

const INVENTORY_FIELDS = [
  'FMaterialId.FNumber',
  'FMaterialId.FName',
  'FMaterialId.FSpecification',
  'FLot.FNumber',
  'FAVBQty',
  'FBaseQty',
  'FMaterialid.FSTOREURNOM',
  'FMaterialid.FSTOREURNUM',
]

const LOCAL_PD_COLUMNS = 'id, pdDate, process, flowNo, productId, productName, specification, lot, number, pd_number, remark, process_status'
const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

function scalar(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value
}

function text(value: unknown): string | null {
  if (value == null) return null
  const normalized = String(scalar(value)).trim()
  return normalized || null
}

function numberValue(value: unknown): number | null {
  if (value == null || value === '') return null
  const parsed = Number(scalar(value))
  return Number.isFinite(parsed) ? parsed : null
}

function rowValue(row: QueryRow, index: number, field: string): unknown {
  if (Array.isArray(row)) {
    if (row.length === 1 && row[0] && typeof row[0] === 'object' && !Array.isArray(row[0])) {
      return rowValue(row[0] as Record<string, unknown>, index, field)
    }
    return row[index]
  }
  if (field in row) return row[field]
  const underscored = field.replaceAll('.', '_')
  return row[underscored]
}

function rowsOrThrow(value: unknown, message: string): QueryRow[] {
  if (!Array.isArray(value)) throw new Error(message)
  return value.filter((row): row is QueryRow => Array.isArray(row) || Boolean(row && typeof row === 'object'))
}

function mapLocalPdRow(row: RowDataPacket, isUpdatePdData: string | null): Record<string, unknown> {
  return {
    createBy: null,
    createTime: null,
    updateBy: null,
    updateTime: null,
    remark: row.remark ?? null,
    id: row.id,
    pdDate: row.pdDate,
    process: row.process,
    flowNo: row.flowNo,
    productId: row.productId,
    productName: row.productName,
    specification: row.specification,
    lot: row.lot,
    number: numberValue(row.number),
    pdNumber: numberValue(row.pd_number),
    processStatus: row.process_status,
    isUpdatePdData,
  }
}

function mapOperationRow(row: QueryRow): Record<string, unknown> {
  return {
    createBy: null,
    createTime: null,
    updateBy: null,
    updateTime: null,
    remark: null,
    id: null,
    pdDate: null,
    process: null,
    flowNo: text(rowValue(row, 1, 'FBillNo')),
    productId: text(rowValue(row, 3, 'FProductId.FNumber')),
    productName: text(rowValue(row, 4, 'FProductName')),
    specification: text(rowValue(row, 5, 'FProSpecification')),
    lot: null,
    number: null,
    pdNumber: null,
    processStatus: null,
    isUpdatePdData: null,
  }
}

function operationData(rows: QueryRow[]): Record<string, unknown> {
  const first = rows[0]
  const lastQualified = numberValue(rowValue(rows[rows.length - 1], 6, 'FQualifiedQty')) ?? 0
  let number: number
  if (lastQualified === 0) {
    number = 0
    for (const row of rows) {
      const qualified = numberValue(rowValue(row, 6, 'FQualifiedQty')) ?? 0
      if (qualified > 0) number = qualified
    }
    if (number === 0) number = numberValue(rowValue(first, 9, 'FOperQty')) ?? 0
  } else {
    const firstQualified = numberValue(rowValue(first, 6, 'FQualifiedQty')) ?? 0
    number = (firstQualified * 1000 - lastQualified * 1000) / 1000
  }
  return { ...mapOperationRow(first), number }
}

function mapInventoryRow(row: QueryRow): Record<string, unknown> {
  return {
    createBy: null,
    createTime: null,
    updateBy: null,
    updateTime: null,
    remark: null,
    id: null,
    pdDate: null,
    process: null,
    flowNo: text(rowValue(row, 3, 'FLot.FNumber')),
    productId: text(rowValue(row, 0, 'FMaterialId.FNumber')),
    productName: text(rowValue(row, 1, 'FMaterialId.FName')),
    specification: text(rowValue(row, 2, 'FMaterialId.FSpecification')),
    lot: text(rowValue(row, 3, 'FLot.FNumber')),
    number: numberValue(rowValue(row, 5, 'FBaseQty')),
    pdNumber: null,
    processStatus: null,
    isUpdatePdData: null,
  }
}

function isRecent(pdDate: unknown): boolean {
  const raw = queryText(pdDate).trim()
  if (!raw) return false
  const parsed = new Date(`${raw.replaceAll('-', '/')} 00:00:00`)
  return !Number.isNaN(parsed.getTime()) && Date.now() - parsed.getTime() < RECENT_WINDOW_MS
}

async function localPd(pool: Pool, flowNo: string): Promise<RowDataPacket | null> {
  const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(
    `SELECT ${LOCAL_PD_COLUMNS} FROM pd WHERE flowNo LIKE CONCAT('%', ?, '%') ORDER BY pdDate DESC LIMIT 1`,
  ), [flowNo])
  return rows[0] || null
}

async function queryKingdee(flowNo: string): Promise<Record<string, unknown> | null> {
  const operationRows = rowsOrThrow(await executeBillQuery({
    formId: 'SFC_OperationPlanning',
    fieldKeys: OPERATION_FIELDS,
    filterString: [{ Left: '(', FieldName: 'FBillNo', Compare: '67', Value: flowNo, Right: ')', Logic: '0' }],
    startRow: 0,
    limit: 50,
  }), '金蝶工序计划查询返回异常')
  if (operationRows.length) return operationData(operationRows)

  const inventoryRows = rowsOrThrow(await executeBillQuery({
    formId: 'STK_Inventory',
    fieldKeys: INVENTORY_FIELDS,
    filterString: `FLot.FNumber = '${flowNo.replaceAll("'", "''")}' AND FBaseQty > 0`,
    startRow: 0,
    limit: 1,
  }), '金蝶即时库存查询返回异常')
  if (inventoryRows.length) return mapInventoryRow(inventoryRows[0])

  const anyInventoryRows = rowsOrThrow(await executeBillQuery({
    formId: 'STK_Inventory',
    fieldKeys: INVENTORY_FIELDS,
    filterString: [{ Left: '(', FieldName: 'FLot.FNumber', Compare: '67', Value: flowNo, Right: ')', Logic: '0' }],
    startRow: 0,
    limit: 1,
  }), '金蝶即时库存查询返回异常')
  return anyInventoryRows.length ? mapInventoryRow(anyInventoryRows[0]) : null
}

export async function queryPdFromKingdee(event: H3Event): Promise<Record<string, unknown> | null> {
  const flowNo = queryText(getRouterParam(event, 'id')).trim()
  if (!flowNo) throw new Error('流程单号不能为空')
  const local = await localPd(getMysqlPool(), flowNo)
  if (local && isRecent(local.pdDate)) return mapLocalPdRow(local, '1')
  return queryKingdee(flowNo)
}
