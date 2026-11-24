const PACKAGE_STORAGE_RULES = [
  { packageKey: 'SOT23', location: 'A1-A9' },
  { packageKey: 'TO252', location: 'A10-A12' },
  { packageKey: 'DFN', location: 'A13' },
  { packageKey: 'SOD523', location: 'A14-A15' },
  { packageKey: 'SOD323', location: 'B1-B6' },
  { packageKey: 'SOD123', location: 'B7-B11' },
  { packageKey: '插件', location: 'B12' },
  { packageKey: 'SOT89', location: 'B13' },
  { packageKey: 'SMB', location: 'B13-B14' },
  { packageKey: 'SMA', location: 'B15' }
]

/**
 * 根据金蝶规格型号返回出库拣货仓位区间（如 A1-A9）。
 * 忽略大小写、空格和连字符，兼容 SOD323 / SOD-323 等写法。
 */
export function getPackageStorageLocation(specification) {
  const normalized = String(specification || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9\u4e00-\u9fff]/g, '')

  if (!normalized) return ''
  return PACKAGE_STORAGE_RULES.find(rule => normalized.includes(rule.packageKey))?.location || ''
}

/** 将区间展开为具体货架列表，如 A1-A3 → ['A1','A2','A3']。 */
export function expandShelfRange(range) {
  const value = String(range || '').trim().toUpperCase().replace(/\s+/g, '')
  if (!value) return []
  if (!value.includes('-')) return [value]

  const [startRaw, endRaw] = value.split('-')
  const start = parseShelfCode(startRaw)
  const end = parseShelfCode(endRaw)
  if (!start || !end || start.letter !== end.letter) {
    return [normalizeShelfCode(startRaw), normalizeShelfCode(endRaw)].filter(Boolean)
  }
  const from = Math.min(start.number, end.number)
  const to = Math.max(start.number, end.number)
  const shelves = []
  for (let n = from; n <= to; n += 1) shelves.push(`${start.letter}${n}`)
  return shelves
}

/** 封装对应的具体候选货架列表。 */
export function getPackageShelfCandidates(specification) {
  return expandShelfRange(getPackageStorageLocation(specification))
}

/**
 * 判断具体货架编码是否等于推荐位，或落在推荐区间内。
 * 精确推荐时传单个货架（如 A5）；区间仍兼容。
 */
export function isLocationInSuggestedRange(locationCode, suggestedRange) {
  const location = normalizeShelfCode(locationCode)
  const range = String(suggestedRange || '').trim().toUpperCase()
  if (!location || !range) return true

  // 正式 WMS 库位编码本身包含连字符（如 A-01-01-03），先判断精确相等。
  if (location === normalizeShelfCode(range)) return true

  if (!range.includes('-')) {
    return location === normalizeShelfCode(range)
  }

  return expandShelfRange(range).includes(location)
}

function normalizeShelfCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
}

function parseShelfCode(value) {
  const match = normalizeShelfCode(value).match(/^([A-Z]+)(\d+)$/)
  if (!match) return null
  return { letter: match[1], number: Number(match[2]) }
}

export { PACKAGE_STORAGE_RULES }
