import { describe, expect, it } from 'vitest'
import { shouldOpenQuotationGridEditor } from '../packages/ui/quotationGridEdit.js'

describe('quotation grid single-click editing', () => {
  it('opens ordinary editable columns on click', () => {
    expect(shouldOpenQuotationGridEditor({
      readonly: false,
      column: { prop: 'application', readonly: false },
    })).toBe(true)
  })

  it('does not replace readonly or unit column behavior', () => {
    expect(shouldOpenQuotationGridEditor({ readonly: true, column: { prop: 'application' } })).toBe(false)
    expect(shouldOpenQuotationGridEditor({ readonly: false, column: { prop: 'application', readonly: true } })).toBe(false)
    expect(shouldOpenQuotationGridEditor({ readonly: false, column: { prop: 'unit' } })).toBe(false)
  })
})
