function normalizeText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

export const SAMPLE_PROGRESS_FILTER_BLANK = '__sample_progress_filter_blank__'

export function getSampleProgressFilterValueKey(value) {
  const text = normalizeText(value)
  if (!text) return SAMPLE_PROGRESS_FILTER_BLANK
  return `${typeof value}:${text}`
}

export function formatSampleProgressFilterValue(value) {
  return normalizeText(value) || '（空白）'
}

export function getSampleProgressFilterOptions(rows, key) {
  const seen = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    const value = row?.[key]
    const valueKey = getSampleProgressFilterValueKey(value)
    if (seen.has(valueKey)) continue
    seen.set(valueKey, {
      key: valueKey,
      value,
      label: formatSampleProgressFilterValue(value),
    })
  }
  return [...seen.values()]
}

export function filterSampleProgressRows(rows, filters = {}) {
  const entries = Object.entries(filters).filter(([, values]) => Array.isArray(values))
  if (!entries.length) return Array.isArray(rows) ? rows : []
  return (Array.isArray(rows) ? rows : []).filter((row) => entries.every(([key, values]) => (
    values.includes(getSampleProgressFilterValueKey(row?.[key]))
  )))
}

function toNumber(value) {
  const text = normalizeText(value).replace(/,/g, '')
  if (!text) return null
  const number = Number(text)
  return Number.isFinite(number) ? number : value
}

export function normalizeSampleProgressGridValue(value, column = {}) {
  if (column.type === 'number') return toNumber(value)
  if (column.type === 'date') return normalizeText(value) || null
  return typeof value === 'string' ? value.trim() : value
}

export function applySampleProgressGridEdit(lines, detail, columns = []) {
  const rowIndex = Number(detail?.rowIndex)
  const prop = detail?.prop
  if (!Number.isInteger(rowIndex) || rowIndex < 0 || !prop) return lines
  const column = columns.find((item) => item.key === prop) || {}
  const next = (Array.isArray(lines) ? lines : []).map((line) => ({ ...line }))
  if (!next[rowIndex]) return lines
  next[rowIndex][prop] = normalizeSampleProgressGridValue(detail.val, column)
  return next
}

export function applySampleProgressPasteGrid(lines, rows, columns, startRow = 0, startColumn = 0) {
  const next = (Array.isArray(lines) ? lines : []).map((line) => ({ ...line }))
  const changedRows = new Set()

  rows.forEach((row, rowOffset) => {
    const rowIndex = startRow + rowOffset
    const target = next[rowIndex]
    if (!target) return
    row.forEach((value, columnOffset) => {
      const column = columns[startColumn + columnOffset]
      if (!column || column.readonly) return
      target[column.key] = normalizeSampleProgressGridValue(value, column)
      changedRows.add(rowIndex)
    })
  })

  return { lines: next, changedRows: [...changedRows] }
}
