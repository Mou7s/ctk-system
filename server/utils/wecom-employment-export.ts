import * as XLSX from 'xlsx-js-style'
import { strToU8, unzipSync, zipSync } from 'fflate'
import { setResponseHeader, type H3Event } from 'h3'
import type { DepartmentStat, LeaveReasonStat } from './wecom-employment-summary'
import {
  EMPLOYMENT_CHART_DRAWING,
  EMPLOYMENT_CHART_DRAWING_RELS,
  EMPLOYMENT_CHART_HIRE_PIE,
  EMPLOYMENT_CHART_LEAVE_PIE,
  EMPLOYMENT_CHART_REASON_BAR,
  EMPLOYMENT_CHART_SHEET_RELS,
} from './employment-chart-parts'

export type WecomEmploymentExportOptions = {
  leaveRate?: number | null
  reasonStats?: LeaveReasonStat[]
  reasonLeaveTotal?: number
}

// 图表数据源布局（'图表数据' 隐藏表，与 employment-chart-parts.ts 的引用口径一致）。
// 图表只画非零行：运行时把非零部门/原因压缩到块首，再把图表引用区间收窄到实际行数，
// 零值不进图，不再出现满屏 "0%" 标签。
export const EMPLOYMENT_CHART_DEPT_SLOTS = 40
const CHART_DEPT_FIRST_ROW = 3
const CHART_DEPT_LAST_ROW = CHART_DEPT_FIRST_ROW + EMPLOYMENT_CHART_DEPT_SLOTS - 1
const CHART_REASON_FIRST_ROW = 45
const CHART_REASON_ROWS = 11
const CHART_REASON_LAST_ROW = CHART_REASON_FIRST_ROW + CHART_REASON_ROWS - 1
const NAME_COL_WCH = 56

// 已是末级部门口径：去层级缩进（半角/全角空格），只留部门名
function deptName(row: DepartmentStat): string {
  return String(row.department ?? '').replace(/^[\s　]+/, '')
}

// 半角算 1、全角算 2，按列宽估算名单换行数，行高按 15pt/行给
function wrappedLines(text: string, wch: number): number {
  if (!text) return 1
  let width = 0
  for (const ch of text) width += (ch.codePointAt(0) ?? 0) <= 0xff ? 1 : 2
  return Math.max(1, Math.ceil(width / wch))
}

// 离职率存文本百分比（'13.04%'），无数据时存 '-'；所用 xlsx 库写不出自定义数字格式，真数字会显示成 0.13 故不用
function rateText(value: number | null | undefined): string {
  return value == null ? '-' : `${value.toFixed(2)}%`
}

const HEADER_FILL = 'FF4472C4'
const TOTAL_FILL = 'FFFFE699'
const UNFILLED_FONT = 'FFC00000'
const GRID_COLOR = 'FFBFBFBF'

function thinBorder() {
  const side = { style: 'thin', color: { rgb: GRID_COLOR } }
  return { top: side, bottom: side, left: side, right: side }
}

function paintCell(worksheet: XLSX.WorkSheet, r: number, c: number, style: XLSX.CellStyle) {
  const ref = XLSX.utils.encode_cell({ r, c })
  const cell = worksheet[ref] as XLSX.CellObject | undefined
  if (!cell) return
  cell.s = { ...(cell.s || {}), ...style }
}

export function sendWecomEmploymentExcel(
  event: H3Event,
  rows: DepartmentStat[],
  title: string,
  fileName: string,
  options: WecomEmploymentExportOptions = {},
) {
  const totalHire = rows.reduce((sum, row) => sum + row.hireCount, 0)
  const totalLeave = rows.reduce((sum, row) => sum + row.leaveCount, 0)
  // 单表纵向堆叠：部门入离职汇总（含饼图口径的入离职人数与离职率）+ 离职原因归类
  // 行号（0 起）：0 标题，1 部门表头，2..2+rows.length-1 部门行，2+rows.length 合计
  const deptHeaderRow = 1
  const deptTotalRow = 2 + rows.length
  const data: (string | number)[][] = [
    [title],
    ['序号', '部门', '入职人数', '入职名单', '离职人数', '离职名单', '离职率'],
    ...rows.map((row, index) => [
      index + 1,
      deptName(row),
      row.hireCount,
      row.hireNames.join('、'),
      row.leaveCount,
      row.leaveNames.join('、'),
      rateText(row.leaveRate),
    ]),
    [
      '',
      '合计',
      totalHire,
      `${rows.reduce((sum, row) => sum + row.hireNames.length, 0)} 人`,
      totalLeave,
      `${rows.reduce((sum, row) => sum + row.leaveNames.length, 0)} 人`,
      rateText(options.leaveRate),
    ],
  ]
  const reasonStats = options.reasonStats || []
  let reasonTitleRow = -1
  let reasonHeaderRow = -1
  let unfilledRow = -1
  if (reasonStats.length) {
    const reasonTotal = options.reasonLeaveTotal ?? reasonStats.reduce((sum, row) => sum + row.count, 0)
    data.push([])
    data.push([`离职原因归类（离职 ${reasonTotal} 人次）`])
    reasonTitleRow = data.length - 1
    reasonHeaderRow = data.length
    data.push(['序号', '原因编码', '原因', '原话口径', '人次', '占比', ''])
    for (const [index, row] of reasonStats.entries()) {
      if (!row.code) unfilledRow = data.length
      data.push([
        index + 1,
        row.code || '-',
        row.label,
        row.fullText,
        row.count,
        rateText(row.rate),
        '',
      ])
    }
  }
  const worksheet = XLSX.utils.aoa_to_sheet(data)
  const merges = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }]
  if (reasonStats.length) merges.push({ s: { r: reasonTitleRow, c: 0 }, e: { r: reasonTitleRow, c: 6 } })
  worksheet['!merges'] = merges
  worksheet['!cols'] = [
    { wch: 8 },
    { wch: 20 },
    { wch: 12 },
    { wch: NAME_COL_WCH },
    { wch: 12 },
    { wch: NAME_COL_WCH },
    { wch: 12 },
  ]
  const rowHeights: { hpt: number }[] = [{ hpt: 28 }, { hpt: 22 }]
  for (let r = 2; r < data.length; r += 1) {
    if (r === reasonTitleRow) rowHeights.push({ hpt: 24 })
    else if (r === reasonHeaderRow || r === deptTotalRow) rowHeights.push({ hpt: 22 })
    else if (r >= 2 && r < 2 + rows.length) {
      // 名单按换行数给行高，人多时自动长高，不再被遮住
      const stat = rows[r - 2]
      const lines = Math.max(
        wrappedLines(stat.hireNames.join('、'), NAME_COL_WCH),
        wrappedLines(stat.leaveNames.join('、'), NAME_COL_WCH),
      )
      rowHeights.push({ hpt: Math.min(105, Math.max(18, lines * 15)) })
    }
    else rowHeights.push({ hpt: 18 })
  }
  worksheet['!rows'] = rowHeights
  worksheet['!autofilter'] = { ref: `A2:G${2 + rows.length}` }

  const border = thinBorder()
  const headerStyle: XLSX.CellStyle = {
    font: { bold: true, sz: 11, color: { rgb: 'FFFFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: HEADER_FILL }, bgColor: { rgb: HEADER_FILL } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border,
  }
  paintCell(worksheet, 0, 0, {
    font: { bold: true, sz: 14 },
    alignment: { horizontal: 'center', vertical: 'center' },
    border,
  })
  for (let c = 0; c <= 6; c += 1) paintCell(worksheet, deptHeaderRow, c, headerStyle)
  for (let r = 2; r <= deptTotalRow; r += 1) {
    const isTotal = r === deptTotalRow
    for (let c = 0; c <= 6; c += 1) {
      const nameCol = c === 1 || c === 3 || c === 5
      paintCell(worksheet, r, c, {
        font: isTotal ? { bold: true, sz: 11 } : { sz: 11 },
        fill: isTotal ? { patternType: 'solid', fgColor: { rgb: TOTAL_FILL }, bgColor: { rgb: TOTAL_FILL } } : undefined,
        alignment: {
          horizontal: nameCol ? 'left' : 'center',
          vertical: 'center',
          wrapText: nameCol,
        },
        border,
      })
    }
  }
  if (reasonStats.length) {
    paintCell(worksheet, reasonTitleRow, 0, {
      font: { bold: true, sz: 12 },
      alignment: { horizontal: 'left', vertical: 'center' },
      border,
    })
    for (let c = 0; c <= 6; c += 1) paintCell(worksheet, reasonHeaderRow, c, headerStyle)
    for (let r = reasonHeaderRow + 1; r < data.length; r += 1) {
      const isUnfilled = r === unfilledRow
      for (let c = 0; c <= 6; c += 1) {
        const textCol = c === 2 || c === 3
        paintCell(worksheet, r, c, {
          font: isUnfilled
            ? { bold: true, sz: 11, color: { rgb: UNFILLED_FONT } }
            : { sz: 11 },
          alignment: {
            horizontal: textCol ? 'left' : 'center',
            vertical: 'center',
            wrapText: textCol,
          },
          border,
        })
      }
    }
  }
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, '入离职汇总')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([[]]), '分布图')
  const chartPlan = buildChartDataSheet(rows, reasonStats)
  XLSX.utils.book_append_sheet(workbook, chartPlan.sheet, '图表数据')
  workbook.Workbook = { Sheets: [{}, {}, { Hidden: 1 }] }
  const buffer = injectEmploymentCharts(
    XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer', cellStyles: true }),
    chartPlan,
  )
  setResponseHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`)
  setResponseHeader(event, 'Access-Control-Expose-Headers', 'Content-Disposition')
  return buffer
}

// '图表数据' 隐藏表：只填非零行（入职块 B/C、离职块 E/F、原因块 B/C/D），
// 返回压缩后的实际行数，供注入图表时收窄引用区间
export type EmploymentChartPlan = {
  sheet: XLSX.WorkSheet
  hireCount: number
  leaveCount: number
  reasonCount: number
  unfilledIndex: number
}

function buildChartDataSheet(rows: DepartmentStat[], reasonStats: LeaveReasonStat[]): EmploymentChartPlan {
  const grid: (string | number)[][] = []
  const setCell = (r: number, c: number, value: string | number) => {
    while (grid.length < r) grid.push([])
    const line = grid[r - 1]
    while (line.length < c) line.push('')
    line[c - 1] = value
  }
  const hireRows = rows
    .filter((row) => Number(row.hireCount || 0) > 0)
    .slice(0, EMPLOYMENT_CHART_DEPT_SLOTS)
  const leaveRows = rows
    .filter((row) => Number(row.leaveCount || 0) > 0)
    .slice(0, EMPLOYMENT_CHART_DEPT_SLOTS)
  const reasonRows = reasonStats
    .filter((row) => Number(row.count || 0) > 0)
    .slice(0, CHART_REASON_ROWS)
  hireRows.forEach((row, index) => {
    const r = CHART_DEPT_FIRST_ROW + index
    setCell(r, 2, deptName(row))
    setCell(r, 3, Number(row.hireCount || 0))
  })
  leaveRows.forEach((row, index) => {
    const r = CHART_DEPT_FIRST_ROW + index
    setCell(r, 5, deptName(row))
    setCell(r, 6, Number(row.leaveCount || 0))
  })
  reasonRows.forEach((row, index) => {
    const r = CHART_REASON_FIRST_ROW + index
    setCell(r, 2, row.label)
    setCell(r, 3, row.code || '-')
    setCell(r, 4, Number(row.count || 0))
  })
  return {
    sheet: XLSX.utils.aoa_to_sheet(grid),
    hireCount: hireRows.length,
    leaveCount: leaveRows.length,
    reasonCount: reasonRows.length,
    unfilledIndex: reasonRows.findIndex((row) => !row.code),
  }
}

// 引用区间收窄到 [firstRow, firstRow + max(count,1) - 1]，空数据时保留首行空位，保证图表 XML 合法
function narrowChartRange(xml: string, col: string, firstRow: number, lastRow: number, count: number): string {
  const end = firstRow + Math.max(count, 1) - 1
  return xml.replaceAll(`$${col}$${firstRow}:$${col}$${lastRow}`, `$${col}$${firstRow}:$${col}$${end}`)
}

// 把原生图表部件注入 xlsx 包：加 chart/drawing 文件，补 rels 与内容类型，挂载到“分布图”表
export function injectEmploymentCharts(
  source: Uint8Array | Buffer,
  plan: EmploymentChartPlan = { sheet: XLSX.utils.aoa_to_sheet([[]]), hireCount: 0, leaveCount: 0, reasonCount: 0, unfilledIndex: -1 },
): Uint8Array {
  const files = unzipSync(new Uint8Array(source))
  const text = (name: string): string => new TextDecoder().decode(files[name])
  const hirePie = narrowChartRange(EMPLOYMENT_CHART_HIRE_PIE, 'B', CHART_DEPT_FIRST_ROW, CHART_DEPT_LAST_ROW, plan.hireCount)
  const hirePieNarrowed = narrowChartRange(hirePie, 'C', CHART_DEPT_FIRST_ROW, CHART_DEPT_LAST_ROW, plan.hireCount)
  const leavePie = narrowChartRange(EMPLOYMENT_CHART_LEAVE_PIE, 'E', CHART_DEPT_FIRST_ROW, CHART_DEPT_LAST_ROW, plan.leaveCount)
  const leavePieNarrowed = narrowChartRange(leavePie, 'F', CHART_DEPT_FIRST_ROW, CHART_DEPT_LAST_ROW, plan.leaveCount)
  let reasonBar = narrowChartRange(EMPLOYMENT_CHART_REASON_BAR, 'B', CHART_REASON_FIRST_ROW, CHART_REASON_LAST_ROW, plan.reasonCount)
  reasonBar = narrowChartRange(reasonBar, 'D', CHART_REASON_FIRST_ROW, CHART_REASON_LAST_ROW, plan.reasonCount)
  // “未填写”红色点跟随压缩后的下标；没有未填写行时去掉该点
  reasonBar = plan.unfilledIndex >= 0
    ? reasonBar.replace('<dPt><idx val="10"', `<dPt><idx val="${plan.unfilledIndex}"`)
    : reasonBar.replace(/<dPt>.*?<\/dPt>/, '')
  files['xl/charts/chart1.xml'] = strToU8(hirePieNarrowed)
  files['xl/charts/chart2.xml'] = strToU8(leavePieNarrowed)
  files['xl/charts/chart3.xml'] = strToU8(reasonBar)
  files['xl/drawings/drawing1.xml'] = strToU8(EMPLOYMENT_CHART_DRAWING)
  files['xl/drawings/_rels/drawing1.xml.rels'] = strToU8(EMPLOYMENT_CHART_DRAWING_RELS)
  files['xl/worksheets/_rels/sheet2.xml.rels'] = strToU8(EMPLOYMENT_CHART_SHEET_RELS)
  files['[Content_Types].xml'] = strToU8(
    text('[Content_Types].xml').replace(
      '</Types>',
      [
        '<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>',
        '<Override PartName="/xl/charts/chart2.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>',
        '<Override PartName="/xl/charts/chart3.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>',
        '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>',
        '</Types>',
      ].join(''),
    ),
  )
  const sheet2Name = 'xl/worksheets/sheet2.xml'
  const sheet2 = text(sheet2Name)
  if (!sheet2.includes('<drawing')) {
    files[sheet2Name] = strToU8(sheet2.replace('</worksheet>', '<drawing r:id="rId1"/></worksheet>'))
  }
  return zipSync(files, { level: 6 })
}
