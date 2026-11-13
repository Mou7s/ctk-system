import { queryK3Inventory } from './stock-document'

function text(value: unknown): string {
  return String(Array.isArray(value) ? value[0] ?? '' : value ?? '').trim()
}

function normalizeQty(value: unknown): number {
  const parsed = Number(Array.isArray(value) ? value[0] : value)
  return Number.isFinite(parsed) ? Number(parsed.toFixed(3)) : 0
}

function packageName(specification: string): string {
  return specification.trim().split('/')[0]?.trim() || ''
}

function marking(specification: string): string {
  const parts = specification.trim().split('/')
  return parts.length > 1 ? parts.at(-1)?.trim() || '' : ''
}

/**
 * Read current selectable source inventory for the scanned material.
 *
 * K3 is the source of truth here. Successful previous transfers have already
 * reduced K3 on-hand quantity, so local staging history must not be subtracted
 * again. Only rows with a current available quantity and an explicit K3 stock
 * location can be selected for a direct transfer.
 */
export async function queryLocalStockLegacyStaging(materialCode: unknown): Promise<Record<string, unknown>[]> {
  const normalized = text(materialCode).toUpperCase()
  if (!normalized) throw new Error('物料编码不能为空')

  const inventory = await queryK3Inventory({
    material: normalized,
    availableOnly: true,
    pageNum: 1,
    pageSize: 100,
  })
  const rows = (Array.isArray(inventory.rows) ? inventory.rows : []) as Record<string, unknown>[]
  const availableRows = rows.filter((row) => normalizeQty(row.availableQty) > 0)
  const selectableRows = availableRows.filter((row) => text(row.stockNumber) && text(row.stockLocationNumber))

  if (!selectableRows.length) {
    if (availableRows.length) {
      throw new Error(`物料 ${normalized} 存在可用库存，但没有返回可调拨的金蝶仓位`)
    }
    throw new Error(`所有仓库都没有查到物料 ${normalized} 的可用库存`)
  }

  return selectableRows.map((row) => {
    const sourceOnHand = normalizeQty(row.baseQty)
    const sourceAvailable = normalizeQty(row.availableQty)
    const specification = text(row.specification)
    return {
      labelId: null,
      sourceBillNo: null,
      sourceEntryId: null,
      seq: 1,
      materialCode: text(row.materialNumber).toUpperCase(),
      materialName: text(row.materialName),
      specification,
      packageName: packageName(specification),
      marking: marking(specification),
      lotNumber: text(row.lotNumber),
      unitNumber: text(row.unitNumber),
      receiptQty: sourceAvailable,
      sourceStockNumber: text(row.stockNumber).toUpperCase(),
      sourceStockName: text(row.stockName),
      sourceStockLocationNumber: text(row.stockLocationNumber),
      sourceStockLocationName: text(row.stockLocationName),
      sourceStockLocationFlexId: text(row.stockLocationFlexId),
      transferredQty: 0,
      sourceOnHandQty: sourceOnHand,
      sourceAvailableQty: sourceAvailable,
      stagingAvailableQty: sourceAvailable,
      transferableQty: sourceAvailable,
      legacy: true,
    }
  })
}
