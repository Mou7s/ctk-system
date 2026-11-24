import { describe, expect, it } from 'vitest'
import { getRowIndexesFromRange, getSelectedRowIndexes } from '../packages/ui/quotationGridSelection.js'

describe('quotation grid selected rows', () => {
  it('returns every row covered by a forward rectangular range', () => {
    expect(getRowIndexesFromRange({ y: 2, y1: 5 })).toEqual([2, 3, 4, 5])
  })

  it('returns every row covered by a reverse rectangular range', () => {
    expect(getRowIndexesFromRange({ y: 5, y1: 2 })).toEqual([2, 3, 4, 5])
  })

  it('uses the cached range after the grid loses focus to the delete button', () => {
    expect(getSelectedRowIndexes({
      range: { y: 8, y1: 10 },
      focused: null,
      lastFocused: { row: 8 },
    })).toEqual([8, 9, 10])
  })

  it('falls back to the focused row for a single-cell selection', () => {
    expect(getSelectedRowIndexes({ focused: { rowIndex: 4 } })).toEqual([4])
  })

  it('returns no row when neither a range nor focus exists', () => {
    expect(getSelectedRowIndexes()).toEqual([])
  })

  it('prioritizes explicit selected row over focused and hovered rows', () => {
    expect(getSelectedRowIndexes({
      selected: 3,
      focused: { rowIndex: 2 },
      hovered: 1,
    })).toEqual([3])
  })

  it('falls back to hovered row when no explicit selection or focus exists', () => {
    expect(getSelectedRowIndexes({
      hovered: 2,
    })).toEqual([2])
  })

  it('falls back to provided fallback row when nothing else matches', () => {
    expect(getSelectedRowIndexes({
      fallback: 0,
    })).toEqual([0])
  })
})
