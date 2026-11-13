import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx/xlsx.mjs'
import { unzipSync } from 'fflate'
import { buildDomesticQuotationTemplateWorkbook, buildQuotationTemplateWorkbook } from '../../server/utils/quotation.ts'
import { parseDomesticQuotationWorkbook, parseQuotationWorkbook } from '../../server/utils/quotation-parser.ts'

const header = { customer_name: '动态行测试', customer_style: '终端', country: '中国', rate: 7, quote_date: '2026-10-27', payment_term: '现金', salesperson_name: '测试$1<&' }
const lines = count => Array.from({ length: count }, (_, index) => ({ line_no: index + 1, ctk_mpn: `CTK-${index + 1}`, unit: 'KPCS', original_price_rmb: 70, rate: 7, min_pack_count: 3 }))
const decoder = new TextDecoder()

describe('报价单动态明细行', () => {
  it.each([1, 16, 501])('内贸 %i 行导出再导入，页脚、合并单元格和打印范围随明细移动', (count) => {
    const bytes = buildDomesticQuotationTemplateWorkbook(readFileSync('server/templates/内贸销售报价单模板.xlsx'), header, lines(count))
    const parsed = parseDomesticQuotationWorkbook(bytes)
    expect(parsed.lines).toHaveLength(count)
    expect(parsed.lines.at(-1)).toMatchObject({ lineNo: count, ctkMpn: `CTK-${count}`, originalPriceRmb: 70, minPackCount: 3 })
    const workbook = XLSX.read(bytes, { type: 'buffer' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const footerRow = 12 + count
    expect(sheet[`A${footerRow}`].v).toMatch(/^以上/u)
    expect(sheet[`A${footerRow + 3}`].v).toContain('现金')
    expect(sheet[`A${footerRow + 8}`].v).toContain('测试$1<&')
    expect(sheet['!merges']).toContainEqual({ s: { c: 1, r: 10 + count }, e: { c: 2, r: 10 + count } })
    const files = unzipSync(bytes)
    expect(decoder.decode(files['xl/workbook.xml'])).toContain(`$I$${footerRow + 14}`)
    expect(decoder.decode(files['xl/worksheets/sheet1.xml'])).toContain('fitToHeight="0"')
  })

  it('外贸501行导出再导入不截断，末行美元公式和打印范围正确', () => {
    const bytes = buildQuotationTemplateWorkbook(readFileSync('server/templates/外贸销售报价单模板.xlsx'), header, lines(501))
    const parsed = parseQuotationWorkbook(bytes, '外贸.xlsx', { requireLatestTemplate: true })
    expect(parsed.lines).toHaveLength(501)
    expect(parsed.lines.at(-1).ctkMpn).toBe('CTK-501')
    const workbook = XLSX.read(bytes, { type: 'buffer' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    expect(sheet.L507.f).toContain('E507')
    expect(sheet.L507.v).toBe(10)
    expect(sheet.M507.v).toBe(0.01)
    expect(decoder.decode(unzipSync(bytes)['xl/workbook.xml'])).toContain('$P$507')
  })

  it('旧内贸无页脚工作簿继续读取表头之后的全部明细', () => {
    const book = XLSX.utils.book_new()
    const rows = [['内贸报价单'], [], [], [], [], ['客户：旧版客户'], ['联系人：测试'], [], ['序号', '品名', '型号', '封装', '单位', '含税单价'],
      ...lines(31).map(line => [line.line_no, '产品', line.ctk_mpn, 'SOT-23', 'PCS', 0.07])]
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), '报价单')
    const parsed = parseDomesticQuotationWorkbook(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }))
    expect(parsed.lines).toHaveLength(31)
    expect(parsed.lines.at(-1).ctkMpn).toBe('CTK-31')
  })
})
