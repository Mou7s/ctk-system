import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { unzipSync, zipSync } from 'fflate'
import { getNitroServerConfig } from './runtime'
import type { WfTemplateData } from './wf-export'

export const WF_EXPORT_TEMPLATE_RELATIVE_PATH = join('wfsx_excel', 'WFDD.xlsx')

const textDecoder = new TextDecoder()
const textEncoder = new TextEncoder()
const TOKEN_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}|\{\s*([^{}]+?)\s*\}/g
const ROW_PATTERN = /<row\b[^>]*(?:\/>|>[\s\S]*?<\/row>)/g
const CELL_PATTERN = /<c\b[^>]*?\/>|<c\b[^>]*>[\s\S]*?<\/c>/g
const SHARED_ITEM_PATTERN = /<si\b[^>]*>[\s\S]*?<\/si>/g

export class WfTemplateError extends Error {
  readonly statusCode = 503

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'WfTemplateError'
  }
}

type WfCell = {
  raw: string
  ref: string
  row: number
  col: number
}

type WfRow = {
  raw: string
  openTag: string
  prefix: string
  suffix: string
  row: number
  cells: WfCell[]
}

type TokenValues = Record<string, unknown>
type StringTable = SharedStringTable | null

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function decodeXml(value: string): string {
  return value
    .replaceAll(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replaceAll(/&#([0-9]+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')
}

function getAttribute(tag: string, name: string): string | null {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = tag.match(new RegExp(`\\b${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`))
  return match ? (match[1] ?? match[2] ?? null) : null
}

function setAttribute(tag: string, name: string, value: string): string {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const attribute = ` ${name}="${escapeXml(value)}"`
  const pattern = new RegExp(`(\\s${escapedName}\\s*=\\s*)(?:"[^"]*"|'[^']*')`)
  if (pattern.test(tag)) return tag.replace(pattern, `$1"${escapeXml(value)}"`)
  return tag.endsWith('/>') ? `${tag.slice(0, -2)}${attribute}/>` : `${tag.slice(0, -1)}${attribute}>`
}

function removeAttribute(tag: string, name: string): string {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return tag.replace(new RegExp(`\\s${escapedName}\\s*=\\s*(?:"[^"]*"|'[^']*')`), '')
}

function columnToNumber(value: string): number {
  let result = 0
  for (const character of value.toUpperCase()) result = result * 26 + character.charCodeAt(0) - 64
  return result - 1
}

function numberToColumn(value: number): string {
  let result = ''
  let current = value + 1
  while (current > 0) {
    const remainder = (current - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    current = Math.floor((current - 1) / 26)
  }
  return result
}

function parseCellRef(ref: string): { row: number; col: number } | null {
  const match = ref.match(/^([A-Z]+)([0-9]+)$/i)
  if (!match) return null
  return { col: columnToNumber(match[1]), row: Number.parseInt(match[2], 10) }
}

function makeCellRef(col: number, row: number): string {
  return `${numberToColumn(col)}${row}`
}

function getCellOpenTag(raw: string): string {
  const end = raw.indexOf('>')
  if (end < 0) throw new WfTemplateError('外发上锡 Excel 模板单元格结构无效')
  return raw.slice(0, end + 1)
}

function setCellRef(raw: string, ref: string): string {
  return setAttribute(getCellOpenTag(raw), 'r', ref) + raw.slice(getCellOpenTag(raw).length)
}

function getCellValueXml(raw: string): string {
  const value = raw.match(/<v>([\s\S]*?)<\/v>/)
  if (value) return decodeXml(value[1])
  const inlineText = [...raw.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
  if (inlineText.length) return inlineText.map((match) => decodeXml(match[1])).join('')
  return ''
}

function parseRows(sheetData: string): WfRow[] {
  return [...sheetData.matchAll(ROW_PATTERN)].map((match) => {
    const raw = match[0]
    const openEnd = raw.indexOf('>')
    const openTag = raw.slice(0, openEnd + 1)
    const row = Number.parseInt(getAttribute(openTag, 'r') || '0', 10)
    const closeStart = raw.lastIndexOf('</row>')
    const body = closeStart >= 0 ? raw.slice(openEnd + 1, closeStart) : ''
    const cells: WfCell[] = []
    let cursor = 0
    for (const cellMatch of body.matchAll(CELL_PATTERN)) {
      const cellRaw = cellMatch[0]
      const ref = getAttribute(getCellOpenTag(cellRaw), 'r') || ''
      const position = parseCellRef(ref)
      if (!position) continue
      cells.push({ raw: cellRaw, ref, row: position.row, col: position.col })
      cursor = (cellMatch.index || 0) + cellRaw.length
    }
    const firstCell = body.search(CELL_PATTERN)
    const prefix = firstCell >= 0 ? body.slice(0, firstCell) : body
    const suffix = firstCell >= 0 ? body.slice(cursor) : ''
    return { raw, openTag, prefix, suffix, row, cells }
  })
}

function serializeRow(row: WfRow): string {
  const openTag = setAttribute(row.openTag, 'r', String(row.row))
  return `${openTag}${row.prefix}${row.cells.map((cell) => cell.raw).join('')}${row.suffix}</row>`
}

function cloneRow(row: WfRow): WfRow {
  return {
    raw: row.raw,
    openTag: row.openTag,
    prefix: row.prefix,
    suffix: row.suffix,
    row: row.row,
    cells: row.cells.map((cell) => ({ ...cell })),
  }
}

function updateRowNumber(row: WfRow, rowNumber: number): void {
  row.row = rowNumber
  row.cells = row.cells.map((cell) => {
    const updatedRef = makeCellRef(cell.col, rowNumber)
    return { ...cell, row: rowNumber, ref: updatedRef, raw: setCellRef(cell.raw, updatedRef) }
  })
}

class SharedStringTable {
  private readonly entries: string[]
  private readonly indexes = new Map<string, number>()
  private readonly sourceXml: string
  private readonly originalEntryCount: number

  constructor(sourceXml: string) {
    this.sourceXml = sourceXml
    this.entries = [...sourceXml.matchAll(SHARED_ITEM_PATTERN)].map((match) => {
      const value = [...match[0].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
        .map((textMatch) => decodeXml(textMatch[1]))
        .join('')
      return value
    })
    this.originalEntryCount = this.entries.length
    this.entries.forEach((value, index) => {
      if (!this.indexes.has(value)) this.indexes.set(value, index)
    })
  }

  get(index: number): string {
    return this.entries[index] ?? ''
  }

  add(value: string): number {
    const existing = this.indexes.get(value)
    if (existing != null) return existing
    const index = this.entries.length
    this.entries.push(value)
    this.indexes.set(value, index)
    return index
  }

  toXml(sheetXmlByPath: Record<string, string>): string {
    let stringCellCount = 0
    for (const xml of Object.values(sheetXmlByPath)) {
      stringCellCount += [...xml.matchAll(/<c\b[^>]*\bt\s*=\s*['"]s['"][^>]*>/g)].length
    }
    const rootStart = this.sourceXml.indexOf('<sst')
    const rootEnd = rootStart >= 0 ? this.sourceXml.indexOf('>', rootStart) : -1
    const closingTag = this.sourceXml.lastIndexOf('</sst>')
    if (rootStart < 0 || rootEnd < 0 || closingTag < 0 || rootEnd >= closingTag) {
      throw new WfTemplateError('外发上锡 Excel sharedStrings.xml 结构无效')
    }
    const rootTag = this.sourceXml.slice(rootStart, rootEnd + 1)
    const updatedRootTag = setAttribute(setAttribute(rootTag, 'count', String(stringCellCount)), 'uniqueCount', String(this.entries.length))
    const appendedEntriesXml = this.entries.slice(this.originalEntryCount).map((value) => {
      const preserveSpace = /^\s|\s$/.test(value) ? ' xml:space="preserve"' : ''
      return `<si><t${preserveSpace}>${escapeXml(value)}</t></si>`
    }).join('')
    const prefix = this.sourceXml.slice(0, rootStart)
    const body = this.sourceXml.slice(rootEnd + 1, closingTag)
    return `${prefix}${updatedRootTag}${body}${appendedEntriesXml}</sst>`
  }
}

function resolveCellValue(cell: WfCell, sharedStrings: StringTable): string {
  const openTag = getCellOpenTag(cell.raw)
  const type = getAttribute(openTag, 't')
  const value = getCellValueXml(cell.raw)
  if (type === 's') return sharedStrings?.get(Number.parseInt(value, 10)) ?? ''
  return value
}

function setCellValue(cell: WfCell, value: unknown, sharedStrings: StringTable): void {
  const openTag = getCellOpenTag(cell.raw)
  let attrs = removeAttribute(openTag, 't')
  let body: string
  if (typeof value === 'number' && Number.isFinite(value)) {
    attrs = setAttribute(attrs, 't', 'n')
    body = `<v>${String(value)}</v>`
  } else if (typeof value === 'boolean') {
    attrs = setAttribute(attrs, 't', 'b')
    body = `<v>${value ? '1' : '0'}</v>`
  } else {
    const stringValue = String(value ?? '')
    if (sharedStrings) {
      attrs = setAttribute(attrs, 't', 's')
      body = `<v>${sharedStrings.add(stringValue)}</v>`
    } else {
      attrs = setAttribute(attrs, 't', 'inlineStr')
      const preserveSpace = /^\s|\s$/.test(stringValue) ? ' xml:space="preserve"' : ''
      body = `<is><t${preserveSpace}>${escapeXml(stringValue)}</t></is>`
    }
  }
  cell.raw = `${attrs}${body}</c>`
}

function replaceTokens(value: string, values: TokenValues): { value: unknown; changed: boolean } {
  let changed = false
  let exactKey: string | null = null
  const exact = value.match(/^\{\{\s*([^{}]+?)\s*\}\}$|^\{\s*([^{}]+?)\s*\}$/)
  if (exact) exactKey = (exact[1] || exact[2]).trim()
  const replaced = value.replace(TOKEN_PATTERN, (match, doubleKey, singleKey) => {
    const key = String(doubleKey || singleKey).trim()
    if (!(key in values)) return match
    changed = true
    return String(values[key] ?? '')
  })
  if (exactKey && exactKey in values) return { value: values[exactKey], changed: true }
  return { value: replaced, changed }
}

function rowValues(listName: 'list1' | 'list2', item: Record<string, unknown>): TokenValues {
  const values: TokenValues = { ...item }
  for (const [key, value] of Object.entries(item)) {
    values[`${listName}.${key}`] = value
    values[`.${key}`] = value
  }
  return values
}

function shiftMergeRefs(sheetXml: string, fromRow: number, delta: number): string {
  if (delta <= 0) return sheetXml
  return sheetXml.replace(/(<mergeCell\b[^>]*\bref\s*=\s*["'])([^"']+)(["'][^>]*>)/g, (match, prefix, range, suffix) => {
    const refs = range.split(':')
    if (refs.length !== 2) return match
    const start = parseCellRef(refs[0])
    const end = parseCellRef(refs[1])
    if (!start || !end) return match
    if (start.row >= fromRow) start.row += delta
    if (end.row >= fromRow) end.row += delta
    return `${prefix}${makeCellRef(start.col, start.row)}:${makeCellRef(end.col, end.row)}${suffix}`
  })
}

function findListRow(rows: WfRow[], listName: 'list1' | 'list2', sharedStrings: SharedStringTable): number {
  return rows.findIndex((row) => row.cells.some((cell) => {
    const value = resolveCellValue(cell, sharedStrings)
    return value.includes(`{${listName}.`) || value.includes(`{{${listName}.`) || value.includes('{.col') || value.includes('{{.col')
  }))
}

function expandListRows(
  rows: WfRow[],
  sheetXml: string,
  listName: 'list1' | 'list2',
  items: Array<Record<string, unknown>>,
  sharedStrings: StringTable,
): { rows: WfRow[]; sheetXml: string; changed: boolean } {
  const templateIndex = findListRow(rows, listName, sharedStrings)
  if (templateIndex < 0) return { rows, sheetXml, changed: false }

  const template = rows[templateIndex]
  const count = Math.max(items.length, 1)
  const generatedRows: WfRow[] = []
  for (let offset = 0; offset < count; offset++) {
    const generated = cloneRow(template)
    const values = rowValues(listName, items[offset] || {})
    generated.cells.forEach((cell) => {
      const replacement = replaceTokens(resolveCellValue(cell, sharedStrings), values)
      if (replacement.changed) setCellValue(cell, replacement.value, sharedStrings)
    })
    updateRowNumber(generated, template.row + offset)
    generatedRows.push(generated)
  }

  const delta = count - 1
  if (delta > 0) {
    for (let index = templateIndex + 1; index < rows.length; index++) updateRowNumber(rows[index], rows[index].row + delta)
    sheetXml = shiftMergeRefs(sheetXml, template.row + 1, delta)
  }
  rows.splice(templateIndex, 1, ...generatedRows)
  return { rows, sheetXml, changed: true }
}

function fillGlobalTokens(rows: WfRow[], headers: TokenValues, sharedStrings: StringTable): number {
  let replacements = 0
  for (const row of rows) {
    for (const cell of row.cells) {
      const replacement = replaceTokens(resolveCellValue(cell, sharedStrings), headers)
      if (!replacement.changed) continue
      setCellValue(cell, replacement.value, sharedStrings)
      replacements++
    }
  }
  return replacements
}

function updateDimension(sheetXml: string, rows: WfRow[]): string {
  const existing = sheetXml.match(/<dimension\b[^>]*\bref\s*=\s*["']([^"']+)["'][^>]*\/>/)
  const current = existing?.[1]?.split(':') || ['A1', 'A1']
  const start = parseCellRef(current[0]) || { row: 1, col: 0 }
  const end = parseCellRef(current[1] || current[0]) || { row: 1, col: 0 }
  const lastRow = rows.reduce((max, row) => Math.max(max, row.row), end.row)
  const lastCol = rows.reduce((max, row) => row.cells.reduce((rowMax, cell) => Math.max(rowMax, cell.col), max), end.col)
  const ref = `${makeCellRef(start.col, start.row)}:${makeCellRef(lastCol, lastRow)}`
  if (!existing) return sheetXml
  return sheetXml.replace(existing[0], existing[0].replace(existing[1], ref))
}

function updateSheetData(sheetXml: string, rows: WfRow[]): string {
  const sheetData = sheetXml.match(/<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/)
  if (!sheetData) throw new WfTemplateError('外发上锡 Excel 模板缺少 sheetData')
  const updated = sheetData[0].replace(sheetData[1], rows.map(serializeRow).join(''))
  return sheetXml.replace(sheetData[0], updated)
}

function decodeZipText(files: Record<string, Uint8Array>, path: string): string {
  const file = files[path]
  if (!file) throw new WfTemplateError(`外发上锡 Excel 模板缺少 ${path}`)
  return textDecoder.decode(file)
}

function encodeZipText(value: string): Uint8Array {
  return textEncoder.encode(value)
}

function fillZipTemplate(template: Buffer, data: WfTemplateData): Buffer {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(new Uint8Array(template))
  } catch (error) {
    throw new WfTemplateError('外发上锡 Excel 模板解析失败', { cause: error })
  }

  try {
    const sheetPath = 'xl/worksheets/sheet1.xml'
    const sheetXml = decodeZipText(files, sheetPath)
    const sharedStringsPath = 'xl/sharedStrings.xml'
    const sharedStrings = files[sharedStringsPath]
      ? new SharedStringTable(textDecoder.decode(files[sharedStringsPath]))
      : null

    const sheetData = sheetXml.match(/<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/)?.[1]
    if (!sheetData) throw new WfTemplateError('外发上锡 Excel 模板缺少 sheetData')
    let rows = parseRows(sheetData)
    let updatedSheetXml = sheetXml
    let replacements = 0

    const list1Result = expandListRows(rows, updatedSheetXml, 'list1', data.list1, sharedStrings)
    rows = list1Result.rows
    updatedSheetXml = list1Result.sheetXml
    if (list1Result.changed) replacements++

    const list2Result = expandListRows(rows, updatedSheetXml, 'list2', data.list2, sharedStrings)
    rows = list2Result.rows
    updatedSheetXml = list2Result.sheetXml
    if (list2Result.changed) replacements++

    replacements += fillGlobalTokens(rows, data.headers, sharedStrings)
    if (!replacements) throw new WfTemplateError('外发上锡 Excel 模板缺少可填充的占位符')

    updatedSheetXml = updateSheetData(updatedSheetXml, rows)
    updatedSheetXml = updateDimension(updatedSheetXml, rows)
    files[sheetPath] = encodeZipText(updatedSheetXml)

    const sheetXmlByPath: Record<string, string> = {}
    for (const [path, content] of Object.entries(files)) {
      if (path.startsWith('xl/worksheets/') && path.endsWith('.xml')) sheetXmlByPath[path] = path === sheetPath ? updatedSheetXml : textDecoder.decode(content)
    }
    if (sharedStrings) files[sharedStringsPath] = encodeZipText(sharedStrings.toXml(sheetXmlByPath))

    return Buffer.from(zipSync(files, { level: 6 }))
  } catch (error) {
    if (error instanceof WfTemplateError) throw error
    throw new WfTemplateError('外发上锡 Excel 生成失败', { cause: error })
  }
}

export function fillWfTemplate(template: Buffer, data: WfTemplateData): Buffer {
  return fillZipTemplate(template, data)
}

export async function generateWfExcel(data: WfTemplateData): Promise<Buffer> {
  const profilePath = getNitroServerConfig().profilePath
  const templatePath = join(profilePath, WF_EXPORT_TEMPLATE_RELATIVE_PATH)
  let template: Buffer
  try {
    template = await readFile(templatePath)
  } catch (error) {
    throw new WfTemplateError('外发上锡 Excel 模板不存在，请检查 profilePath/wfsx_excel/WFDD.xlsx', { cause: error })
  }
  return fillWfTemplate(template, data)
}
