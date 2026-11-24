export function normalizeQuotationClipboardText(text) {
  return String(text ?? '').replace(/\r\n?/g, '\n')
}

export function isQuotationMultiCellPaste(text, hasHtmlTable = false) {
  const normalized = normalizeQuotationClipboardText(text)
  return normalized.includes('\n') || normalized.includes('\t') || Boolean(hasHtmlTable)
}
