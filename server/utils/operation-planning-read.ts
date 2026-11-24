import { getRouterParam, type H3Event } from 'h3'
import { executeBillQuery } from './k3'
import { queryText } from './read'

type QueryRow = unknown[] | Record<string, unknown>

const GXJH_FIELDS = [
  'FID',
  'FEntity_FEntryID',
  'FSubEntity_FDetailID',
  'FBillNo',
  'FMONumber',
  'FOperQty',
  'FQualifiedQty',
  'FProductId',
  'FProductName',
  'FProSpecification',
  'FProcessId.FName',
  'F_UNW_BaseProperty_re5',
  'F_UNW_Text_w5c',
]

const FLOW_INFO_FIELDS = [
  'FSubEntity_FSeq',
  'FBillNo',
  'FProductId.FNumber',
  'FProductName',
  'FProSpecification',
  'F_UNW_Text_w5c',
  'F_UNW_BaseProperty_re51',
  'FCustId.FShortName',
  'F_UNW_BaseProperty_re5',
]

const GXJH_PREVIEW_FIELDS = [
  'FID',
  'FEntity_FEntryID',
  'FSubEntity_FDetailID',
  'FBillNo',
  'FMONumber',
  'FOperNumber',
  'FOperQty',
  'FQualifiedQty',
  'FProductId.FNumber',
  'FProductName',
  'FProSpecification',
  'FProcessId.FName',
]

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

function rowsOrThrow(value: unknown): QueryRow[] {
  if (!Array.isArray(value)) throw new Error('金蝶工序计划查询返回异常')
  return value.filter((row): row is QueryRow => Array.isArray(row) || Boolean(row && typeof row === 'object'))
}

function textValue(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const normalized = String(Array.isArray(value) ? value[0] ?? '' : value).trim()
  return normalized || null
}

function numberValue(value: unknown): number {
  const parsed = Number(Array.isArray(value) ? value[0] : value)
  return Number.isFinite(parsed) ? parsed : 0
}

function filter(billNo: string) {
  return [{ Left: '(', FieldName: 'FBillNo', Compare: '67', Value: billNo, Right: ')', Logic: '0' }]
}

export async function queryGxjh(event: H3Event): Promise<Record<string, unknown>> {
  const billNo = queryText(getRouterParam(event, 'billno')).trim()
  if (!billNo) throw new Error('流程单号不能为空')
  const rows = rowsOrThrow(await executeBillQuery({
    formId: 'SFC_OperationPlanning',
    fieldKeys: GXJH_FIELDS,
    filterString: filter(billNo),
    startRow: 0,
    limit: 1000,
  }))
  if (!rows.length) return {}
  const row = rows[0]
  return Object.fromEntries(GXJH_FIELDS.map((field, index) => [field, rowValue(row, index, field)]))
}

export async function queryGxjhPreview(event: H3Event): Promise<Record<string, unknown> | null> {
  const billNo = queryText(getRouterParam(event, 'billno')).trim()
  if (!billNo) throw new Error('流程单号不能为空')

  const rows = rowsOrThrow(await executeBillQuery({
    formId: 'SFC_OperationPlanning',
    fieldKeys: GXJH_PREVIEW_FIELDS,
    filterString: filter(billNo),
    orderString: 'FOperNumber ASC',
    startRow: 0,
    limit: 1000,
  }))
  if (!rows.length) return null

  const first = rows[0]
  const operations = rows.map((row, index) => {
    const plannedQty = Math.max(0, numberValue(rowValue(row, 6, 'FOperQty')))
    const reportedQty = Math.max(0, numberValue(rowValue(row, 7, 'FQualifiedQty')))
    const remainingQty = Math.max(0, plannedQty - reportedQty)

    return {
      operationId: textValue(rowValue(row, 2, 'FSubEntity_FDetailID')) || `operation-${index + 1}`,
      entryId: textValue(rowValue(row, 1, 'FEntity_FEntryID')),
      processNumber: textValue(rowValue(row, 5, 'FOperNumber')),
      processName: textValue(rowValue(row, 11, 'FProcessId.FName')) || '未命名工序',
      plannedQty,
      reportedQty,
      remainingQty,
      status: remainingQty > 0 ? '可汇报' : '已完成',
      canReport: remainingQty > 0,
    }
  })

  return {
    flowNo: textValue(rowValue(first, 3, 'FBillNo')) || billNo,
    moNumber: textValue(rowValue(first, 4, 'FMONumber')),
    productId: textValue(rowValue(first, 8, 'FProductId.FNumber')),
    productName: textValue(rowValue(first, 9, 'FProductName')),
    specification: textValue(rowValue(first, 10, 'FProSpecification')),
    operations,
    sourceAt: new Date().toISOString(),
  }
}

export async function queryFlowBillInfo(event: H3Event): Promise<Record<string, unknown>> {
  const flowNo = queryText(getRouterParam(event, 'flowno')).trim()
  if (!flowNo) throw new Error('流程单号不能为空')
  const rows = rowsOrThrow(await executeBillQuery({
    formId: 'SFC_OperationPlanning',
    fieldKeys: FLOW_INFO_FIELDS,
    filterString: filter(flowNo),
    startRow: 0,
    limit: 50,
  }))
  if (!rows.length) return {}
  const row = rows[0]
  return {
    FBillNo: rowValue(row, 1, 'FBillNo'),
    productId: rowValue(row, 2, 'FProductId.FNumber'),
    productName: rowValue(row, 3, 'FProductName'),
    specification: rowValue(row, 4, 'FProSpecification'),
    xpph: rowValue(row, 5, 'F_UNW_Text_w5c'),
    xpcc: rowValue(row, 6, 'F_UNW_BaseProperty_re51'),
    khdm: rowValue(row, 7, 'FCustId.FShortName'),
    xpxh: rowValue(row, 8, 'F_UNW_BaseProperty_re5'),
  }
}
