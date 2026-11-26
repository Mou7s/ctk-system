import { setResponseHeader, type H3Event } from 'h3'
import { getXlsxSync } from './lazy-deps'
import { exceptionExportHeaders } from './exception-read'

export function sendExceptionExcel(event: H3Event, rows: Array<Record<string, unknown>>) {
  const XLSX = getXlsxSync()
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: exceptionExportHeaders })
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, '异常单数据')
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
  setResponseHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent('异常单数据.xlsx')}`)
  setResponseHeader(event, 'Access-Control-Expose-Headers', 'Content-Disposition')
  return buffer
}
