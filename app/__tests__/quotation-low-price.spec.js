import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ query: vi.fn(), body: {}, parts: [], session: { userId: 2 }, allowed: true, canReview: false, mime: '' }))
vi.mock('h3', () => ({ getHeader: () => state.mime, readBody: async () => state.body, readMultipartFormData: async () => state.parts }))
vi.mock('../../server/utils/auth', () => ({ hasPermission: (_session, permission) => state.allowed && (!permission.endsWith('Review') || state.canReview) }))
vi.mock('../../server/utils/read', () => ({ withReadSession: async (_event, _label, work) => work(state.session, { query: state.query }) }))
vi.mock('../../server/utils/mysql', () => ({ mysqlQueryOptions: sql => ({ sql }) }))
vi.mock('../../server/utils/quotation-parser', () => ({ parseQuotationWorkbook: vi.fn(), parseDomesticQuotationWorkbook: vi.fn() }))

import { comparableQuotationPrice, quotationLowPriceWarnings, checkQuotationLowPrices } from '../../server/utils/quotation-low-price'

describe('quotation low price comparison', () => {
  beforeEach(() => {
    state.query.mockReset()
    state.body = {}; state.allowed = true; state.canReview = false; state.mime = ''
  })

  it('normalizes domestic PCS and KPCS without guessing unknown units', () => {
    expect(comparableQuotationPrice({ unit: 'PCS', originalPriceRmb: 0.068 }, 'DOMESTIC')).toBe(68)
    expect(comparableQuotationPrice({ unit: 'KPCS', originalPriceRmb: 68 }, 'DOMESTIC')).toBe(68)
    expect(comparableQuotationPrice({ unit: '箱', originalPriceRmb: 68 }, 'DOMESTIC')).toBeNull()
    expect(comparableQuotationPrice({ unit: 'KPCS', originalPriceRmb: 0 }, 'FOREIGN')).toBeNull()
    expect(comparableQuotationPrice({ unit: 'KPCS', originalPriceRmb: 68, reviewPriceRmb: 60 }, 'FOREIGN')).toBe(60)
  })

  it('warns for the same customer and salesperson using the latest approved final price, with exact product and package', async () => {
    state.query.mockResolvedValue([[{ price: 80, unit: 'KPCS', quoteNo: 'H1', customerName: '同一客户', quoteDate: '2026-10-20' }]])
    const warnings = await quotationLowPriceWarnings({ query: state.query }, [{ ctkMpn: ' abc ', packageName: 'SOD-123', unit: 'PCS', originalPriceRmb: 0.06 }], 'DOMESTIC', 7, '同一客户', 2)
    expect(warnings).toEqual([expect.objectContaining({ currentPrice: 60, previousPrice: 80, decreasePercent: 25, customerName: '同一客户', lineNo: 1 })])
    const [{ sql }, params] = state.query.mock.calls[0]
    expect(params).toEqual(['DOMESTIC', 7, 'ABC', 'SOD-123', '同一客户', 2])
    expect(sql).toContain("q.status = 'APPROVED'")
    expect(sql).toContain('l.final_price_rmb > 0')
    expect(sql).toContain('q.final_review_time')
    expect(sql).toContain('q.salesperson_id = ?')
    expect(sql).toContain('TRIM(q.customer_name) = TRIM(?)')
    expect(sql).not.toContain('COALESCE(l.final_price_rmb')
  })

  it('does not alert on equal/higher prices or missing approved history; reuses per-product query', async () => {
    state.query.mockResolvedValue([[{ price: 60, unit: 'KPCS' }]])
    const lines = [60, 61].map(price => ({ ctkMpn: 'ABC', unit: 'KPCS', originalPriceRmb: price }))
    expect(await quotationLowPriceWarnings({ query: state.query }, lines, 'FOREIGN', 0, '同一客户', 2)).toEqual([])
    expect(state.query).toHaveBeenCalledTimes(1)
    state.query.mockResolvedValue([[]])
    expect(await quotationLowPriceWarnings({ query: state.query }, lines, 'FOREIGN', 0, '同一客户', 2)).toEqual([])
  })


  it('does not query history without a customer or a valid owner', async () => {
    const lines = [{ ctkMpn: 'ABC', unit: 'KPCS', originalPriceRmb: 1 }]
    expect(await quotationLowPriceWarnings({ query: state.query }, lines, 'FOREIGN', 0, '', 2)).toEqual([])
    expect(await quotationLowPriceWarnings({ query: state.query }, lines, 'FOREIGN', 0, '客户', 0)).toEqual([])
    expect(state.query).not.toHaveBeenCalled()
  })

  it('uses the stored salesperson for reviewers and ignores a forged owner', async () => {
    state.canReview = true
    state.body = { id: 7, salespersonId: 99, lines: [{ ctkMpn: 'ABC', unit: 'KPCS', originalPriceRmb: 1 }] }
    state.query.mockResolvedValueOnce([[{ salesperson_id: 3, customer_name: '客户A' }]]).mockResolvedValueOnce([[]])
    expect((await checkQuotationLowPrices({})).code).toBe(200)
    expect(state.query.mock.calls[1][1]).toEqual(['FOREIGN', 7, 'ABC', '', '客户A', 3])
  })

  it('uses the login user for new quotes and carries the entered customer', async () => {
    state.body = { customerName: '客户B', salespersonId: 99, lines: [{ ctkMpn: 'ABC', unit: 'KPCS', originalPriceRmb: 1 }] }
    state.query.mockResolvedValueOnce([[]])
    expect((await checkQuotationLowPrices({})).code).toBe(200)
    expect(state.query.mock.calls[0][1]).toEqual(['FOREIGN', 0, 'ABC', '', '客户B', 2])
  })

  it('returns a permission error before reading history', async () => {
    state.allowed = false
    expect((await checkQuotationLowPrices({})).code).toBe(403)
    expect(state.query).not.toHaveBeenCalled()
  })

  it('checks document ownership before using saved draft lines', async () => {
    state.body = { id: 7 }
    // hasPermission permits list but no review capability in this test.
    state.query.mockResolvedValueOnce([[{ salesperson_id: 3 }]])
    expect((await checkQuotationLowPrices({})).code).toBe(403)
    expect(state.query).toHaveBeenCalledTimes(1)
  })

  it('parses uploaded domestic prices before comparing without writing a document', async () => {
    const { parseDomesticQuotationWorkbook } = await import('../../server/utils/quotation-parser')
    parseDomesticQuotationWorkbook.mockReturnValue({ customerName: '同一客户', lines: [{ ctkMpn: 'ABC', unit: 'KPCS', originalPriceRmb: 60 }] })
    state.mime = 'multipart/form-data; boundary=test'
    state.parts = [{ name: 'file', filename: 'quote.xlsx', data: Buffer.from('test') }]
    state.query.mockResolvedValue([[{ price: 80, unit: 'KPCS' }]])
    const response = await checkQuotationLowPrices({}, 'DOMESTIC')
    expect(response.code).toBe(200)
    expect(response.data[0].currentPrice).toBe(60)
    expect(state.query.mock.calls.every(([options]) => options.sql.trim().startsWith('SELECT'))).toBe(true)
  })

  it('rejects malformed rows', async () => {
    for (const lines of [[null], ['bad'], [[]]]) {
      state.body = { lines }
      expect((await checkQuotationLowPrices({})).code).toBe(400)
    }
    expect(state.query).not.toHaveBeenCalled()
  })

  it('accepts more than 500 rows for comparison', async () => {
    state.body = { customerName: '同一客户', lines: Array.from({ length: 501 }, (_, index) => ({ lineNo: index + 1, ctkMpn: 'ABC', unit: 'KPCS', originalPriceRmb: 60 })) }
    state.query.mockResolvedValue([[{ price: 80, unit: 'KPCS' }]])
    const response = await checkQuotationLowPrices({})
    expect(response.code).toBe(200)
    expect(response.data).toHaveLength(501)
    expect(response.data.at(-1).lineNo).toBe(501)
  })

  it('propagates history query failures instead of reporting no lower price', async () => {
    state.query.mockRejectedValue(new Error('history offline'))
    await expect(quotationLowPriceWarnings({ query: state.query }, [{ ctkMpn: 'ABC', unit: 'KPCS', originalPriceRmb: 1 }], 'FOREIGN', 0, '同一客户', 2)).rejects.toThrow('history offline')
  })
})
