import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CalendarDate } from '@internationalized/date'
import { describe, expect, it } from 'vitest'
import {
  DATE_RANGE_PRESETS,
  calendarToArray,
  isPresetSelected,
  presetToArray,
  rangeArrayToCalendar,
  rangeDisplayText,
} from '../packages/shared/dateRange'

const MIGRATED_SITES = [
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
  'app/pages/tk_custom/domesticQuotation/index.vue',
  'app/pages/tk_custom/wecomAttendance/index.vue',
  'app/pages/tk_custom/pic/index.vue',
  'app/packages/ui/TkQuotationAnalysis.vue',
]

function sourceOf(rel) {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

describe('统一日期范围选择组件 TkDateRangePicker 与 dateRange 工具', () => {
  it('TkDateRangePicker.vue 存在、封装原生 UPopover + UCalendar range 并从 ui 包导出', () => {
    const pickerPath = resolve(process.cwd(), 'app/packages/ui/TkDateRangePicker.vue')
    expect(existsSync(pickerPath)).toBe(true)
    const pickerSource = sourceOf('app/packages/ui/TkDateRangePicker.vue')
    expect(pickerSource).toContain('<UPopover')
    expect(pickerSource).toMatch(/<UCalendar\b[^>]*\brange\b/)
    const uiIndex = sourceOf('app/packages/ui/index.js')
    expect(uiIndex).toContain('TkDateRangePicker')
  })

  for (const rel of MIGRATED_SITES) {
    it(`${rel} 使用统一 TkDateRangePicker，不再复制范围日历或退回原生 date input`, () => {
      const source = sourceOf(rel)
      const template = source.slice(0, source.indexOf('<script'))
      expect(template).toContain('<TkDateRangePicker')
      expect(template.match(/<UCalendar\b[^>]*\brange\b/g) || []).toHaveLength(0)
      expect(template.match(/type="date"/g) || []).toHaveLength(0)
    })
  }

  it('DATE_RANGE_PRESETS 顺序包含 今天 / 近7天 / 近30天 / 本月 / 上月', () => {
    expect(DATE_RANGE_PRESETS.map((p) => p.label)).toEqual(['今天', '近7天', '近30天', '本月', '上月'])
  })

  it('presetToArray 与 isPresetSelected 准确计算「上月」（含跨年、平闰年二月及 datetime 口径）', () => {
    const lastMonthPreset = DATE_RANGE_PRESETS.find((p) => p.label === '上月')
    expect(lastMonthPreset).toBeTruthy()

    const novRef = new CalendarDate(2026, 11, 19)
    expect(presetToArray(lastMonthPreset, 'date', novRef)).toEqual(['2026-10-01', '2026-10-31'])
    expect(isPresetSelected(['2026-10-01', '2026-10-31'], lastMonthPreset, 'date', novRef)).toBe(true)
    expect(isPresetSelected(['2026-10-01', '2026-10-30'], lastMonthPreset, 'date', novRef)).toBe(false)

    // 跨年：2026-01 -> 2025-12
    const janRef = new CalendarDate(2026, 1, 15)
    expect(presetToArray(lastMonthPreset, 'date', janRef)).toEqual(['2025-12-01', '2025-12-31'])

    // 闰年 2 月：2024-03 -> 2024-02-01..2024-02-29
    const leapRef = new CalendarDate(2024, 3, 10)
    expect(presetToArray(lastMonthPreset, 'date', leapRef)).toEqual(['2024-02-01', '2024-02-29'])

    // 平年 2 月：2026-03 -> 2026-02-01..2026-02-28
    const nonLeapRef = new CalendarDate(2026, 3, 10)
    expect(presetToArray(lastMonthPreset, 'date', nonLeapRef)).toEqual(['2026-02-01', '2026-02-28'])

    // datetime 口径
    expect(presetToArray(lastMonthPreset, 'datetime', novRef)).toEqual([
      '2026-10-01 00:00:00',
      '2026-10-31 23:59:59',
    ])
    expect(
      isPresetSelected(['2026-10-01 00:00:00', '2026-10-31 23:59:59'], lastMonthPreset, 'datetime', novRef),
    ).toBe(true)
  })

  it('日期转换辅助函数保持原有输入输出契约', () => {
    const range = rangeArrayToCalendar(['2026-11-01', '2026-11-19'])
    expect(range?.start?.toString()).toBe('2026-11-01')
    expect(range?.end?.toString()).toBe('2026-11-19')
    expect(calendarToArray(range, 'date')).toEqual(['2026-11-01', '2026-11-19'])
    expect(rangeDisplayText(['2026-11-01 00:00:00', '2026-11-19 23:59:59'])).toBe('2026-11-01 ~ 2026-11-19')
  })
})
