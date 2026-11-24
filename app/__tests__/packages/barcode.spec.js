import { describe, expect, it } from 'vitest'
import { parseMaterialCode } from '../../packages/shared/barcode.js'

describe('barcode parsing', () => {
  it('extracts material code from the JSON payload used by legacy labels', () => {
    expect(parseMaterialCode('{"编码":"NAZ0030068","封装":"SOD-123","印字":"E1","名称":"TKMMSZ5231B"}'))
      .toBe('NAZ0030068')
  })

  it('keeps plain and pipe-delimited material labels compatible', () => {
    expect(parseMaterialCode('MAT:NAZ0030068')).toBe('NAZ0030068')
    expect(parseMaterialCode('LABEL|MAT:NAZ0030068')).toBe('NAZ0030068')
  })
})
