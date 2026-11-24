export const DOMESTIC_QUOTATION_UNIT = 'KPCS'

export function domesticQuotationUnit(value) {
  const unit = String(value ?? '').trim().toUpperCase()
  if (['K', 'KPCS', 'KPC', '千只', '千个'].includes(unit)) return 'KPCS'
  if (['PCS', 'PC', '只', '个'].includes(unit)) return 'PCS'
  return ''
}

// Scale before rounding prices: 0.068 yuan/PCS must become 68 yuan/KPCS, never 70.
export function domesticPriceToKpcs(value, sourceUnit) {
  if (value == null || String(value).trim() === '' || domesticQuotationUnit(sourceUnit) !== 'PCS') return value
  const number = Number(String(value).replace(/[￥¥$,]/gu, '').trim())
  return Number.isFinite(number) ? Math.round((number * 1000 + Number.EPSILON) * 100) / 100 : value
}

export function pcsToKpcs(value) {
  if (value == null || String(value).trim() === '') return null
  const count = Number(value)
  return Number.isFinite(count) ? Math.round(count / 1000 * 1000000) / 1000000 : null
}

export function domesticPriceToPcs(value, sourceUnit) {
  if (value == null || String(value).trim() === '' || domesticQuotationUnit(sourceUnit) !== 'KPCS') return value
  const number = Number(String(value).replace(/[￥¥$,]/gu, '').trim())
  return Number.isFinite(number) ? Math.round(number / 1000 * 1e8) / 1e8 : value
}

export function domesticPackToPcs(value, sourceUnit) {
  if (value == null || String(value).trim() === '') return value
  const count = Number(value)
  return Number.isFinite(count) && domesticQuotationUnit(sourceUnit) === 'KPCS' ? Math.round(count * 1000 * 1e6) / 1e6 : value
}

// Convert a stored quotation for PCS entry/review without guessing unknown units.
export function domesticLineToPcs(line = {}) {
  const kind = domesticQuotationUnit(line.unit)
  return {
    ...line,
    sourceUnit: line.sourceUnit ?? line.unit,
    unit: kind ? 'PCS' : (line.unit || ''),
    minPackCount: domesticPackToPcs(line.minPackCount, line.unit),
    ...Object.fromEntries(['originalPriceRmb', 'initialPriceRmb', 'finalPriceRmb'].map(key => [key, domesticPriceToPcs(line[key], line.unit)])),
  }
}

export function domesticReviewPriceToStored(value, sourceUnit) {
  if (!domesticQuotationUnit(sourceUnit)) return null
  return domesticQuotationUnit(sourceUnit) === 'KPCS' ? domesticPriceToKpcs(value, 'PCS') : value
}
