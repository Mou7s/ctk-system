import { getQuery, getRouterParam, readBody, setResponseHeader, type H3Event } from 'h3'
import { executeBillQuery, K3CloudError } from './k3'
import { getAuthSession, hasRole } from './auth'
import { apiError, apiSuccess, errorMessage } from './response'
import { queryK3SqlServer, sqlStringParameter, SqlServerError } from './sqlserver'
import { generateWfExcel, WfTemplateError } from './wf-export-excel'

export const WF_EXPORT_ROLE = 'plating_clerk'
export const WF_EXPORT_CREATOR_NAME = '童炜城'
export const WF_EXPORT_SEND_FORM_ID = 'SFC_OperOutGroupSend'
export const WF_EXPORT_RECEIVE_FORM_ID = 'SFC_OperOutGroupReceive'
export const WF_EXPORT_SEND_FIELDS = [
  'FSupplier.FShortName',
  'FBillNo',
  'FCreatorId.FName',
  'FDate',
  'FOplanInFo',
  'FMaterialName',
  'FMaterialSpec',
  'FMOBaseUnitId.FName',
  'F_UNW_Text_qtr',
  'FOutSendQtyFake',
  'FRateValQty',
  'FRateOperQty',
  'F_UNW_Base_re5',
]

const BILL_NO_SEPARATOR = /[&\s,，;；]+/
const BILL_NO_PATTERN = /^[A-Za-z0-9_-]{4,40}$/

export type WfExportRow = any[]

export interface WfExportMapping {
  inputBill: string
  type: 'RECEIVE' | 'SEND'
  resolvedBills: string[]
}

export interface WfPreviewData {
  inputCount: number
  sendBillCount: number
  rowCount: number
  inputBillnos: string[]
  sendBillnos: string[]
  mappings: WfExportMapping[]
  warnings: string[]
  samples: Array<Record<string, unknown>>
  supplier: string
  sampleBillNo: string
  creator: string
  billDate: string
}

export interface WfTemplateData {
  headers: Record<string, unknown>
  list1: Array<Record<string, unknown>>
  list2: Array<Record<string, unknown>>
}

export class WfExportInputError extends Error {
  readonly statusCode = 400

  constructor(message: string) {
    super(message)
    this.name = 'WfExportInputError'
  }
}

function asString(value: unknown): string {
  return value == null ? '' : String(value)
}

function asRows(value: any): WfExportRow[] {
  if (Array.isArray(value)) {
    return value.filter((row) => Array.isArray(row))
  }

  const candidates = [
    value?.Result?.Rows,
    value?.Result?.Data,
    value?.Result?.Result,
    value?.Rows,
    value?.rows,
    value?.data,
    value?.Data,
  ]
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((row) => Array.isArray(row))
    }
  }
  return []
}

function rowValue(row: any, index: number, ...keys: string[]): unknown {
  if (Array.isArray(row)) return row[index]
  for (const key of keys) {
    if (row && row[key] !== undefined) return row[key]
  }
  return undefined
}

function escapeK3String(value: string): string {
  return value.replace(/'/g, "''")
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function flattenBillInput(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => flattenBillInput(item))
  if (value == null) return []
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>
    return flattenBillInput(object.billNos ?? object.billno ?? object.billNo ?? '')
  }
  return String(value).split(BILL_NO_SEPARATOR).map((item) => item.trim()).filter(Boolean)
}

export function parseWfBillNos(value: unknown): { billNos: string[]; invalid: string[] } {
  const tokens = unique(flattenBillInput(value).map((token) => token.toUpperCase()))
  const invalid = unique(tokens.filter((token) => !BILL_NO_PATTERN.test(token)))
  const billNos = unique(tokens.filter((token) => BILL_NO_PATTERN.test(token)))
  return { billNos, invalid }
}

function bodyBillNos(body: unknown): unknown {
  if (body && typeof body === 'object') {
    const object = body as Record<string, unknown>
    return object.billNos ?? object.billno ?? object.billNo
  }
  if (typeof body !== 'string' || !body.trim()) return undefined

  const text = body.trim()
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object') return bodyBillNos(parsed)
    return parsed
  } catch {
    const params = new URLSearchParams(text)
    return params.get('billNos') ?? params.get('billno') ?? text
  }
}

async function readWfBillInput(event: H3Event, routeBillNo?: string): Promise<unknown> {
  if (routeBillNo) return routeBillNo
  const query = getQuery(event) as Record<string, unknown>
  const body = await readBody(event).catch(() => undefined)
  return bodyBillNos(body) ?? query.billNos ?? query.billno ?? query.billNo
}

export async function requireWfExportAccess(event: H3Event): Promise<{ ok: true } | { ok: false; response: any }> {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return { ok: false, response: apiError('登录状态已过期', 401) }
  if (!hasRole(authenticated.session, WF_EXPORT_ROLE)) {
    return { ok: false, response: apiError(`缺少 ${WF_EXPORT_ROLE} 角色权限`, 403) }
  }
  return { ok: true }
}

function receiveFilter(billNo: string): string {
  return `FBillNo='${escapeK3String(billNo)}'`
}

function sendFilter(billNos: string[]): unknown[] {
  const filters = billNos.map((billNo, index) => ({
    Left: billNos.length > 1 && index === 0 ? '(' : '',
    FieldName: 'FBillNo',
    Compare: '67',
    Value: billNo,
    Right: billNos.length > 1 && index === billNos.length - 1 ? ')' : '',
    Logic: billNos.length > 1 && index < billNos.length - 1 ? 1 : 0,
  }))
  filters.push({
    Left: '',
    FieldName: 'FLineType',
    Compare: '29',
    Value: 'A',
    Right: '',
    Logic: 0,
  })
  return filters
}

async function resolveSendBills(inputBillnos: string[]): Promise<{
  sendBillnos: string[]
  mappings: WfExportMapping[]
  warnings: string[]
}> {
  const sendBillnos: string[] = []
  const mappings: WfExportMapping[] = []
  const warnings: string[] = []

  for (const inputBill of inputBillnos) {
    if (!inputBill.startsWith('WWJS')) {
      sendBillnos.push(inputBill)
      mappings.push({ inputBill, type: 'SEND', resolvedBills: [inputBill] })
      continue
    }

    const raw = await executeBillQuery({
      formId: WF_EXPORT_RECEIVE_FORM_ID,
      fieldKeys: 'FGroupSendInfo',
      filterString: receiveFilter(inputBill),
      limit: 1000,
    })
    const resolvedBills = unique(asRows(raw)
      .map((row) => asString(rowValue(row, 0, 'FGroupSendInfo', 'groupSendInfo')).trim().toUpperCase())
      .filter(Boolean))
    sendBillnos.push(...resolvedBills)
    mappings.push({ inputBill, type: 'RECEIVE', resolvedBills })
    if (!resolvedBills.length) warnings.push(`接收单 ${inputBill} 未反查到对应的发出单`)
  }

  return { sendBillnos: unique(sendBillnos), mappings, warnings }
}

export async function queryWfSendRows(inputBillnos: string[]): Promise<{
  inputBillnos: string[]
  sendBillnos: string[]
  mappings: WfExportMapping[]
  warnings: string[]
  rows: WfExportRow[]
}> {
  const resolved = await resolveSendBills(inputBillnos)
  if (!resolved.sendBillnos.length) {
    return { ...resolved, inputBillnos, rows: [] }
  }

  const raw = await executeBillQuery({
    formId: WF_EXPORT_SEND_FORM_ID,
    fieldKeys: WF_EXPORT_SEND_FIELDS,
    filterString: sendFilter(resolved.sendBillnos),
    limit: 10000,
    maxLimit: 10000,
  })
  return { ...resolved, inputBillnos, rows: asRows(raw) }
}

function sampleFromRow(row: WfExportRow): Record<string, unknown> {
  return {
    billNo: asString(rowValue(row, 1, 'FBillNo', 'billNo')),
    materialName: asString(rowValue(row, 5, 'FMaterialName', 'materialName')),
    materialSpec: asString(rowValue(row, 6, 'FMaterialSpec', 'materialSpec')),
    planInfo: asString(rowValue(row, 4, 'FOplanInFo', 'planInfo')),
    qty: rowValue(row, 9, 'FOutSendQtyFake', 'qty'),
  }
}

export function buildWfPreviewData(result: Awaited<ReturnType<typeof queryWfSendRows>>): WfPreviewData {
  const first = result.rows[0] || []
  return {
    inputCount: result.inputBillnos.length,
    sendBillCount: result.sendBillnos.length,
    rowCount: result.rows.length,
    inputBillnos: result.inputBillnos,
    sendBillnos: result.sendBillnos,
    mappings: result.mappings,
    warnings: result.warnings,
    samples: result.rows.slice(0, 8).map(sampleFromRow),
    supplier: asString(rowValue(first, 0, 'FSupplier.FShortName', 'supplier')),
    sampleBillNo: asString(rowValue(first, 1, 'FBillNo', 'billNo')),
    creator: asString(rowValue(first, 2, 'FCreatorId.FName', 'creator')),
    billDate: asString(rowValue(first, 3, 'FDate', 'billDate')),
  }
}

function toInt(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? ''))
  if (!Number.isFinite(parsed)) throw new WfExportInputError('K3Cloud 返回了无法识别的框架 ID')
  return Math.trunc(parsed)
}

function toDouble(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? ''))
  if (!Number.isFinite(parsed)) throw new WfExportInputError('K3Cloud 返回了无法识别的数量或换算率')
  return parsed
}

function getTiao(row: WfExportRow): number {
  const outSendQtyFake = toDouble(rowValue(row, 9, 'FOutSendQtyFake'))
  const rateValQty = toDouble(rowValue(row, 10, 'FRateValQty'))
  const rateOperQty = toDouble(rowValue(row, 11, 'FRateOperQty'))
  if (rateOperQty === 0) throw new WfExportInputError('K3Cloud 返回了工序换算率为 0 的明细')
  return Math.round(((outSendQtyFake * 1000 * rateValQty * 1000) / (rateOperQty * 1000)) / 1000 + 0.4999999999)
}

export async function queryWfFrameNames(rows: WfExportRow[]): Promise<Map<string, string>> {
  const frameIds = unique(rows.map((row) => String(toInt(rowValue(row, 12, 'F_UNW_Base_re5')))).filter(Boolean))
  if (!frameIds.length) return new Map()

  const placeholders = frameIds.map((_, index) => `@frame${index}`).join(', ')
  const records = await queryK3SqlServer<{ frameId: string | number; frameName: string }>(async (request) => {
    frameIds.forEach((frameId, index) => sqlStringParameter(request, `frame${index}`, frameId))
    return request.query(`
      SELECT T_ENG_BOMCHILD.FID AS frameId,
             T_BD_MATERIAL_L.FNAME AS frameName
      FROM T_ENG_BOMCHILD
      LEFT JOIN T_BD_MATERIAL
        ON T_BD_MATERIAL.FMATERIALID = T_ENG_BOMCHILD.FMATERIALID
      LEFT JOIN T_BD_MATERIAL_L
        ON T_BD_MATERIAL.FMATERIALID = T_BD_MATERIAL_L.FMATERIALID
      WHERE T_ENG_BOMCHILD.FID IN (${placeholders})
        AND T_BD_MATERIAL.FNUMBER LIKE 'N105%'
    `)
  })
  const names = new Map<string, string>()
  for (const record of records) {
    const key = String(record.frameId ?? '')
    if (key && !names.has(key)) names.set(key, asString(record.frameName))
  }
  return names
}

export async function buildWfTemplateData(rows: WfExportRow[], billNos: string[]): Promise<WfTemplateData> {
  if (!rows.length) throw new WfExportInputError('未查询到可导出的外发上锡明细')
  const frameNames = await queryWfFrameNames(rows)
  const first = rows[0]
  const headers = {
    head_1: rowValue(first, 0, 'FSupplier.FShortName', 'supplier'),
    head_2: billNos.join(','),
    head_3: WF_EXPORT_CREATOR_NAME,
    head_4: asString(rowValue(first, 3, 'FDate', 'billDate')).slice(0, 10),
  }
  const list1: Array<Record<string, unknown>> = []
  const list2: Array<Record<string, unknown>> = []
  let list1Total = 0

  rows.forEach((row, index) => {
    const frameId = String(toInt(rowValue(row, 12, 'F_UNW_Base_re5')))
    const frameName = frameNames.get(frameId) || ''
    const tiao = getTiao(row)
    const packaging = asString(rowValue(row, 6, 'FMaterialSpec', 'materialSpec')).split('/')[0]
    const materialText = asString(rowValue(row, 8, 'F_UNW_Text_qtr', 'materialText'))
    list1Total += tiao

    const existing = list2.find((item) => item.col2 === packaging && item.col5 === frameName)
    if (existing) {
      existing.col3 = toInt(existing.col3) + tiao
      existing.col4 = toInt(existing.col4) + 1
      existing.col6 = toInt(existing.col6) + materialText.split('/').length
    } else {
      list2.push({
        col1: list2.length + 1,
        col2: packaging,
        col3: tiao,
        col4: 1,
        col5: frameName,
        col6: materialText.split('/').length,
      })
    }

    list1.push({
      col1: index + 1,
      col2: rowValue(row, 4, 'FOplanInFo', 'planInfo'),
      col3: rowValue(row, 5, 'FMaterialName', 'materialName'),
      col4: packaging,
      col5: rowValue(row, 7, 'FMOBaseUnitId.FName', 'baseUnit'),
      col6: rowValue(row, 9, 'FOutSendQtyFake', 'qty'),
      col7: tiao,
      col8: materialText,
      col9: frameName,
    })
  })

  // Keep the Java template's existing total口径: list2_total sums col4.
  const list2Total = list2.reduce((sum, item) => sum + toInt(item.col4), 0)
  return { headers: { ...headers, list1_total: list1Total, list2_total: list2Total }, list1, list2 }
}

function responseForError(error: unknown, fallback: string): any {
  if (error instanceof WfExportInputError) return apiError(error.message, error.statusCode)
  if (error instanceof WfTemplateError) return apiError(error.message, error.statusCode)
  if (error instanceof K3CloudError || error instanceof SqlServerError) {
    console.error('[wf-export]', errorMessage(error))
    return apiError(error.message, error.statusCode)
  }
  console.error('[wf-export]', errorMessage(error, fallback))
  return apiError(fallback, 502)
}

async function withWfAccess(event: H3Event, work: () => Promise<any>): Promise<any> {
  const access = await requireWfExportAccess(event)
  if (!access.ok) return access.response
  try {
    return await work()
  } catch (error) {
    return responseForError(error, '外发上锡处理失败')
  }
}

export async function handleWfPreview(event: H3Event): Promise<any> {
  return withWfAccess(event, async () => {
    const parsed = parseWfBillNos(await readWfBillInput(event))
    if (parsed.invalid.length) throw new WfExportInputError(`以下单号格式不正确：${parsed.invalid.join('、')}`)
    if (!parsed.billNos.length) throw new WfExportInputError('请至少填写一个外发单号')

    const result = await queryWfSendRows(parsed.billNos)
    if (!result.sendBillnos.length) return apiError('未反查到对应的外发发出单', 404, buildWfPreviewData(result))
    if (!result.rows.length) return apiError('外发发出单没有可导出的明细', 404, buildWfPreviewData(result))
    return apiSuccess(buildWfPreviewData(result))
  })
}

export async function handleWfExport(event: H3Event, routeBillNo?: string): Promise<any> {
  return withWfAccess(event, async () => {
    const parsed = parseWfBillNos(await readWfBillInput(event, routeBillNo || getRouterParam(event, 'billno')))
    if (parsed.invalid.length) throw new WfExportInputError(`以下单号格式不正确：${parsed.invalid.join('、')}`)
    if (!parsed.billNos.length) throw new WfExportInputError('请至少填写一个外发单号')

    const result = await queryWfSendRows(parsed.billNos)
    if (!result.sendBillnos.length) throw new WfExportInputError('未反查到对应的外发发出单')
    if (!result.rows.length) throw new WfExportInputError('外发发出单没有可导出的明细')

    const templateData = await buildWfTemplateData(result.rows, result.sendBillnos)
    const workbook = await generateWfExcel(templateData)
    const fileName = `外发上锡_${Date.now()}.xlsx`
    setResponseHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    setResponseHeader(event, 'Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`)
    setResponseHeader(event, 'Access-Control-Expose-Headers', 'Content-Disposition, Content-Type')
    return workbook
  })
}
