import { describe, expect, it } from 'vitest'
import {
  applyQuotationGridEdit,
  buildQuotationGridSource,
  formatQuotationLeadTime,
  normalizeQuotationLeadTime,
  quotationLeadTimeIso,
} from '@ctk-system/shared'

/**
 * 交期列的日期口径（2026-09-18 用户口径）：
 * 模板里交期是「英语(美国)」日期格式（07-Mar-01 = dd-mmm-yy）。
 *   · 页面显示 = dd-mmm-yy（跟 Excel 里看到的一样）
 *   · 落库/提交 = YYYY-MM-DD（服务端 excelDateSerial 只认这个，历史数据也是这个）
 * 文本交期（"30days" / "1-30days"）两边都原样，不能被当成日期。
 */

describe('交期日期：显示用 Excel 格式', () => {
  it('ISO 日期显示成 dd-mmm-yy', () => {
    expect(formatQuotationLeadTime('2026-12-01')).toBe('01-Dec-26')
    expect(formatQuotationLeadTime('2026-03-07')).toBe('07-Mar-26')
    expect(formatQuotationLeadTime('2001-03-07')).toBe('07-Mar-01')
    // 月缩写大写、日和年补零
    expect(formatQuotationLeadTime('2026-01-05')).toBe('05-Jan-26')
  })

  it('文本交期原样，不当日期', () => {
    expect(formatQuotationLeadTime('30days')).toBe('30days')
    expect(formatQuotationLeadTime('1-30days')).toBe('1-30days')
    expect(formatQuotationLeadTime('')).toBe('')
    expect(formatQuotationLeadTime(null)).toBe('')
    // 填 30 表示「30 天」，不是 1900-01-30
    expect(formatQuotationLeadTime(30)).toBe('30')
  })
})

describe('交期日期：落库/提交用 ISO', () => {
  it('各种写法都能回落成 YYYY-MM-DD', () => {
    expect(normalizeQuotationLeadTime('2026-12-01')).toBe('2026-12-01')
    expect(normalizeQuotationLeadTime('01-Dec-26')).toBe('2026-12-01')
    expect(normalizeQuotationLeadTime('1-Dec-2026')).toBe('2026-12-01')
    expect(normalizeQuotationLeadTime('2026/12/1')).toBe('2026-12-01')
    // Excel 序列号（2026-12-01 = 46357；和「30 天」那种小数字要分开）
    expect(normalizeQuotationLeadTime(46357)).toBe('2026-12-01')
    expect(normalizeQuotationLeadTime(new Date(2026, 11, 1))).toBe('2026-12-01')
  })

  it('两位年按 Excel 口径：00-29 → 20xx，30-99 → 19xx', () => {
    expect(quotationLeadTimeIso('01-Dec-26')).toBe('2026-12-01')
    expect(quotationLeadTimeIso('01-Dec-29')).toBe('2029-12-01')
    expect(quotationLeadTimeIso('01-Dec-30')).toBe('1930-12-01')
  })

  it('文本交期与空值原样返回，不硬解释成日期', () => {
    expect(normalizeQuotationLeadTime('30days')).toBe('30days')
    expect(normalizeQuotationLeadTime('1-30days')).toBe('1-30days')
    expect(normalizeQuotationLeadTime('')).toBe('')
    expect(normalizeQuotationLeadTime(null)).toBe('')
    expect(normalizeQuotationLeadTime('待定')).toBe('待定')
    expect(quotationLeadTimeIso('30days')).toBe(null)
  })
})

describe('交期日期：与网格/提交的接线', () => {
  const line = (overrides = {}) => ({ lineNo: 1, qty: 100, originalPriceRmb: 1, rate: 7, ...overrides })

  it('网格里显示 Excel 格式', () => {
    const [displayed] = buildQuotationGridSource([line({ leadTime: '2026-12-01' })])
    expect(displayed.leadTime).toBe('01-Dec-26')
    // 文本交期在网格里也不变
    expect(buildQuotationGridSource([line({ leadTime: '30days' })])[0].leadTime).toBe('30days')
    expect(buildQuotationGridSource([line({ leadTime: '' })])[0].leadTime).toBe('')
  })

  it('在网格里手输/粘贴 dd-mmm-yy 会回落成 ISO（不能把显示文本存进去）', () => {
    const [edited] = applyQuotationGridEdit([line()], { rowIndex: 0, prop: 'leadTime', val: '01-Dec-26' })
    expect(edited.leadTime).toBe('2026-12-01')
    // 文本交期照旧
    const [text] = applyQuotationGridEdit([line()], { rowIndex: 0, prop: 'leadTime', val: '30days' })
    expect(text.leadTime).toBe('30days')
  })
})
