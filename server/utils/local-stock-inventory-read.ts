import { executeBillQuery } from './k3'
import { calculateK3AvailableQty } from './stock-document'

const STOCK_ORG = '100'
const FLEX_VALUE_FIELDS = ['FID', 'FNUMBER', 'FNAME', 'FFlexValueNumber', 'FFlexValueName']
const BASE_FIELDS = [
  'FMaterialID.FNumber',
  'FMaterialID.FName',
  'FMaterialID.FSpecification',
  'FBaseUnitId.FNumber',
  'FBaseUnitId.FName',
  'FStockOrgId.FNumber',
  'FStockID.FNumber',
  'FStockID.FName',
  'FStockLocID',
  'FLot.FNumber',
  'FBaseQty',
  'FAVBQty',
  'FStockStatusId.FNumber',
  'FStockStatusId.FName',
  'FBaseLockQty',
]

function text(value: unknown): string {
  return String(Array.isArray(value) ? value[0] ?? '' : value ?? '').trim()
}

function numberValue(value: unknown): number {
  const parsed = Number(Array.isArray(value) ? value[0] : value)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeQuantity(value: number): number {
  return Number(value.toFixed(3))
}

function firstNonBlank(current: string, next: unknown): string {
  return current || text(next)
}

function escapeFilterValue(value: string): string {
  if (/[\r\n]/u.test(value)) throw new Error('物料编码包含非法字符')
  return value.replaceAll("'", "''")
}

async function queryFlexValueIds(): Promise<string[]> {
  const rows = await executeBillQuery({
    formId: 'BD_FLEXVALUES',
    fieldKeys: FLEX_VALUE_FIELDS,
    startRow: 0,
    limit: 200,
  })
  if (!Array.isArray(rows)) throw new Error('金蝶库位维度查询返回异常')
  return [...new Set(rows
    .map((row) => Array.isArray(row) ? text(row[0]) : '')
    .filter(Boolean))]
}

export async function queryLocalStockMaterialInventory(materialCode: unknown): Promise<Record<string, unknown>> {
  const normalized = text(materialCode).toUpperCase()
  if (!normalized) throw new Error('物料编码不能为空')

  const flexIds = await queryFlexValueIds()
  const locationFields = flexIds.flatMap((id) => [
    `FStockLocID.FF${id}.FNumber`,
    `FStockLocID.FF${id}.FName`,
  ])
  const fields = [...BASE_FIELDS, ...locationFields]
  const rows = await executeBillQuery({
    formId: 'STK_Inventory',
    fieldKeys: fields,
    filterString: `FStockOrgId.FNumber='${escapeFilterValue(STOCK_ORG)}' and FMaterialId.FNumber='${escapeFilterValue(normalized)}' and FBaseQty<>0`,
    startRow: 0,
    limit: 2000,
  })
  if (!Array.isArray(rows)) throw new Error('金蝶库存查询返回异常')

  const grouped = new Map<string, Record<string, unknown>>()
  let materialName = ''
  let specification = ''
  let unitNumber = ''
  let unitName = ''
  let totalOnHand = 0
  let totalAvailable = 0

  for (const row of rows) {
    if (!Array.isArray(row) || row.length < BASE_FIELDS.length) throw new Error('金蝶库存查询返回字段数量异常')
    const onHand = numberValue(row[10])
    if (onHand === 0) continue
    const available = calculateK3AvailableQty(row[10], row[14], row[12], row[13])
    let stockLocationNumber = ''
    let stockLocationName = ''
    for (let index = 0; index < flexIds.length; index += 1) {
      const number = text(row[BASE_FIELDS.length + index * 2])
      const name = text(row[BASE_FIELDS.length + index * 2 + 1])
      if (!stockLocationNumber && number) stockLocationNumber = number
      if (!stockLocationName && name) stockLocationName = name
      if (stockLocationNumber && stockLocationName) break
    }
    if (!stockLocationNumber) stockLocationNumber = text(row[8])

    const stockNumber = text(row[6])
    const stockName = text(row[7])
    const lotNumber = text(row[9])
    const key = [stockNumber, stockLocationNumber, lotNumber].join('\u0001')
    materialName = firstNonBlank(materialName, row[1])
    specification = firstNonBlank(specification, row[2])
    unitNumber = firstNonBlank(unitNumber, row[3])
    unitName = firstNonBlank(unitName, row[4])
    totalOnHand += onHand
    totalAvailable += available

    const existing = grouped.get(key)
    if (existing) {
      existing.onHandQty = normalizeQuantity(numberValue(existing.onHandQty) + onHand)
      existing.availableQty = normalizeQuantity(numberValue(existing.availableQty) + available)
      continue
    }
    grouped.set(key, {
      stockNumber,
      stockName,
      stockLocationNumber,
      stockLocationName,
      lotNumber,
      onHandQty: normalizeQuantity(onHand),
      availableQty: normalizeQuantity(available),
    })
  }

  return {
    materialCode: normalized,
    materialName,
    specification,
    unitNumber,
    unitName,
    totalOnHandQty: normalizeQuantity(totalOnHand),
    totalAvailableQty: normalizeQuantity(totalAvailable),
    rowCount: grouped.size,
    queriedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
    rows: [...grouped.values()],
  }
}
