import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 2026-09-22 拆封装：日期范围/单日选择直接用原生 UPopover + UCalendar（range 是 UCalendar 原生 prop），
 * 项目级封装组件 TkDatePicker / TkDateRangePicker 已删除，不许回归。
 */

const RANGE_SITES = [
  'app/components/tk_custom/KingdeeStockDocumentPage.vue',
  'app/pages/monitor/operlog/index.vue',
  'app/pages/monitor/job/log.vue',
  'app/pages/tk_custom/exception/index.vue',
  'app/pages/monitor/logininfor/index.vue',
  'app/pages/system/config/index.vue',
  'app/pages/tk_custom/attendance/index.vue',
  'app/pages/tk_custom/sampleProgress/index.vue',
  'app/pages/tk_custom/salesPriceTrend/index.vue',
  'app/pages/system/dict/index.vue',
  'app/pages/system/user/index.vue',
  'app/pages/tk_custom/productionOrder/index.vue',
  'app/pages/tk_custom/processYield/index.vue',
  'app/pages/system/role/index.vue',
  'app/pages/tk_custom/quotation/index.vue',
  'app/packages/ui/TkEditableCell.vue',
  'app/packages/ui/TkQuotationAnalysis.vue',
]

function sourceOf(rel) {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

describe('日期选择拆封装：原生 UCalendar，TkDate* 不回归', () => {
  for (const rel of RANGE_SITES) {
    it(`${rel} 用原生 UCalendar 且不再引用 TkDate 封装`, () => {
      const source = sourceOf(rel)
      expect(source).not.toContain('TkDateRangePicker')
      expect(source).not.toContain('TkDatePicker')
      expect(source).toMatch(/<UCalendar\b/)
    })
  }

  it('报价列表和共享分析保留两处原生范围日历', () => {
    const quotation = sourceOf('app/pages/tk_custom/quotation/index.vue') + sourceOf('app/packages/ui/TkQuotationAnalysis.vue')
    const rangeTags = (quotation.match(/<UCalendar[^>]*>/g) || []).filter((tag) => /\brange\b/.test(tag))
    expect(rangeTags).toHaveLength(2)
    for (const rel of RANGE_SITES.slice(0, 15)) {
      expect(sourceOf(rel)).toMatch(/<UCalendar\b[^>]*\brange\b/)
    }
  })

  it('两个封装组件文件已删除', () => {
    expect(existsSync(resolve(process.cwd(), 'app/packages/ui/TkDateRangePicker.vue'))).toBe(false)
    expect(existsSync(resolve(process.cwd(), 'app/packages/ui/TkDatePicker.vue'))).toBe(false)
  })

  it('共享转换层 dateRange.js 就位（纯函数，不封装组件）', () => {
    const source = sourceOf('app/packages/shared/dateRange.js')
    expect(source).toContain('DATE_RANGE_PRESETS')
    expect(source).toContain('rangeArrayToCalendar')
    expect(source).toContain('calendarToArray')
  })

  it('反向断言：把 TkDateRangePicker 写回引用必须被上面的 toContain 抓到', () => {
    const fake = '<template><TkDateRangePicker v-model="d" /></template>'
    expect(fake).toContain('TkDateRangePicker')
    const wroteBack = fake.includes('TkDateRangePicker')
    expect(wroteBack).toBe(true)
  })
})
