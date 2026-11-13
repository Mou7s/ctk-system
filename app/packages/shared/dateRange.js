import { CalendarDate, getLocalTimeZone, parseDate, today } from '@internationalized/date'
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import { computed } from 'vue'

/**
 * 日期范围选择共享工具（原生 UPopover + UCalendar range 的数据层）。
 * 只做「字符串数组 ⇄ CalendarDate」转换与快捷预设，不封装任何日期组件。
 */

/** 快捷预设：覆盖 80% 的范围选择 */
export const DATE_RANGE_PRESETS = [
  { label: '今天', days: 0 },
  { label: '近7天', days: 6 },
  { label: '近30天', days: 29 },
  { label: '本月', month: true },
]

function pad(n) {
  return String(n).padStart(2, '0')
}

function dateToYmd(value) {
  if (!value) return ''
  if (typeof value.toString === 'function') {
    const text = value.toString()
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10)
  }
  if (value.year != null && value.month != null && value.day != null) {
    return `${value.year}-${pad(value.month)}-${pad(value.day)}`
  }
  return ''
}

function parseYmd(text) {
  if (text == null || text === '') return null
  if (typeof text !== 'string') {
    const ymd = dateToYmd(text)
    return ymd ? parseYmd(ymd) : null
  }
  const ymd = text.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
  try {
    return parseDate(ymd)
  } catch {
    const [y, m, d] = ymd.split('-').map(Number)
    return new CalendarDate(y, m, d)
  }
}

/** ['YYYY-MM-DD', …] → UCalendar range 的 {start,end}（不完整返回 null） */
export function rangeArrayToCalendar(arr) {
  if (!Array.isArray(arr) || !arr[0] || !arr[1]) return null
  const start = parseYmd(arr[0])
  const end = parseYmd(arr[1])
  if (!start || !end) return null
  return { start, end }
}

/** UCalendar range 的 {start,end} → 字符串数组；valueFormat='datetime' 补 00:00:00 / 23:59:59 */
export function calendarToArray(range, valueFormat = 'date') {
  if (!range?.start || !range?.end) return []
  const start = dateToYmd(range.start)
  const end = dateToYmd(range.end)
  if (!start || !end) return []
  if (valueFormat === 'datetime') return [`${start} 00:00:00`, `${end} 23:59:59`]
  return [start, end]
}

/** 快捷预设 → 字符串数组（口径同 calendarToArray） */
export function presetToArray(preset, valueFormat = 'date') {
  const end = today(getLocalTimeZone())
  let start = end
  if (preset.month) {
    start = new CalendarDate(end.year, end.month, 1)
  } else if (preset.days) {
    start = end.subtract({ days: preset.days })
  }
  return calendarToArray({ start, end }, valueFormat)
}

/** 触发按钮上的显示文本（datetime 口径也只展示日期部分） */
export function rangeDisplayText(arr) {
  if (!arr?.[0] || !arr?.[1]) return ''
  return `${String(arr[0]).slice(0, 10)} ~ ${String(arr[1]).slice(0, 10)}`
}

/** 单日：'YYYY-MM-DD' → CalendarDate（null 安全） */
export function dateStringToCalendar(text) {
  return parseYmd(text)
}

/** 单日：CalendarDate → 'YYYY-MM-DD'（空值返回 null） */
export function calendarToDateString(value) {
  const ymd = dateToYmd(value)
  return ymd || null
}

/** 当前区间是否恰好等于某快捷预设（弹层左栏选中高亮用） */
export function isPresetSelected(arr, preset, valueFormat = 'date') {
  if (!Array.isArray(arr) || !arr[0] || !arr[1]) return false
  const target = presetToArray(preset, valueFormat)
  return arr[0] === target[0] && arr[1] === target[1]
}

/** 日历月数随断点：≥sm 双月，手机单月（官方 date range picker 例子同款） */
export function useCalendarMonths() {
  const isDesktop = useBreakpoints(breakpointsTailwind).greaterOrEqual('sm')
  return computed(() => (isDesktop.value ? 2 : 1))
}
