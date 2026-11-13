import { describe, expect, it } from 'vitest'
import {
  applySampleProgressGridEdit,
  applySampleProgressPasteGrid,
  filterSampleProgressRows,
  getSampleProgressFilterOptions,
  getSampleProgressFilterValueKey,
} from '../packages/shared/sampleProgressGrid.js'

const columns = [
  { key: 'customerName' },
  { key: 'quantity', type: 'number' },
  { key: 'sampleOrderDate', type: 'date' },
]

describe('sample progress RevoGrid data updates', () => {
  it('normalizes numeric and date cell edits without mutating the source', () => {
    const source = [{ customerName: '原客户', quantity: 1, sampleOrderDate: null }]
    const numberResult = applySampleProgressGridEdit(source, { rowIndex: 0, prop: 'quantity', val: '2,468' }, columns)
    const dateResult = applySampleProgressGridEdit(numberResult, { rowIndex: 0, prop: 'sampleOrderDate', val: '2026-08-26' }, columns)

    expect(source[0].quantity).toBe(1)
    expect(dateResult[0]).toMatchObject({ quantity: 2468, sampleOrderDate: '2026-08-26' })
  })

  it('pastes an Excel single column down the selected RevoGrid column', () => {
    const source = Array.from({ length: 4 }, () => ({ customerName: '', quantity: null, sampleOrderDate: null }))
    const result = applySampleProgressPasteGrid(
      source,
      [['客户A'], ['客户B'], ['客户C']],
      columns,
      1,
      0,
    )

    expect(result.lines.map((row) => row.customerName)).toEqual(['', '客户A', '客户B', '客户C'])
    expect(result.changedRows).toEqual([1, 2, 3])
  })

  it('keeps a two-dimensional Excel paste aligned and converts numbers', () => {
    const source = Array.from({ length: 2 }, () => ({ customerName: '', quantity: null, sampleOrderDate: null }))
    const result = applySampleProgressPasteGrid(source, [['客户A', '100'], ['客户B', '200']], columns)

    expect(result.lines).toEqual([
      { customerName: '客户A', quantity: 100, sampleOrderDate: null },
      { customerName: '客户B', quantity: 200, sampleOrderDate: null },
    ])
  })

  it('builds unique filter options and keeps blank values selectable', () => {
    const options = getSampleProgressFilterOptions([
      { customerName: '客户A' },
      { customerName: '客户A' },
      { customerName: '' },
      { customerName: null },
      { customerName: '客户B' },
    ], 'customerName')

    expect(options.map((option) => option.label)).toEqual(['客户A', '（空白）', '客户B'])
    expect(getSampleProgressFilterValueKey('')).toBe(getSampleProgressFilterValueKey(null))
  })

  it('filters the loaded page by multiple selected values and columns', () => {
    const rows = [
      { customerName: '客户A', country: '中国' },
      { customerName: '客户B', country: '中国' },
      { customerName: '客户C', country: '美国' },
    ]
    const result = filterSampleProgressRows(rows, {
      customerName: [getSampleProgressFilterValueKey('客户A'), getSampleProgressFilterValueKey('客户B')],
      country: [getSampleProgressFilterValueKey('中国')],
    })

    expect(result).toEqual(rows.slice(0, 2))
  })
})
