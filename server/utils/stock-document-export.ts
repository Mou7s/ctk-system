import { getQuery, setResponseHeader, type H3Event } from 'h3'
import { unzipSync, zipSync } from 'fflate'
import * as XLSX from 'xlsx/xlsx.mjs'
import { getAuthSession } from './auth'
import { executeBillQuery, K3CloudError } from './k3'
import { apiError, errorMessage } from './response'
import { buildDocumentFilter } from './stock-document'

const FORM_ID = 'PRD_INSTOCK'
const BATCH_SIZE = 1_000
const MAX_ROWS = 20_000
const EXPORT_FIELDS = [
  'FDate',
  'FMaterialId.FNumber',
  'FMaterialId.FName',
  'FMaterialId.FSpecification',
  'FRealQty',
]

const CATEGORIES = [
  { name: '玻封成品' },
  { name: '塑封 SOD-323' },
  { name: '塑封 SOD-123' },
  { name: '塑封 SOT-23' },
  { name: '塑封 SOT-23-3L' },
  { name: '塑封 SOT-23-5L' },
  { name: '塑封 SOT-23-6L/27R' },
  { name: '塑封 SOD-523' },
  { name: 'DFN 无引脚系列' },
  { name: 'PDFN 功率贴片' },
  { name: 'TO 功率器件' },
  { name: '其他封装' },
] as const

type Query = Record<string, unknown>
type Material = {
  modelKey: string
  materialNumber: string
  materialName: string
  specification: string
  category: string
  chipType: string
}
type ColumnType = 'DATE' | 'DATA' | 'SUBTOTAL' | 'GRAND_TOTAL'
type ColumnRange = { start: number; subtotal: number; dataEnd: number; repeatDate: number }
type CellRef = { r: number; c: number }
type Merge = { s: CellRef; e: CellRef }

class ProductionReceiptExportInputError extends Error {
  readonly statusCode = 400
}

function scalar(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value
}

function text(value: unknown): string {
  return String(scalar(value) ?? '').trim()
}

function numberValue(value: unknown): number {
  const parsed = Number(scalar(value))
  return Number.isFinite(parsed) ? parsed : 0
}

function parseDate(value: unknown, label: string): string {
  const normalized = text(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new ProductionReceiptExportInputError(`${label}格式不正确`)
  }
  const [year, month, day] = normalized.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new ProductionReceiptExportInputError(`${label}格式不正确`)
  }
  return normalized
}

function nextDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

function currentYearMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function lastDayOfMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number)
  const date = new Date(Date.UTC(year, month, 0))
  return date.toISOString().slice(0, 10)
}

function resolveDateRange(query: Query): { targetMonth: string; startDate: string; endDate: string } {
  const rawYearMonth = text(query.yearMonth)
  const rawBeginDate = text(query.beginDate)
  const rawEndDate = text(query.endDate)

  let targetMonth = currentYearMonth()
  if (rawYearMonth) {
    if (!/^\d{4}-\d{2}$/.test(rawYearMonth)) {
      throw new ProductionReceiptExportInputError('月份格式不正确')
    }
    const [year, month] = rawYearMonth.split('-').map(Number)
    if (month < 1 || month > 12) throw new ProductionReceiptExportInputError('月份格式不正确')
    targetMonth = rawYearMonth
  } else if (rawBeginDate) {
    targetMonth = parseDate(rawBeginDate, '开始日期').slice(0, 7)
  }

  const startDate = rawBeginDate ? parseDate(rawBeginDate, '开始日期') : `${targetMonth}-01`
  const endDate = rawEndDate ? parseDate(rawEndDate, '结束日期') : lastDayOfMonth(targetMonth)
  if (endDate < startDate) throw new ProductionReceiptExportInputError('结束日期不能早于开始日期')
  // 矩阵表的标题与 Sheet 名只写一个月，跨月区间必须显式拒绝，避免标题与内容不符
  if (startDate.slice(0, 7) !== endDate.slice(0, 7)) {
    throw new ProductionReceiptExportInputError('月度入库明细表按月导出，请选择同一月份内的日期范围')
  }
  return { targetMonth: startDate.slice(0, 7), startDate, endDate }
}

function validateRows(rows: unknown[]): unknown[][] {
  return rows.map((row) => {
    if (!Array.isArray(row)) throw new Error('金蝶生产入库导出查询字段异常')
    return row.length === EXPORT_FIELDS.length
      ? row
      : row.length > EXPORT_FIELDS.length
        ? row.slice(0, EXPORT_FIELDS.length)
        : [...row, ...Array.from({ length: EXPORT_FIELDS.length - row.length }, () => null)]
  })
}

async function queryExportRows(query: Query, startDate: string, endDate: string): Promise<unknown[][]> {
  let filterString: string
  try {
    // 与列表页同源的关键字口径（单号/物料/规格前缀/仓库/生产订单号），状态固定为已审核
    filterString = buildDocumentFilter('productionReceipt', {
      ...query,
      documentStatus: 'C',
      beginDate: startDate,
      endDate,
    })
  } catch (error) {
    throw new ProductionReceiptExportInputError(errorMessage(error, '筛选条件不正确'))
  }
  const rows: unknown[][] = []
  let startRow = 0

  while (rows.length < MAX_ROWS) {
    const limit = Math.min(BATCH_SIZE, MAX_ROWS - rows.length)
    const batch = await executeBillQuery({
      formId: FORM_ID,
      fieldKeys: EXPORT_FIELDS,
      filterString,
      orderString: 'FDate ASC,FMaterialId.FNumber ASC,FEntity_FSeq ASC',
      startRow,
      limit,
    })
    if (!Array.isArray(batch)) throw new Error('金蝶生产入库导出查询返回异常')
    const validated = validateRows(batch)
    rows.push(...validated)
    if (validated.length < limit) break
    startRow += validated.length
  }
  return rows
}

function classifyCategory(specification: string, materialName: string): string {
  const value = `${specification} ${materialName}`.toUpperCase()
  if (value.includes('玻封') || value.includes('LL-34') || value.includes('LL-41') || value.includes('LL4148')) return '玻封成品'
  if (value.includes('SOD-323') || value.includes('SOD323')) return '塑封 SOD-323'
  if (value.includes('SOD-123') || value.includes('SOD123')) return '塑封 SOD-123'
  if (value.includes('SOT-23-3L') || value.includes('SOT23-3L')) return '塑封 SOT-23-3L'
  if (value.includes('SOT-23-5L') || value.includes('SOT23-5L')) return '塑封 SOT-23-5L'
  if (value.includes('SOT-23-6L') || value.includes('SOT23-6L') || value.includes('27R') || value.includes('SOT-26')) return '塑封 SOT-23-6L/27R'
  if (value.includes('SOT-23') || value.includes('SOT23')) return '塑封 SOT-23'
  if (value.includes('SOD-523') || value.includes('SOD523')) return '塑封 SOD-523'
  if (value.includes('PDFN')) return 'PDFN 功率贴片'
  if (value.includes('DFN')) return 'DFN 无引脚系列'
  if (value.includes('TO-252') || value.includes('TO-251') || value.includes('TO-220') || value.includes('SOT-89')) return 'TO 功率器件'
  return '其他封装'
}

function classifyChipType(specification: string, materialName: string): string {
  const value = `${specification} ${materialName}`.toUpperCase()
  if (value.includes('双芯')) return '双芯'
  if (value.includes('三芯')) return '三芯'
  if (value.includes('四芯')) return '四芯'
  if (value.includes('单芯')) return '单芯'
  if (value.includes('SOT23-6L')) return 'SOT23-6L'
  return '-'
}

function buildMatrix(rawRows: unknown[][], startDate: string, endDate: string, targetMonth: string): Buffer {
  const dateModelQty = new Map<string, Map<string, number>>()
  const materialMap = new Map<string, Material>()

  for (const row of rawRows) {
    const date = text(row[0]).slice(0, 10)
    const materialNumber = text(row[1])
    const materialName = text(row[2])
    const specification = text(row[3])
    const modelKey = `${materialName}||${specification}`
    if (!materialMap.has(modelKey)) {
      materialMap.set(modelKey, {
        modelKey,
        materialNumber,
        materialName,
        specification,
        category: classifyCategory(specification, materialName),
        chipType: classifyChipType(specification, materialName),
      })
    }
    const dayMap = dateModelQty.get(date) || new Map<string, number>()
    dayMap.set(modelKey, (dayMap.get(modelKey) || 0) + numberValue(row[4]))
    dateModelQty.set(date, dayMap)
  }

  const categoryMaterials = new Map<string, Material[]>()
  for (const category of CATEGORIES) categoryMaterials.set(category.name, [])
  for (const material of materialMap.values()) {
    const materials = categoryMaterials.get(material.category) || []
    materials.push(material)
    categoryMaterials.set(material.category, materials)
  }
  for (const materials of categoryMaterials.values()) {
    materials.sort((left, right) => left.materialName.localeCompare(right.materialName) || left.specification.localeCompare(right.specification))
  }

  const columnTypes: ColumnType[] = ['DATE']
  const columnMaterials: Array<Material | null> = [null]
  const columnCategories = ['主日期']
  const categoryRanges = new Map<string, ColumnRange>()
  const subtotalColumns: number[] = []
  let currentColumn = 1

  for (const category of CATEGORIES) {
    const materials = categoryMaterials.get(category.name) || []
    if (!materials.length) continue
    const start = currentColumn
    for (const material of materials) {
      columnTypes.push('DATA')
      columnMaterials.push(material)
      columnCategories.push(category.name)
      currentColumn += 1
    }
    const subtotal = currentColumn
    columnTypes.push('SUBTOTAL')
    columnMaterials.push(null)
    columnCategories.push(category.name)
    subtotalColumns.push(subtotal)
    currentColumn += 1

    const repeatDate = currentColumn
    columnTypes.push('DATE')
    columnMaterials.push(null)
    columnCategories.push(category.name)
    currentColumn += 1
    categoryRanges.set(category.name, { start, subtotal, dataEnd: subtotal - 1, repeatDate })
  }

  const grandTotal = currentColumn
  columnTypes.push('GRAND_TOTAL')
  columnMaterials.push(null)
  columnCategories.push('总合计')
  const columnCount = columnTypes.length

  const rows: unknown[][] = [
    Array.from({ length: columnCount }, () => ''),
    Array.from({ length: columnCount }, () => ''),
    Array.from({ length: columnCount }, () => ''),
    Array.from({ length: columnCount }, () => ''),
  ]
  const merges: Merge[] = [{ s: { r: 1, c: 0 }, e: { r: 3, c: 0 } }]
  rows[0][0] = targetMonth.replace('-', '/')
  rows[1][0] = '日期'

  for (let column = 1; column < columnCount; column += 1) {
    const type = columnTypes[column]
    const material = columnMaterials[column]
    if (type === 'DATA' && material) {
      rows[2][column] = material.materialName
      rows[3][column] = material.chipType
    }
    if (type === 'DATE') {
      rows[1][column] = '日期'
      merges.push({ s: { r: 1, c: column }, e: { r: 3, c: column } })
    } else if (type === 'GRAND_TOTAL') {
      rows[1][column] = '总合计'
      merges.push({ s: { r: 1, c: column }, e: { r: 3, c: column } })
    }
  }

  for (const category of CATEGORIES) {
    const range = categoryRanges.get(category.name)
    if (!range) continue
    rows[0][range.start] = `${targetMonth.slice(0, 4)}年（${Number(targetMonth.slice(5))}月）${category.name}入库明细`
    rows[1][range.start] = category.name
    rows[1][range.subtotal] = '每日小计'
    rows[2][range.subtotal] = '小计'
    merges.push({ s: { r: 0, c: range.start }, e: { r: 0, c: range.subtotal } })
    if (range.dataEnd > range.start) merges.push({ s: { r: 1, c: range.start }, e: { r: 1, c: range.dataEnd } })
    merges.push({ s: { r: 2, c: range.subtotal }, e: { r: 3, c: range.subtotal } })
  }

  const formulaCells: Array<{ row: number; column: number; formula: string; value: number }> = []
  const dates: string[] = []
  for (let date = startDate; date <= endDate; date = nextDate(date)) dates.push(date)
  for (const date of dates) {
    const rowNumber = rows.length
    const row = Array.from({ length: columnCount }, () => '')
    const dayMap = dateModelQty.get(date) || new Map<string, number>()
    const subtotalValues = new Map<number, number>()
    for (let column = 0; column < columnCount; column += 1) {
      const type = columnTypes[column]
      if (type === 'DATE') row[column] = `${Number(date.slice(5, 7))}-${Number(date.slice(8, 10))}`
      else if (type === 'DATA') {
        const quantity = Math.max(0, dayMap.get(columnMaterials[column]?.modelKey || '') || 0)
        row[column] = quantity > 0 ? quantity : ''
      }
      else if (type === 'SUBTOTAL') {
        const range = categoryRanges.get(columnCategories[column])
        if (range) {
          const subtotalValue = Array.from({ length: range.dataEnd - range.start + 1 }, (_, offset) => row[range.start + offset])
            .reduce((sum, value) => sum + (typeof value === 'number' ? value : 0), 0)
          subtotalValues.set(column, subtotalValue)
          row[column] = subtotalValue
          formulaCells.push({ row: rowNumber, column, value: subtotalValue, formula: `SUM(${cellAddress(range.start, rowNumber + 1)}:${cellAddress(range.dataEnd, rowNumber + 1)})` })
        }
      } else if (type === 'GRAND_TOTAL') {
        const formula = subtotalColumns.map((subtotal) => cellAddress(subtotal, rowNumber + 1)).join('+')
        const grandTotalValue = subtotalColumns.reduce((sum, subtotal) => sum + (subtotalValues.get(subtotal) || 0), 0)
        row[column] = grandTotalValue
        if (formula) formulaCells.push({ row: rowNumber, column, value: grandTotalValue, formula })
      }
    }
    rows.push(row)
  }

  const totalRowNumber = rows.length
  const firstDataRow = 5
  const lastDataRow = rows.length - 0
  const totalRow = Array.from({ length: columnCount }, () => '')
  totalRow[0] = '月度合计'
  for (let column = 1; column < columnCount; column += 1) {
    if (columnTypes[column] === 'DATE') totalRow[column] = '合计'
    else {
      const totalValue = rows.slice(4).reduce((sum, row) => sum + (typeof row[column] === 'number' ? row[column] as number : 0), 0)
      totalRow[column] = totalValue
      formulaCells.push({ row: totalRowNumber, column, value: totalValue, formula: `SUM(${cellAddress(column, firstDataRow)}:${cellAddress(column, lastDataRow)})` })
    }
  }
  rows.push(totalRow)

  const sheet = XLSX.utils.aoa_to_sheet(rows)
  for (const item of formulaCells) {
    sheet[XLSX.utils.encode_cell({ r: item.row, c: item.column })] = { t: 'n', f: item.formula, v: item.value }
  }
  sheet['!merges'] = merges
  sheet['!cols'] = columnTypes.map((type) => ({
    wch: type === 'DATE' ? 8 : type === 'DATA' ? 12 : 14,
  }))

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, `${targetMonth.slice(0, 4)}年${targetMonth.slice(5)}月`)
  const workbookBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer
  return styleMatrixWorkbook(workbookBuffer, columnTypes, totalRowNumber + 1)
}

function cellAddress(column: number, rowNumber: number): string {
  return XLSX.utils.encode_cell({ r: rowNumber - 1, c: column })
}

function matrixStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.###"/><numFmt numFmtId="165" formatCode="#,##0"/></numFmts>
  <fonts count="5">
    <font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>
    <font><b/><sz val="15"/><color rgb="FFFFFFFF"/><name val="Microsoft YaHei"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Microsoft YaHei"/></font>
    <font><b/><sz val="10"/><color rgb="FF1F2937"/><name val="Microsoft YaHei"/></font>
    <font><b/><sz val="10"/><color rgb="FF1F2937"/><name val="Consolas"/></font>
  </fonts>
  <fills count="9">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF2F75B5"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD9EAF7"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEAF1F8"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE2F0D9"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF3F6F9"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFB7C9D6"/></left><right style="thin"><color rgb="FFB7C9D6"/></right><top style="thin"><color rgb="FFB7C9D6"/></top><bottom style="thin"><color rgb="FFB7C9D6"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="18">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="8" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="2" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="8" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="164" fontId="4" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="164" fontId="4" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="164" fontId="4" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="165" fontId="4" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="165" fontId="4" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="165" fontId="4" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  <dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleMedium4"/>
</styleSheet>`
}

function matrixCellStyleId(row: number, column: number, columnTypes: ColumnType[], totalRow: number): number {
  const type = columnTypes[column]
  if (row === 1) return column === 0 ? 13 : 1
  if (row === 2) {
    if (type === 'DATE') return 5
    if (type === 'SUBTOTAL' || type === 'GRAND_TOTAL') return 6
    return 3
  }
  if (row === 3 || row === 4) {
    if (type === 'DATE') return 5
    if (type === 'SUBTOTAL' || type === 'GRAND_TOTAL') return 6
    return 4
  }
  if (row === totalRow) {
    if (column === 1 || type === 'DATE') return 11
    return 12
  }
  if (type === 'DATE') return 7
  if (type === 'SUBTOTAL') return 9
  if (type === 'GRAND_TOTAL') return 10
  return 8
}

function styleMatrixWorkbook(buffer: Buffer, columnTypes: ColumnType[], totalRow: number): Buffer {
  const files = unzipSync(new Uint8Array(buffer))
  const decoder = new TextDecoder('utf-8')
  const encoder = new TextEncoder()
  const sheetPath = 'xl/worksheets/sheet1.xml'
  const sheetBytes = files[sheetPath]
  const stylesPath = 'xl/styles.xml'
  if (!sheetBytes || !files[stylesPath]) return buffer

  let sheetXml = decoder.decode(sheetBytes)
  sheetXml = sheetXml.replace(/<c\b([^>]*\br="([A-Z]+)(\d+)"[^>]*)>/gu, (full, attributes, columnLetters, rowText) => {
    const row = Number(rowText)
    const column = XLSX.utils.decode_col(columnLetters)
    const styleId = matrixCellStyleId(row, column, columnTypes, totalRow)
    const nextAttributes = /\bs="\d+"/u.test(attributes)
      ? attributes.replace(/\bs="\d+"/u, `s="${styleId}"`)
      : `${attributes} s="${styleId}"`
    return `<c${nextAttributes}>`
  })
  sheetXml = sheetXml.replace(/<c\b([^>]*\br="([A-Z]+)(\d+)"[^>]*)>([\s\S]*?)<\/c>/gu, (full, attributes, _columnLetters, _rowText, body) => {
    const styleId = Number(attributes.match(/\bs="(\d+)"/u)?.[1])
    const valueText = body.match(/<v>([^<]*)<\/v>/u)?.[1]?.trim()
    const cellType = attributes.match(/\bt="([^"]+)"/u)?.[1]
    if (!Number.isInteger(styleId) || cellType === 'str' || cellType === 'inlineStr' || !valueText) return full
    const value = Number(valueText)
    if (!Number.isFinite(value) || !Number.isInteger(value)) return full
    const integerStyleId = ({ 8: 14, 9: 15, 10: 16, 12: 17 } as Record<number, number>)[styleId] || styleId
    if (integerStyleId === styleId) return full
    const nextAttributes = attributes.replace(/\bs="\d+"/u, `s="${integerStyleId}"`)
    return `<c${nextAttributes}>${body}</c>`
  })
  sheetXml = sheetXml.replace(
    /<sheetView\b[^>]*\/>/u,
    '<sheetView workbookViewId="0"><pane xSplit="1" ySplit="4" topLeftCell="B5" activePane="bottomRight" state="frozen"/><selection pane="bottomRight" activeCell="B5" sqref="B5"/></sheetView>',
  )
  for (const [row, height] of [[1, 30], [2, 32], [3, 28], [4, 22]] as const) {
    const rowPattern = new RegExp(`(<row\\b[^>]*\\br="${row}"[^>]*)>`, 'u')
    sheetXml = sheetXml.replace(rowPattern, (_full, attributes) => {
      const nextAttributes = attributes
        .replace(/\\sht="[^"]*"/u, '')
        .replace(/\\scustomHeight="[^"]*"/u, '')
      return `${nextAttributes} ht="${height}" customHeight="1">`
    })
  }
  if (!sheetXml.includes('<pageSetup ')) {
    const printSettings = '<pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>'
    sheetXml = sheetXml.includes('<ignoredErrors')
      ? sheetXml.replace('<ignoredErrors', `${printSettings}<ignoredErrors`)
      : sheetXml.replace('</worksheet>', `${printSettings}</worksheet>`)
  }

  files[sheetPath] = encoder.encode(sheetXml)
  files[stylesPath] = encoder.encode(matrixStylesXml())
  return Buffer.from(zipSync(files))
}

export async function exportProductionReceiptMatrix(event: H3Event) {
  if (!await getAuthSession(event)) return apiError('登录状态已过期', 401)

  try {
    const query = getQuery(event) as Query
    const { targetMonth, startDate, endDate } = resolveDateRange(query)
    const rawRows = await queryExportRows(query, startDate, endDate)
    const buffer = buildMatrix(rawRows, startDate, endDate, targetMonth)
    const fileName = `成品入库明细表_${targetMonth.replace('-', '')}.xlsx`
    setResponseHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    setResponseHeader(event, 'Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`)
    setResponseHeader(event, 'Access-Control-Expose-Headers', 'Content-Disposition')
    return buffer
  } catch (error) {
    if (error instanceof ProductionReceiptExportInputError) return apiError(error.message, error.statusCode)
    if (error instanceof K3CloudError) {
      console.error(`[NitroK3:stockDocument/exportProductionReceiptMatrix:${error.kind}]`, errorMessage(error, 'unknown error'))
      return apiError(error.message, error.statusCode)
    }
    console.error('[NitroK3:stockDocument/exportProductionReceiptMatrix]', errorMessage(error, 'unknown error'))
    return apiError('金蝶生产入库明细导出失败，请检查金蝶连接或稍后重试', 502)
  }
}
