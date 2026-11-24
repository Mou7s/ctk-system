import { describe, expect, it } from 'vitest'
import { createQuotationPasteHistory } from '@ctk-system/shared'

describe('quotation paste history', () => {
  it('undoes and redoes a pasted table snapshot', () => {
    const history = createQuotationPasteHistory()
    const before = { lines: [{ description: '铝带', qty: 1 }] }
    const after = { lines: [{ description: '铝带', qty: 1 }, { description: '铜线', qty: 1 }] }

    history.record(before)
    expect(history.undo(after)).toEqual(before)
    expect(history.redo(before)).toEqual(after)
  })

  it('does not add duplicate snapshots and respects the stack limit', () => {
    const history = createQuotationPasteHistory(2)
    const first = { lines: [{ description: 'A' }] }
    const second = { lines: [{ description: 'B' }] }
    const third = { lines: [{ description: 'C' }] }

    history.record(first)
    history.record(first)
    history.record(second)

    expect(history.undo(third)).toEqual(second)
    expect(history.undo(second)).toEqual(first)
    expect(history.undo(first)).toEqual(null)
  })
})
