function toCount(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

function toRows(value) {
  return Array.isArray(value) ? [...value] : []
}

export function quotationPriceAdjustment(original, final) {
  if (original == null || final == null || original === '' || final === '') return null
  const before = Number(original), after = Number(final)
  if (!Number.isFinite(before) || !Number.isFinite(after)) return null
  const delta = Math.round((after - before) * 100) / 100
  return { delta, percent: before === 0 ? null : delta / before * 100 }
}

/**
 * 服务端 /tk_custom/quotation/analysis 把「客户 / 型号汇总行」放在 `rows` 键下、
 * 明细放在 `detailRows`，页面模板读的是 `summaryRows` / `detailRows`。
 * 这里做一次显式映射，避免两侧键名漂移导致汇总表恒空。
 */
export function mapQuotationAnalysisPayload(data) {
  const payload = data && typeof data === 'object' ? data : {}
  return {
    quoteCount: toCount(payload.quoteCount),
    lineCount: toCount(payload.lineCount),
    changedRmbCount: toCount(payload.changedRmbCount),
    changedUsdCount: toCount(payload.changedUsdCount),
    finalRmbCount: toCount(payload.finalRmbCount),
    finalUsdCount: toCount(payload.finalUsdCount),
    missingFinalCount: toCount(payload.missingFinalCount),
    summaryRows: toRows(payload.rows),
    detailRows: toRows(payload.detailRows),
  }
}
