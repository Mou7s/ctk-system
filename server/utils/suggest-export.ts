import * as XLSX from 'xlsx/xlsx.mjs'
import { setResponseHeader, type H3Event } from 'h3'
import { suggestExportHeaders } from './suggest-read'

export function sendSuggestExcel(event: H3Event, rows: Array<Record<string, unknown>>) {
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: suggestExportHeaders })
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, '意见建议数据')
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
  setResponseHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent('意见建议数据.xlsx')}`)
  setResponseHeader(event, 'Access-Control-Expose-Headers', 'Content-Disposition')
  return buffer
}
