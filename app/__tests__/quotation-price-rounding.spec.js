import * as XLSX from 'xlsx/xlsx.mjs'
import { describe, expect, it } from 'vitest'
import { applyQuotationGridEdit, buildQuotationGridSource, computeQuotationUsdPc, parseQuotationPaste } from '@ctk-system/shared'
import { parseQuotationWorkbook } from '../../server/utils/quotation-parser.ts'

// 用户口径（2026-09-14）：人民币/美元单价一律保留两位小数，显示与保存同口径。
// 这些用例锁三处价格归一化入口，任一处退回 4 位小数都会红。
function workbookBytes(rows) {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), '9-14')
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
}

const HEADER_ROWS = [
  ['S/N', 'Quote to', 'End User', 'Applicaiton', 'Manufacturer', 'Desprition', 'Qty', 'Unit', 'CTK MPN', 'Package', 'Die Size', 'SPQ/Reel', 'Price/RMB KPCS', 'Price/USD KPCS', 'Datasheet'],
  ['序列', '客户', '终端客户', '应用', '友商', '产品描述', '数量', '单位', 'CTK 型号', '封装', '芯片大小', '(pcs)', '单价（元）', '单价（美元）', '规格书'],
]

describe('quotation price keeps two decimals', () => {
  it('rounds pasted prices to two decimals', () => {
    const rows = parseQuotationPaste([
      ...HEADER_ROWS,
      ['1', '客户A', '终端A', '应用A', '友商A', '产品A', '500', 'kpcs', 'SMF36CA', 'SOD-123FL', 'Standard', '3000', '54', '12.4444', 'spec.pdf'],
    ].map((row) => row.join('\t')).join('\n'))

    expect(rows[0].originalPriceRmb).toBe(54)
    // 旧模板没有汇率列：美元价算不出来（不再采信粘贴/表格里的美元列）
    expect(rows[0].originalPriceUsd).toBeNull()
  })

  it('rounds a hand-typed grid price to two decimals and the rate to four', () => {
    const lines = [{ lineNo: 1, ctkMpn: 'SMF36CA' }]

    expect(applyQuotationGridEdit(lines, { rowIndex: 0, prop: 'originalPriceRmb', val: '12.4444' })[0].originalPriceRmb).toBe(12.44)
    // 汇率四位小数：7.123456 手输进网格后落 7.1235
    expect(applyQuotationGridEdit(lines, { rowIndex: 0, prop: 'rate', val: '7.123456' })[0].rate).toBe(7.1235)
    // 数量不是单价，不参与两位小数归一
    expect(applyQuotationGridEdit(lines, { rowIndex: 0, prop: 'qty', val: '12.4444' })[0].qty).toBe(12.4444)
  })

  // 美元价不再手填：工作簿里由「人民币单价 ÷ 汇率」算出（旧模板没有汇率列 => null）。
  const V2_HEADER_ROWS = [
    ['S/N', 'Quote Date', 'Country', 'Style', 'Quote to', 'End User', 'Applicaiton', 'Manufacturer',
      'MPN', 'Qty', 'Unit', 'CTK MPN', 'Package', 'Die Size', 'SPQ/Reel',
      'Price/RMB', 'Rate', 'Price/USD KPCS', 'Price/USD PC', 'L/T', 'Datasheet', 'Remark'],
    ['序列', '报价日期', '国家', '客户性质', '客户', '终端客户', '应用', '友商', '友商型号', '数量', '单位',
      'CTK 型号', '封装', '芯片大小', '(pcs)', '单价（元）', '汇率', '千只单价（美元）', '1只单价（美元）',
      '交期', '规格书', '备注'],
  ]

  it('derives the workbook USD price from the RMB price and the rate', () => {
    const legacy = parseQuotationWorkbook(workbookBytes([
      ['Quotation Sheet'],
      ...HEADER_ROWS,
      [1, '客户A', '终端A', '应用A', '友商A', '产品A', 500, 'kpcs', 'SMF36CA', 'SOD-123FL', 'Standard', '3000', 54, 12.4444, 'spec.pdf'],
    ]), '报价单.xlsx')

    expect(legacy.lines[0].originalPriceRmb).toBe(54)
    expect(legacy.lines[0].originalPriceUsd).toBeNull()

    const v2 = parseQuotationWorkbook(workbookBytes([
      ['Quotation Sheet'],
      ...V2_HEADER_ROWS,
      [1, null, '印度', '分销商', '客户A', '终端A', '应用A', '友商A', 'MPN-A', 500, 'kpcs', 'SMF36CA',
        'SOD-123FL', 'Standard', '3000', 54, 7.2, null, null, '30days', 'spec.pdf', null],
    ]), '报价单.xlsx')

    expect(v2.lines[0].originalPriceRmb).toBe(54)
    expect(v2.lines[0].rate).toBe(7.2)
    expect(v2.lines[0].originalPriceUsd).toBe(7.5)
  })

  it('rounds half values up instead of dropping them to the lower cent', () => {
    const rows = parseQuotationPaste([
      ...HEADER_ROWS,
      ['1', '客户A', '终端A', '应用A', '友商A', '产品A', '1', 'pcs', 'CTK-001', 'SOT23', '1x1', '1', '0.615', '0.615', ''],
    ].map((row) => row.join('\t')).join('\n'))

    expect(rows[0].originalPriceRmb).toBe(0.62)
    expect(rows[0].originalPriceUsd).toBeNull()
  })

  // 表格里看到的就是两位：老单据库里的 4 位小数也按两位渲染，整数也补 .00。
  // displayPrice* 只表示「成交价」（终审通过时冻结的 finalPrice*），未通过时为空。
  it('renders grid rows with two-decimal prices, including the readonly display columns', () => {
    const [line] = buildQuotationGridSource([{
      lineNo: 1,
      qty: 500,
      originalPriceRmb: 54,
      originalPriceUsd: 12.4444,
      finalPriceRmb: 52.005,
    }])

    expect(line.originalPriceRmb).toBe('54.00')
    expect(line.originalPriceUsd).toBe('12.44')
    expect(line.displayPriceRmb).toBe('52.01')
    // 没有成交价就不显示，不回退成业务员报价（否则两列会显示同一个数）
    expect(line.displayPriceUsd).toBe('')
    // 数量不参与单价两位小数归一
    expect(line.qty).toBe(500)
  })

  // 只读美元列由「人民币单价 ÷ 汇率」实时算出（千只价两位、1只价五位）
  it('derives the readonly USD columns from the RMB price and the rate', () => {
    const [line] = buildQuotationGridSource([{ lineNo: 1, originalPriceRmb: 54, rate: 7.2 }])

    expect(line.usdKpcs).toBe('7.50')
    expect(line.usdPc).toBe('0.00750')
    expect(line.rate).toBe(7.2)
  })

  // 1只美元价保留五位小数（2026-09-24 口径）：第 5 位是真实值（1.75/1000 = 0.00175），
  // 四位小数会把它截成 0.0018，任一处退回四位都会红。
  it('keeps five decimals for the 1-pc USD price', () => {
    const [line] = buildQuotationGridSource([{ lineNo: 1, originalPriceRmb: 12.4444, rate: 7.1 }])

    expect(line.usdKpcs).toBe('1.75')
    expect(line.usdPc).toBe('0.00175')
  })

  // 汇率没填时千只美元价算不出来（null），1只美元价必须跟着是 null，
  // 不能因为 Number(null) === 0 就显示成 0.0000 —— 那看着像「已经算过了」，
  // 服务端 computeUsdPricePc 也是「usd 为空就为空」的同一口径。
  it('keeps the 1-pc USD price empty when the K-pcs price cannot be computed', () => {
    expect(computeQuotationUsdPc(null)).toBe(null)
    expect(computeQuotationUsdPc(undefined)).toBe(null)
    expect(computeQuotationUsdPc('')).toBe(null)
    expect(computeQuotationUsdPc(0)).toBe(0)

    const [noRate] = buildQuotationGridSource([{ lineNo: 1, originalPriceRmb: 54 }])
    expect(noRate.usdKpcs).toBe('')
    expect(noRate.usdPc).toBe('')
  })

  // 表格里改过的单价回到数据层仍是数字两位小数，提交时不会把 '54.00' 当文本存进去
  it('keeps grid edits numeric after the display formatting', () => {
    const [line] = buildQuotationGridSource([{ lineNo: 1, originalPriceRmb: '54.00', qty: 500 }])

    const nextLines = applyQuotationGridEdit([line], { rowIndex: 0, prop: 'originalPriceRmb', val: '55.005' })

    expect(nextLines[0].originalPriceRmb).toBe(55.01)
    expect(buildQuotationGridSource(nextLines)[0].originalPriceRmb).toBe('55.01')
  })
})
