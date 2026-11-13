import { describe, expect, it } from 'vitest'
import { mapQuotationAnalysisPayload } from '@ctk-system/shared'

describe('quotation analysis payload mapping', () => {
  it('maps the server summary rows key into summaryRows', () => {
    const data = {
      quoteCount: 2,
      lineCount: 5,
      changedRmbCount: 1,
      changedUsdCount: 0,
      finalRmbCount: 4,
      finalUsdCount: 3,
      rows: [
        { key: 'A\u0000B', customerName: 'A', ctkMpn: 'B', lineCount: 3, averageFinalRmb: 12.5 },
      ],
      detailRows: [{ quoteNo: 'BJ1', lineNo: 1 }],
    }

    const mapped = mapQuotationAnalysisPayload(data)

    expect(mapped.summaryRows).toHaveLength(1)
    expect(mapped.summaryRows[0].customerName).toBe('A')
    expect(mapped.detailRows).toHaveLength(1)
    expect(mapped.quoteCount).toBe(2)
    expect(mapped.lineCount).toBe(5)
    expect(mapped.changedRmbCount).toBe(1)
    expect(mapped.changedUsdCount).toBe(0)
    expect(mapped.finalRmbCount).toBe(4)
    expect(mapped.finalUsdCount).toBe(3)
  })

  it('falls back to empty arrays and zero counters on a partial payload', () => {
    const mapped = mapQuotationAnalysisPayload({ rows: null })

    expect(mapped.summaryRows).toEqual([])
    expect(mapped.detailRows).toEqual([])
    expect(mapped.quoteCount).toBe(0)
    expect(mapped.lineCount).toBe(0)
    expect(mapped.changedRmbCount).toBe(0)
    expect(mapped.changedUsdCount).toBe(0)
    expect(mapped.finalRmbCount).toBe(0)
    expect(mapped.finalUsdCount).toBe(0)
  })

  it('never shares the server array references with the page state', () => {
    const rows = [{ key: 'x' }]
    const mapped = mapQuotationAnalysisPayload({ rows, detailRows: rows })

    expect(mapped.summaryRows).toEqual(rows)
    expect(mapped.summaryRows).not.toBe(rows)
    expect(mapped.detailRows).not.toBe(rows)
  })

  it('tolerates a missing payload', () => {
    expect(mapQuotationAnalysisPayload(undefined)).toEqual({
      quoteCount: 0,
      lineCount: 0,
      changedRmbCount: 0,
      changedUsdCount: 0,
      finalRmbCount: 0,
      finalUsdCount: 0,
      missingFinalCount: 0,
      summaryRows: [],
      detailRows: [],
    })
  })
})
