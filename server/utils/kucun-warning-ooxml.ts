/**
 * 金蝶库存预警报表 · 原生 OOXML 生成器（不依赖 SheetJS 写入）。
 * 参照退役 Java POI 产出的合法结构（inlineStr + numFmts + cellXfs 索引），
 * 保证 Excel/WPS 打开零修复提示；样式为 2026-09 设计版。
 */

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
function esc(value: string): string {
  return value.replace(/[&<>"]/g, (ch) => ESC[ch]!)
}

// ---- 调色板（ARGB，无 FF 前缀时 POI 同样用 6 位）----
const C = {
  navy: '1E3A8A', slate: '1E293B', white: 'FFFFFF',
  border: 'E2E8F0', borderHead: '334155',
  zebra: 'F8FAFC', ink: '334155', muted: '64748B', faint: '94A3B8',
  panel: 'F8FAFC',
  totalBg: 'EFF6FF', totalFg: '1D4ED8',
  lowBg: 'FEF2F2', lowFg: 'DC2626',
  okBg: 'ECFDF5', okFg: '059669',
  gapBg: 'FFFBEB', gapFg: 'D97706',
  warnRowBg: 'FEF2F2', warnFg: 'B91C1C', gapWarnBg: 'FECACA',
  chipLowBg: 'FEE2E2', chipOkBg: 'D1FAE5', chipOkFg: '047857',
}
const FONT_NAME = '微软雅黑'
const NUMFMT = '#,##0.##'

// ---- 样式登记表（下标即 s= 索引）----
type Font = { sz: number; bold?: boolean; italic?: boolean; color: string }
type Fill = { bg: string }
type Border = boolean
type Align = 'center' | 'left' | 'right'
type Xf = { font: Font; fill?: Fill; border?: Border; align: Align; numFmt?: boolean; indent?: number }

const XFS: Xf[] = []
function xf(x: Xf): number {
  XFS.push(x)
  return XFS.length - 1
}

// 0 默认
xf({ font: { sz: 11, color: C.ink }, align: 'left' })
// 1 标题横幅
const S_TITLE = xf({ font: { sz: 18, bold: true, color: C.white }, fill: { bg: C.navy }, align: 'center' })
// 2 副标题
const S_SUB = xf({ font: { sz: 9, color: C.muted }, fill: { bg: C.panel }, align: 'left' })
// 3/4 KPI 标签+值（各卡复制生成）
function kpiPair(bg: string, fg: string, sz = 16): [number, number] {
  const label = xf({ font: { sz: 9, bold: true, color: C.muted }, fill: { bg }, align: 'center', border: true })
  const value = xf({ font: { sz, bold: true, color: fg }, fill: { bg }, align: 'center', border: true, numFmt: true })
  return [label, value]
}
const [S_KPI_T_L, S_KPI_T_V] = kpiPair(C.totalBg, C.totalFg)
const [S_KPI_L_L, S_KPI_L_V] = kpiPair(C.lowBg, C.lowFg)
const [S_KPI_O_L, S_KPI_O_V] = kpiPair(C.okBg, C.okFg)
const [S_KPI_G_L, S_KPI_G_V] = kpiPair(C.gapBg, C.gapFg)
const [S_KPI_D_L, S_KPI_D_V] = kpiPair(C.panel, C.ink, 10)
// 13 表头
const S_HEAD = xf({ font: { sz: 10, bold: true, color: C.white }, fill: { bg: C.slate }, align: 'center', border: true })
// 数据行样式（正常白/斑马、偏低红、缺口色块、状态徽章）
function rowStyles(bg: string, numFg: string, bold: boolean): Record<string, number> {
  return {
    center: xf({ font: { sz: 10, bold, color: C.ink }, fill: { bg }, align: 'center', border: true }),
    left: xf({ font: { sz: 10, color: C.ink }, fill: { bg }, align: 'left', border: true }),
    num: xf({ font: { sz: 10, bold, color: numFg }, fill: { bg }, align: 'right', border: true, numFmt: true }),
    gapWarn: xf({ font: { sz: 10, bold: true, color: C.warnFg }, fill: { bg: C.gapWarnBg }, align: 'right', border: true, numFmt: true }),
    chipLow: xf({ font: { sz: 10, bold: true, color: C.warnFg }, fill: { bg: C.chipLowBg }, align: 'center', border: true }),
    chipOk: xf({ font: { sz: 10, bold: true, color: C.chipOkFg }, fill: { bg: C.chipOkBg }, align: 'center', border: true }),
  }
}
const ROW_EVEN = rowStyles(C.white, C.ink, false)
const ROW_ODD = rowStyles(C.zebra, C.ink, false)
const ROW_WARN = rowStyles(C.warnRowBg, C.warnFg, true)
// 页脚
const S_FOOT = xf({ font: { sz: 8, italic: true, color: C.faint }, fill: { bg: C.panel }, align: 'left' })

function fontXml(f: Font): string {
  return `<font><name val="${FONT_NAME}"/><sz val="${f.sz}"/>${f.bold ? '<b val="true"/>' : ''}${f.italic ? '<i val="true"/>' : ''}<color rgb="${f.color}"/></font>`
}

function stylesXml(): string {
  const fonts = [...new Map(XFS.map((x) => [JSON.stringify(x.font), x.font])).values()]
  const fontIndex = new Map(fonts.map((f, i) => [JSON.stringify(f), i]))
  const fills: string[] = []
  const fillIndex = new Map<string, number>()
  function fillId(bg?: string): number {
    if (bg == null) return 0
    if (!fillIndex.has(bg)) {
      // 索引 0/1 必须是 none/gray125
      if (fills.length === 0) fills.push('<fill><patternFill patternType="none"/></fill>')
      if (fills.length === 1) fills.push('<fill><patternFill patternType="gray125"/></fill>')
      fills.push(`<fill><patternFill patternType="solid"><fgColor rgb="${bg}"/></patternFill></fill>`)
      fillIndex.set(bg, fills.length - 1)
    }
    return fillIndex.get(bg)!
  }
  const borders: string[] = []
  const borderIndex = new Map<string, number>()
  function borderId(has: boolean): number {
    const key = has ? 'y' : 'n'
    if (!borderIndex.has(key)) {
      if (borders.length === 0 && !has) borders.push('<border><left/><right/><top/><bottom/><diagonal/></border>')
      else borders.push(`<border><left style="thin"><color rgb="${C.border}"/></left><right style="thin"><color rgb="${C.border}"/></right><top style="thin"><color rgb="${C.border}"/></top><bottom style="thin"><color rgb="${C.border}"/></bottom><diagonal/></border>`)
      borderIndex.set(key, borders.length - 1)
    }
    return borderIndex.get(key)!
  }

  const numFmtIds = new Set(XFS.filter((x) => x.numFmt).map(() => 164))
  const xfsXml = XFS.map((x) => {
    const fi = fontIndex.get(JSON.stringify(x.font))!
    const bi = borderId(Boolean(x.border))
    const parts = [
      `numFmtId="${x.numFmt ? 164 : 0}"`,
      `fontId="${fi}"`,
      `fillId="${fillId(x.fill?.bg)}"`,
      `borderId="${bi}"`,
      'xfId="0"',
    ]
    const flags = [
      x.numFmt ? 'applyNumberFormat="true"' : '',
      'applyFont="true"',
      x.fill ? 'applyFill="true"' : '',
      x.border ? 'applyBorder="true"' : '',
      'applyAlignment="true"',
    ].filter(Boolean).join(' ')
    const indent = x.indent ? ` indent="${x.indent}"` : ''
    return `<xf ${parts.join(' ')} ${flags}><alignment horizontal="${x.align}" vertical="center"${indent}/></xf>`
  }).join('')

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${numFmtIds.size ? `<numFmts count="${numFmtIds.size}"><numFmt numFmtId="164" formatCode="${NUMFMT}"/></numFmts>` : ''}<fonts count="${fonts.length}">${fonts.map(fontXml).join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="${borders.length}">${borders.join('')}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${XFS.length}">${xfsXml}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/></styleSheet>`
}

function colName(index: number): string {
  let s = ''
  let n = index
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  }
  return s
}

type Cell = { v: string | number; s: number }
type RowData = Map<number, Cell>

class SheetWriter {
  rows = new Map<number, RowData>()
  merges: Array<[number, number, number, number]> = []
  colWidths: number[] = []
  rowHeights: Array<number | undefined> = []
  freezeRows = 0
  freezeCols = 0
  autofilterEndRow = 0
  tabColor?: string

  set(row: number, col: number, value: string | number, styleIndex: number): void {
    if (!this.rows.has(row)) this.rows.set(row, new Map())
    this.rows.get(row)!.set(col, { v: value, s: styleIndex })
  }
  merge(r1: number, c1: number, r2: number, c2: number): void {
    this.merges.push([r1, c1, r2, c2])
  }

  xml(): string {
    // 列数：取列宽表长度与所有行最大列索引(+1)的较大者；11 列 → lastCol=10 → 'K'
    let colCount = this.colWidths.length
    for (const row of this.rows.values()) {
      for (const c of row.keys()) colCount = Math.max(colCount, c + 1)
    }
    const lastCol = colCount - 1
    const maxRow = Math.max(...this.rows.keys(), 0) + 1
    const colsXml = this.colWidths.length
      ? `<cols>${this.colWidths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="true"/>`).join('')}</cols>`
      : ''
    const rowsXml: string[] = []
    for (let r = 0; r < maxRow; r++) {
      const rowData = this.rows.get(r)
      const ht = this.rowHeights[r]
      const htAttr = ht ? ` customHeight="true" ht="${ht}"` : ''
      if (!rowData) { rowsXml.push(`<row r="${r + 1}"${htAttr}/>`); continue }
      const cells = [...rowData.entries()].sort((a, b) => a[0] - b[0]).map(([c, cell]) => {
        const ref = `${colName(c)}${r + 1}`
        if (typeof cell.v === 'number' && Number.isFinite(cell.v)) {
          return `<c r="${ref}" s="${cell.s}" t="n"><v>${cell.v}</v></c>`
        }
        return `<c r="${ref}" s="${cell.s}" t="inlineStr"><is><t xml:space="preserve">${esc(String(cell.v))}</t></is></c>`
      }).join('')
      rowsXml.push(`<row r="${r + 1}"${htAttr}>${cells}</row>`)
    }
    const mergesXml = this.merges.length
      ? `<mergeCells count="${this.merges.length}">${this.merges.map(([r1, c1, r2, c2]) => `<mergeCell ref="${colName(c1)}${r1 + 1}:${colName(c2)}${r2 + 1}"/>`).join('')}</mergeCells>`
      : ''
    const paneXml = this.freezeRows
      ? `<pane ySplit="${this.freezeRows}"${this.freezeCols ? ` xSplit="${this.freezeCols}"` : ''} topLeftCell="A${this.freezeRows + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/>`
      : ''
    const filterXml = this.autofilterEndRow
      ? `<autoFilter ref="A${this.freezeRows + 1}:${colName(lastCol)}${this.autofilterEndRow}"/>`
      : ''
    const prXml = this.tabColor ? `<sheetPr><tabColor rgb="${this.tabColor}"/></sheetPr>` : ''
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${prXml}<dimension ref="A1:${colName(lastCol)}${maxRow}"/><sheetViews><sheetView workbookViewId="0" tabSelected="false" zoomScale="100"${this.freezeRows ? `>${paneXml}</sheetView>` : '/>'}</sheetViews><sheetFormatPr defaultRowHeight="15.0"/>${colsXml}<sheetData>${rowsXml.join('')}</sheetData>${filterXml}${mergesXml}<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`
  }
}

export interface WarningRow {
  materialCode: string
  materialName: string
  specification: string
  unit: string
  safeStock: number
  actualTotal: number
  warningStatus: string
  stockOrgName: string
}

const HEADERS = ['序号', '类别', '物料编码', '物料名称', '规格型号', '单位', '安全库存', '库存总量', '缺口', '预警状态', '库存组织']
const WIDTHS = [7, 8, 14, 24, 30, 8, 12, 12, 13, 20, 26]

function isBelow(status: string): boolean {
  return status.includes('安全') || status.includes('偏低')
}
function category(code: string): string {
  const c = code.trim().toUpperCase()
  if (c.startsWith('N103')) return '黑胶'
  if (c.startsWith('N105')) return '框架'
  return '其他'
}
function pad2(n: number): string { return String(n).padStart(2, '0') }
function fmtTime(d = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function buildSheet(rows: WarningRow[], includeNormal: boolean, tabColor: string): SheetWriter {
  const ws = new SheetWriter()
  ws.tabColor = tabColor
  ws.colWidths = WIDTHS
  ws.freezeRows = 6

  const total = rows.length
  let belowCount = 0
  let totalGap = 0
  for (const r of rows) {
    if (isBelow(r.warningStatus)) {
      belowCount++
      totalGap += Math.max(0, r.safeStock - r.actualTotal)
    }
  }
  const normalCount = includeNormal ? total - belowCount : 0
  const now = new Date()

  // r0 标题 / r1 副标题
  ws.set(0, 0, includeNormal ? '金蝶库存预警报表' : '金蝶库存预警 · 偏低明细', S_TITLE)
  ws.merge(0, 0, 0, 10)
  ws.rowHeights[0] = 46
  ws.set(1, 0, `数据来源：金蝶库存预警快照（物料库存计划 + 可参与预警即时库存）    统计时间 ${fmtTime(now)}    ${includeNormal ? '偏低行置顶展示' : '仅列出低于安全库存的物料'}`, S_SUB)
  ws.merge(1, 0, 1, 10)
  ws.rowHeights[1] = 20

  // r2/r3 KPI 卡
  const kpis: Array<[string, string | number, number, number]> = [
    ['物料总数', total, S_KPI_T_L, S_KPI_T_V],
    ['偏低', belowCount, S_KPI_L_L, S_KPI_L_V],
    includeNormal ? ['正常', normalCount, S_KPI_O_L, S_KPI_O_V] : ['偏低占比', total ? Math.round((belowCount / total) * 100) : 0, S_KPI_L_L, S_KPI_L_V],
    ['缺口合计', Number(totalGap.toFixed(2)), S_KPI_G_L, S_KPI_G_V],
    ['生成时间', `${pad2(now.getHours())}:${pad2(now.getMinutes())}`, S_KPI_D_L, S_KPI_D_V],
  ]
  const starts = [0, 2, 4, 6, 9]
  kpis.forEach(([label, value, sl, sv], i) => {
    const c1 = starts[i]!
    const c2 = i === 4 ? 10 : c1 + 1
    ws.set(2, c1, label, sl)
    ws.set(3, c1, value, sv)
    for (let c = c1; c <= c2; c++) {
      if (c !== c1) { ws.set(2, c, '', sl); ws.set(3, c, value === '' ? '' : (c === c2 && i === 4 ? '' : ''), sv) }
    }
    ws.merge(2, c1, 2, c2)
    ws.merge(3, c1, 3, c2)
  })
  // 生成时间卡显示完整时间
  ws.set(3, 9, `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`, S_KPI_D_V)
  ws.rowHeights[2] = 18
  ws.rowHeights[3] = 32

  // r4 间隔
  ws.rowHeights[4] = 8

  // r5 表头
  HEADERS.forEach((h, c) => ws.set(5, c, h, S_HEAD))
  ws.rowHeights[5] = 26

  // r6+ 数据
  let seq = 1
  for (const row of rows) {
    const below = isBelow(row.warningStatus)
    const odd = seq % 2 === 0
    const s = below ? ROW_WARN : odd ? ROW_ODD : ROW_EVEN
    const gap = Math.max(0, row.safeStock - row.actualTotal)
    const r = 5 + seq
    ws.set(r, 0, seq, s.center)
    ws.set(r, 1, category(row.materialCode), s.center)
    ws.set(r, 2, row.materialCode, s.center)
    ws.set(r, 3, row.materialName, s.left)
    ws.set(r, 4, row.specification, s.left)
    ws.set(r, 5, row.unit, s.center)
    ws.set(r, 6, row.safeStock, s.num)
    ws.set(r, 7, row.actualTotal, s.num)
    ws.set(r, 8, gap, below && gap > 0 ? s.gapWarn : s.num)
    ws.set(r, 9, row.warningStatus, below ? s.chipLow : s.chipOk)
    ws.set(r, 10, row.stockOrgName, s.left)
    ws.rowHeights[r] = 20
    seq++
  }

  // 页脚
  const fr = 5 + seq
  ws.set(fr, 0, `口径：物料库存计划 + 可参与预警即时库存 · 偏低置顶 · 缺口 = max(0, 安全库存 − 库存总量) · 生成于 ${fmtTime(now)}`, S_FOOT)
  ws.merge(fr, 0, fr, 10)
  ws.rowHeights[fr] = 18
  ws.autofilterEndRow = fr - 1
  return ws
}

function contentTypesXml(sheetCount: number): string {
  const overrides = Array.from({ length: sheetCount }, (_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${overrides}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`
}

function workbookXml(sheetNames: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetNames.map((name, i) => `<sheet name="${esc(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`
}

function workbookRelsXml(sheetCount: number): string {
  const sheets = Array.from({ length: sheetCount }, (_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets}<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
}

function rootRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`
}

function coreXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>ctk-system</dc:creator><cp:lastModifiedBy>ctk-system</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created></cp:coreProperties>`
}

function appXml(sheetNames: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Microsoft Excel</Application></Properties>`
}

/** 生成完整 xlsx 的 zip 文件表（键=路径，值=UTF8 字节），交给上层 zipSync。 */
export function buildWarningSheetFiles(dbRows: Array<Record<string, unknown>>): Record<string, Uint8Array> {
  const mapRow = (row: Record<string, unknown>): WarningRow => ({
    materialCode: String(row.material_code ?? ''),
    materialName: String(row.material_name ?? ''),
    specification: String(row.specification ?? ''),
    unit: String(row.unit ?? ''),
    safeStock: Number(row.safe_stock ?? 0),
    actualTotal: Number(row.actual_total ?? 0),
    warningStatus: String(row.warning_status ?? ''),
    stockOrgName: String(row.stock_org_name || row.stock_org_code || '-'),
  })
  const sorted = [...dbRows].map(mapRow).sort((a, b) => {
    const aBelow = isBelow(a.warningStatus) ? 0 : 1
    const bBelow = isBelow(b.warningStatus) ? 0 : 1
    if (aBelow !== bBelow) return aBelow - bBelow
    return a.materialCode.toLowerCase().localeCompare(b.materialCode.toLowerCase())
  })
  const belowRows = sorted.filter((r) => isBelow(r.warningStatus))

  const sheets = [
    buildSheet(sorted, true, 'FF1D4ED8'),
    buildSheet(belowRows, false, 'FFDC2626'),
  ]
  const sheetNames = ['库存预警(全部)', '偏低明细']

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(contentTypesXml(sheets.length)),
    '_rels/.rels': strToU8(rootRelsXml()),
    'docProps/core.xml': strToU8(coreXml()),
    'docProps/app.xml': strToU8(appXml(sheetNames)),
    'xl/workbook.xml': strToU8(workbookXml(sheetNames)),
    'xl/_rels/workbook.xml.rels': strToU8(workbookRelsXml(sheets.length)),
    'xl/styles.xml': strToU8(stylesXml()),
  }
  sheets.forEach((sheet, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheet.xml())
  })
  return files
}

// fflate 引入放底部避免循环依赖观感
import { strToU8 } from 'fflate'
