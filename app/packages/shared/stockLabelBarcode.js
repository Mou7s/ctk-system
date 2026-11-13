/**
 * 解析现场继续使用的旧版中文 JSON 物料二维码。
 */
export function parseLegacyStockLabelBarcode(raw) {
  const text = String(raw || '').trim()
  if (!text.startsWith('{')) return null
  try {
    const value = JSON.parse(text)
    const materialCode = String(value?.编码 || '').trim().toUpperCase()
    if (!materialCode || typeof value !== 'object' || Array.isArray(value)) return null
    return {
      kind: 'legacy-material',
      legacy: true,
      labelId: '',
      planNo: '',
      materialCode,
      qty: null,
      seq: null,
      raw: text,
    }
  } catch {
    return null
  }
}
