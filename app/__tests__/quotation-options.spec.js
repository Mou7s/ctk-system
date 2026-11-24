import { describe, expect, it } from 'vitest'
import {
  QUOTATION_COUNTRY_OPTIONS,
  QUOTATION_COUNTRY_SOURCE,
  QUOTATION_CUSTOMER_STYLE_OPTIONS,
  QUOTATION_CUSTOMER_STYLE_SOURCE,
  DEFAULT_QUOTATION_UNIT,
  QUOTATION_OPTION_RULES,
  QUOTATION_UNIT_OPTIONS,
  formatQuotationOptionViolations,
  isQuotationOptionValue,
  quotationOptionViolations,
  quotationSelectSource,
} from '@ctk-system/shared'
import * as serverOptions from '../../server/utils/quotation-options.ts'

// 用户口径（2026-09-16）：国家 / 客户性质 / 单位是选项列 —— 从 Excel 粘贴、文件导入或手输的值
// 必须落在选项内，表里没有的值一律不允许进系统（空值放行）。
describe('quotation line options', () => {
  it('客户性质按给定枚举固定五项（EMS 与品牌商分开，2026-09-17）', () => {
    expect(QUOTATION_CUSTOMER_STYLE_OPTIONS).toEqual(['分销商', '代理商', '终端', 'EMS', '品牌商', '其他'])
  })

  it('国家清单覆盖主要贸易伙伴、无重复', () => {
    for (const name of ['印度', '越南', '泰国', '美国', '德国', '巴西', '澳大利亚', '中国香港', '南非']) {
      expect(QUOTATION_COUNTRY_OPTIONS).toContain(name)
    }
    expect(new Set(QUOTATION_COUNTRY_OPTIONS).size).toBe(QUOTATION_COUNTRY_OPTIONS.length)
    expect(QUOTATION_COUNTRY_OPTIONS.length).toBeGreaterThan(150)
  })

  it('国家 / 客户性质两列受下拉约束（单位列已取消，数量固定 kpcs）', () => {
    expect(QUOTATION_OPTION_RULES.map((rule) => rule.key)).toEqual(['country', 'customerStyle'])
    expect(QUOTATION_UNIT_OPTIONS).toEqual(['pcs', 'kpcs'])
    expect(DEFAULT_QUOTATION_UNIT).toBe('kpcs')
  })

  it('判定非法值：不在清单内的写法违规，空值与非选项列放行', () => {
    expect(isQuotationOptionValue('country', '印度')).toBe(true)
    expect(isQuotationOptionValue('country', '印度X')).toBe(false)
    expect(isQuotationOptionValue('country', 'India')).toBe(false)
    expect(isQuotationOptionValue('country', '')).toBe(true)
    expect(isQuotationOptionValue('customerStyle', '代理商')).toBe(true)
    expect(isQuotationOptionValue('customerStyle', '无效客户性质')).toBe(false)
    // EMS 与品牌商各自合法；合并写法「EMS/品牌商」已废弃，不允许再进系统
    expect(isQuotationOptionValue('customerStyle', 'EMS')).toBe(true)
    expect(isQuotationOptionValue('customerStyle', '品牌商')).toBe(true)
    expect(isQuotationOptionValue('customerStyle', 'EMS/品牌商')).toBe(false)
    // 单位列已取消：unit 不再是选项列，写什么都不拦（入库固定 kpcs）
    expect(isQuotationOptionValue('unit', 'kpos')).toBe(true)
    // 非选项列不受影响
    expect(isQuotationOptionValue('ctkMpn', '任何写法')).toBe(true)
  })

  it('违规片段带行号与列名，提示语说明操作已取消', () => {
    const found = quotationOptionViolations([
      { country: '印度X', customerStyle: '分销商', unit: 'pcs', rowLabel: '第2行' },
      { country: '印度', customerStyle: '无效客户性质', unit: 'kpcs', rowLabel: '第3行' },
    ])

    expect(found).toEqual(['第2行国家「印度X」', '第3行客户性质「无效客户性质」'])
    const message = formatQuotationOptionViolations(found)
    expect(message).toContain('第2行国家「印度X」')
    expect(message).toContain('不在下拉选项内')
    expect(message).toContain('已取消本次操作')
  })

  it('超过三处只列前三处并给出总处数', () => {
    expect(formatQuotationOptionViolations(['a', 'b', 'c', 'd'])).toContain('等 4 处')
  })

  it('下拉 source 用 RevoGrid select 需要的 { label, value } 结构', () => {
    expect(quotationSelectSource(['a'])).toEqual([{ label: 'a', value: 'a' }])
    expect(QUOTATION_CUSTOMER_STYLE_SOURCE.map((item) => item.value)).toEqual(QUOTATION_CUSTOMER_STYLE_OPTIONS)
    expect(QUOTATION_COUNTRY_SOURCE).toHaveLength(QUOTATION_COUNTRY_OPTIONS.length)
  })

  it('两端（前端 shared / 服务端 utils）清单与判定逐项一致', () => {
    expect(QUOTATION_COUNTRY_OPTIONS).toEqual([...serverOptions.QUOTATION_COUNTRY_OPTIONS])
    expect(QUOTATION_CUSTOMER_STYLE_OPTIONS).toEqual([...serverOptions.QUOTATION_CUSTOMER_STYLE_OPTIONS])
    expect(QUOTATION_UNIT_OPTIONS).toEqual([...serverOptions.QUOTATION_UNIT_OPTIONS])

    for (const value of ['印度', '印度X', 'India', '', '分销商', '代理商', '无效客户性质', 'pcs', 'kpos', ' kpcs ']) {
      for (const key of ['country', 'customerStyle', 'unit', 'ctkMpn']) {
        expect(isQuotationOptionValue(key, value), `${key}:${value}`)
          .toBe(serverOptions.isQuotationOptionValue(key, value))
      }
    }
    expect(serverOptions.quotationOptionViolations([{ country: '印度X', rowLabel: '第2行' }]))
      .toEqual(quotationOptionViolations([{ country: '印度X', rowLabel: '第2行' }]))
  })
})
