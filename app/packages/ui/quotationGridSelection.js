export function getRowIndexesFromRange(range) {
  if (!range || !Number.isInteger(range.y) || !Number.isInteger(range.y1)) return []

  const start = Math.min(range.y, range.y1)
  const end = Math.max(range.y, range.y1)
  return Array.from({ length: end - start + 1 }, (_, offset) => start + offset)
}

export function getSelectedRowIndexes({ range, focused, lastFocused, selected, hovered, fallback = null } = {}) {
  const rangeIndexes = getRowIndexesFromRange(range)
  if (rangeIndexes.length) return rangeIndexes

  const row = selected ?? focused?.rowIndex ?? focused?.y ?? lastFocused?.row ?? hovered
  if (Number.isInteger(row)) return [row]

  return Number.isInteger(fallback) ? [fallback] : []
}
