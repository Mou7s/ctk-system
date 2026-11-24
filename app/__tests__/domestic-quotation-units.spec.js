import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx/xlsx.mjs'
import { readFileSync } from 'node:fs'
import { domesticPriceToKpcs, pcsToKpcs, domesticPriceToPcs, domesticPackToPcs, domesticLineToPcs, domesticReviewPriceToStored } from '../packages/shared/domesticQuotationUnits.js'
import { blankDomesticQuotationLine, hasDomesticQuotationLineData, mapDomesticMaterialOption, resolveDomesticMaterialSelection } from '../packages/ui/domesticQuotationGrid.js'
import { parseDomesticQuotationWorkbook } from '../../server/utils/quotation-parser.ts'
import { buildDomesticQuotationTemplateWorkbook } from '../../server/utils/quotation.ts'
import { monthlyQuotationPeriod, renderMonthlyQuotationExcel } from '../../server/utils/domestic-quotation-monthly.ts'

describe('内贸KPCS换算和未知单位保护', () => {
  it('旧版包装在前的模板继续按原表头导出，不错放价格和包装数', () => {
    const book = XLSX.read(readFileSync('server/templates/内贸销售报价单模板.xlsx'), { type: 'buffer' })
    const oldSheet = book.Sheets[book.SheetNames[0]]
    ;[oldSheet.G11, oldSheet.H11] = [oldSheet.H11, oldSheet.G11]
    for (let row = 12; row <= 26; row++) {
      for (const column of 'ABCDEFGHI') oldSheet[`${column}${row}`] ||= { t: 's', v: '' }
    }
    const oldTemplate = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' })
    const bytes = buildDomesticQuotationTemplateWorkbook(oldTemplate, { customer_name: '测试客户', customer_style: '终端' }, [{ line_no: 1, unit: 'KPCS', ctk_mpn: 'CTK-1', original_price_rmb: 68, min_pack_count: 3 }])
    const output = XLSX.read(bytes, { type: 'buffer' })
    const sheet = output.Sheets[output.SheetNames[0]]
    expect(sheet.G12.v).toBe(3000)
    expect(sheet.H12.v).toBe(0.068)
    expect(parseDomesticQuotationWorkbook(bytes).lines[0]).toMatchObject({ minPackCount: 3, originalPriceRmb: 68 })
  })

  it('PCS显示与审核回存按已知原单位换算，重复打开不会重复缩放', () => {
    const stored = { unit: 'KPCS', minPackCount: 3, originalPriceRmb: 68, initialPriceRmb: 65, finalPriceRmb: 60 }
    const displayed = domesticLineToPcs(stored)
    expect(displayed).toMatchObject({ unit: 'PCS', sourceUnit: 'KPCS', minPackCount: 3000, originalPriceRmb: 0.068, initialPriceRmb: 0.065, finalPriceRmb: 0.06 })
    expect(domesticLineToPcs(displayed)).toEqual(displayed)
    expect(domesticPriceToKpcs(0.068, 'PCS')).toBe(68)
    expect(domesticReviewPriceToStored(0.065, 'KPCS')).toBe(65)
    expect(domesticReviewPriceToStored(0.065, 'PCS')).toBe(0.065)
    expect(domesticReviewPriceToStored(0.065, '')).toBeNull()
    expect(domesticPriceToPcs(0.068, 'PCS')).toBe(0.068)
    expect(domesticPackToPcs(3000, 'PCS')).toBe(3000)
    expect(domesticLineToPcs({ unit: '', originalPriceRmb: 920, minPackCount: 1 })).toMatchObject({ unit: '', originalPriceRmb: 920, minPackCount: 1 })
  })

  it('新版PCS模板导出旧KPCS数据后导入保留原始计价金额和包装量', () => {
    const template = readFileSync('server/templates/内贸销售报价单模板.xlsx')
    const bytes = buildDomesticQuotationTemplateWorkbook(template, { customer_name: '测试客户', customer_style: '终端' }, [{ line_no: 1, unit: 'KPCS', ctk_mpn: 'CTK-1', original_price_rmb: 68, min_pack_count: 3 }])
    const workbook = XLSX.read(bytes, { type: 'buffer' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    expect(sheet.H12.v).toBe(3000)
    expect(sheet.G12.v).toBe(0.068)
    expect(sheet.G12.z || '').not.toBe('0.00')
    expect(parseDomesticQuotationWorkbook(bytes).lines[0]).toMatchObject({ unit: 'KPCS', originalPriceRmb: 68, minPackCount: 3 })
  })
  it('默认PCS占位行仍为空行，不会占满15行明细', () => {
    const line = blankDomesticQuotationLine()
    expect(line.unit).toBe('PCS')
    expect(hasDomesticQuotationLineData(line)).toBe(false)
    expect(hasDomesticQuotationLineData({ ...line, ctkMpn: 'CTK-1' })).toBe(true)
  })
  it('PCS先放大再舍入，K及KPCS单价不再次放大', () => {
    expect(domesticPriceToKpcs('0.068', 'PCS')).toBe(68)
    expect(domesticPriceToKpcs(920, 'K')).toBe(920)
    expect(domesticPriceToKpcs(920, 'KPCS')).toBe(920)
    expect(pcsToKpcs(500)).toBe(0.5)
  })
  it('金蝶包装数只换算一次，选中已映射对象不会再次除1000', () => {
    const option = mapDomesticMaterialOption({ name: 'CTK-1', spec: 'SOD-123/0.5K盘/无', minPackCount: 1 })
    expect(option.minPackCount).toBe('500')
    expect(resolveDomesticMaterialSelection(option).minPackCount).toBe('500')
  })
  it('旧PCS模板导入换算单价和包装数', () => {
    const book = XLSX.utils.book_new()
    const data = [['内贸报价单'], [], [], [], [], ['客户：测试客户'], ['联系人：测试'], [],
      ['序号', 'CTK物料名称', '客户物料名称', '型号', '封装', '单位', '最小包装数', '含税单价', '备注'],
      [1, '品名', '', 'CTK-1', 'SOT-23', 'PCS', 500, 0.068, '']]
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(data), '报价单')
    const parsed = parseDomesticQuotationWorkbook(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }))
    expect(parsed.lines[0]).toMatchObject({ unit: 'KPCS', minPackCount: 0.5, originalPriceRmb: 68 })
    book.Sheets['报价单'].F10 = { t: 's', v: '' }
    expect(() => parseDomesticQuotationWorkbook(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }))).toThrow('计价单位缺失')
  })
  it('历史空单位可下载，保留原价包装数并明确标记，已知PCS仍正确换算', () => {
    const template = readFileSync('server/templates/内贸销售报价单模板.xlsx')
    const bytes = buildDomesticQuotationTemplateWorkbook(template, { customer_name: '回归客户' }, [
      { line_no: 1, unit: '', ctk_mpn: 'CTK-1', original_price_rmb: 920, final_price_rmb: 910, min_pack_count: 1 },
      { line_no: 2, unit: 'PCS', ctk_mpn: 'CTK-2', original_price_rmb: 0.068, min_pack_count: 500 },
    ])
    const book = XLSX.read(bytes, { type: 'buffer' })
    const sheet = book.Sheets[book.SheetNames[0]]
    expect(sheet.G12.v).toBe(910)
    expect(sheet.H12.v).toBe(1)
    expect(sheet.G13.v).toBe(0.068)
    expect(sheet.H13.v).toBe(500)
    expect(sheet.H11.v).not.toContain('KPCS')
    expect(sheet.G11.v).not.toContain('KPCS')
    expect(sheet.A15.v).toContain('单位未确认')
    expect(() => parseDomesticQuotationWorkbook(bytes)).toThrow('计价单位')
  })
  it('月结财务汇总保留未知原值并标记待核对，已知PCS才换算', () => {
    const rows = [{ id: 1, report_line_no: 1, report_unit: '', report_price: 920, report_min_pack: 1 }, { id: 2, report_line_no: 1, report_unit: 'PCS', report_price: 0.068, report_min_pack: 500 }]
    const book = XLSX.read(renderMonthlyQuotationExcel(rows, monthlyQuotationPeriod(new Date('2026-10-20T00:00:00Z'))), { type: 'buffer' })
    const sheet = book.Sheets['报价明细']
    expect(sheet.L4.v).toBe('待核对')
    expect(sheet.N4.v).toBe(920)
    expect(sheet.P4.v).toContain('保留原值')
    expect(sheet.L5.v).toBe('PCS')
    expect(sheet.M5.v).toBe(500)
    expect(sheet.N5.v).toBe(0.068)
  })
})
