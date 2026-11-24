import * as XLSX from 'xlsx/xlsx.mjs'
import { readFileSync } from 'node:fs'
import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { buildDomesticQuotationTemplateWorkbook } from '../../server/utils/quotation.ts'
import { parseDomesticQuotationWorkbook, parseQuotationWorkbook } from '../../server/utils/quotation-parser.ts'
import { DOMESTIC_QUOTATION_COLUMNS, domesticPackCountFromSpec, mapDomesticMaterialOption, resolveDomesticMaterialSelection } from '../packages/ui/domesticQuotationGrid.js'

const template = readFileSync('server/templates/内贸销售报价单模板.xlsx')
const header = { customer_name: '测试客户', contact_text: '测试联系人', quote_date: '2026-10-13', customer_style: 'EMS', customer_address: '测试地址', customer_phone: '010-12345678' }
const line = { line_no: 1, material_code: '1405001900', manufacturer: 'CTK', application: 'CTK名称', ctk_mpn: 'CTK-1', package_name: 'SOT-23', unit: 'KPCS', min_pack_count: 3, original_price_rmb: 1.25, final_price_rmb: 1.3, remark: '测试备注', customer_material_name: '客户专用名称' }
function sheet(bytes) {
  const book = XLSX.read(bytes, { type: 'buffer' })
  return book.Sheets[book.SheetNames[0]]
}

describe('内贸物料名称与最小包装数', () => {
  it.each([
    ['SOT-23(6R)/3K盘/无/A4', '3000'],
    ['SOD-123/0.5K盘/无', '500'],
    ['SOT-23／３Ｋ盘／无', '3000'],
    ['SOT-23/3000只盘/无', '3000'],
    ['SOT-23/3K盘/5K盘', ''],
    ['SOT-23/散装', ''],
    ['SOT-23/3K/无', ''],
    ['SOT-23/0K盘', ''],
    ['', ''],
  ])('从明确规格 %s 解析包装量为 %s PCS', (spec, expected) => {
    expect(domesticPackCountFromSpec(spec)).toBe(expected)
    const option = mapDomesticMaterialOption({ name: 'TKBAV70', spec, minPackCount: 1 })
    expect(option.minPackCount).toBe(expected)
    expect(resolveDomesticMaterialSelection(option).minPackCount).toBe(expected)
  })
  it('采购最小包装数存在但规格未明确包装量时仍留空', () => {
    expect(mapDomesticMaterialOption({ name: 'CTK-1', minPackCount: 3000 }).minPackCount).toBe('')
  })

  it('新模板列序与在线版一致，客户物料名称、备注和最终审核价完整往返', () => {
    const bytes = buildDomesticQuotationTemplateWorkbook(template, header, [line])
    const cells = sheet(bytes)
    expect(['B11','D11','F11','G11','H11','I11'].map(address => String(cells[address].v).replace(/\s/gu, ''))).toEqual(DOMESTIC_QUOTATION_COLUMNS.map(column => column.label))
    expect(cells.H12).toMatchObject({ t: 'n', v: 3000 })
    expect(cells.G12).toMatchObject({ t: 'n', v: 0.0013 })
    expect(cells.B12.v).toBe('客户专用名称')
    expect(cells.D12.v).toBe('CTK-1')
    expect(cells.I12.v).toBe('测试备注')
    expect(parseDomesticQuotationWorkbook(bytes).lines[0]).toMatchObject({ application: '', ctkMpn: 'CTK-1', customerMaterialName: '客户专用名称', packageName: 'SOT-23', unit: 'KPCS', minPackCount: 3, originalPriceRmb: 1.3, remark: '测试备注' })
    expect(parseDomesticQuotationWorkbook(bytes)).toMatchObject({ customerStyle: 'EMS', customerAddress: '测试地址', customerPhone: '010-12345678', contact: '测试联系人', quoteDate: '2026-10-13' })
    expect(() => parseQuotationWorkbook(bytes)).toThrow('内贸销售报价单')
  })

  it('旧版带单位列模板仍保留品牌并按PCS换算', () => {
    const bytes = buildDomesticQuotationTemplateWorkbook(template, header, [line])
    const book = XLSX.read(bytes, { type: 'buffer' })
    const oldRows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1, defval: null })
    oldRows[10] = ['序号','品号','品名','型号','封装','单位','含税单价（元/PCS）','最小包装数（PCS）','品牌']
    oldRows[11] = [1,'1405001900','CTK名称','CTK-1','SOT-23','PCS',0.068,3000,'CTK']
    for (let row = 12; row <= 25; row++) oldRows[row] = []
    book.Sheets[book.SheetNames[0]] = XLSX.utils.aoa_to_sheet(oldRows)
    const parsed = parseDomesticQuotationWorkbook(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }))
    expect(parsed.lines[0]).toMatchObject({ manufacturer: 'CTK', unit: 'KPCS', originalPriceRmb: 68, minPackCount: 3 })
  })

  it('导出保留签名栏但不再输出重复姓名、星号和联系方式', () => {
    const cells = sheet(buildDomesticQuotationTemplateWorkbook(template, { ...header, salesperson_name: '测试制表人', salesperson_phone: '测试手机', salesperson_email: 'test@example.invalid' }, [line]))
    expect(cells.A21.v).toContain('制表：测试制表人')
    expect(cells.A21.v).not.toContain('测试联系人')
    expect(cells.A9.v).toContain('测试联系人')
    expect(cells.A21.v).toContain('客户回签')
    for (let row = 23; row <= 27; row++) for (const column of 'ABCDEFGHI') expect(cells[`${column}${row}`]?.v ?? '').toBe('')
  })

  it('下载模板清空全部九列样张且保留图片和 A:I 打印范围', () => {
    const blank = buildDomesticQuotationTemplateWorkbook(template, {}, [], { blank: true })
    const cells = sheet(blank)
    expect(Object.values(cells).filter(cell => cell && typeof cell === 'object' && String(cell.v || '').startsWith('单位'))).toHaveLength(0)
    for (let row = 12; row <= 16; row++) for (const column of 'ABCDEFGHI') expect(cells[`${column}${row}`]?.v ?? '').toBe('')
    const files = unzipSync(blank)
    expect(new TextDecoder().decode(files['xl/workbook.xml'])).toContain('$I$31')
    const original = unzipSync(template)
    for (const name of Object.keys(original).filter(name => name.startsWith('xl/media/') || name.startsWith('xl/drawings/'))) expect(files[name]).toEqual(original[name])
  })

  it('无最小包装数保持空值，非法包装数上传被拒绝', () => {
    for (const count of [null, 0, -1, 0.0000001]) {
      const bytes = buildDomesticQuotationTemplateWorkbook(template, header, [{ ...line, min_pack_count: count }])
      if (count == null) expect(parseDomesticQuotationWorkbook(bytes).lines[0].minPackCount).toBeNull()
      else expect(() => parseDomesticQuotationWorkbook(bytes)).toThrow('最小包装数必须为正数')
    }
  })

  it('15行明细完整往返，页脚不当成产品行', () => {
    const lines = Array.from({ length: 15 }, (_, index) => ({ ...line, line_no: index + 1, ctk_mpn: `CTK-${index + 1}` }))
    const parsed = parseDomesticQuotationWorkbook(buildDomesticQuotationTemplateWorkbook(template, header, lines))
    expect(parsed.lines).toHaveLength(15)
    expect(parsed.lines[14].ctkMpn).toBe('CTK-15')
  })

  it('模板默认现金，修改收款方式和客户应用后导出重导入一致', () => {
    const blank = sheet(buildDomesticQuotationTemplateWorkbook(template, {}, [], { blank: true }))
    expect(blank.H6.v).toBe('现金')
    expect(blank.H7?.v || '').toBe('')
    expect(blank.A20.v).toContain('现金')
    const bytes = buildDomesticQuotationTemplateWorkbook(template, { ...header, payment_term: '月结30天', customer_application: '电源' }, [line])
    expect(parseDomesticQuotationWorkbook(bytes)).toMatchObject({ paymentTerm: '月结30天', customerApplication: '电源' })
    expect(sheet(bytes).A16.v).toContain('月结30天')
    expect(parseDomesticQuotationWorkbook(bytes).lines[0].customerMaterialName).toBe('客户专用名称')
  })

  it.each(['', '错误性质'])('新模板客户性质无效时拒绝导入：%s', (customerStyle) => {
    const bytes = buildDomesticQuotationTemplateWorkbook(template, header, [line])
    const book = XLSX.read(bytes, { type: 'buffer' })
    book.Sheets[book.SheetNames[0]].H8 = { t: 's', v: customerStyle }
    expect(() => parseDomesticQuotationWorkbook(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }))).toThrow('客户性质')
  })

  it('选择金蝶物料带出最小包装数，无值物料允许空白手填且不会沿用上一物料的数值', () => {
    const options = [mapDomesticMaterialOption({ name: 'CTK-1', spec: 'SOT-23(6R)/3K盘/无/A4', minPackCount: 1 }), mapDomesticMaterialOption({ name: 'CTK-2', minPackCount: null })]
    expect(resolveDomesticMaterialSelection('CTK-1', options).minPackCount).toBe('3000')
    expect(resolveDomesticMaterialSelection('CTK-2', options).minPackCount).toBe('')
    expect(resolveDomesticMaterialSelection('手输型号', options).minPackCount).toBe('')
  })
})
