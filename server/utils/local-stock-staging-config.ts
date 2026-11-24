export const STAGING_TARGET_STOCK = 'CTK10'
export const STAGING_TARGET_STOCK_NAME = '塑封成品仓'
export const STAGING_TARGET_LOCATION_FLEX_ID = '100008'

export const STAGING_SOURCE_STOCKS = [
  { number: 'CTK10', name: '塑封成品仓', locationFlexId: '100008' },
  { number: 'CTK11', name: 'OEM成品仓', locationFlexId: '100011' },
  { number: 'CTK20', name: '塑封成品仓1', locationFlexId: '100008' },
] as const

export function sourceStockConfig(stockNumber: unknown) {
  const normalized = String(stockNumber ?? '').trim().toUpperCase()
  return STAGING_SOURCE_STOCKS.find((item) => item.number === normalized) || null
}

export function sourceLocationFlexId(stockNumber: unknown): string {
  return sourceStockConfig(stockNumber)?.locationFlexId || STAGING_TARGET_LOCATION_FLEX_ID
}

export function sourceStockName(stockNumber: unknown): string {
  return sourceStockConfig(stockNumber)?.name || String(stockNumber ?? '').trim().toUpperCase()
}

export function isStagingSourceStock(stockNumber: unknown): boolean {
  return Boolean(sourceStockConfig(stockNumber))
}
