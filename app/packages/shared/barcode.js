export function parseMaterialCode(rawValue) {
  const value = String(rawValue || '').trim()
  if (!value) return ''

  const parts = value.split('|')
  const candidates = parts.length >= 2 ? [parts[1], value] : [value]

  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim()
    if (!normalized) continue
    try {
      const payload = JSON.parse(normalized)
      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        const code = payload['编码'] || payload['物料编码'] || payload.materialCode || payload.code || payload.FNumber
        if (code) return String(code).trim().replace(/^MAT:/i, '').toUpperCase()
      }
    } catch {
      // Legacy labels are plain text or pipe-delimited values.
    }
    return normalized.replace(/^MAT:/i, '').toUpperCase()
  }
  return ''
}
