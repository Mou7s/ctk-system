import { readFileSync } from 'node:fs'
import * as XLSX from 'xlsx/xlsx.mjs'
import { describe, expect, it } from 'vitest'
import { buildQuotationTemplateWorkbook, populateQuotationWorkbook, quotationTemplatePath } from '../../server/utils/quotation.ts'
import { parseQuotationWorkbook } from '../../server/utils/quotation-parser.ts'

const template = () => readFileSync(quotationTemplatePath())
const header = (city) => ({ customer_name: '客户甲', end_user: '终端甲', country: '印度', city, customer_style: '分销商', rate: 7.2, quote_date: '2026-10-21', delivery_terms: 'EXW Dongguan', validity: '30days', payment_term: 'Net 30' })
const lines = [{ line_no: 1, material_code: 'NB001', ctk_mpn: 'CTK-001', qty: 100, original_price_rmb: 72 }]

describe('quotation header city', () => {
  it.each(['Mumbai', '深圳 / Shenzhen', 'City of London', '', undefined])('round trips optional city %s without shifting terms or prices', (city) => {
    const bytes = buildQuotationTemplateWorkbook(template(), header(city), lines)
    const parsed = parseQuotationWorkbook(bytes, '报价单.xlsx', { requireLatestTemplate: true })
    expect(parsed.city).toBe(city || '')
    expect(parsed).toMatchObject({ customerName: '客户甲', country: '印度', paymentTerm: 'Net 30', validity: '30days', rate: 7.2 })
    expect(parsed.lines[0].ctkMpn).toBe('CTK-001')
    const sheet = XLSX.read(bytes, { type: 'buffer' }).Sheets['报价单']
    expect(sheet.L7.f).toContain('$M$3')
    expect(sheet.M4.v).toBe('Net 30')
  })

  it('populates the SheetJS export path and clears city in blank templates', () => {
    const workbook = XLSX.read(template(), { type: 'buffer' })
    populateQuotationWorkbook(workbook, header('Mumbai'), lines)
    expect(workbook.Sheets['报价单'].J4.v).toBe('Mumbai')
    expect(workbook.Sheets['报价单'].M4.v).toBe('Net 30')
    const blank = XLSX.read(buildQuotationTemplateWorkbook(template(), header('Mumbai'), [], { blank: true }), { type: 'buffer' })
    expect(blank.Sheets['报价单'].J4?.v || '').toBe('')
  })

  it('keeps city empty when importing the preceding 16-column template', () => {
    const workbook = XLSX.read(template(), { type: 'buffer' })
    populateQuotationWorkbook(workbook, header('Mumbai'), lines)
    const sheet = workbook.Sheets['报价单']
    delete sheet.I4
    delete sheet.J4
    sheet.K4 = { t: 's', v: 'Net 30' }
    sheet.J4 = { t: 's', v: '付款方式\nPayment Terms:' }
    delete sheet.L4
    delete sheet.M4
    sheet['!merges'] = sheet['!merges'].filter((range) => range.s.r !== 3)
    const parsed = parseQuotationWorkbook(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), '旧模板.xlsx', { requireLatestTemplate: true })
    expect(parsed.city).toBe('')
    expect(parsed.paymentTerm).toBe('Net 30')
  })
})
