import { describe, expect, it } from 'vitest'
import {
  applyQuotationGridEdit,
  buildQuotationGridSource,
  buildQuotationLineCardModels,
  formatQuotationDate,
  normalizeQuotationDate,
  parseQuotationPaste,
  quotationDateIso,
} from '@ctk-system/shared'

/**
 * 报价日期列的日期口径（2026-09-18 用户口径）：
 * 报价日期在模板 B 列（单元格格式 yyyy-mm-dd）、数据库、导出文件里都是 YYYY-MM-DD，
 * 只有页面网格的单元格是自由输入口 —— 不归一就会出现 2026/9/18、2026.9.8、Excel 序列号，
 * 而服务端 dateOnly 只认 YYYY-MM-DD（第N行报价日期格式必须为YYYY-MM-DD）。
 *   · 页面显示 = YYYY-MM-DD
 *   · 落库/提交 = YYYY-MM-DD
 * 认不出来的写法（"2"、"待定"）原样保留：页面工具条点名 + 提交时按行报错，不悄悄吞掉内容。
 */

describe('报价日期：显示统一 YYYY-MM-DD', () => {
  it('各种日期写法都显示成 YYYY-MM-DD', () => {
    expect(formatQuotationDate('2026-09-18')).toBe('2026-09-18')
    expect(formatQuotationDate('2026/9/18')).toBe('2026-09-18')
    expect(formatQuotationDate('2026.9.8')).toBe('2026-09-08')
    expect(formatQuotationDate('08-Sep-26')).toBe('2026-09-08')
    expect(formatQuotationDate('8-Sep-2026')).toBe('2026-09-08')
    // Excel 序列号（2026-12-01 = 46357）
    expect(formatQuotationDate(46357)).toBe('2026-12-01')
    expect(formatQuotationDate(new Date(2026, 8, 18))).toBe('2026-09-18')
  })

  it('只填年月按 1 号（与粘贴解析同口径）', () => {
    expect(formatQuotationDate('2026-9')).toBe('2026-09-01')
    expect(formatQuotationDate('2026/9')).toBe('2026-09-01')
  })

  it('认不出来的写法原样显示，不当日期解释', () => {
    expect(formatQuotationDate('2')).toBe('2')
    expect(formatQuotationDate('待定')).toBe('待定')
    expect(formatQuotationDate('')).toBe('')
    expect(formatQuotationDate(null)).toBe('')
  })
})

describe('报价日期：落库/提交统一 YYYY-MM-DD', () => {
  it('归一成 ISO，认不出的原样返回', () => {
    expect(normalizeQuotationDate('2026/9/18')).toBe('2026-09-18')
    expect(normalizeQuotationDate('2026.9.8')).toBe('2026-09-08')
    expect(normalizeQuotationDate('08-Sep-26')).toBe('2026-09-08')
    expect(normalizeQuotationDate('46357')).toBe('2026-12-01')
    expect(normalizeQuotationDate('2')).toBe('2')
    expect(normalizeQuotationDate('')).toBe('')
    expect(normalizeQuotationDate(null)).toBe('')
  })

  it('两位年按 Excel 口径：00-29 → 20xx，30-99 → 19xx', () => {
    expect(quotationDateIso('08-Sep-26')).toBe('2026-09-08')
    expect(quotationDateIso('08-Sep-29')).toBe('2029-09-08')
    expect(quotationDateIso('08-Sep-30')).toBe('1930-09-08')
  })

  it('小数字不是日期序列号（填 2 不能被读成 1900-01-02）', () => {
    expect(quotationDateIso('2')).toBe(null)
    expect(quotationDateIso(2)).toBe(null)
    expect(quotationDateIso('30days')).toBe(null)
  })
})

describe('报价日期：与网格/卡片/粘贴的接线', () => {
  const line = (overrides = {}) => ({ lineNo: 1, qty: 100, originalPriceRmb: 1, rate: 7, ...overrides })

  it('网格里显示 YYYY-MM-DD（库里/导出的写法一致）', () => {
    expect(buildQuotationGridSource([line({ quoteDate: '2026/9/18' })])[0].quoteDate).toBe('2026-09-18')
    expect(buildQuotationGridSource([line({ quoteDate: '2026-09-18' })])[0].quoteDate).toBe('2026-09-18')
    expect(buildQuotationGridSource([line({ quoteDate: '' })])[0].quoteDate).toBe('')
    // 认不出来的写法不吞掉，照原样显示（提交时会被点名）
    expect(buildQuotationGridSource([line({ quoteDate: '2' })])[0].quoteDate).toBe('2')
  })

  it('在网格里手输 2026/9/18 会回落成 ISO（不能把斜杠写法存进去）', () => {
    expect(applyQuotationGridEdit([line()], { rowIndex: 0, prop: 'quoteDate', val: '2026/9/18' })[0].quoteDate).toBe('2026-09-18')
    expect(applyQuotationGridEdit([line()], { rowIndex: 0, prop: 'quoteDate', val: '2026.9.8' })[0].quoteDate).toBe('2026-09-08')
    // 认不出来的值不改写，交给提交校验报错
    expect(applyQuotationGridEdit([line()], { rowIndex: 0, prop: 'quoteDate', val: '2' })[0].quoteDate).toBe('2')
  })

  it('手机卡片里「全部字段」的报价日期也是 YYYY-MM-DD', () => {
    const [card] = buildQuotationLineCardModels([line({ quoteDate: '2026/9/18' })])
    const field = card.detailFields.find((item) => item.key === 'quoteDate')
    expect(field.value).toBe('2026-09-18')
    const [empty] = buildQuotationLineCardModels([line({ quoteDate: '' })])
    expect(empty.detailFields.find((item) => item.key === 'quoteDate').value).toBe('未填')
  })

  it('整块粘贴里的报价日期也归一成 ISO', () => {
    const header = '序列\t报价日期\t国家\t客户性质\t客户\t终端客户\t应用\t友商\t友商型号\t数量\tCTK 型号\t封装\t芯片大小\t(pcs)\t单价（元）\t汇率\t千只单价（美元）\t1只单价（美元）\t交期\t规格书\t备注'
    const row = '1\t2026.9.8\t中国\t贸易商\tA客户\t\t\t\t\t100\tTKBAS716\tSMB\t\t\t1.00\t7\t\t\t01-Dec-26\t\t'
    const [pasted] = parseQuotationPaste(`${header}\n${row}`)
    expect(pasted.quoteDate).toBe('2026-09-08')
  })
})
