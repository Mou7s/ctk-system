import * as XLSX from 'xlsx-js-style'
import { describe, expect, it } from 'vitest'
import {
  analyzeWorkshopShift,
  classifyCalendarDay,
  countExpectedWorkdays,
  defaultFinanceGroupForWecomGroup,
  formatOfficeExceptions,
} from '../../server/utils/wecom-attendance-calc'
import { buildWecomAttendanceWorkbook } from '../../server/utils/wecom-attendance-export'

function ts(ymd, hms) {
  return Math.floor(new Date(`${ymd}T${hms}+08:00`).getTime() / 1000)
}

describe('WeCom attendance finance accounting & Excel workbook', () => {
  it('classifies 5-day vs 6-day calendars, statutory holidays, and makeup workdays', () => {
    // 2026-11-07 is Saturday, 2026-11-08 is Sunday, 2026-11-09 is Monday
    expect(classifyCalendarDay('2026-11-07', 'five_day')).toBe('weekend')
    expect(classifyCalendarDay('2026-11-07', 'six_day')).toBe('workday')
    expect(classifyCalendarDay('2026-11-08', 'five_day')).toBe('weekend')
    expect(classifyCalendarDay('2026-11-08', 'six_day')).toBe('weekend')
    expect(classifyCalendarDay('2026-11-09', 'five_day')).toBe('workday')

    // 2026-10-01 National Day statutory holiday; 2026-10-10 Saturday makeup workday
    expect(classifyCalendarDay('2026-10-01', 'five_day')).toBe('holiday')
    expect(classifyCalendarDay('2026-10-01', 'six_day')).toBe('holiday')
    expect(classifyCalendarDay('2026-10-10', 'five_day')).toBe('workday')

    // 2026-11-01..2026-11-30 (21 Mon-Fri workdays, 25 Mon-Sat workdays)
    expect(countExpectedWorkdays('2026-11-01', '2026-11-30', 'five_day')).toBe(21)
    expect(countExpectedWorkdays('2026-11-01', '2026-11-30', 'six_day')).toBe(25)
    expect(defaultFinanceGroupForWecomGroup(33)).toBe('时薪')
    expect(defaultFinanceGroupForWecomGroup(32)).toBe('月薪11小时')
  })

  it('splits 时薪/计件 workshop hours into regular, weekday OT, Saturday/Sunday weekend OT, and holiday OT', () => {
    // Weekday 08:00 ~ 20:30 (12.5h gross - 1.0h meal = 11.5h -> 8h reg + 3.5h weekday OT)
    const wkday = analyzeWorkshopShift(33, [ts('2026-11-09', '07:55:00'), ts('2026-11-09', '20:31:00')], {
      financeGroup: '时薪',
    })
    expect(wkday.regularHours).toBe(8)
    expect(wkday.weekdayOvertimeHours).toBe(3.5)
    expect(wkday.weekendOvertimeHours).toBe(0)
    expect(wkday.holidayOvertimeHours).toBe(0)

    // Saturday (2026-11-07) & Sunday (2026-11-08) -> 100% weekend OT, even starting at 08:25 with no late/early flags
    const sat = analyzeWorkshopShift(33, [ts('2026-11-07', '08:25:00'), ts('2026-11-07', '17:30:00')], {
      financeGroup: '计件',
    })
    expect(sat.dayKind).toBe('weekend')
    expect(sat.regularHours).toBe(0)
    expect(sat.weekdayOvertimeHours).toBe(0)
    expect(sat.weekendOvertimeHours).toBe(8.5)
    expect(sat.lateMinutes).toBe(0)
    expect(sat.late1to10Count).toBe(0)
    expect(sat.earlyMinutes).toBe(0)

    // Statutory holiday (2026-10-01) -> 100% holiday OT (08:00..17:00 gross 9h - 0.5h lunch = 8.5h)
    const hol = analyzeWorkshopShift(33, [ts('2026-10-01', '08:00:00'), ts('2026-10-01', '17:00:00')], {
      financeGroup: '时薪',
    })
    expect(hol.dayKind).toBe('holiday')
    expect(hol.regularHours).toBe(0)
    expect(hol.holidayOvertimeHours).toBe(8.5)
  })

  it('applies 1-min grace, 1~10 vs >10 late/early buckets, and 8h threshold for night allowance', () => {
    // 08:01:00 is within 60s grace
    const grace = analyzeWorkshopShift(33, [ts('2026-11-09', '08:01:00'), ts('2026-11-09', '17:00:00')], {
      financeGroup: '时薪',
    })
    expect(grace.lateMinutes).toBe(0)
    expect(grace.late1to10Count).toBe(0)
    expect(grace.earlyMinutes).toBe(0)

    // Late 5m + Early 5m -> both 1~10 buckets
    const bucket10 = analyzeWorkshopShift(33, [ts('2026-11-09', '08:05:00'), ts('2026-11-09', '16:25:00')], {
      financeGroup: '时薪',
    })
    expect(bucket10.lateMinutes).toBe(5)
    expect(bucket10.late1to10Count).toBe(1)
    expect(bucket10.lateOver10Count).toBe(0)
    expect(bucket10.earlyMinutes).toBe(5)
    expect(bucket10.early1to10Count).toBe(1)
    expect(bucket10.earlyOver10Count).toBe(0)

    // Late 15m + Early 15m -> both >10 buckets
    const bucketOver = analyzeWorkshopShift(33, [ts('2026-11-09', '08:15:00'), ts('2026-11-09', '16:15:00')], {
      financeGroup: '时薪',
    })
    expect(bucketOver.late1to10Count).toBe(0)
    expect(bucketOver.lateOver10Count).toBe(1)
    expect(bucketOver.early1to10Count).toBe(0)
    expect(bucketOver.earlyOver10Count).toBe(1)

    // Approved leave suppresses early-leave flag
    const approvedLeave = analyzeWorkshopShift(33, [ts('2026-11-09', '08:00:00'), ts('2026-11-09', '12:00:00')], {
      financeGroup: '时薪',
      hasApprovedLeave: true,
    })
    expect(approvedLeave.earlyMinutes).toBe(0)

    // Night allowance: <=19:50 AND >=8h
    const nightOk = analyzeWorkshopShift(33, [ts('2026-11-09', '19:48:00'), ts('2026-11-10', '07:00:00')], {
      financeGroup: '时薪',
    })
    expect(nightOk.nightAllowance).toBe(1)

    const nightTooShort = analyzeWorkshopShift(33, [ts('2026-11-09', '19:45:00'), ts('2026-11-10', '02:00:00')], {
      financeGroup: '时薪',
    })
    expect(nightTooShort.nightAllowance).toBe(0)
    expect(nightTooShort.nightAllowanceNote).toContain('不足8h')

    const nightTooLate = analyzeWorkshopShift(33, [ts('2026-11-09', '19:51:00'), ts('2026-11-10', '07:00:00')], {
      financeGroup: '时薪',
    })
    expect(nightTooLate.nightAllowance).toBe(0)

    // In-progress shift today (nowTs < nomEndTs) -> not counted as early leave
    const inProgress = analyzeWorkshopShift(33, [ts('2026-11-19', '07:50:00'), ts('2026-11-19', '11:55:00')], {
      financeGroup: '时薪',
      nowTs: ts('2026-11-19', '15:20:00'),
    })
    expect(inProgress.earlyMinutes).toBe(0)
    expect(inProgress.early1to10Count).toBe(0)
    expect(inProgress.earlyOver10Count).toBe(0)

    // Half-day / >=60m early departure: still records earlyMinutes, but not counted in 11~59m bucket
    const halfDay = analyzeWorkshopShift(33, [ts('2026-11-09', '08:00:00'), ts('2026-11-09', '12:00:00')], {
      financeGroup: '时薪',
    })
    expect(halfDay.earlyMinutes).toBe(270)
    expect(halfDay.early1to10Count).toBe(0)
    expect(halfDay.earlyOver10Count).toBe(0)
  })

  it('handles 月薪11小时 (Mon-Sat regular up to 11.5h, 0 weekday OT, Sunday OT) and office exceptions', () => {
    const sat11h = analyzeWorkshopShift(32, [ts('2026-11-07', '07:50:00'), ts('2026-11-07', '20:00:00')], {
      financeGroup: '月薪11小时',
    })
    expect(sat11h.dayKind).toBe('workday')
    expect(sat11h.regularHours).toBe(11)
    expect(sat11h.weekdayOvertimeHours).toBe(0)

    const sun11h = analyzeWorkshopShift(32, [ts('2026-11-08', '07:50:00'), ts('2026-11-08', '17:30:00')], {
      financeGroup: '月薪11小时',
    })
    expect(sun11h.dayKind).toBe('weekend')
    expect(sun11h.regularHours).toBe(0)
    // 07:50 clamps to 08:00 nominal start -> 08:00..17:30 = 9.5h - 0.5h lunch = 9.0h
    expect(sun11h.weekendOvertimeHours).toBe(9)

    const ex = formatOfficeExceptions([
      { exception: 1, count: 1, duration: 45 }, // <=60s grace
      { exception: 1, count: 1, duration: 12 * 60 }, // 11~59m
      { exception: 2, count: 1, duration: 4 * 60 }, // 1~10m early
      { exception: 4, count: 1, duration: 8 * 3600 }, // 旷工
    ])
    expect(ex.lateCount).toBe(1)
    expect(ex.late1to10Count).toBe(0)
    expect(ex.lateOver10Count).toBe(1)
    expect(ex.early1to10Count).toBe(1)
    expect(ex.hasAbsent).toBe(true)
    expect(ex.hasOtherAnomaly).toBe(false)

    const exOverHour = formatOfficeExceptions([
      { exception: 1, count: 1, duration: 90 * 60 },
      { exception: 2, count: 1, duration: 90 * 60 },
    ])
    expect(exOverHour.lateMinutes).toBe(90)
    expect(exOverHour.lateOver10Count).toBe(0)
    expect(exOverHour.earlyMinutes).toBe(90)
    expect(exOverHour.earlyOver10Count).toBe(0)
  })

  it('builds the 27-column finance Excel workbook with merged title and pure numeric totals', () => {
    const report = {
      meta: {
        startDate: '2026-11-01',
        endDate: '2026-11-30',
        scope: 'all',
        generatedAt: '2026-11-19T00:00:00Z',
        totalEmployees: 2,
      },
      summary: {
        employeeCount: 2,
        workshopCount: 1,
        officeCount: 1,
        totalRegularHours: 240,
        totalWeekdayOvertimeHours: 20,
        totalWeekendOvertimeHours: 16,
        totalHolidayOvertimeHours: 8,
        totalOvertimeHours: 44,
        totalNightAllowanceCount: 5,
        totalNightAllowanceMissCount: 1,
        totalLeaveCount: 1,
        totalBukaCount: 2,
        totalAbsentDays: 1,
        totalAnomalyDays: 1,
      },
      employees: [
        {
          userid: 'u1',
          employeeCode: '003911',
          name: '张三',
          dept: '模压部',
          groupid: 33,
          groupName: '生产车间',
          financeGroup: '时薪',
          profileRemark: '',
          calcMode: '车间工时',
          shouldAttendDays: 21,
          regularDays: 20,
          weekendOvertimeDays: 2,
          totalAttendDays: 22,
          attDays: 22,
          dayShiftDays: 16,
          nightShiftDays: 6,
          midShiftDays: 0,
          regularHours: 160,
          weekdayOvertimeHours: 20,
          weekendOvertimeHours: 16,
          holidayOvertimeHours: 0,
          overtimeHours: 36,
          rawStayHours: 196,
          nightAllowanceCount: 5,
          nightAllowanceMissCount: 1,
          lateCount: 2,
          lateMinutes: 18,
          late1to10Count: 1,
          lateOver10Count: 1,
          earlyCount: 1,
          earlyMinutes: 5,
          early1to10Count: 1,
          earlyOver10Count: 0,
          personalLeaveHours: 4,
          sickLeaveHours: 0,
          unpaidLeaveSummary: '事假4h',
          unpaidLeaveHours: 4,
          paidLeaveSummary: '',
          paidLeaveHours: 0,
          leaveSummary: '事假4h',
          leaveHours: 4,
          absentDays: 0,
          bukaCount: 2,
          anomalyDays: 1,
        },
        {
          userid: 'u2',
          employeeCode: '001206',
          name: '李四',
          dept: '财务部',
          groupid: 22,
          groupName: '办公室不加班',
          financeGroup: '月薪',
          profileRemark: '',
          calcMode: '企微规则',
          shouldAttendDays: 25,
          regularDays: 10,
          weekendOvertimeDays: 0,
          totalAttendDays: 10,
          attDays: 10,
          dayShiftDays: 10,
          nightShiftDays: 0,
          midShiftDays: 0,
          regularHours: 80,
          weekdayOvertimeHours: 0,
          weekendOvertimeHours: 0,
          holidayOvertimeHours: 8,
          overtimeHours: 8,
          rawStayHours: 80,
          nightAllowanceCount: 0,
          nightAllowanceMissCount: 0,
          lateCount: 0,
          lateMinutes: 0,
          late1to10Count: 0,
          lateOver10Count: 0,
          earlyCount: 0,
          earlyMinutes: 0,
          early1to10Count: 0,
          earlyOver10Count: 0,
          personalLeaveHours: 0,
          sickLeaveHours: 8,
          unpaidLeaveSummary: '病假8h',
          unpaidLeaveHours: 8,
          paidLeaveSummary: '年假8h',
          paidLeaveHours: 8,
          leaveSummary: '病假8h、年假8h',
          leaveHours: 16,
          absentDays: 1,
          bukaCount: 0,
          anomalyDays: 0,
        },
      ],
      dailyDetails: [],
      anomalies: [],
    }

    const wb = buildWecomAttendanceWorkbook(report)
    expect(wb.SheetNames).toEqual(['全厂考勤汇总', '每日考勤明细', '漏卡与异常待核'])

    const ws1 = wb.Sheets['全厂考勤汇总']
    const aoa1 = XLSX.utils.sheet_to_json(ws1, { header: 1 })
    expect(aoa1[0][0]).toBe('示例企业有限公司 2026-11月份 出勤汇总表')
    expect(ws1['!merges']).toEqual([{ s: { r: 0, c: 0 }, e: { r: 0, c: 26 } }])
    expect(aoa1[1]).toHaveLength(27)
    expect(aoa1[1][1]).toBe('工号')
    expect(aoa1[1][4]).toBe('财务分组')
    expect(aoa1[1][11]).toBe('平时加班(h)')
    expect(aoa1[1][12]).toBe('周末加班(h)')
    expect(aoa1[1][13]).toBe('法定节假日加班(h)')
    expect(aoa1[1][23]).toBe('旷工(天)')
    expect(aoa1[1][25]).toBe('待核漏卡(天)')

    const totalRow = aoa1[4]
    expect(totalRow[0]).toBe('合计')
    expect(totalRow[7]).toBe(30) // regularDays 20 + 10
    expect(totalRow[8]).toBe(2) // weekendOvertimeDays 2 + 0
    expect(totalRow[9]).toBe(32) // totalAttendDays
    expect(totalRow[11]).toBe(20) // weekdayOvertimeHours
    expect(totalRow[12]).toBe(16) // weekendOvertimeHours
    expect(totalRow[13]).toBe(8) // holidayOvertimeHours
    expect(totalRow[20]).toBe(4) // personalLeaveHours
    expect(totalRow[21]).toBe(8) // sickLeaveHours
    expect(totalRow[22]).toBe(8) // paidLeaveHours
    expect(totalRow[23]).toBe(1) // absentDays
    expect(totalRow[25]).toBe(1) // anomalyDays
  })
})
