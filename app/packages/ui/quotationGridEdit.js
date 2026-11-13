export const QUOTATION_GRID_CLICK_MOVE_TOLERANCE = 10

export function isQuotationGridClick(start, end, tolerance = QUOTATION_GRID_CLICK_MOVE_TOLERANCE) {
  if (!start || !end) return false
  return Math.abs(end.clientX - start.clientX) <= tolerance
    && Math.abs(end.clientY - start.clientY) <= tolerance
}

export function shouldOpenQuotationGridEditor({ readonly, column }) {
  return !readonly && Boolean(column) && !column.readonly && column.prop !== 'unit'
}
