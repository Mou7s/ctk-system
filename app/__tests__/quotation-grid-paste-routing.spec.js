import { describe, expect, it } from 'vitest'
import {
  isQuotationMultiCellPaste,
  normalizeQuotationClipboardText,
} from '../packages/ui/quotationGridPaste.js'

describe('quotation grid clipboard routing', () => {
  it('recognizes an Excel single-column copy as a multi-cell paste', () => {
    const text = '客户A\r\n客户B\r\n客户C\r\n'
    expect(normalizeQuotationClipboardText(text)).toBe('客户A\n客户B\n客户C\n')
    expect(isQuotationMultiCellPaste(text)).toBe(true)
  })

  it('recognizes a multi-column row as a multi-cell paste', () => {
    expect(isQuotationMultiCellPaste('A\tB\tC')).toBe(true)
  })

  it('leaves a single value to the active cell editor', () => {
    expect(isQuotationMultiCellPaste('12345')).toBe(false)
  })
})
