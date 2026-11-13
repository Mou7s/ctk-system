export const MAX_PRICE_TREND_SERIES = 200

export function salesPricePairKey(customerNumber, materialNumber) {
  return `${String(customerNumber || '')}\u0000${String(materialNumber || '')}`
}

export function getSalesPricePointValue(point, metric = 'tax') {
  const value = metric === 'preTax' ? point?.preTaxPrice : point?.taxPrice
  return value == null || value === '' ? null : Number(value)
}

export function getSalesPriceSeriesValue(series, metric = 'tax', edge = 'latest') {
  return getSalesPricePointValue(series?.[edge], metric)
}

export function buildSalesPriceSummary(series, metric = 'tax') {
  const firstValue = getSalesPriceSeriesValue(series, metric, 'first')
  const latestValue = getSalesPriceSeriesValue(series, metric, 'latest')
  const change = firstValue == null || latestValue == null ? null : latestValue - firstValue

  return {
    key: series?.key,
    customerNumber: series?.customerNumber,
    customerName: series?.customerName,
    materialNumber: series?.materialNumber,
    materialName: series?.materialName,
    firstDate: series?.first?.date || '',
    firstBillNo: series?.first?.billNo || '',
    firstValue,
    latestDate: series?.latest?.date || '',
    latestBillNo: series?.latest?.billNo || '',
    latestValue,
    change,
    percent: firstValue ? (change / firstValue) * 100 : null,
  }
}

export function sortSalesPriceSummaries(rows, sortKey, sortDirection = 'asc') {
  const list = Array.isArray(rows) ? rows : []
  if (!sortKey) return [...list]

  const direction = sortDirection === 'desc' ? -1 : 1
  return list
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const leftValue = getSummarySortValue(left.row, sortKey)
      const rightValue = getSummarySortValue(right.row, sortKey)

      if (leftValue == null && rightValue == null) return left.index - right.index
      if (leftValue == null) return 1
      if (rightValue == null) return -1

      const result = isNumericSummarySortKey(sortKey)
        ? Number(leftValue) - Number(rightValue)
        : String(leftValue).localeCompare(String(rightValue), 'zh-CN')

      return result * direction || left.index - right.index
    })
    .map(({ row }) => row)
}

function getSummarySortValue(row, sortKey) {
  if (sortKey === 'customerMaterial') {
    const customer = row?.customerName || row?.customerNumber || ''
    const material = row?.materialName || row?.materialNumber || ''
    return `${customer} / ${material}`
  }
  return row?.[sortKey]
}

function isNumericSummarySortKey(sortKey) {
  return ['firstValue', 'latestValue', 'change', 'percent'].includes(sortKey)
}
