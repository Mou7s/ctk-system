// Use SheetJS's ESM build explicitly. The package's CommonJS entry imports
// dist/cpexcel.js through a Windows absolute path in Nitro dev mode.
import * as XLSX from 'xlsx/xlsx.mjs'
import { setResponseHeader, type H3Event } from 'h3'

export function sendKucunExcel(event: H3Event, rows: Array<Record<string, unknown>>, fileName: string) {
  const worksheet = XLSX.utils.json_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'D栋库存')
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
  setResponseHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`)
  setResponseHeader(event, 'Access-Control-Expose-Headers', 'Content-Disposition')
  return buffer
}
