// Resize the detail band without reserializing drawings, styles or shared strings.
// Footer rows and merged cells move together; the print area follows the new end.
export function resizeDomesticDetailRows(
  files: Record<string, Uint8Array>, sheetXml: string,
  firstRow: number, footerRow: number, count: number,
): { sheetXml: string; offset: number } {
  const offset = count - (footerRow - firstRow)
  const lastRow = Number(/<dimension\b[^>]*ref="[A-Z]+\d+:[A-Z]+(\d+)"/u.exec(sheetXml)?.[1] || footerRow)
  if (lastRow + offset > 1048576) throw new Error('明细超出 Excel 单个工作表可容纳的行数')
  const moveRefs = (xml: string) => xml.replace(/\b(r|ref|sqref)="([^"]+)"/gu, (_all, key, value) => {
    const moved = key === 'r' && /^\d+$/u.test(value)
      ? String(Number(value) >= footerRow ? Number(value) + offset : value)
      : value.replace(/(\$?[A-Z]+\$?)(\d+)/gu, (_ref: string, col: string, row: string) => `${col}${Number(row) >= footerRow ? Number(row) + offset : row}`)
    return `${key}="${moved}"`
  })
  const rowPattern = /<row\b[^>]*\br="(\d+)"[^>]*(?:\/>|>[\s\S]*?<\/row>)/gu
  const rows = [...sheetXml.matchAll(rowPattern)]
  const source = rows.find(row => Number(row[1]) === firstRow)?.[0]
  if (!source) throw new Error('内贸模板缺少明细样式行')
  const details = Array.from({ length: count }, (_, index) => source.replace(/\br="([A-Z]*)(\d+)"/gu, (_all, col) => `r="${col}${firstRow + index}"`)).join('')
  const data = rows.map(row => {
    const number = Number(row[1])
    if (number === firstRow) return details
    if (number > firstRow && number < footerRow) return ''
    return moveRefs(row[0])
  }).join('')
  sheetXml = sheetXml.replace(/(<sheetData\b[^>]*>)[\s\S]*?(<\/sheetData>)/u, (_all, open, close) => `${open}${data}${close}`)
  sheetXml = sheetXml.replace(/<mergeCells\b[^>]*>([\s\S]*?)<\/mergeCells>/u, (_all, body) => {
    const merges = [...body.matchAll(/<mergeCell\b[^>]*ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"[^>]*\/>/gu)].flatMap(match => {
      const start = Number(match[2]); const end = Number(match[4])
      if (start === firstRow && end === firstRow) return Array.from({ length: count }, (_, index) => `<mergeCell ref="${match[1]}${firstRow + index}:${match[3]}${firstRow + index}"/>`)
      if (start >= firstRow && end < footerRow) return []
      return [moveRefs(match[0])]
    })
    return `<mergeCells count="${merges.length}">${merges.join('')}</mergeCells>`
  })
  sheetXml = sheetXml.replace(/(<dimension\b[^>]*ref=")[^"]+"/u, `$1A1:I${lastRow + offset}"`)
    .replace(/fitToHeight="\d+"/u, 'fitToHeight="0"')
  const decoder = new TextDecoder(); const encoder = new TextEncoder()
  if (files['xl/workbook.xml']) {
    const xml = decoder.decode(files['xl/workbook.xml']).replace(/(<definedName\b[^>]*name="_xlnm.Print_Area"[^>]*>)([\s\S]*?)(<\/definedName>)/u,
      (_all, open, area, close) => `${open}${area.replace(/(\$[A-Z]+\$)(\d+)$/u, (_ref: string, col: string, row: string) => `${col}${Number(row) + offset}`)}${close}`)
    files['xl/workbook.xml'] = encoder.encode(xml)
  }
  return { sheetXml, offset }
}

export function syncQuotationPrintArea(files: Record<string, Uint8Array>, sheetXml: string): void {
  const lastRow = Number(/<dimension\b[^>]*ref="[A-Z]+\d+:[A-Z]+(\d+)"/u.exec(sheetXml)?.[1] || 0)
  const bytes = files['xl/workbook.xml']
  if (!bytes || !lastRow) return
  const xml = new TextDecoder().decode(bytes).replace(/(<definedName\b[^>]*name="_xlnm.Print_Area"[^>]*>)([\s\S]*?)(<\/definedName>)/u,
    (_all, open, area, close) => `${open}${area.replace(/(\$[A-Z]+\$)(\d+)$/u, (_ref: string, col: string) => `${col}${lastRow}`)}${close}`)
  files['xl/workbook.xml'] = new TextEncoder().encode(xml)
}
