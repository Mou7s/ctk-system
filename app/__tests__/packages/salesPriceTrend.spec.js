import { describe, expect, it } from 'vitest'
import {
  MAX_PRICE_TREND_SERIES,
  buildSalesPriceSummary,
  getSalesPricePointValue,
  salesPricePairKey,
  sortSalesPriceSummaries,
} from '@/packages/shared/salesPriceTrend.js'

describe('salesPriceTrend shared helpers', () => {
  it('creates stable customer and material pair keys', () => {
    expect(salesPricePairKey('CUST001', 'MAT001')).toBe('CUST001\u0000MAT001')
  })

  it('selects the requested price metric without changing points', () => {
    const point = { preTaxPrice: 20, taxPrice: 21, date: '2026-07-22' }
    expect(getSalesPricePointValue(point, 'tax')).toBe(21)
    expect(getSalesPricePointValue(point, 'preTax')).toBe(20)
  })

  it('summarizes first/latest values using the selected metric', () => {
    const series = {
      key: 'CUST001\u0000MAT001',
      customerNumber: 'CUST001',
      customerName: '客户一',
      materialNumber: 'MAT001',
      materialName: '物料一',
      first: { date: '2026-01-01', billNo: 'SO001', preTaxPrice: 20, taxPrice: 21 },
      latest: { date: '2026-07-22', billNo: 'SO002', preTaxPrice: 22, taxPrice: 23 },
    }
    const summary = buildSalesPriceSummary(series, 'preTax')
    expect(summary.firstValue).toBe(20)
    expect(summary.latestValue).toBe(22)
    expect(summary.change).toBe(2)
    expect(summary.percent).toBe(10)
  })

  it('keeps the backend curve limit explicit', () => {
    expect(MAX_PRICE_TREND_SERIES).toBe(200)
  })

  it('sorts summary rows in either direction and keeps empty values last', () => {
    const rows = [
      { key: 'a', customerName: 'Customer B', materialName: 'Material 2', change: 3 },
      { key: 'b', customerName: 'Customer A', materialName: 'Material 1', change: null },
      { key: 'c', customerName: 'Customer A', materialName: 'Material 3', change: -1 },
    ]

    expect(sortSalesPriceSummaries(rows, 'change', 'desc').map(row => row.key)).toEqual(['a', 'c', 'b'])
    expect(sortSalesPriceSummaries(rows, 'customerMaterial', 'asc').map(row => row.key)).toEqual(['b', 'c', 'a'])
    expect(sortSalesPriceSummaries(rows, 'customerMaterial', 'desc').map(row => row.key)).toEqual(['a', 'c', 'b'])
  })
})
