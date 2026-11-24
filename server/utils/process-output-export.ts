import { getQuery, readBody, setResponseHeader, type H3Event } from 'h3'
import * as XLSX from 'xlsx/xlsx.mjs'
import { queryProcessOutputSummary } from './process-output-read'

type Query = Record<string, unknown>

function reportName(periodType: unknown): string {
  if (periodType === 'shiftRange') return '时间段报表'
  if (periodType === 'week') return '周报'
  if (periodType === 'month') return '月报'
  return '日报'
}

function numberText(value: unknown): string {
  if (value == null || value === '') return ''
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return ''
  return String(parsed).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
}

function percentText(value: unknown): string {
  if (value == null || value === '') return ''
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return ''
  const rounded = Math.round((parsed * 100 + Number.EPSILON) * 100) / 100
  return `${String(rounded).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')}%`
}

function queryOf(event: H3Event): Promise<Query> {
  return readBody(event).then((body) => ({
    ...(getQuery(event) as Query),
    ...(body && typeof body === 'object' && !Array.isArray(body) ? body as Query : {}),
  }))
}

function rowsForSummary(summary: any): unknown[][] {
  const rows: unknown[][] = [
    ['统计日期', summary.reportDate || ''],
    [],
  ]
  for (const table of summary.tables || []) {
    rows.push([
      table.tableName || '',
      `封装数量：${table.rows?.length || 0}`,
      `工序数量：${table.processes?.length || 0}`,
    ])
    const header: unknown[] = ['每天产能汇总']
    for (const process of table.processes || []) {
      header.push(process.processName || '', '目标产能', '达成率')
    }
    rows.push(header)

    const writeOutputRow = (dataRow: any) => {
      const row: unknown[] = [dataRow?.packageName || '']
      for (const process of table.processes || []) {
        const cell = dataRow?.cells?.[process.processName]
        row.push(numberText(cell?.outputQty), numberText(cell?.targetCapacity), percentText(cell?.achievementRate))
      }
      rows.push(row)
    }

    if (!(table.rows?.length) && !(table.processes?.length)) {
      rows.push(['暂无数据'])
    } else {
      for (const dataRow of table.rows || []) writeOutputRow(dataRow)
      writeOutputRow(table.totalRow)
      if (summary.showStaffRows === true) {
        const staffRow: unknown[] = ['人员数量']
        for (const process of table.processes || []) staffRow.push(numberText(table.staffCounts?.[process.processName]), '', '')
        rows.push(staffRow)
        const averageRow: unknown[] = ['人均产值']
        for (const process of table.processes || []) averageRow.push(numberText(table.averageValues?.[process.processName]), '', '')
        rows.push(averageRow)
      }
    }
    rows.push([])
  }
  return rows
}

export async function exportProcessOutputSummary(event: H3Event) {
  const query = await queryOf(event)
  const summary = await queryProcessOutputSummary(query)
  const name = reportName(query.periodType)
  const tablePart = query.tableName ? `_${String(query.tableName)}` : ''
  const fileName = `${summary.reportDate || ''}${tablePart}_工序产量${name}.xlsx`
  const sheet = XLSX.utils.aoa_to_sheet(rowsForSummary(summary))
  sheet['!cols'] = [{ wch: 20 }]
  const maxProcesses = Math.max(0, ...(summary.tables || []).map((table: any) => table.processes?.length || 0))
  for (let index = 1; index <= maxProcesses * 3; index += 1) sheet['!cols'].push({ wch: 12 })
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, `工序产量${name}`)
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
  setResponseHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`)
  setResponseHeader(event, 'Access-Control-Expose-Headers', 'Content-Disposition')
  return buffer
}
