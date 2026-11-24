import type { Pool, RowDataPacket } from 'mysql2/promise'
import { getMysqlPool, mysqlQueryOptions } from './mysql'
import { loadWecomContactConfig } from './wecom-contacts'

export type AttendanceScope = 'all' | 'workshop' | 'office' | 'guard'

export const FINANCE_GROUP_OPTIONS = [
  '时薪',
  '计件',
  '月薪',
  '月薪加班',
  '月薪11小时',
  '月薪9.5小时',
  '保安',
] as const

export type FinanceGroupOption = (typeof FINANCE_GROUP_OPTIONS)[number]
export type CalendarWorkPolicy = 'five_day' | 'six_day' | 'seven_day'
export type CalendarDayKind = 'workday' | 'weekend' | 'holiday'

export type WecomAttendanceQuery = {
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
  scope?: AttendanceScope
  financeGroup?: string
  keyword?: string
}

export type WecomAttendanceProfileRecord = {
  userid: string
  employeeCode: string
  employeeName: string
  financeGroup: string
  remark: string
}

export type EmployeeAttendanceSummary = {
  userid: string
  employeeCode: string
  name: string
  dept: string
  groupid: number
  groupName: string
  financeGroup: string
  profileRemark: string
  calcMode: '车间工时' | '企微规则'
  shouldAttendDays: number
  regularDays: number
  weekendOvertimeDays: number
  totalAttendDays: number
  attDays: number
  dayShiftDays: number
  nightShiftDays: number
  midShiftDays: number
  regularHours: number
  weekdayOvertimeHours: number
  weekendOvertimeHours: number
  holidayOvertimeHours: number
  overtimeHours: number
  rawStayHours: number
  nightAllowanceCount: number
  nightAllowanceMissCount: number
  lateCount: number
  lateMinutes: number
  late1to10Count: number
  lateOver10Count: number
  earlyCount: number
  earlyMinutes: number
  early1to10Count: number
  earlyOver10Count: number
  personalLeaveHours: number
  sickLeaveHours: number
  unpaidLeaveSummary: string
  unpaidLeaveHours: number
  paidLeaveSummary: string
  paidLeaveHours: number
  leaveSummary: string
  leaveHours: number
  absentDays: number
  bukaCount: number
  anomalyDays: number
}

export type DailyAttendanceRow = {
  userid: string
  employeeCode: string
  name: string
  dept: string
  groupid: number
  groupName: string
  financeGroup: string
  calcMode: '车间工时' | '企微规则'
  date: string
  shiftType: string
  punchCount: number
  punchesText: string
  rawHours: number
  regularHours: number
  weekdayOvertimeHours: number
  weekendOvertimeHours: number
  holidayOvertimeHours: number
  overtimeHours: number
  lateMinutes: number
  earlyMinutes: number
  absentDays: number
  nightAllowance: number
  nightAllowanceNote: string
  leaveText: string
  status: string
}

export type WecomAttendanceReport = {
  meta: {
    startDate: string
    endDate: string
    scope: AttendanceScope
    generatedAt: string
    totalEmployees: number
  }
  summary: {
    employeeCount: number
    workshopCount: number
    officeCount: number
    totalRegularHours: number
    totalWeekdayOvertimeHours: number
    totalWeekendOvertimeHours: number
    totalHolidayOvertimeHours: number
    totalOvertimeHours: number
    totalNightAllowanceCount: number
    totalNightAllowanceMissCount: number
    totalLeaveCount: number
    totalBukaCount: number
    totalAbsentDays: number
    totalAnomalyDays: number
  }
  employees: EmployeeAttendanceSummary[]
  dailyDetails: DailyAttendanceRow[]
  anomalies: DailyAttendanceRow[]
}

const WORKSHOP_GROUP_IDS = new Set([32, 33])
const GUARD_GROUP_IDS = new Set([31])
const DEFAULT_FALLBACK_GROUP_ID = 18
const REQUEST_TIMEOUT_MS = 25_000
const BATCH_USERS = 100
const TZ_OFFSET_MS = 8 * 3600 * 1000 // Asia/Shanghai UTC+8

// 2026–2027 年国家法定 3 倍薪资节假日（含除夕共 13 天/年）
export const STATUTORY_HOLIDAYS = new Set<string>([
  // 2026
  '2026-01-01',
  '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19',
  '2026-04-05',
  '2026-05-01', '2026-05-02',
  '2026-06-19',
  '2026-09-25',
  '2026-10-01', '2026-10-02', '2026-10-03',
  // 2027
  '2027-01-01',
  '2027-02-05', '2027-02-06', '2027-02-07', '2027-02-08',
  '2027-04-05',
  '2027-05-01', '2027-05-02',
  '2027-06-09',
  '2027-09-15',
  '2027-10-01', '2027-10-02', '2027-10-03',
])

// 2026–2027 年国务院调休补班周末
export const MAKEUP_WORKDAYS = new Set<string>([
  '2026-01-04',
  '2026-02-14', '2026-02-28',
  '2026-05-09',
  '2026-09-20', '2026-10-10',
  '2027-01-31', '2027-02-14',
  '2027-05-08',
  '2027-09-26', '2027-10-09',
])

export function defaultFinanceGroupForWecomGroup(groupid: number): FinanceGroupOption {
  if (groupid === 33) return '时薪'
  if (groupid === 32) return '月薪11小时'
  if (groupid === 31) return '保安'
  if (groupid === 28) return '月薪加班'
  return '月薪'
}

export function resolveDayDivisor(financeGroup: string, groupid: number): number {
  if (financeGroup === '保安' || GUARD_GROUP_IDS.has(groupid) || groupid === 30) return 12
  if (financeGroup === '月薪11小时') return 11
  if (financeGroup === '月薪9.5小时') return 9.5
  return 8
}

export function classifyCalendarDay(ymd: string, policy: CalendarWorkPolicy): CalendarDayKind {
  if (STATUTORY_HOLIDAYS.has(ymd)) return 'holiday'
  if (policy === 'seven_day') return 'workday'
  if (MAKEUP_WORKDAYS.has(ymd)) return 'workday'
  const [y, m, d] = ymd.split('-').map(Number)
  const dow = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()
  if (policy === 'five_day') {
    return dow === 0 || dow === 6 ? 'weekend' : 'workday'
  }
  return dow === 0 ? 'weekend' : 'workday'
}

export function countExpectedWorkdays(startDate: string, endDate: string, policy: CalendarWorkPolicy): number {
  let cur = parseYmdToUtc8Start(startDate)
  const endTs = parseYmdToUtc8Start(endDate)
  let cnt = 0
  while (cur <= endTs) {
    const ymd = unixToUtc8Parts(cur).date
    if (classifyCalendarDay(ymd, policy) === 'workday') cnt += 1
    cur += 86400
  }
  return cnt
}

async function fetchJson(url: string, init: RequestInit): Promise<any> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    const body = await res.json().catch(() => null)
    if (!res.ok) throw new Error(`企业微信接口 HTTP ${res.status}`)
    return body
  } finally {
    clearTimeout(timer)
  }
}

async function getWecomAppToken(pool: Pool): Promise<string> {
  const cfg = await loadWecomContactConfig(pool)
  const q = new URLSearchParams({ corpid: cfg.corpId, corpsecret: cfg.corpSecret })
  const body = await fetchJson(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?${q.toString()}`, { method: 'GET' })
  if (Number(body?.errcode || 0) !== 0 || !body?.access_token) {
    throw new Error(`企业微信获取令牌失败（errcode=${body?.errcode}，errmsg=${body?.errmsg}）`)
  }
  return String(body.access_token)
}

async function postWecom(token: string, path: string, payload: Record<string, unknown>): Promise<any> {
  const body = await fetchJson(
    `https://qyapi.weixin.qq.com/cgi-bin/${path}?access_token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    },
  )
  if (Number(body?.errcode || 0) !== 0) {
    throw new Error(`企业微信 ${path} 失败（errcode=${body?.errcode}，errmsg=${body?.errmsg}）`)
  }
  return body
}

async function loadAttendanceProfiles(pool: Pool): Promise<Map<string, WecomAttendanceProfileRecord>> {
  const map = new Map<string, WecomAttendanceProfileRecord>()
  try {
    const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`
      SELECT userid, employee_code, employee_name, finance_group, remark
      FROM tk_wecom_attendance_profile
    `))
    for (const row of rows) {
      const userid = String(row.userid || '').trim()
      if (!userid) continue
      map.set(userid, {
        userid,
        employeeCode: String(row.employee_code || '').trim(),
        employeeName: String(row.employee_name || '').trim(),
        financeGroup: String(row.finance_group || '').trim(),
        remark: String(row.remark || '').trim(),
      })
    }
  } catch (error: any) {
    // 测试环境或尚未执行建表迁移时降级按企业微信规则组兜底
    if (error?.code !== 'ER_NO_SUCH_TABLE') throw error
  }
  return map
}

export async function upsertWecomAttendanceProfile(
  pool: Pool,
  input: {
    userid: string
    employeeCode?: string
    employeeName?: string
    financeGroup?: string
    remark?: string | null
    updatedBy?: string | null
  },
): Promise<void> {
  const userid = String(input.userid || '').trim()
  if (!userid) throw new Error('userid 不能为空')
  const employeeCode = String(input.employeeCode || '').trim().slice(0, 32)
  const employeeName = String(input.employeeName || '').trim().slice(0, 64)
  const financeGroup = String(input.financeGroup || '').trim()
  if (financeGroup && !(FINANCE_GROUP_OPTIONS as readonly string[]).includes(financeGroup)) {
    throw new Error(`不支持的财务分组：${financeGroup}`)
  }
  const remark = input.remark === undefined || input.remark === null ? null : String(input.remark).trim().slice(0, 255)
  const updatedBy = input.updatedBy ? String(input.updatedBy).trim().slice(0, 64) : null

  await pool.query(
    mysqlQueryOptions(`
      INSERT INTO tk_wecom_attendance_profile
        (userid, employee_code, employee_name, finance_group, remark, updated_by)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        employee_code = VALUES(employee_code),
        employee_name = COALESCE(NULLIF(VALUES(employee_name), ''), employee_name),
        finance_group = VALUES(finance_group),
        remark = VALUES(remark),
        updated_by = VALUES(updated_by)
    `),
    [userid, employeeCode, employeeName, financeGroup, remark, updatedBy],
  )
}

function parseYmdToUtc8Start(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return Math.floor((Date.UTC(y!, m! - 1, d!, 0, 0, 0) - TZ_OFFSET_MS) / 1000)
}

function parseYmdToUtc8End(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return Math.floor((Date.UTC(y!, m! - 1, d!, 23, 59, 59) - TZ_OFFSET_MS) / 1000)
}

function unixToUtc8Parts(unixSec: number): {
  date: string
  hour: number
  minute: number
  second: number
  hms: string
  ms: number
} {
  const d = new Date(unixSec * 1000 + TZ_OFFSET_MS)
  const y = d.getUTCFullYear()
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  const hour = d.getUTCHours()
  const minute = d.getUTCMinutes()
  const second = d.getUTCSeconds()
  const hms = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`
  return { date: `${y}-${mo}-${day}`, hour, minute, second, hms, ms: unixSec * 1000 }
}

function splitDateChunks(startDate: string, endDate: string, maxDays = 30): Array<{ start: string; end: string }> {
  const chunks: Array<{ start: string; end: string }> = []
  let cur = parseYmdToUtc8Start(startDate)
  const endTs = parseYmdToUtc8Start(endDate)
  while (cur <= endTs) {
    const chunkEnd = Math.min(cur + (maxDays - 1) * 86400, endTs)
    chunks.push({
      start: unixToUtc8Parts(cur).date,
      end: unixToUtc8Parts(chunkEnd).date,
    })
    cur = chunkEnd + 86400
  }
  return chunks
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function floorHalfHour(hours: number): number {
  return Math.floor(hours / 0.5) * 0.5
}

export function dedupePunches(timestamps: number[], minGapSec = 180): number[] {
  const sorted = [...timestamps].sort((a, b) => a - b)
  const out: number[] = []
  for (const ts of sorted) {
    if (!out.length || ts - out[out.length - 1]! > minGapSec) {
      out.push(ts)
    }
  }
  return out
}

export function clusterWorkshopShifts(timestamps: number[], startDate: string): number[][] {
  const shifts: number[][] = []
  let cur: number[] = []
  for (const ts of timestamps) {
    const parts = unixToUtc8Parts(ts)
    if (!cur.length) {
      // 过滤查询首日凌晨 00:00~10:00 属于前一天夜班的下班卡
      if (parts.date === startDate && parts.hour < 10) continue
      cur = [ts]
      continue
    }
    const gapH = (ts - cur[cur.length - 1]!) / 3600
    const spanH = (ts - cur[0]!) / 3600
    if (spanH > 15.5) {
      shifts.push(cur)
      cur = [ts]
    } else if (cur.length >= 2 && gapH > 9.0) {
      shifts.push(cur)
      cur = [ts]
    } else if (cur.length === 1 && gapH > 14.5) {
      shifts.push(cur)
      cur = [ts]
    } else {
      cur.push(ts)
    }
  }
  if (cur.length) shifts.push(cur)
  return shifts
}

function makeUtc8Ts(ymd: string, hour: number, minute: number, second = 0, addDays = 0): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return Math.floor((Date.UTC(y!, m! - 1, d! + addDays, hour, minute, second) - TZ_OFFSET_MS) / 1000)
}

export type WorkshopShiftAnalysis = {
  date: string
  dayKind: CalendarDayKind
  shiftType: string
  punchCount: number
  punchesText: string
  rawHours: number
  regularHours: number
  weekdayOvertimeHours: number
  weekendOvertimeHours: number
  holidayOvertimeHours: number
  overtimeHours: number
  lateMinutes: number
  late1to10Count: number
  lateOver10Count: number
  earlyMinutes: number
  early1to10Count: number
  earlyOver10Count: number
  nightAllowance: number
  nightAllowanceNote: string
  status: string
}

export function analyzeWorkshopShift(
  groupid: number,
  pts: number[],
  options: { financeGroup?: string; hasApprovedLeave?: boolean; nowTs?: number } = {},
): WorkshopShiftAnalysis {
  const financeGroup = String(options.financeGroup || defaultFinanceGroupForWecomGroup(groupid)).trim()
  const isHourlyOrPiece = financeGroup === '时薪' || financeGroup === '计件'
  const isMonthly11h = financeGroup === '月薪11小时' || (groupid === 32 && !isHourlyOrPiece)
  const policy: CalendarWorkPolicy = isHourlyOrPiece ? 'five_day' : 'six_day'

  const t0 = pts[0]!
  const p0 = unixToUtc8Parts(t0)
  const workDate = p0.date
  const dayKind = classifyCalendarDay(workDate, policy)
  const hm = p0.hour * 60 + p0.minute

  let shiftType = '白班'
  let nomStartTs = t0

  if (hm >= 5 * 60 + 30 && hm < 10 * 60 + 30) {
    shiftType = '白班'
    if (hm < 8 * 60 + 30) nomStartTs = makeUtc8Ts(workDate, 8, 0, 0)
    else if (hm < 9 * 60 + 30) nomStartTs = makeUtc8Ts(workDate, 9, 0, 0)
    else nomStartTs = makeUtc8Ts(workDate, 10, 0, 0)
  } else if (hm >= 10 * 60 + 30 && hm < 17 * 60) {
    shiftType = '中班'
    nomStartTs = hm < 12 * 60 + 30 ? makeUtc8Ts(workDate, 12, 0, 0) : t0
  } else if (hm >= 17 * 60) {
    shiftType = '夜班'
    nomStartTs = makeUtc8Ts(workDate, 20, 0, 0)
  } else {
    shiftType = '异常跨夜'
    nomStartTs = t0
  }

  const punchesText = pts
    .map((ts) => {
      const pp = unixToUtc8Parts(ts)
      return pp.date === workDate ? pp.hms : `次${pp.hms}`
    })
    .join(' / ')

  let status = '正常'
  let rawHours = 0
  const tLast = pts[pts.length - 1]!
  if (pts.length < 2) {
    status = `漏卡(仅${pts.length}次)`
  } else {
    let effStart = t0
    if (effStart < nomStartTs && nomStartTs - effStart <= 90 * 60) {
      effStart = nomStartTs
    }
    const grossH = Math.max(0, (tLast - effStart) / 3600)
    if (grossH < 0.5) {
      status = '时长过短(<0.5h)'
    } else {
      let mealDeduct = 0
      if (shiftType === '白班') {
        const lunchStart = makeUtc8Ts(workDate, 11, 30, 0)
        const lunchEnd = makeUtc8Ts(workDate, 12, 30, 0)
        const dinnerEnd = makeUtc8Ts(workDate, 18, 0, 0)
        if (effStart <= lunchStart && tLast >= lunchEnd) mealDeduct += 0.5
        if (tLast >= dinnerEnd) mealDeduct += 0.5
      } else if (shiftType === '夜班') {
        const nextMid = makeUtc8Ts(workDate, 0, 0, 0, 1)
        if (tLast >= nextMid) mealDeduct += 0.5
      } else if (shiftType === '中班') {
        const dinnerStart = makeUtc8Ts(workDate, 17, 0, 0)
        const dinnerEnd = makeUtc8Ts(workDate, 18, 0, 0)
        if (effStart <= dinnerStart && tLast >= dinnerEnd) mealDeduct += 0.5
      }
      rawHours = round2(Math.max(0, grossH - mealDeduct))
    }
  }

  // 迟到与早退仅在应出勤工作日计算，周末/法定加班不计迟到早退
  let lateMinutes = 0
  let late1to10Count = 0
  let lateOver10Count = 0
  let earlyMinutes = 0
  let early1to10Count = 0
  let earlyOver10Count = 0

  if (dayKind === 'workday') {
    const lateSec = t0 - nomStartTs
    lateMinutes = lateSec <= 60 ? 0 : Math.ceil(lateSec / 60)
    if (lateMinutes > 0 && lateMinutes <= 10) late1to10Count = 1
    else if (lateMinutes > 10 && lateMinutes <= 59) lateOver10Count = 1

    const nowTs = options.nowTs ?? Math.floor(Date.now() / 1000)
    if (
      status === '正常'
      && !options.hasApprovedLeave
      && (shiftType === '白班' || shiftType === '夜班' || shiftType === '中班')
    ) {
      const nomEndTs = nomStartTs + 8.5 * 3600
      // 当日未到下班时间（班次仍在进行中）不计早退；>=60分钟属于半天/短时出勤，不计入“超10分(<1h)”早退档
      if (nowTs >= nomEndTs && tLast < nomEndTs) {
        earlyMinutes = Math.ceil((nomEndTs - tLast) / 60)
        if (earlyMinutes > 0 && earlyMinutes <= 10) early1to10Count = 1
        else if (earlyMinutes > 10 && earlyMinutes <= 59) earlyOver10Count = 1
      }
    }
  }

  // 夜班补贴：需同时满足「首卡 <= 19:50:00」且「当日有效总工时 >= 8h」
  let nightAllowance = 0
  let nightAllowanceNote = ''
  if (shiftType === '夜班') {
    const cutoffTs = makeUtc8Ts(workDate, 19, 50, 0)
    if (t0 > cutoffTs) {
      nightAllowance = 0
      nightAllowanceNote = `未达标(${p0.hms}>19:50)`
    } else if (status !== '正常' || rawHours < 8.0) {
      nightAllowance = 0
      nightAllowanceNote = '未达标(工时不足8h)'
    } else {
      nightAllowance = 1
      nightAllowanceNote = '达标(≤19:50且≥8h)'
    }
  }

  let regularHours = 0
  let weekdayOvertimeHours = 0
  let weekendOvertimeHours = 0
  let holidayOvertimeHours = 0

  if (status === '正常') {
    const floored = floorHalfHour(rawHours)
    if (dayKind === 'holiday') {
      holidayOvertimeHours = Math.min(floored, 11.5)
    } else if (dayKind === 'weekend') {
      weekendOvertimeHours = Math.min(floored, 11.5)
    } else if (isMonthly11h) {
      regularHours = Math.min(floored, 11.5)
    } else {
      regularHours = Math.min(floored, 8.0)
      weekdayOvertimeHours = Math.min(Math.max(0, floored - 8.0), 3.5)
    }
  }
  const overtimeHours = round2(weekdayOvertimeHours + weekendOvertimeHours + holidayOvertimeHours)

  return {
    date: workDate,
    dayKind,
    shiftType,
    punchCount: pts.length,
    punchesText,
    rawHours,
    regularHours: round2(regularHours),
    weekdayOvertimeHours: round2(weekdayOvertimeHours),
    weekendOvertimeHours: round2(weekendOvertimeHours),
    holidayOvertimeHours: round2(holidayOvertimeHours),
    overtimeHours,
    lateMinutes,
    late1to10Count,
    lateOver10Count,
    earlyMinutes,
    early1to10Count,
    earlyOver10Count,
    nightAllowance,
    nightAllowanceNote,
    status,
  }
}

const UNPAID_LEAVE_KEYWORDS = ['事假', '病假', '旷工', '无薪']

function isUnpaidLeaveName(name: string): boolean {
  return UNPAID_LEAVE_KEYWORDS.some((kw) => name.includes(kw))
}

function formatSpItemDuration(item: any): {
  text: string
  hours: number
  isBuka: boolean
  isLeave: boolean
  isUnpaid: boolean
} {
  const type = Number(item?.type || 0)
  const name = String(item?.name || '').trim() || (type === 2 ? '补卡' : '假勤')
  const count = Number(item?.count || 0)
  const duration = Number(item?.duration || 0)
  const timeType = Number(item?.time_type ?? 1) // 0=按天(秒/86400), 1=按小时(秒/3600)

  if (count <= 0 && duration <= 0) return { text: '', hours: 0, isBuka: false, isLeave: false, isUnpaid: false }
  if (type === 2) {
    return { text: `补卡${count}次`, hours: 0, isBuka: true, isLeave: false, isUnpaid: false }
  }
  if (type === 1) {
    const unpaid = isUnpaidLeaveName(name)
    if (timeType === 0 && duration > 0) {
      const days = round2(duration / 86400)
      return { text: `${name}${days}天`, hours: round2(days * 8), isBuka: false, isLeave: true, isUnpaid: unpaid }
    }
    const hrs = round2(duration / 3600)
    return { text: hrs > 0 ? `${name}${hrs}h` : `${name}${count}次`, hours: hrs, isBuka: false, isLeave: true, isUnpaid: unpaid }
  }
  if (type === 3 || type === 4) {
    const hrs = round2(duration / 3600)
    return { text: hrs > 0 ? `${name}${hrs}h` : `${name}${count}次`, hours: 0, isBuka: false, isLeave: false, isUnpaid: false }
  }
  return { text: '', hours: 0, isBuka: false, isLeave: false, isUnpaid: false }
}

function formatSecHms(sec: number): string {
  if (!sec || sec < 0) return ''
  const s = sec % 86400
  const h = String(Math.floor(s / 3600)).padStart(2, '0')
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return sec >= 86400 ? `次${h}:${m}:${ss}` : `${h}:${m}:${ss}`
}

export function formatOfficeExceptions(exInfos: any[]): {
  status: string
  lateCount: number
  lateMinutes: number
  late1to10Count: number
  lateOver10Count: number
  earlyCount: number
  earlyMinutes: number
  early1to10Count: number
  earlyOver10Count: number
  hasAbsent: boolean
  absentSec: number
  absentCnt: number
  hasOtherAnomaly: boolean
  isAnomaly: boolean
} {
  if (!Array.isArray(exInfos) || !exInfos.length) {
    return {
      status: '正常',
      lateCount: 0,
      lateMinutes: 0,
      late1to10Count: 0,
      lateOver10Count: 0,
      earlyCount: 0,
      earlyMinutes: 0,
      early1to10Count: 0,
      earlyOver10Count: 0,
      hasAbsent: false,
      absentSec: 0,
      absentCnt: 0,
      hasOtherAnomaly: false,
      isAnomaly: false,
    }
  }
  const labels: string[] = []
  let lateCount = 0
  let lateMinutes = 0
  let late1to10Count = 0
  let lateOver10Count = 0
  let earlyCount = 0
  let earlyMinutes = 0
  let early1to10Count = 0
  let earlyOver10Count = 0
  let hasAbsent = false
  let absentSec = 0
  let absentCnt = 0
  let hasOtherAnomaly = false

  for (const ex of exInfos) {
    const code = Number(ex?.exception || 0)
    const cnt = Number(ex?.count || 0)
    const dur = Number(ex?.duration || 0)
    if (cnt <= 0 && dur <= 0) continue
    if (code === 1) {
      if (dur > 60) {
        const totalMin = Math.ceil(dur / 60)
        const perMin = Math.ceil(totalMin / Math.max(1, cnt))
        lateCount += cnt
        lateMinutes += totalMin
        if (perMin <= 10) late1to10Count += cnt
        else if (perMin <= 59) lateOver10Count += cnt
        labels.push(`迟到${totalMin}分`)
      }
    } else if (code === 2) {
      if (dur > 0) {
        const totalMin = Math.ceil(dur / 60)
        const perMin = Math.ceil(totalMin / Math.max(1, cnt))
        earlyCount += cnt
        earlyMinutes += totalMin
        if (perMin <= 10) early1to10Count += cnt
        else if (perMin <= 59) earlyOver10Count += cnt
        labels.push(`早退${totalMin}分`)
      }
    } else if (code === 3) {
      hasOtherAnomaly = true
      labels.push(`缺卡${cnt}次`)
    } else if (code === 4) {
      hasAbsent = true
      absentSec += dur
      absentCnt += Math.max(1, cnt)
      labels.push(dur > 0 ? `旷工${round2(dur / 3600)}h` : `旷工${cnt}次`)
    } else if (code === 5) {
      hasOtherAnomaly = true
      labels.push(`地点异常${cnt}次`)
    } else if (code === 6) {
      hasOtherAnomaly = true
      labels.push(`设备异常${cnt}次`)
    }
  }
  return {
    status: labels.length ? labels.join('、') : '正常',
    lateCount,
    lateMinutes,
    late1to10Count,
    lateOver10Count,
    earlyCount,
    earlyMinutes,
    early1to10Count,
    earlyOver10Count,
    hasAbsent,
    absentSec,
    absentCnt,
    hasOtherAnomaly,
    isAnomaly: hasOtherAnomaly || earlyCount > 0 || lateCount > 0,
  }
}

export async function calculateWecomAttendanceReport(
  pool: Pool = getMysqlPool(),
  query: WecomAttendanceQuery,
): Promise<WecomAttendanceReport> {
  const { startDate, endDate } = query
  const scope: AttendanceScope = query.scope || 'all'
  const filterFinanceGroup = String(query.financeGroup || '').trim()
  const keyword = String(query.keyword || '').trim().toLowerCase()

  const token = await getWecomAppToken(pool)

  // 1. Parallel fetch: WeCom users, departments, checkin rules, and MySQL finance profiles
  const [usersRes, deptsRes, rulesRes, profileMap] = await Promise.all([
    fetchJson(`https://qyapi.weixin.qq.com/cgi-bin/user/list?access_token=${encodeURIComponent(token)}&department_id=1&fetch_child=1`, { method: 'GET' }),
    fetchJson(`https://qyapi.weixin.qq.com/cgi-bin/department/list?access_token=${encodeURIComponent(token)}`, { method: 'GET' }),
    postWecom(token, 'checkin/getcorpcheckinoption', {}),
    loadAttendanceProfiles(pool),
  ])

  const deptMap = new Map<number, string>()
  for (const d of deptsRes?.department || []) {
    deptMap.set(Number(d.id), String(d.name || '').trim())
  }
  const userMap = new Map<string, { name: string; dept: string; active: boolean }>()
  for (const u of usersRes?.userlist || []) {
    const uid = String(u.userid || '').trim()
    const deptIds: number[] = Array.isArray(u.department) ? u.department.map(Number) : []
    const deptNames = deptIds.filter((id) => id !== 1).map((id) => deptMap.get(id) || '').filter(Boolean)
    userMap.set(uid, {
      name: String(u.name || uid).trim(),
      dept: deptNames.join('/') || '默认部门',
      active: Number(u.status) === 1 && Number(u.enable) === 1,
    })
  }

  type TargetEmp = {
    userid: string
    employeeCode: string
    name: string
    dept: string
    groupid: number
    groupName: string
    financeGroup: string
    profileRemark: string
    calcMode: '车间工时' | '企微规则'
  }
  const targets: TargetEmp[] = []
  const seenUids = new Set<string>()
  for (const g of (rulesRes?.group || []).sort((a: any, b: any) => Number(a.groupid) - Number(b.groupid))) {
    const gid = Number(g.groupid)
    if (gid === DEFAULT_FALLBACK_GROUP_ID) continue
    const isWs = WORKSHOP_GROUP_IDS.has(gid)
    const isGuard = GUARD_GROUP_IDS.has(gid)
    if (scope === 'workshop' && !isWs) continue
    if (scope === 'guard' && !isGuard) continue
    if (scope === 'office' && (isWs || isGuard)) continue

    for (const rawUid of g?.range?.userid || []) {
      const uid = String(rawUid || '').trim()
      if (!uid || seenUids.has(uid)) continue
      const u = userMap.get(uid)
      if (!u || !u.active) continue

      const profile = profileMap.get(uid)
      const employeeCode = profile?.employeeCode || ''
      const financeGroup = profile?.financeGroup || defaultFinanceGroupForWecomGroup(gid)
      const profileRemark = profile?.remark || ''

      if (filterFinanceGroup && financeGroup !== filterFinanceGroup) continue
      if (
        keyword
        && !u.name.toLowerCase().includes(keyword)
        && !u.dept.toLowerCase().includes(keyword)
        && !uid.toLowerCase().includes(keyword)
        && !employeeCode.toLowerCase().includes(keyword)
        && !financeGroup.toLowerCase().includes(keyword)
      ) {
        continue
      }

      seenUids.add(uid)
      targets.push({
        userid: uid,
        employeeCode,
        name: u.name,
        dept: u.dept,
        groupid: gid,
        groupName: String(g.groupname || `规则${gid}`),
        financeGroup,
        profileRemark,
        calcMode: isWs ? '车间工时' : '企微规则',
      })
    }
  }

  if (!targets.length) {
    return {
      meta: { startDate, endDate, scope, generatedAt: new Date().toISOString(), totalEmployees: 0 },
      summary: {
        employeeCount: 0,
        workshopCount: 0,
        officeCount: 0,
        totalRegularHours: 0,
        totalWeekdayOvertimeHours: 0,
        totalWeekendOvertimeHours: 0,
        totalHolidayOvertimeHours: 0,
        totalOvertimeHours: 0,
        totalNightAllowanceCount: 0,
        totalNightAllowanceMissCount: 0,
        totalLeaveCount: 0,
        totalBukaCount: 0,
        totalAbsentDays: 0,
        totalAnomalyDays: 0,
      },
      employees: [],
      dailyDetails: [],
      anomalies: [],
    }
  }

  const chunks = splitDateChunks(startDate, endDate, 30)
  const allUids = targets.map((t) => t.userid)
  const wsUids = targets.filter((t) => t.calcMode === '车间工时').map((t) => t.userid)

  // 2 & 3. Fetch WeCom daydata (ALL targets) & raw punches (Workshop targets) in parallel
  const daydataByUser = new Map<string, any[]>()
  const wsPunchesByUser = new Map<string, number[]>()

  const tasks: Array<() => Promise<void>> = []
  for (const chunk of chunks) {
    const st = parseYmdToUtc8Start(chunk.start)
    const et = parseYmdToUtc8End(chunk.end)
    for (let i = 0; i < allUids.length; i += BATCH_USERS) {
      const batch = allUids.slice(i, i + BATCH_USERS)
      tasks.push(async () => {
        const res = await postWecom(token, 'checkin/getcheckin_daydata', {
          starttime: st,
          endtime: et,
          useridlist: batch,
        })
        for (const item of res?.datas || []) {
          const uid = String(item?.base_info?.acctid || '').trim()
          if (!uid) continue
          if (!daydataByUser.has(uid)) daydataByUser.set(uid, [])
          daydataByUser.get(uid)!.push(item)
        }
      })
    }
    if (wsUids.length) {
      const etRaw = et + 12 * 3600
      for (let i = 0; i < wsUids.length; i += BATCH_USERS) {
        const batch = wsUids.slice(i, i + BATCH_USERS)
        tasks.push(async () => {
          const res = await postWecom(token, 'checkin/getcheckindata', {
            opencheckindatatype: 3,
            starttime: st,
            endtime: etRaw,
            useridlist: batch,
          })
          for (const r of res?.checkindata || []) {
            if (r?.exception_type === '未打卡' || !r?.checkin_time) continue
            const uid = String(r.userid || '').trim()
            if (!uid) continue
            if (!wsPunchesByUser.has(uid)) wsPunchesByUser.set(uid, [])
            wsPunchesByUser.get(uid)!.push(Number(r.checkin_time))
          }
        })
      }
    }
  }

  const MAX_CONCURRENCY = 6
  let cursor = 0
  const workers = Array.from({ length: Math.min(MAX_CONCURRENCY, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const idx = cursor++
      await tasks[idx]!()
    }
  })
  await Promise.all(workers)

  // 4. Assemble per-employee summary & daily details
  const employees: EmployeeAttendanceSummary[] = []
  const dailyDetails: DailyAttendanceRow[] = []
  const anomalies: DailyAttendanceRow[] = []

  const fiveDayCount = countExpectedWorkdays(startDate, endDate, 'five_day')
  const sixDayCount = countExpectedWorkdays(startDate, endDate, 'six_day')

  for (const emp of targets) {
    const userDays = daydataByUser.get(emp.userid) || []
    const dayDivisor = resolveDayDivisor(emp.financeGroup, emp.groupid)
    const isGuard = emp.financeGroup === '保安' || GUARD_GROUP_IDS.has(emp.groupid)

    // Build per-day sp_items (leaves + buka) map from WeCom daydata
    const spByDate = new Map<string, { texts: string[]; leaveHours: number; unpaidHours: number; paidHours: number; bukaCount: number; explicitAbsentHours: number }>()
    const unpaidLeaveTotals = new Map<string, { hours: number; count: number }>()
    const paidLeaveTotals = new Map<string, { hours: number; count: number }>()
    let empPersonalLeaveHours = 0
    let empSickLeaveHours = 0
    let empUnpaidLeaveHours = 0
    let empPaidLeaveHours = 0
    let empExplicitAbsentHours = 0
    let empBukaCount = 0

    for (const d of userDays) {
      const dTs = Number(d?.base_info?.date || 0)
      if (!dTs) continue
      const ymd = unixToUtc8Parts(dTs).date
      if (ymd < startDate || ymd > endDate) continue
      const spList = Array.isArray(d?.sp_items) ? d.sp_items : []
      const texts: string[] = []
      let lh = 0
      let ulh = 0
      let plh = 0
      let bc = 0
      let absH = 0
      for (const sp of spList) {
        const parsed = formatSpItemDuration(sp)
        if (!parsed.text) continue
        texts.push(parsed.text)
        if (parsed.isLeave) {
          lh += parsed.hours
          const spName = String(sp?.name || '请假').trim()
          const targetMap = parsed.isUnpaid ? unpaidLeaveTotals : paidLeaveTotals
          if (parsed.isUnpaid) {
            ulh += parsed.hours
            empUnpaidLeaveHours += parsed.hours
            if (spName.includes('事假')) empPersonalLeaveHours += parsed.hours
            else if (spName.includes('病假')) empSickLeaveHours += parsed.hours
            else if (spName.includes('旷工')) {
              absH += parsed.hours
              empExplicitAbsentHours += parsed.hours
            }
          } else {
            plh += parsed.hours
            empPaidLeaveHours += parsed.hours
          }
          const entry = targetMap.get(spName) || { hours: 0, count: 0 }
          entry.hours += parsed.hours
          entry.count += Number(sp?.count || 1)
          targetMap.set(spName, entry)
        }
        if (parsed.isBuka) {
          const c = Number(sp?.count || 1)
          bc += c
          empBukaCount += c
        }
      }
      if (texts.length) {
        spByDate.set(ymd, {
          texts,
          leaveHours: round2(lh),
          unpaidHours: round2(ulh),
          paidHours: round2(plh),
          bukaCount: bc,
          explicitAbsentHours: round2(absH),
        })
      }
    }

    const fmtLeaveMap = (m: Map<string, { hours: number; count: number }>) => {
      const parts: string[] = []
      for (const [spName, info] of m.entries()) {
        parts.push(info.hours > 0 ? `${spName}${round2(info.hours)}h` : `${spName}${info.count}次`)
      }
      return parts.join('、')
    }
    const unpaidLeaveSummary = fmtLeaveMap(unpaidLeaveTotals)
    const paidLeaveSummary = fmtLeaveMap(paidLeaveTotals)
    const leaveSummary = [unpaidLeaveSummary, paidLeaveSummary].filter(Boolean).join('、')
    const empLeaveHours = round2(empUnpaidLeaveHours + empPaidLeaveHours)

    if (emp.calcMode === '车间工时') {
      const isHourlyOrPiece = emp.financeGroup === '时薪' || emp.financeGroup === '计件'
      const expectedDays = isHourlyOrPiece ? fiveDayCount : sixDayCount
      const pts = dedupePunches(wsPunchesByUser.get(emp.userid) || [])
      const shifts = clusterWorkshopShifts(pts, startDate)

      let dayShiftDays = 0
      let nightShiftDays = 0
      let midShiftDays = 0
      let regSum = 0
      let wkdayOtSum = 0
      let wkndOtSum = 0
      let holOtSum = 0
      let rawSum = 0
      let nightAllowSum = 0
      let nightMissSum = 0
      let lateCount = 0
      let lateMinutes = 0
      let late1to10Count = 0
      let lateOver10Count = 0
      let earlyCount = 0
      let earlyMinutes = 0
      let early1to10Count = 0
      let earlyOver10Count = 0
      let anomalyDays = 0
      let absentDays = round2(empExplicitAbsentHours / dayDivisor)
      const coveredDates = new Set<string>()

      for (const spts of shifts) {
        const prelimDate = unixToUtc8Parts(spts[0]!).date
        const spDay = spByDate.get(prelimDate)
        const analyzed = analyzeWorkshopShift(emp.groupid, spts, {
          financeGroup: emp.financeGroup,
          hasApprovedLeave: Boolean(spDay && spDay.leaveHours > 0),
        })
        if (analyzed.date < startDate || analyzed.date > endDate) continue
        coveredDates.add(analyzed.date)

        if (analyzed.shiftType === '白班') dayShiftDays += 1
        else if (analyzed.shiftType === '夜班') nightShiftDays += 1
        else if (analyzed.shiftType === '中班') midShiftDays += 1

        regSum += analyzed.regularHours
        wkdayOtSum += analyzed.weekdayOvertimeHours
        wkndOtSum += analyzed.weekendOvertimeHours
        holOtSum += analyzed.holidayOvertimeHours
        rawSum += analyzed.rawHours
        nightAllowSum += analyzed.nightAllowance
        if (analyzed.shiftType === '夜班' && analyzed.nightAllowance === 0) nightMissSum += 1
        if (analyzed.lateMinutes > 0) {
          lateCount += 1
          lateMinutes += analyzed.lateMinutes
          late1to10Count += analyzed.late1to10Count
          lateOver10Count += analyzed.lateOver10Count
        }
        if (analyzed.earlyMinutes > 0) {
          earlyCount += 1
          earlyMinutes += analyzed.earlyMinutes
          early1to10Count += analyzed.early1to10Count
          earlyOver10Count += analyzed.earlyOver10Count
        }
        if (analyzed.status !== '正常') anomalyDays += 1

        const row: DailyAttendanceRow = {
          userid: emp.userid,
          employeeCode: emp.employeeCode,
          name: emp.name,
          dept: emp.dept,
          groupid: emp.groupid,
          groupName: emp.groupName,
          financeGroup: emp.financeGroup,
          calcMode: emp.calcMode,
          date: analyzed.date,
          shiftType: analyzed.dayKind === 'holiday'
            ? `${analyzed.shiftType}(节假)`
            : analyzed.dayKind === 'weekend'
              ? `${analyzed.shiftType}(周末)`
              : analyzed.shiftType,
          punchCount: analyzed.punchCount,
          punchesText: analyzed.punchesText,
          rawHours: analyzed.rawHours,
          regularHours: analyzed.regularHours,
          weekdayOvertimeHours: analyzed.weekdayOvertimeHours,
          weekendOvertimeHours: analyzed.weekendOvertimeHours,
          holidayOvertimeHours: analyzed.holidayOvertimeHours,
          overtimeHours: analyzed.overtimeHours,
          lateMinutes: analyzed.lateMinutes,
          earlyMinutes: analyzed.earlyMinutes,
          absentDays: spDay?.explicitAbsentHours ? round2(spDay.explicitAbsentHours / dayDivisor) : 0,
          nightAllowance: analyzed.nightAllowance,
          nightAllowanceNote: analyzed.nightAllowanceNote,
          leaveText: spDay ? spDay.texts.join('、') : '',
          status: analyzed.status,
        }
        dailyDetails.push(row)
        if (row.status !== '正常') anomalies.push(row)
      }

      for (const [ymd, spDay] of spByDate.entries()) {
        if (coveredDates.has(ymd)) continue
        dailyDetails.push({
          userid: emp.userid,
          employeeCode: emp.employeeCode,
          name: emp.name,
          dept: emp.dept,
          groupid: emp.groupid,
          groupName: emp.groupName,
          financeGroup: emp.financeGroup,
          calcMode: emp.calcMode,
          date: ymd,
          shiftType: '请假/审批',
          punchCount: 0,
          punchesText: '',
          rawHours: 0,
          regularHours: 0,
          weekdayOvertimeHours: 0,
          weekendOvertimeHours: 0,
          holidayOvertimeHours: 0,
          overtimeHours: 0,
          lateMinutes: 0,
          earlyMinutes: 0,
          absentDays: spDay.explicitAbsentHours ? round2(spDay.explicitAbsentHours / dayDivisor) : 0,
          nightAllowance: 0,
          nightAllowanceNote: '',
          leaveText: spDay.texts.join('、'),
          status: '请假',
        })
      }

      const regularDays = round2(regSum / dayDivisor)
      const weekendOvertimeDays = round2(wkndOtSum / dayDivisor)
      const totalAttendDays = round2(regularDays + weekendOvertimeDays)
      const totalOtHours = round2(wkdayOtSum + wkndOtSum + holOtSum)
      absentDays = round2(absentDays)

      employees.push({
        userid: emp.userid,
        employeeCode: emp.employeeCode,
        name: emp.name,
        dept: emp.dept,
        groupid: emp.groupid,
        groupName: emp.groupName,
        financeGroup: emp.financeGroup,
        profileRemark: emp.profileRemark,
        calcMode: emp.calcMode,
        shouldAttendDays: expectedDays,
        regularDays,
        weekendOvertimeDays,
        totalAttendDays,
        attDays: totalAttendDays,
        dayShiftDays,
        nightShiftDays,
        midShiftDays,
        regularHours: round2(regSum),
        weekdayOvertimeHours: round2(wkdayOtSum),
        weekendOvertimeHours: round2(wkndOtSum),
        holidayOvertimeHours: round2(holOtSum),
        overtimeHours: totalOtHours,
        rawStayHours: round2(rawSum),
        nightAllowanceCount: nightAllowSum,
        nightAllowanceMissCount: nightMissSum,
        lateCount,
        lateMinutes,
        late1to10Count,
        lateOver10Count,
        earlyCount,
        earlyMinutes,
        early1to10Count,
        earlyOver10Count,
        personalLeaveHours: round2(empPersonalLeaveHours),
        sickLeaveHours: round2(empSickLeaveHours),
        unpaidLeaveSummary,
        unpaidLeaveHours: round2(empUnpaidLeaveHours),
        paidLeaveSummary,
        paidLeaveHours: round2(empPaidLeaveHours),
        leaveSummary,
        leaveHours: empLeaveHours,
        absentDays,
        bukaCount: empBukaCount,
        anomalyDays,
      })
    } else {
      // 办公室固定班 / 自由班 / 保安排班
      let shouldAttendDays = 0
      let dayAttendCount = 0
      let regSum = 0
      let wkdayOtSum = 0
      let wkndOtSum = 0
      let holOtSum = 0
      let rawSum = 0
      let lateCount = 0
      let lateMinutes = 0
      let late1to10Count = 0
      let lateOver10Count = 0
      let earlyCount = 0
      let earlyMinutes = 0
      let early1to10Count = 0
      let earlyOver10Count = 0
      let absentDays = 0
      let anomalyDays = 0

      const sortedDays = [...userDays].sort((a, b) => Number(a?.base_info?.date || 0) - Number(b?.base_info?.date || 0))
      for (const d of sortedDays) {
        const dTs = Number(d?.base_info?.date || 0)
        if (!dTs) continue
        const ymd = unixToUtc8Parts(dTs).date
        if (ymd < startDate || ymd > endDate) continue

        const dayType = Number(d?.base_info?.day_type ?? 0) // 0=工作日, 1=休息日
        const sumInfo = d?.summary_info || {}
        const checkinCount = Number(sumInfo.checkin_count || 0)
        const rawWorkH = round2(Number(sumInfo.regular_work_sec || 0) / 3600)
        const stdWorkH = round2(Number(sumInfo.standard_work_sec || 0) / 3600)

        const otInfo = d?.ot_info || {}
        const otWorkSec = Number(otInfo.workday_over_as_vacation || 0) + Number(otInfo.workday_over_as_money || 0)
        const otRestSec = Number(otInfo.restday_over_as_vacation || 0) + Number(otInfo.restday_over_as_money || 0)
        const otHolSec = Number(otInfo.holiday_over_as_vacation || 0) + Number(otInfo.holiday_over_as_money || 0)
        const otDurationSec = Number(otInfo.ot_duration || 0)
        const isStatHoliday = STATUTORY_HOLIDAYS.has(ymd)
        const hasExplicitSplit = (otWorkSec + otRestSec + otHolSec) > 0

        let regH = 0
        let workdayOtH = 0
        let weekendOtH = 0
        let holidayOtH = 0

        if (isStatHoliday) {
          regH = 0
          if (otHolSec > 0) holidayOtH = round2(otHolSec / 3600)
          else if (otDurationSec > 0) holidayOtH = round2(otDurationSec / 3600)
          else if (checkinCount > 0 && rawWorkH > 0) holidayOtH = floorHalfHour(rawWorkH)
        } else if (isGuard) {
          regH = stdWorkH > 0 ? round2(Math.min(rawWorkH, stdWorkH)) : rawWorkH
        } else if (dayType === 1) {
          regH = 0
          if (otRestSec > 0) weekendOtH = round2(otRestSec / 3600)
          else if (otDurationSec > 0) weekendOtH = round2(otDurationSec / 3600)
          else if (checkinCount > 0 && rawWorkH > 0) weekendOtH = floorHalfHour(rawWorkH)
        } else {
          regH = stdWorkH > 0 ? round2(Math.min(rawWorkH, stdWorkH)) : rawWorkH
          if (hasExplicitSplit) {
            workdayOtH = round2(otWorkSec / 3600)
            weekendOtH = round2(otRestSec / 3600)
            holidayOtH = round2(otHolSec / 3600)
          } else if (otDurationSec > 0) {
            workdayOtH = round2(otDurationSec / 3600)
          }
        }

        const spDay = spByDate.get(ymd)
        const ex = formatOfficeExceptions(d?.exception_infos || [])

        if (dayType === 0 && !isStatHoliday) shouldAttendDays += 1
        if (dayType === 1 && checkinCount === 0 && !spDay) continue

        if (checkinCount > 0) dayAttendCount += 1
        regSum += regH
        wkdayOtSum += workdayOtH
        wkndOtSum += weekendOtH
        holOtSum += holidayOtH
        rawSum += rawWorkH

        lateCount += ex.lateCount
        lateMinutes += ex.lateMinutes
        late1to10Count += ex.late1to10Count
        lateOver10Count += ex.lateOver10Count
        earlyCount += ex.earlyCount
        earlyMinutes += ex.earlyMinutes
        early1to10Count += ex.early1to10Count
        earlyOver10Count += ex.earlyOver10Count

        let dayAbsent = 0
        if (ex.hasAbsent && !spDay) {
          dayAbsent = ex.absentSec > 0
            ? round2(Math.min(1, ex.absentSec / 3600 / dayDivisor))
            : (checkinCount === 0 ? 1 : round2(Math.min(1, 0.5 * ex.absentCnt)))
          absentDays = round2(absentDays + dayAbsent)
        } else if (spDay?.explicitAbsentHours) {
          dayAbsent = round2(spDay.explicitAbsentHours / dayDivisor)
          absentDays = round2(absentDays + dayAbsent)
        }

        if (ex.hasOtherAnomaly && !spDay) anomalyDays += 1

        const earliest = formatSecHms(Number(sumInfo.earliest_time || 0))
        const latest = formatSecHms(Number(sumInfo.lastest_time || 0))
        const punchesText = earliest && latest && earliest !== latest ? `${earliest} ~ ${latest}` : earliest || ''
        const dayOt = round2(workdayOtH + weekendOtH + holidayOtH)

        const row: DailyAttendanceRow = {
          userid: emp.userid,
          employeeCode: emp.employeeCode,
          name: emp.name,
          dept: emp.dept,
          groupid: emp.groupid,
          groupName: emp.groupName,
          financeGroup: emp.financeGroup,
          calcMode: emp.calcMode,
          date: ymd,
          shiftType: isStatHoliday
            ? '法定节假日'
            : dayType === 1
              ? '休息日打卡'
              : String(d?.base_info?.rule_info?.schedulename || '固定班'),
          punchCount: checkinCount,
          punchesText,
          rawHours: rawWorkH,
          regularHours: regH,
          weekdayOvertimeHours: round2(workdayOtH),
          weekendOvertimeHours: round2(weekendOtH),
          holidayOvertimeHours: round2(holidayOtH),
          overtimeHours: dayOt,
          lateMinutes: ex.lateMinutes,
          earlyMinutes: ex.earlyMinutes,
          absentDays: dayAbsent,
          nightAllowance: 0,
          nightAllowanceNote: '',
          leaveText: spDay ? spDay.texts.join('、') : '',
          status: spDay && ex.status !== '正常' ? `${ex.status}(有审批)` : ex.status,
        }
        dailyDetails.push(row)
        if (ex.hasOtherAnomaly && !spDay) anomalies.push(row)
      }

      const regularDays = round2(regSum / dayDivisor)
      const weekendOvertimeDays = round2(wkndOtSum / dayDivisor)
      const totalAttendDays = round2(regularDays + weekendOvertimeDays)
      const totalOtHours = round2(wkdayOtSum + wkndOtSum + holOtSum)

      employees.push({
        userid: emp.userid,
        employeeCode: emp.employeeCode,
        name: emp.name,
        dept: emp.dept,
        groupid: emp.groupid,
        groupName: emp.groupName,
        financeGroup: emp.financeGroup,
        profileRemark: emp.profileRemark,
        calcMode: emp.calcMode,
        shouldAttendDays,
        regularDays,
        weekendOvertimeDays,
        totalAttendDays,
        attDays: totalAttendDays,
        dayShiftDays: dayAttendCount,
        nightShiftDays: 0,
        midShiftDays: 0,
        regularHours: round2(regSum),
        weekdayOvertimeHours: round2(wkdayOtSum),
        weekendOvertimeHours: round2(wkndOtSum),
        holidayOvertimeHours: round2(holOtSum),
        overtimeHours: totalOtHours,
        rawStayHours: round2(rawSum),
        nightAllowanceCount: 0,
        nightAllowanceMissCount: 0,
        lateCount,
        lateMinutes,
        late1to10Count,
        lateOver10Count,
        earlyCount,
        earlyMinutes,
        early1to10Count,
        earlyOver10Count,
        personalLeaveHours: round2(empPersonalLeaveHours),
        sickLeaveHours: round2(empSickLeaveHours),
        unpaidLeaveSummary,
        unpaidLeaveHours: round2(empUnpaidLeaveHours),
        paidLeaveSummary,
        paidLeaveHours: round2(empPaidLeaveHours),
        leaveSummary,
        leaveHours: empLeaveHours,
        absentDays: round2(absentDays),
        bukaCount: empBukaCount,
        anomalyDays,
      })
    }
  }

  dailyDetails.sort((a, b) => a.groupid - b.groupid || a.dept.localeCompare(b.dept, 'zh') || a.name.localeCompare(b.name, 'zh') || a.date.localeCompare(b.date))
  anomalies.sort((a, b) => b.date.localeCompare(a.date) || a.groupid - b.groupid || a.name.localeCompare(b.name, 'zh'))

  const sumField = (pick: (e: EmployeeAttendanceSummary) => number) =>
    round2(employees.reduce((s, e) => s + pick(e), 0))

  return {
    meta: {
      startDate,
      endDate,
      scope,
      generatedAt: new Date().toISOString(),
      totalEmployees: employees.length,
    },
    summary: {
      employeeCount: employees.length,
      workshopCount: employees.filter((e) => e.calcMode === '车间工时').length,
      officeCount: employees.filter((e) => e.calcMode === '企微规则').length,
      totalRegularHours: sumField((e) => e.regularHours),
      totalWeekdayOvertimeHours: sumField((e) => e.weekdayOvertimeHours),
      totalWeekendOvertimeHours: sumField((e) => e.weekendOvertimeHours),
      totalHolidayOvertimeHours: sumField((e) => e.holidayOvertimeHours),
      totalOvertimeHours: sumField((e) => e.overtimeHours),
      totalNightAllowanceCount: employees.reduce((s, e) => s + e.nightAllowanceCount, 0),
      totalNightAllowanceMissCount: employees.reduce((s, e) => s + e.nightAllowanceMissCount, 0),
      totalLeaveCount: employees.filter((e) => Boolean(e.leaveSummary)).length,
      totalBukaCount: employees.reduce((s, e) => s + e.bukaCount, 0),
      totalAbsentDays: sumField((e) => e.absentDays),
      totalAnomalyDays: anomalies.length,
    },
    employees,
    dailyDetails,
    anomalies,
  }
}
