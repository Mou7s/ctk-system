import * as XLSX from 'xlsx/xlsx.mjs'
import { describe, expect, it } from 'vitest'
import { cleanQuotationText, isQuotationPlaceholder } from '@ctk-system/shared'
import { parseQuotationWorkbook } from '../../server/utils/quotation-parser.ts'

function workbookBytes(rows) {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), '8-14')
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
}

const PLACEHOLDER_VALUES = ['/', '-', '--', 'N/A', 'n/a', 'NA', 'null', 'undefined', '待定', '无', 'TBD', '?']

describe('quotation placeholder text cleaning', () => {
  it('detects the placeholder values used in customer Excel sheets', () => {
    for (const value of PLACEHOLDER_VALUES) {
      expect(isQuotationPlaceholder(value)).toBe(true)
    }
  })

  it('keeps real content untouched', () => {
    for (const value of ['BAV21W', 'SOD323', 'electrical measure', '2 years', '1-30days', 'N-experimental']) {
      expect(isQuotationPlaceholder(value)).toBe(false)
      expect(cleanQuotationText(value)).toBe(value)
    }
  })

  it('cleans surrounding whitespace and full-width spaces', () => {
    expect(cleanQuotationText('\u3000 Vites \u3000')).toBe('Vites')
    expect(cleanQuotationText(null)).toBe('')
    expect(cleanQuotationText(undefined)).toBe('')
  })

  it('turns placeholders into empty strings', () => {
    for (const value of PLACEHOLDER_VALUES) {
      expect(cleanQuotationText(value)).toBe('')
    }
  })

  it('matches the server parser behaviour for slash placeholders', () => {
    const bytes = workbookBytes([
      ['S/N', '客户', '产品描述', 'QTY', 'CTK MPN', '封装', 'SPQ/Reel', '单价（元）', '单价（美元）'],
      [1, 'Vites', 'CRS06', 8039, '/', '/', '/', '/', '/'],
    ])

    const parsed = parseQuotationWorkbook(bytes, 'Vites.xlsx')
    const line = parsed.lines[0]

    expect(line.ctkMpn).toBe('')
    expect(line.packageName).toBe('')
    expect(line.spqReel).toBe('')
    expect(line.originalPriceRmb).toBeNull()
    expect(line.originalPriceUsd).toBeNull()
  })
})
