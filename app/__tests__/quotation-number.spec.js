import { describe, it, expect, vi } from 'vitest'
vi.mock('../../server/utils/mysql', () => ({ mysqlQueryOptions: s => s }))
vi.mock('../../server/utils/write', () => ({ writeFail: (message) => { throw new Error(message) } }))
import { allocateQuotationNumber, quotationNumberDate } from '../../server/utils/quotation-number'

describe('quotation numbering', () => {
  it('uses Beijing day across UTC midnight boundary', () => {
    expect(quotationNumberDate(new Date('2026-10-21T16:00:00Z'))).toBe('20261022')
    expect(quotationNumberDate(new Date('2026-10-21T15:59:59Z'))).toBe('20261021')
  })
  it('continues the migrated domestic daily counter', async () => {
    const connection = { execute: vi.fn(), query: vi.fn().mockResolvedValue([[{ sequence_value: 9 }]]) }
    expect(await allocateQuotationNumber(connection, 'DOMESTIC', new Date('2026-10-22T00:00:00Z'))).toBe('CTK2026102210')
    expect(connection.execute.mock.calls[1][1]).toEqual([10, '20261022', 'DOMESTIC'])
    expect(connection.query.mock.calls[0][0]).toContain('FOR UPDATE')
  })
  it('rejects overflow without updating the counter', async () => {
    const connection = { execute: vi.fn(), query: vi.fn().mockResolvedValue([[{ sequence_value: 99 }]]) }
    await expect(allocateQuotationNumber(connection, 'FOREIGN')).rejects.toThrow('号段上限')
    expect(connection.execute).toHaveBeenCalledTimes(1)
  })
})


describe('independent business number ranges', () => {
  it.each([
    ['DOMESTIC', 0, '01'], ['DOMESTIC', 48, '49'],
    ['FOREIGN', 50, '51'], ['FOREIGN', 98, '99'],
  ])('allocates %s after %s as %s', async (kind, previous, suffix) => {
    const connection = { execute: vi.fn(), query: vi.fn().mockResolvedValue([[{ sequence_value: previous }]]) }
    expect(await allocateQuotationNumber(connection, kind, new Date('2026-10-22T00:00:00Z'))).toBe('CTK20261022' + suffix)
    expect(connection.execute.mock.calls[0][1]).toEqual(['20261022', kind, kind === 'DOMESTIC' ? 0 : 50])
    expect(connection.query.mock.calls[0][1]).toEqual(['20261022', kind])
  })
  it('prevents domestic overflow into the foreign range', async () => {
    const connection = { execute: vi.fn(), query: vi.fn().mockResolvedValue([[{ sequence_value: 49 }]]) }
    await expect(allocateQuotationNumber(connection, 'DOMESTIC')).rejects.toThrow('内贸')
    expect(connection.execute).toHaveBeenCalledTimes(1)
  })
  it('rejects an unknown business type before touching the database', async () => {
    const connection = { execute: vi.fn() }
    await expect(allocateQuotationNumber(connection, 'UNKNOWN')).rejects.toThrow('业务类型')
    expect(connection.execute).not.toHaveBeenCalled()
  })
})
