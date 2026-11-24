import { describe, expect, it } from 'vitest'
import {
  QUOTATION_VALIDITY_OPTIONS,
  QUOTATION_VALIDITY_PATTERN_SOURCE,
  QUOTATION_VALIDITY_UNIT,
  isQuotationValidityOption,
  normalizeQuotationValidity,
} from '@ctk-system/shared'
import { buildQuotationTermsLine } from '../../server/utils/quotation.ts'
import { extractQuotationValidity, normalizeQuotationValidity as serverNormalize } from '../../server/utils/quotation-validity.ts'

/**
 * 有效期（2026-09-18 用户口径：多加几种档位，并保证导出 Excel 同步）。
 *
 * 「同步」在这里是可验证的三段链路：
 *   页面选值 → 导出时拼进 A6 那句 `Quotation Valid: <n>days` → 再上传时能被解析器读回同一个值。
 * 模板那句话里只有 days 的位置，所以档位一律是 <n>days；手输的周/月/纯数字/中文「天」折算成天数。
 */

describe('有效期档位', () => {
  it('都是 <n>days 形式，且按天数升序（模板那句只认天数）', () => {
    expect(QUOTATION_VALIDITY_OPTIONS.length).toBeGreaterThanOrEqual(6)
    for (const option of QUOTATION_VALIDITY_OPTIONS) {
      expect(option).toMatch(/^\d+days$/)
      expect(isQuotationValidityOption(option)).toBe(true)
    }
    const days = QUOTATION_VALIDITY_OPTIONS.map((option) => Number(option.replace('days', '')))
    expect([...days].sort((a, b) => a - b)).toEqual(days)
    expect(new Set(QUOTATION_VALIDITY_OPTIONS).size).toBe(QUOTATION_VALIDITY_OPTIONS.length)
    // 原来只有 7/30 两项，常用的 15/60/90 也得在
    for (const option of ['7days', '15days', '30days', '60days', '90days']) {
      expect(QUOTATION_VALIDITY_OPTIONS).toContain(option)
    }
    expect(isQuotationValidityOption('45 days')).toBe(false)
  })
})

describe('有效期归一（导出用）', () => {
  it('纯数字 / 各种天数写法统一成 <n>days', () => {
    expect(normalizeQuotationValidity('60')).toBe('60days')
    expect(normalizeQuotationValidity('60days')).toBe('60days')
    expect(normalizeQuotationValidity('60 days')).toBe('60days')
    expect(normalizeQuotationValidity('60DAY')).toBe('60days')
    expect(normalizeQuotationValidity('60天')).toBe('60days')
  })

  it('周 / 月折算成天数（1 周 = 7 天，1 月 = 30 天）', () => {
    expect(normalizeQuotationValidity('2weeks')).toBe('14days')
    expect(normalizeQuotationValidity('2周')).toBe('14days')
    expect(normalizeQuotationValidity('3months')).toBe('90days')
    expect(normalizeQuotationValidity('1个月')).toBe('30days')
  })

  it('认不出的写法原样保留，不硬拼 days', () => {
    expect(normalizeQuotationValidity('永久')).toBe('永久')
    expect(normalizeQuotationValidity('面谈')).toBe('面谈')
    expect(normalizeQuotationValidity('')).toBe('')
    expect(normalizeQuotationValidity(null)).toBe('')
  })

  it('客户端与服务端同一份实现（对拍）', () => {
    const samples = ['', null, '60', '60days', '60 days', '2weeks', '3months', '永久', '180天']
    for (const sample of samples) {
      expect(serverNormalize(sample)).toBe(normalizeQuotationValidity(sample))
    }
  })
})

describe('有效期导出 → 再上传读回来（同步）', () => {
  it('每个档位导出的那句话都能被解析器读回原值', () => {
    for (const option of QUOTATION_VALIDITY_OPTIONS) {
      const line = buildQuotationTermsLine({ validity: option, customer_name: '深圳市测试客户' })
      expect(line).toContain(`Quotation Valid: ${option}`)
      expect(extractQuotationValidity(line)).toBe(option)
      // 页面预览解析用的是同一份正则
      const previewMatch = new RegExp(QUOTATION_VALIDITY_PATTERN_SOURCE, 'i').exec(line)
      expect(previewMatch ? `${previewMatch[1]}${QUOTATION_VALIDITY_UNIT}` : '').toBe(option)
    }
  })

  it('手输的纯数字/周/月导出后也能读回折算后的天数', () => {
    expect(extractQuotationValidity(buildQuotationTermsLine({ validity: '60' }))).toBe('60days')
    expect(extractQuotationValidity(buildQuotationTermsLine({ validity: '2weeks' }))).toBe('14days')
    expect(extractQuotationValidity(buildQuotationTermsLine({ validity: '3months' }))).toBe('90days')
  })

  it('空白模板仍是占位符 + days，不会因为归一逻辑变成空', () => {
    const blank = buildQuotationTermsLine({}, { blank: true })
    expect(blank).toContain('Quotation Valid:')
    expect(blank).toMatch(/Quotation Valid:\s*\S+\s*days/u)
    expect(extractQuotationValidity(blank)).toBe('')
  })

  it('认不出的写法不会写出「永久 days」这种句子', () => {
    const line = buildQuotationTermsLine({ validity: '永久' })
    expect(line).toContain('Quotation Valid: 永久')
    expect(line).not.toContain('永久 days')
  })
})
