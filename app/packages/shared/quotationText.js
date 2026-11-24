// 客户报价表里用 / - N/A 待定 之类的占位符表示「没有」，
// 直接入库会让「CTK 型号 = /」「封装 = /」这种脏值出现在单据和导出里。
// 价格列由 parsePrice 单独处理，这里只统一文本列的清洗口径。
const PLACEHOLDER_TEXT = /^(?:\/{1,2}|-{1,2}|n\/?a|null|undefined|待定|无|tbd|\?)$/iu

function normalizeText(value) {
  return String(value ?? '')
    .replace(/[\u00a0\u3000]/gu, ' ')
    .trim()
}

export function isQuotationPlaceholder(value) {
  const text = normalizeText(value)
  return text !== '' && PLACEHOLDER_TEXT.test(text)
}

export function cleanQuotationText(value) {
  const text = normalizeText(value)
  return PLACEHOLDER_TEXT.test(text) ? '' : text
}
