import { executeBillQuery } from './k3'

export const QA_SHIPPING_BATCH_SIZE = 1_000
export const QA_SHIPPING_MAX_ROWS = 20_000

export class QaShippingInputError extends Error {
  readonly statusCode = 400

  constructor(message: string) {
    super(message)
    this.name = 'QaShippingInputError'
  }
}

type QaShippingInput = Record<string, unknown>

function scalar(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value
}

function text(value: unknown): string {
  return String(scalar(value) ?? '').trim()
}

function classificationText(value: unknown): string {
  return String(scalar(value) ?? '')
}

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function normalizeMonth(value: unknown): string {
  const candidate = text(value).slice(0, 7)
  if (!candidate) return currentMonth()
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(candidate)) throw new QaShippingInputError('月份格式不正确，应为 YYYY-MM')
  return candidate
}

function monthBounds(month: string): { start: string; end: string } {
  const [year, monthNumber] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return {
    start: `${month}-01 00:00:00`,
    end: `${month}-${String(lastDay).padStart(2, '0')} 23:59:59`,
  }
}

function dateKeys(month: string): string[] {
  const [year, monthNumber] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return Array.from({ length: lastDay }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`)
}

function numberValue(value: unknown): number {
  const parsed = Number(scalar(value))
  return Number.isFinite(parsed) ? parsed : 0
}

function decimalParts(value: unknown): { unscaled: bigint; scale: number } | null {
  const parsed = numberValue(value)
  const match = String(parsed).match(/^([+-]?)(\d+)(?:\.(\d+))?$/)
  if (!match) return null
  const fraction = match[3] || ''
  return {
    unscaled: BigInt(`${match[1] === '-' ? '-' : ''}${match[2]}${fraction}`),
    scale: fraction.length,
  }
}

function decimalAdd(left: unknown, right: unknown): number {
  const leftParts = decimalParts(left)
  const rightParts = decimalParts(right)
  if (!leftParts || !rightParts) return numberValue(left) + numberValue(right)
  const scale = Math.max(leftParts.scale, rightParts.scale)
  const unscaled = leftParts.unscaled * 10n ** BigInt(scale - leftParts.scale)
    + rightParts.unscaled * 10n ** BigInt(scale - rightParts.scale)
  const absolute = unscaled < 0n ? -unscaled : unscaled
  const digits = absolute.toString().padStart(scale + 1, '0')
  const sign = unscaled < 0n ? '-' : ''
  const decimal = scale ? `${sign}${digits.slice(0, -scale)}.${digits.slice(-scale)}` : `${sign}${digits}`
  const result = Number(decimal)
  return Number.isFinite(result) ? result : numberValue(left) + numberValue(right)
}

function createRow(date: string): Record<string, unknown> {
  return { date, glassOut: 0, glassCK: 0, to252: 0, pdfn: 0, plasticOut: 0, total: 0 }
}

function addClassified(row: Record<string, any>, qty: number, modelValue: unknown, materialValue: unknown, customerValue: unknown, outbound: boolean): void {
  const amount = outbound ? qty : -qty
  const model = classificationText(modelValue).toUpperCase()
  const material = classificationText(materialValue).toUpperCase()
  const customer = classificationText(customerValue)
  if (model.includes('TO-252') || model.includes('TO252')) {
    row.to252 = decimalAdd(row.to252, amount)
  } else if ((model.includes('PDFN') || model.includes('DFN')) && !model.includes('1006')) {
    row.pdfn = decimalAdd(row.pdfn, amount)
  } else if (material.startsWith('NA') || model.includes('LL') || model.includes('DO-')) {
    if (customer === 'CUST0118' || customer === 'CUST0858' || customer.includes('CK') || material.includes('CK')) {
      row.glassCK = decimalAdd(row.glassCK, amount)
    } else {
      row.glassOut = decimalAdd(row.glassOut, amount)
    }
  } else {
    row.plasticOut = decimalAdd(row.plasticOut, amount)
  }
}

async function queryAll(formId: string, fieldKeys: string[], filterString: string): Promise<unknown[][]> {
  const rows: unknown[][] = []
  let startRow = 0
  while (rows.length < QA_SHIPPING_MAX_ROWS) {
    const limit = Math.min(QA_SHIPPING_BATCH_SIZE, QA_SHIPPING_MAX_ROWS - rows.length)
    const batch = await executeBillQuery({ formId, fieldKeys, filterString, startRow, limit })
    if (!Array.isArray(batch)) throw new Error('金蝶 QA 出货查询返回异常')
    for (const row of batch) {
      if (!Array.isArray(row)) throw new Error('金蝶 QA 出货查询字段异常')
      rows.push(row)
    }
    if (batch.length < limit) break
    startRow += batch.length
  }
  return rows
}

export async function queryQaShippingReport(input: QaShippingInput = {}): Promise<Record<string, unknown>> {
  const month = normalizeMonth(input.month)
  const bounds = monthBounds(month)
  const filterString = `FDate >= '${bounds.start}' and FDate <= '${bounds.end}' and FDocumentStatus = 'C'`
  const dateRows = new Map(dateKeys(month).map((date) => [date, createRow(date)]))
  const outboundRows = await queryAll(
    'SAL_OUTSTOCK',
    ['FBillNo', 'FRealQty', 'FDate', 'FMateriaModel', 'FMaterialID.FNumber', 'FCustomerID.FNumber'],
    filterString,
  )
  const returnRows = await queryAll(
    'SAL_RETURNSTOCK',
    ['FBillNo', 'FRealQty', 'FDate', 'FMaterialModel', 'FMaterialID.FNumber', 'FRetcustId.FNumber'],
    filterString,
  )

  for (const row of outboundRows) {
    const date = text(row[2]).slice(0, 10)
    const target = dateRows.get(date)
    const qty = numberValue(row[1])
    if (!target || qty === 0) continue
    addClassified(target, qty, row[3], row[4], row[5], true)
  }
  for (const row of returnRows) {
    const date = text(row[2]).slice(0, 10)
    const target = dateRows.get(date)
    const qty = numberValue(row[1])
    if (!target || qty === 0) continue
    addClassified(target, qty, row[3], row[4], row[5], false)
  }

  const rows = [...dateRows.values()]
  const sumRow = createRow('月度累计')
  for (const row of rows) {
    row.total = [row.glassOut, row.glassCK, row.to252, row.pdfn, row.plasticOut].reduce(decimalAdd, 0)
    sumRow.glassOut = decimalAdd(sumRow.glassOut, row.glassOut)
    sumRow.glassCK = decimalAdd(sumRow.glassCK, row.glassCK)
    sumRow.to252 = decimalAdd(sumRow.to252, row.to252)
    sumRow.pdfn = decimalAdd(sumRow.pdfn, row.pdfn)
    sumRow.plasticOut = decimalAdd(sumRow.plasticOut, row.plasticOut)
  }
  sumRow.total = [sumRow.glassOut, sumRow.glassCK, sumRow.to252, sumRow.pdfn, sumRow.plasticOut].reduce(decimalAdd, 0)
  return { month, rows, sumRow }
}
