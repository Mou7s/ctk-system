import * as XLSX from 'xlsx-js-style'
import { setResponseHeader, type H3Event } from 'h3'
import type { WecomAttendanceReport } from './wecom-attendance-calc'

const TITLE_FILL = 'FFD9E1F2'
const HEADER_FILL = 'FF1F4E78'
const TOTAL_FILL = 'FFFFE699'
const WARN_FILL = 'FFFFF2CC'
const GRID_COLOR = 'FFBFBFBF'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function thinBorder() {
  const side = { style: 'thin', color: { rgb: GRID_COLOR } }
  return { top: side, bottom: side, left: side, right: side }
}

function styleTableSheet(
  ws: XLSX.WorkSheet,
  colWidths: number[],
  options: {
    titleRowIdx?: number
    headerRowIdx?: number
    totalRowIdx?: number
    warnColIndices?: number[]
    leftAlignMaxCol?: number
  } = {},
) {
  const ref = ws['!ref']
  if (!ref) return
  const range = XLSX.utils.decode_range(ref)
  const titleRowIdx = options.titleRowIdx
  const headerRowIdx = options.headerRowIdx ?? 0
  const totalRowIdx = options.totalRowIdx
  const warnColIndices = options.warnColIndices ?? []
  const leftAlignMaxCol = options.leftAlignMaxCol ?? 4

  for (let r = range.s.r; r <= range.e.r; r++) {
    const isTitle = titleRowIdx !== undefined && r === titleRowIdx
    const isHeader = r === headerRowIdx
    const isTotal = totalRowIdx !== undefined && r === totalRowIdx
    const isWarn = !isTitle && !isHeader && !isTotal && warnColIndices.some((colIdx) => {
      const refCell = XLSX.utils.encode_cell({ r, c: colIdx })
      return Number(ws[refCell]?.v || 0) > 0
    })

    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      const cell = ws[addr] as XLSX.CellObject | undefined
      if (!cell) continue
      cell.s = {
        border: thinBorder(),
        font: {
          name: '微软雅黑',
          sz: isTitle ? 14 : 10,
          bold: isTitle || isHeader || isTotal,
          color: { rgb: isHeader ? 'FFFFFFFF' : 'FF111827' },
        },
        fill: isTitle
          ? { fgColor: { rgb: TITLE_FILL } }
          : isHeader
            ? { fgColor: { rgb: HEADER_FILL } }
            : isTotal
              ? { fgColor: { rgb: TOTAL_FILL } }
              : isWarn
                ? { fgColor: { rgb: WARN_FILL } }
                : undefined,
        alignment: {
          horizontal: isTitle || isHeader ? 'center' : (c <= leftAlignMaxCol ? 'left' : 'center'),
          vertical: 'center',
          wrapText: true,
        },
      }
    }
  }
  ws['!cols'] = colWidths.map((wch) => ({ wch }))
  const rows: XLSX.RowInfo[] = []
  if (titleRowIdx !== undefined) rows[titleRowIdx] = { hpt: 30 }
  rows[headerRowIdx] = { hpt: 28 }
  ws['!rows'] = rows
}

function formatSummaryRemark(
  unpaidLeaveSummary: string,
  paidLeaveSummary: string,
  nightAllowanceMissCount: number,
  profileRemark: string,
): string {
  return [
    unpaidLeaveSummary,
    paidLeaveSummary,
    nightAllowanceMissCount > 0 ? `夜班未达标${nightAllowanceMissCount}次` : '',
    profileRemark,
  ]
    .filter(Boolean)
    .join('；')
}

export function buildWecomAttendanceWorkbook(report: WecomAttendanceReport): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  const { startDate, endDate } = report.meta
  const periodLabel = startDate && endDate && startDate.slice(0, 7) === endDate.slice(0, 7)
    ? `${startDate.slice(0, 7)}月份`
    : `${startDate} ~ ${endDate}`

  // Sheet 1: 全厂考勤汇总（财务核算表）
  const s1Headers = [
    '序号', '工号', '姓名', '部门', '财务分组', '考勤规则组',
    '应出勤(天)', '正班出勤(天)', '周末加班(天)', '总出勤(天)',
    '正班工时(h)', '平时加班(h)', '周末加班(h)', '法定节假日加班(h)',
    '夜班总天', '夜班可补(次)',
    '1~10分迟到(次)', '超10分迟到(次)', '1~10分早退(次)', '超10分早退(次)',
    '事假(h)', '病假(h)', '带薪假(h)',
    '旷工(天)', '补卡(次)', '待核漏卡(天)', '请假/异常备注',
  ]
  const companyTitle = String(process.env.ATTENDANCE_COMPANY_TITLE || process.env.COMPANY_DISPLAY_NAME || '').trim() || '示例企业有限公司'
  const titleRow: (string | number)[] = [
    `${companyTitle} ${periodLabel} 出勤汇总表`,
    ...Array.from({ length: s1Headers.length - 1 }, () => ''),
  ]
  const sumNum = (pick: (e: WecomAttendanceReport['employees'][number]) => number) =>
    round2(report.employees.reduce((s, e) => s + pick(e), 0))

  const s1Rows: (string | number)[][] = [
    titleRow,
    s1Headers,
    ...report.employees.map((e, idx) => [
      idx + 1,
      e.employeeCode || '',
      e.name,
      e.dept,
      e.financeGroup,
      e.groupName,
      e.shouldAttendDays,
      e.regularDays,
      e.weekendOvertimeDays,
      e.totalAttendDays,
      e.regularHours,
      e.weekdayOvertimeHours,
      e.weekendOvertimeHours,
      e.holidayOvertimeHours,
      e.nightShiftDays,
      e.nightAllowanceCount,
      e.late1to10Count,
      e.lateOver10Count,
      e.early1to10Count,
      e.earlyOver10Count,
      e.personalLeaveHours,
      e.sickLeaveHours,
      e.paidLeaveHours,
      e.absentDays,
      e.bukaCount,
      e.anomalyDays,
      formatSummaryRemark(e.unpaidLeaveSummary, e.paidLeaveSummary, e.nightAllowanceMissCount, e.profileRemark),
    ]),
    [
      '合计',
      '',
      `${report.summary.employeeCount}人`,
      '',
      '',
      '',
      '',
      sumNum((e) => e.regularDays),
      sumNum((e) => e.weekendOvertimeDays),
      sumNum((e) => e.totalAttendDays),
      report.summary.totalRegularHours,
      report.summary.totalWeekdayOvertimeHours,
      report.summary.totalWeekendOvertimeHours,
      report.summary.totalHolidayOvertimeHours,
      report.employees.reduce((s, e) => s + e.nightShiftDays, 0),
      report.summary.totalNightAllowanceCount,
      report.employees.reduce((s, e) => s + e.late1to10Count, 0),
      report.employees.reduce((s, e) => s + e.lateOver10Count, 0),
      report.employees.reduce((s, e) => s + e.early1to10Count, 0),
      report.employees.reduce((s, e) => s + e.earlyOver10Count, 0),
      sumNum((e) => e.personalLeaveHours),
      sumNum((e) => e.sickLeaveHours),
      sumNum((e) => e.paidLeaveHours),
      report.summary.totalAbsentDays,
      report.summary.totalBukaCount,
      report.summary.totalAnomalyDays,
      '',
    ],
  ]
  const ws1 = XLSX.utils.aoa_to_sheet(s1Rows)
  ws1['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: s1Headers.length - 1 } }]
  styleTableSheet(
    ws1,
    [7, 10, 11, 16, 12, 24, 10, 11, 11, 10, 11, 11, 11, 14, 10, 11, 12, 12, 12, 12, 9, 9, 9, 9, 9, 11, 28],
    {
      titleRowIdx: 0,
      headerRowIdx: 1,
      totalRowIdx: s1Rows.length - 1,
      warnColIndices: [23, 25],
      leftAlignMaxCol: 5,
    },
  )
  XLSX.utils.book_append_sheet(wb, ws1, '全厂考勤汇总')

  // Sheet 2: 每日考勤明细
  const s2Headers = [
    '工号', '姓名', '部门', '财务分组', '考勤规则组', '核算模式', '日期',
    '班别', '打卡次数', '原始打卡时间点',
    '有效总工时(h)', '正班工时(h)', '平时加班(h)', '周末加班(h)', '法定节假日加班(h)',
    '迟到(分)', '早退(分)', '旷工(天)', '夜班补贴', '夜班补贴说明', '企微请假/补卡', '状态',
  ]
  const s2Rows: (string | number)[][] = [
    s2Headers,
    ...report.dailyDetails.map((d) => [
      d.employeeCode || '', d.name, d.dept, d.financeGroup, d.groupName, d.calcMode, d.date,
      d.shiftType, d.punchCount, d.punchesText,
      d.rawHours, d.regularHours, d.weekdayOvertimeHours, d.weekendOvertimeHours, d.holidayOvertimeHours,
      d.lateMinutes, d.earlyMinutes, d.absentDays, d.nightAllowance, d.nightAllowanceNote, d.leaveText, d.status,
    ]),
  ]
  const ws2 = XLSX.utils.aoa_to_sheet(s2Rows)
  styleTableSheet(
    ws2,
    [10, 11, 16, 12, 24, 11, 12, 14, 10, 36, 12, 11, 11, 11, 14, 9, 9, 9, 10, 20, 22, 16],
    { headerRowIdx: 0, leftAlignMaxCol: 5 },
  )
  XLSX.utils.book_append_sheet(wb, ws2, '每日考勤明细')

  // Sheet 3: 漏卡与异常待核
  const s3Headers = ['日期', '工号', '姓名', '部门', '财务分组', '考勤规则组', '班别', '状态', '原始打卡时间点', '企微请假/补卡']
  const s3Rows: (string | number)[][] = [
    s3Headers,
    ...report.anomalies.map((d) => [
      d.date, d.employeeCode || '', d.name, d.dept, d.financeGroup, d.groupName, d.shiftType, d.status, d.punchesText, d.leaveText,
    ]),
  ]
  const ws3 = XLSX.utils.aoa_to_sheet(s3Rows)
  styleTableSheet(
    ws3,
    [12, 10, 11, 16, 12, 24, 14, 18, 36, 22],
    { headerRowIdx: 0, leftAlignMaxCol: 5 },
  )
  XLSX.utils.book_append_sheet(wb, ws3, '漏卡与异常待核')

  return wb
}

export function sendWecomAttendanceExcel(event: H3Event, report: WecomAttendanceReport, fileName: string) {
  const wb = buildWecomAttendanceWorkbook(report)
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  setResponseHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`)
  return buffer
}
