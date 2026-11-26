export const DEFAULT_MIN_COL_WIDTH = 64
export const DEFAULT_MAX_COL_WIDTH = 280
export const DEFAULT_SELECT_MIN_COL_WIDTH = 72

const DEFAULT_FONT = '14px "PingFang SC", "Microsoft YaHei", Helvetica, Arial, sans-serif'
const MONO_FONT = '14px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
const CJK_OR_FULLWIDTH_RE = /[\u2e80-\u9fff\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef]/
const NARROW_ASCII_RE = /[\s.,:;'"`|!()[\]{}/\\-]/
const UPPER_ASCII_RE = /[A-Z@#%&WM]/

let cachedCanvasContext = undefined

function getCanvasContext() {
  if (cachedCanvasContext !== undefined) return cachedCanvasContext
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    cachedCanvasContext = null
    return null
  }
  try {
    const canvas = document.createElement('canvas')
    const ctx = canvas?.getContext?.('2d') || null
    cachedCanvasContext = ctx && typeof ctx.measureText === 'function' ? ctx : null
  } catch {
    cachedCanvasContext = null
  }
  return cachedCanvasContext
}

export function estimateTextWidthFallback(text, mono = false, fontSize = 14) {
  const str = String(text ?? '')
  if (!str) return 0
  const scale = Number.isFinite(Number(fontSize)) && Number(fontSize) > 0 ? Number(fontSize) / 14 : 1
  let total = 0
  for (const ch of str) {
    if (CJK_OR_FULLWIDTH_RE.test(ch)) {
      total += 14 * scale
    } else if (mono) {
      total += 8.6 * scale
    } else if (NARROW_ASCII_RE.test(ch)) {
      total += 4.8 * scale
    } else if (UPPER_ASCII_RE.test(ch)) {
      total += 9.2 * scale
    } else {
      total += 8 * scale
    }
  }
  return total
}

export function measureTextWidth(text, { mono = false, font = '', fontSize = 14, measureFn } = {}) {
  const str = String(text ?? '')
  if (!str) return 0

  if (typeof measureFn === 'function') {
    const measured = Number(measureFn(str, { mono, font, fontSize }))
    if (Number.isFinite(measured) && measured > 0) return measured
  }

  const ctx = getCanvasContext()
  if (ctx) {
    try {
      ctx.font = font || (mono ? MONO_FONT : DEFAULT_FONT)
      const width = Number(ctx.measureText(str)?.width)
      if (Number.isFinite(width) && width > 0) return width
    } catch {
      // Fallback below when canvas measurement is unavailable (e.g. Node/happy-dom)
    }
  }

  return estimateTextWidthFallback(str, mono, fontSize)
}

export function resolveSampleProgressDisplayText(field, value) {
  if (value === null || value === undefined || value === '') return ''
  if (field?.type === 'select' && Array.isArray(field.items)) {
    const matched = field.items.find((item) => {
      const itemValue = item && typeof item === 'object' ? item.value : item
      return itemValue === value || String(itemValue) === String(value)
    })
    if (matched !== undefined) {
      if (matched && typeof matched === 'object') {
        return String(matched.label ?? matched.value ?? '')
      }
      return String(matched)
    }
  }
  return String(value)
}

export function clampColumnWidth(width, minSize = DEFAULT_MIN_COL_WIDTH, maxSize = DEFAULT_MAX_COL_WIDTH) {
  const safeMin = Number.isFinite(Number(minSize)) && Number(minSize) > 0 ? Number(minSize) : DEFAULT_MIN_COL_WIDTH
  const safeMax = Number.isFinite(Number(maxSize)) && Number(maxSize) >= safeMin ? Number(maxSize) : Math.max(safeMin, DEFAULT_MAX_COL_WIDTH)
  const numeric = Number(width)
  if (!Number.isFinite(numeric) || numeric <= 0) return Math.round(safeMin)
  return Math.round(Math.min(safeMax, Math.max(safeMin, numeric)))
}

export function getFieldWidthBounds(field) {
  const minSize = Number.isFinite(Number(field?.minSize)) && Number(field.minSize) > 0
    ? Number(field.minSize)
    : (field?.type === 'select' ? DEFAULT_SELECT_MIN_COL_WIDTH : DEFAULT_MIN_COL_WIDTH)
  const maxSize = Number.isFinite(Number(field?.maxSize)) && Number(field.maxSize) >= minSize
    ? Number(field.maxSize)
    : Math.max(minSize, DEFAULT_MAX_COL_WIDTH)
  const defaultSize = clampColumnWidth(field?.size ?? minSize, minSize, maxSize)
  return { minSize, maxSize, defaultSize }
}

export function calculateSampleProgressColumnWidth(field, rows = [], options = {}) {
  const { minSize, maxSize, defaultSize } = getFieldWidthBounds(field)
  if (!Array.isArray(rows) || rows.length === 0) return defaultSize

  const headerText = String(field?.header || '')
  const headerFont = options.headerFont || options.cellFont || ''
  const headerFontSize = options.headerFontSize || options.cellFontSize || 14
  const singleLineHeaderWidth = measureTextWidth(headerText, {
    mono: false,
    font: headerFont,
    fontSize: headerFontSize,
    measureFn: options.measureFn,
  })
  // 表头支持两行折行，漏斗图标 hover 浮显不常驻占位；4 字以内保持单行，超过 4 字按两行估算
  const headerPadding = 22
  const headerWidth = headerText.length > 4
    ? Math.ceil(Math.min(singleLineHeaderWidth, singleLineHeaderWidth * 0.62)) + headerPadding
    : Math.ceil(singleLineHeaderWidth) + headerPadding

  const isMono = field?.key === 'partNo'
  const cellFont = isMono ? (options.monoFont || '') : (options.cellFont || '')
  const cellFontSize = options.cellFontSize || 14
  const basePaddingX = Number.isFinite(Number(options.cellPaddingX)) && Number(options.cellPaddingX) >= 0
    ? Number(options.cellPaddingX)
    : 12
  // 留出边框、亚像素舍入与中文末字安全余量；select 列额外预留右侧下拉箭头宽度
  const cellExtra = Math.ceil(basePaddingX) + (field?.type === 'select' ? 24 : 14)

  let maxCellWidth = 0
  for (const row of rows) {
    const displayText = resolveSampleProgressDisplayText(field, row?.[field.key])
    if (!displayText) continue
    const measured = Math.ceil(measureTextWidth(displayText, {
      mono: isMono,
      font: cellFont,
      fontSize: cellFontSize,
      measureFn: options.measureFn,
    })) + cellExtra
    if (measured > maxCellWidth) maxCellWidth = measured
  }

  return clampColumnWidth(Math.max(headerWidth, maxCellWidth), minSize, maxSize)
}

export function calculateSampleProgressColumnWidths(fields = [], rows = [], options = {}) {
  const widths = {}
  for (const field of fields || []) {
    if (!field?.key) continue
    widths[field.key] = calculateSampleProgressColumnWidth(field, rows, options)
  }
  return widths
}

export function resolveSampleProgressColumnWidth(field, { autoWidths = {} } = {}) {
  const { minSize, maxSize, defaultSize } = getFieldWidthBounds(field)
  const key = field?.key
  if (key && Number.isFinite(Number(autoWidths?.[key])) && Number(autoWidths[key]) > 0) {
    return clampColumnWidth(autoWidths[key], minSize, maxSize)
  }
  return defaultSize
}
