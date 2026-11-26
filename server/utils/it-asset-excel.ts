import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { setResponseHeader, type H3Event } from 'h3'
import { getXlsxStyleSync, getXlsxSync } from './lazy-deps'

const XLSXStyle: any = new Proxy({}, {
  get(_target, prop) {
    const mod = getXlsxStyleSync()
    const value = mod[prop]
    return typeof value === 'function' ? value.bind(mod) : value
  },
})

export const IT_ASSET_IMPORT_MAX_ROWS = 1000

export const IT_ASSET_EXCEL_HEADERS = [
  '资产编号',
  '资产名称*',
  '设备类型',
  '品牌',
  '规格型号',
  'SN序列号',
  '使用部门',
  '使用人',
  '存放地点',
  '购置日期',
  '资产状态',
  'CPU',
  '内存',
  '硬盘',
  '操作系统',
  'IP地址',
  'MAC地址',
  '保修到期日',
  '备注',
] as const

const DEVICE_TYPE_ALIASES: Record<string, string> = {
  desktop: 'desktop',
  '台式机': 'desktop',
  '台式电脑': 'desktop',
  '主机': 'desktop',
  laptop: 'laptop',
  '笔记本': 'laptop',
  '笔记本电脑': 'laptop',
  '手提电脑': 'laptop',
  all_in_one: 'all_in_one',
  '一体机': 'all_in_one',
  workstation: 'workstation',
  '工作站': 'workstation',
  monitor: 'monitor',
  '显示器': 'monitor',
  server: 'server',
  '服务器': 'server',
  other: 'other',
  '其他': 'other',
  '其他设备': 'other',
  '其它': 'other',
}

const DEVICE_TYPE_LABELS: Record<string, string> = {
  desktop: '台式机',
  laptop: '笔记本',
  all_in_one: '一体机',
  workstation: '工作站',
  monitor: '显示器',
  server: '服务器',
  other: '其他设备',
}

const STATUS_ALIASES: Record<string, string> = {
  in_use: 'in_use',
  '在用': 'in_use',
  '使用中': 'in_use',
  '领用': 'in_use',
  idle: 'idle',
  '闲置': 'idle',
  '库存': 'idle',
  '未分配': 'idle',
  repair: 'repair',
  '维修': 'repair',
  '维修中': 'repair',
  '送修': 'repair',
  scrapped: 'scrapped',
  '报废': 'scrapped',
  '已报废': 'scrapped',
}

const STATUS_LABELS: Record<string, string> = {
  in_use: '在用',
  idle: '闲置',
  repair: '维修中',
  scrapped: '已报废',
}

const HEADER_FIELD_MAP: Record<string, keyof ParsedItAssetImportRow> = {
  '资产编号': 'assetNo',
  '编号': 'assetNo',
  id: 'assetNo',
  assetno: 'assetNo',
  asset_no: 'assetNo',
  '资产名称': 'assetName',
  '名称': 'assetName',
  '设备名称': 'assetName',
  name: 'assetName',
  assetname: 'assetName',
  asset_name: 'assetName',
  '设备类型': 'deviceType',
  '类型': 'deviceType',
  '类别': 'deviceType',
  devicetype: 'deviceType',
  device_type: 'deviceType',
  '品牌': 'brand',
  brand: 'brand',
  '规格型号': 'model',
  '型号': 'model',
  specification: 'model',
  model: 'model',
  'sn序列号': 'serialNo',
  '序列号': 'serialNo',
  sn: 'serialNo',
  serialno: 'serialNo',
  serial_no: 'serialNo',
  '使用部门': 'useDept',
  '部门': 'useDept',
  usedept: 'useDept',
  use_dept: 'useDept',
  '使用人': 'userName',
  '使用人姓名': 'userName',
  '领用人': 'userName',
  '保管人': 'userName',
  user: 'userName',
  username: 'userName',
  user_name: 'userName',
  '存放地点': 'location',
  '存放地': 'location',
  '位置': 'location',
  '办公地点': 'location',
  location: 'location',
  '购置日期': 'purchaseDate',
  '购买日期': 'purchaseDate',
  '采购日期': 'purchaseDate',
  buydate: 'purchaseDate',
  purchasedate: 'purchaseDate',
  purchase_date: 'purchaseDate',
  '资产状态': 'status',
  '状态': 'status',
  status: 'status',
  cpu: 'cpuSpec',
  '处理器': 'cpuSpec',
  'cpu配置': 'cpuSpec',
  cpuspec: 'cpuSpec',
  cpu_spec: 'cpuSpec',
  '内存': 'memorySpec',
  '内存配置': 'memorySpec',
  memory: 'memorySpec',
  memoryspec: 'memorySpec',
  memory_spec: 'memorySpec',
  '硬盘': 'diskSpec',
  '硬盘配置': 'diskSpec',
  '存储': 'diskSpec',
  disk: 'diskSpec',
  diskspec: 'diskSpec',
  disk_spec: 'diskSpec',
  '操作系统': 'osVersion',
  '系统': 'osVersion',
  os: 'osVersion',
  osversion: 'osVersion',
  os_version: 'osVersion',
  'ip地址': 'ipAddress',
  ip: 'ipAddress',
  ipaddress: 'ipAddress',
  ip_address: 'ipAddress',
  'mac地址': 'macAddress',
  mac: 'macAddress',
  macaddress: 'macAddress',
  mac_address: 'macAddress',
  '保修到期日': 'warrantyDate',
  '保修日期': 'warrantyDate',
  '过保日期': 'warrantyDate',
  warrantydate: 'warrantyDate',
  warranty_date: 'warrantyDate',
  '备注': 'remark',
  remark: 'remark',
}

export interface ParsedItAssetImportRow {
  rowNo: number
  assetNo: string
  assetName: string
  deviceType: string
  brand: string
  model: string
  serialNo: string
  useDept: string
  userName: string
  location: string
  purchaseDate: string | null
  status: string
  cpuSpec: string
  memorySpec: string
  diskSpec: string
  osVersion: string
  ipAddress: string
  macAddress: string
  warrantyDate: string | null
  remark: string
}

export interface ItAssetImportParseError {
  rowNo: number
  message: string
}

export interface ItAssetImportParseResult {
  rows: ParsedItAssetImportRow[]
  errors: ItAssetImportParseError[]
}

const TEMPLATE_SAMPLE_ASSET_NAME = '示例-办公台式机（导入前请删除此行）'

function normalizeHeaderName(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replaceAll('*', '')
    .replaceAll('＊', '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

function cleanCellText(value: unknown): string {
  if (value == null) return ''
  return String(value).trim()
}

function formatUtcDay(utcMs: number): string {
  const roundedMs = Math.round(utcMs / 86400000) * 86400000
  const d = new Date(roundedMs)
  const year = d.getUTCFullYear()
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isValidIsoDate(iso: string): boolean {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return false
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const d = new Date(Date.UTC(year, month - 1, day))
  return d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month && d.getUTCDate() === day
}

export function parseExcelDateCell(value: unknown): { value: string | null; error?: string } {
  if (value == null || value === '') return { value: null }

  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel epoch starts 1899-12-30 in UTC; avoids local timezone -1 day drift.
    const excelEpochMs = Date.UTC(1899, 11, 30)
    const iso = formatUtcDay(excelEpochMs + value * 86400000)
    if (!isValidIsoDate(iso)) return { value: null, error: `日期序列号无效: ${value}` }
    return { value: iso }
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return { value: null, error: '日期值无效' }
    return { value: formatUtcDay(value.getTime()) }
  }

  const raw = cleanCellText(value)
  if (!raw) return { value: null }

  const match = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\s.*)?$/)
  if (match) {
    const iso = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
    if (!isValidIsoDate(iso)) return { value: null, error: `日期不存在: ${raw}` }
    return { value: iso }
  }

  const compactMatch = raw.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (compactMatch) {
    const iso = `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`
    if (!isValidIsoDate(iso)) return { value: null, error: `日期不存在: ${raw}` }
    return { value: iso }
  }

  return { value: null, error: `日期格式不正确(${raw})，应为 YYYY-MM-DD` }
}

const FONT_FAMILY = '微软雅黑'

const COLORS = {
  titleBg: 'FF1B365D',
  titleText: 'FFFFFFFF',
  subtitleBg: 'FFEFF6FF',
  subtitleText: 'FF334155',
  subtitleBorder: 'FFBFDBFE',
  headerBg: 'FF1E3A5F',
  headerText: 'FFFFFFFF',
  headerBorder: 'FF334155',
  summaryBg: 'FFE2E8F0',
  summaryText: 'FF0F172A',
  summaryTopBorder: 'FF1E3A5F',
  zebraBg: 'FFF8FAFC',
  whiteBg: 'FFFFFFFF',
  gridBorder: 'FFCBD5E1',
  textPrimary: 'FF0F172A',
  textMuted: 'FF64748B',
  assetNoText: 'FF1E3A5F',
  sampleBg: 'FFFEFCE8',
  sampleText: 'FF854D0E',
  emptyText: 'FF94A3B8',
} as const

const STATUS_CELL_STYLES: Record<string, { bg: string; text: string }> = {
  '在用': { bg: 'FFDCFCE7', text: 'FF166534' },
  '闲置': { bg: 'FFDBEAFE', text: 'FF1E40AF' },
  '维修中': { bg: 'FFFFEDD5', text: 'FF9A3412' },
  '已报废': { bg: 'FFE2E8F0', text: 'FF475569' },
}

const DEVICE_TYPE_CELL_STYLES: Record<string, { bg: string; text: string }> = {
  '台式机': { bg: 'FFEEF2FF', text: 'FF3730A3' },
  '笔记本': { bg: 'FFECFEFF', text: 'FF155E75' },
  '一体机': { bg: 'FFF0F9FF', text: 'FF075985' },
  '工作站': { bg: 'FFF5F3FF', text: 'FF5B21B6' },
  '显示器': { bg: 'FFF1F5F9', text: 'FF334155' },
  '服务器': { bg: 'FFFEF3C7', text: 'FF92400E' },
  '其他设备': { bg: 'FFF8FAFC', text: 'FF475569' },
}

const GUIDE_BADGE_STYLES: Record<string, { bg: string; text: string }> = {
  '必填': { bg: 'FFFEE2E2', text: 'FFB91C1C' },
  '选填': { bg: 'FFDBEAFE', text: 'FF1D4ED8' },
  '提示': { bg: 'FFFEF3C7', text: 'FF92400E' },
}

interface SheetPageSetup {
  orientation?: 'landscape' | 'portrait'
  paperSize?: number
  fitToPage?: boolean
  fitToWidth?: number
  fitToHeight?: number
}

interface SheetFreezeView {
  state: 'frozen'
  ySplit?: number
  xSplit?: number
  topLeftCell?: string
  activeCell?: string
  showGridLines?: boolean
}

function makeBorder(colorRgb: string = COLORS.gridBorder, topOverride?: { style: string; color: { rgb: string } }) {
  const side = { style: 'thin', color: { rgb: colorRgb } }
  return {
    top: topOverride || side,
    bottom: side,
    left: side,
    right: side,
  }
}

function isWideChar(code: number): boolean {
  return (
    (code >= 0x2e80 && code <= 0x9fff)
    || (code >= 0xf900 && code <= 0xfaff)
    || (code >= 0xfe30 && code <= 0xfe6f)
    || (code >= 0xff00 && code <= 0xffef)
  )
}

function estimateSegmentVisualWidth(segment: string): number {
  let width = 0
  for (let i = 0; i < segment.length; i += 1) {
    const code = segment.charCodeAt(i)
    const ch = segment[i]
    if (isWideChar(code)) {
      width += 2.05
    } else if (ch >= 'A' && ch <= 'Z') {
      width += 1.15
    } else if (ch === 'W' || ch === 'M' || ch === '@' || ch === '%') {
      width += 1.25
    } else {
      width += 1.0
    }
  }
  return width
}

function estimateCellVisualWidth(value: unknown): number {
  const text = String(value ?? '')
  if (!text) return 0
  const segments = text.split(/\r?\n/)
  let maxWidth = 0
  for (const seg of segments) {
    const w = estimateSegmentVisualWidth(seg)
    if (w > maxWidth) maxWidth = w
  }
  return maxWidth
}

function computeSmartColWidths(
  headers: readonly string[],
  dataRows: unknown[][],
  bounds: Array<[number, number]>,
): number[] {
  return headers.map((header, colIdx) => {
    const [minW, maxW] = bounds[colIdx] || [12, 32]
    let maxVisual = estimateCellVisualWidth(header) + 3.5
    for (const row of dataRows) {
      const w = estimateCellVisualWidth(row[colIdx]) + 3
      if (w > maxVisual) maxVisual = w
    }
    return Math.round(Math.max(minW, Math.min(maxW, maxVisual)))
  })
}

function estimateWrappedLines(value: unknown, colWidth: number): number {
  const text = String(value ?? '').trim()
  if (!text) return 1
  const effectiveWidth = Math.max(6, (colWidth - 2.5) * 0.9)
  const segments = text.split(/\r?\n/)
  let totalLines = 0
  for (const seg of segments) {
    if (!seg) {
      totalLines += 1
      continue
    }
    const segWidth = estimateSegmentVisualWidth(seg)
    totalLines += Math.max(1, Math.ceil(segWidth / effectiveWidth))
  }
  return Math.max(1, totalLines)
}

function computeDynamicRowHeight(
  rowValues: unknown[],
  colWidths: number[],
  options: { minHpt?: number; maxHpt?: number; lineHpt?: number; verticalPad?: number } = {},
): number {
  const minHpt = options.minHpt ?? 22
  const maxHpt = options.maxHpt ?? 120
  const lineHpt = options.lineHpt ?? 15.5
  const verticalPad = options.verticalPad ?? 7
  let maxLines = 1
  for (let c = 0; c < colWidths.length; c += 1) {
    const lines = estimateWrappedLines(rowValues[c], colWidths[c])
    if (lines > maxLines) maxLines = lines
  }
  return Math.round(Math.max(minHpt, Math.min(maxHpt, maxLines * lineHpt + verticalPad)))
}

function formatExportDateTime(input?: string | Date): string {
  if (typeof input === 'string' && input.trim()) return input.trim()
  const d = input instanceof Date && !Number.isNaN(input.getTime()) ? input : new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hour = String(d.getHours()).padStart(2, '0')
  const minute = String(d.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

function setWorksheetPrintAndFreeze(
  ws: any,
  options: {
    freezeRows?: number
    freezeCols?: number
    autofilterRef?: string
    pageSetup?: SheetPageSetup
  },
) {
  const freezeRows = options.freezeRows ?? 0
  const freezeCols = options.freezeCols ?? 0
  if (freezeRows > 0 || freezeCols > 0) {
    const topLeftCell = `${XLSXStyle.utils.encode_col(freezeCols)}${freezeRows + 1}`
    const view: SheetFreezeView = {
      state: 'frozen',
      ySplit: freezeRows,
      xSplit: freezeCols,
      topLeftCell,
      activeCell: topLeftCell,
      showGridLines: true,
    }
    ws['!views'] = [view]
  }
  if (options.autofilterRef) {
    ws['!autofilter'] = { ref: options.autofilterRef }
  }
  ws['!margins'] = { left: 0.35, right: 0.35, top: 0.5, bottom: 0.5, header: 0.25, footer: 0.25 }
  if (options.pageSetup) {
    ws['!pageSetup'] = {
      orientation: options.pageSetup.orientation ?? 'landscape',
      paperSize: options.pageSetup.paperSize ?? 9,
      fitToPage: options.pageSetup.fitToPage ?? true,
      fitToWidth: options.pageSetup.fitToWidth ?? 1,
      fitToHeight: options.pageSetup.fitToHeight ?? 0,
    }
  }
}

interface ApplySheetStylingOptions {
  titleRowIdx?: number
  subtitleRowIdx?: number
  headerRowIdx: number
  summaryRowIdx?: number
  sampleRowIdx?: number
  emptyRowIdx?: number
  leftAlignCols?: number[]
  rightAlignCols?: number[]
  boldCols?: number[]
  assetNoColIdx?: number
  statusColIdx?: number
  deviceTypeColIdx?: number
  guideBadgeColIdx?: number
  rowMatrix?: unknown[][]
  minDataRowHpt?: number
}

function applySheetStyling(ws: any, colWidths: number[], options: ApplySheetStylingOptions) {
  const ref = ws['!ref']
  if (!ref) return
  const range = XLSXStyle.utils.decode_range(ref)
  const leftCols = new Set(options.leftAlignCols || [])
  const rightCols = new Set(options.rightAlignCols || [])
  const boldCols = new Set(options.boldCols || [])

  for (let r = range.s.r; r <= range.e.r; r += 1) {
    const isTitle = options.titleRowIdx !== undefined && r === options.titleRowIdx
    const isSubtitle = options.subtitleRowIdx !== undefined && r === options.subtitleRowIdx
    const isHeader = r === options.headerRowIdx
    const isSummary = options.summaryRowIdx !== undefined && r === options.summaryRowIdx
    const isSample = options.sampleRowIdx !== undefined && r === options.sampleRowIdx
    const isEmpty = options.emptyRowIdx !== undefined && r === options.emptyRowIdx
    const dataOrdinal = r - options.headerRowIdx - 1
    const isZebra = !isTitle && !isSubtitle && !isHeader && !isSummary && !isSample && !isEmpty && dataOrdinal >= 0 && dataOrdinal % 2 === 1

    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const addr = XLSXStyle.utils.encode_cell({ r, c })
      if (!ws[addr]) {
        ws[addr] = { v: '', t: 's' }
      }
      const cell = ws[addr]
      const rawText = cleanCellText(cell.v)

      if (isTitle) {
        cell.s = {
          border: makeBorder(COLORS.titleBg),
          font: { name: FONT_FAMILY, sz: 15, bold: true, color: { rgb: COLORS.titleText } },
          fill: { fgColor: { rgb: COLORS.titleBg } },
          alignment: { horizontal: 'left', vertical: 'center', wrapText: false, indent: 1 },
        }
        continue
      }

      if (isSubtitle) {
        cell.s = {
          border: makeBorder(COLORS.subtitleBorder),
          font: { name: FONT_FAMILY, sz: 10, bold: false, color: { rgb: COLORS.subtitleText } },
          fill: { fgColor: { rgb: COLORS.subtitleBg } },
          alignment: { horizontal: 'left', vertical: 'center', wrapText: false, indent: 1 },
        }
        continue
      }

      if (isHeader) {
        cell.s = {
          border: makeBorder(COLORS.headerBorder),
          font: { name: FONT_FAMILY, sz: 10, bold: true, color: { rgb: COLORS.headerText } },
          fill: { fgColor: { rgb: COLORS.headerBg } },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        }
        continue
      }

      if (isSummary) {
        const summaryHorizontal = c === 0
          ? 'center'
          : leftCols.has(c)
            ? 'left'
            : rightCols.has(c)
              ? 'right'
              : 'center'
        cell.s = {
          border: makeBorder(COLORS.gridBorder, { style: 'medium', color: { rgb: COLORS.summaryTopBorder } }),
          font: { name: FONT_FAMILY, sz: 10, bold: true, color: { rgb: COLORS.summaryText } },
          fill: { fgColor: { rgb: COLORS.summaryBg } },
          alignment: { horizontal: summaryHorizontal, vertical: 'center', wrapText: true },
        }
        continue
      }

      if (isEmpty) {
        cell.s = {
          border: makeBorder(COLORS.gridBorder),
          font: { name: FONT_FAMILY, sz: 10, italic: true, color: { rgb: COLORS.emptyText } },
          fill: { fgColor: { rgb: COLORS.whiteBg } },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        }
        continue
      }

      let fillRgb: string = isSample ? COLORS.sampleBg : (isZebra ? COLORS.zebraBg : COLORS.whiteBg)
      let fontColor: string = isSample ? COLORS.sampleText : COLORS.textPrimary
      let bold = boldCols.has(c)
      const italic = isSample

      if (!isSample && options.assetNoColIdx === c && rawText) {
        fontColor = COLORS.assetNoText
        bold = true
      }

      if (!isSample && options.statusColIdx === c && STATUS_CELL_STYLES[rawText]) {
        fillRgb = STATUS_CELL_STYLES[rawText].bg
        fontColor = STATUS_CELL_STYLES[rawText].text
        bold = true
      }

      if (!isSample && options.deviceTypeColIdx === c && DEVICE_TYPE_CELL_STYLES[rawText]) {
        fillRgb = DEVICE_TYPE_CELL_STYLES[rawText].bg
        fontColor = DEVICE_TYPE_CELL_STYLES[rawText].text
        bold = false
      }

      if (options.guideBadgeColIdx === c && GUIDE_BADGE_STYLES[rawText]) {
        fillRgb = GUIDE_BADGE_STYLES[rawText].bg
        fontColor = GUIDE_BADGE_STYLES[rawText].text
        bold = true
      }

      const horizontal = leftCols.has(c) ? 'left' : (rightCols.has(c) ? 'right' : 'center')

      cell.s = {
        border: makeBorder(COLORS.gridBorder),
        font: {
          name: FONT_FAMILY,
          sz: 10,
          bold,
          italic,
          color: { rgb: fontColor },
        },
        fill: { fgColor: { rgb: fillRgb } },
        alignment: {
          horizontal,
          vertical: 'center',
          wrapText: true,
        },
      }
    }
  }

  ws['!cols'] = colWidths.map((wch) => ({ wch }))
  const rowHeights: Array<{ hpt: number }> = []
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    if (options.titleRowIdx !== undefined && r === options.titleRowIdx) {
      rowHeights[r] = { hpt: 34 }
    } else if (options.subtitleRowIdx !== undefined && r === options.subtitleRowIdx) {
      rowHeights[r] = { hpt: 24 }
    } else if (r === options.headerRowIdx) {
      rowHeights[r] = { hpt: 28 }
    } else if (options.summaryRowIdx !== undefined && r === options.summaryRowIdx) {
      rowHeights[r] = { hpt: 26 }
    } else if (options.emptyRowIdx !== undefined && r === options.emptyRowIdx) {
      rowHeights[r] = { hpt: 30 }
    } else if (options.rowMatrix && options.rowMatrix[r]) {
      rowHeights[r] = {
        hpt: computeDynamicRowHeight(options.rowMatrix[r], colWidths, {
          minHpt: options.minDataRowHpt ?? 22,
        }),
      }
    } else {
      rowHeights[r] = { hpt: options.minDataRowHpt ?? 22 }
    }
  }
  ws['!rows'] = rowHeights
}

export function buildItAssetImportTemplateWorkbook() {
  const wb = XLSXStyle.utils.book_new()
  const sampleRow = [
    '',
    TEMPLATE_SAMPLE_ASSET_NAME,
    '台式机',
    '联想',
    'ThinkCentre M740t',
    'SN20260001',
    '工程部',
    '张三',
    'A栋3楼办公区',
    '2026-03-15',
    '在用',
    'i5-13400',
    '16GB',
    '512GB SSD',
    'Windows 11 专业版',
    '192.0.2.55',
    'AA-BB-CC-11-22-33',
    '2029-03-14',
    '标配办公主机',
  ]
  const templateMatrix = [[...IT_ASSET_EXCEL_HEADERS], sampleRow]
  const ws1 = XLSXStyle.utils.aoa_to_sheet(templateMatrix)
  const templateColBounds: Array<[number, number]> = [
    [15, 22], [30, 38], [12, 14], [12, 18], [20, 30], [18, 24], [16, 22], [12, 16], [18, 26],
    [14, 15], [12, 14], [18, 32], [10, 14], [14, 22], [20, 28], [16, 20], [20, 22], [14, 15], [22, 36],
  ]
  const ws1Widths = computeSmartColWidths(IT_ASSET_EXCEL_HEADERS, [sampleRow], templateColBounds)
  applySheetStyling(ws1, ws1Widths, {
    headerRowIdx: 0,
    sampleRowIdx: 1,
    leftAlignCols: [1, 4, 5, 8, 11, 13, 14, 18],
    rowMatrix: templateMatrix,
    minDataRowHpt: 24,
  })
  setWorksheetPrintAndFreeze(ws1, {
    freezeRows: 1,
    autofilterRef: `A1:${XLSXStyle.utils.encode_col(IT_ASSET_EXCEL_HEADERS.length - 1)}2`,
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  XLSXStyle.utils.book_append_sheet(wb, ws1, 'IT资产导入模板')

  const guideTitleRow = ['IT 资产批量导入填写说明', '', '']
  const guideHeaders = ['字段名称', '是否必填', '填表说明与可选值']
  const guideDataRows = [
    ['资产编号', '选填', '留空时系统按 TK-PC-0001 自动递增生成；填写则使用指定编号（不能与已有记录重复）'],
    ['资产名称*', '必填', '例如：办公台式机、商务笔记本、研发工作站'],
    ['设备类型', '选填', '可选：台式机、笔记本、一体机、工作站、显示器、服务器、其他设备（留空默认“台式机”）'],
    ['资产状态', '选填', '可选：在用、闲置、维修中、已报废（留空默认“在用”）'],
    ['使用部门 / 使用人', '选填', '支持与企业微信通讯录部门和姓名匹配；若人员姓名唯一且部门未填，系统会自动补全'],
    ['购置日期 / 保修到期日', '选填', '格式 YYYY-MM-DD（如 2026-03-15），也支持 Excel 标准日期单元格'],
    ['示例行处理', '提示', '第 2 行为示例行（浅黄底色），上传前可删除；若未删除且名称仍为示例提示文本，系统会自动忽略该行'],
  ]
  const guideMatrix = [guideTitleRow, guideHeaders, ...guideDataRows]
  const ws2 = XLSXStyle.utils.aoa_to_sheet(guideMatrix)
  ws2['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }]
  const guideWidths = [24, 12, 76]
  applySheetStyling(ws2, guideWidths, {
    titleRowIdx: 0,
    headerRowIdx: 1,
    leftAlignCols: [0, 2],
    guideBadgeColIdx: 1,
    rowMatrix: guideMatrix,
    minDataRowHpt: 24,
  })
  setWorksheetPrintAndFreeze(ws2, {
    freezeRows: 2,
    pageSetup: { orientation: 'portrait', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  XLSXStyle.utils.book_append_sheet(wb, ws2, '填写说明')

  return wb
}

export interface ItAssetExportWorkbookInput {
  rows?: Array<Record<string, any>>
  exportedAt?: string | Date
  companyTitle?: string
}

function normalizeExportStatusKey(rawStatus: unknown): string {
  const text = cleanCellText(rawStatus)
  if (!text) return 'other'
  return STATUS_ALIASES[text.toLowerCase()] || STATUS_ALIASES[text] || 'other'
}

function normalizeExportDeviceTypeKey(rawType: unknown): string {
  const text = cleanCellText(rawType)
  if (!text) return 'other'
  return DEVICE_TYPE_ALIASES[text.toLowerCase()] || DEVICE_TYPE_ALIASES[text] || 'other'
}

function buildDeptSummarySheet(
  rows: Array<Record<string, any>>,
  companyTitle: string,
  exportedAtText: string,
) {
  const headers = [
    '序号',
    '使用部门',
    '资产总计',
    '台式机',
    '笔记本',
    '服务器',
    '其他设备',
    '在用',
    '闲置',
    '维修中',
    '已报废',
    '占比',
  ]

  interface DeptBucket {
    dept: string
    total: number
    desktop: number
    laptop: number
    server: number
    other: number
    inUse: number
    idle: number
    repair: number
    scrapped: number
  }

  const bucketMap = new Map<string, DeptBucket>()
  for (const row of rows) {
    const dept = cleanCellText(row.useDept || row.use_dept) || '未分配部门'
    let bucket = bucketMap.get(dept)
    if (!bucket) {
      bucket = {
        dept,
        total: 0,
        desktop: 0,
        laptop: 0,
        server: 0,
        other: 0,
        inUse: 0,
        idle: 0,
        repair: 0,
        scrapped: 0,
      }
      bucketMap.set(dept, bucket)
    }
    bucket.total += 1

    const typeKey = normalizeExportDeviceTypeKey(row.deviceType || row.device_type)
    if (typeKey === 'desktop') bucket.desktop += 1
    else if (typeKey === 'laptop') bucket.laptop += 1
    else if (typeKey === 'server') bucket.server += 1
    else bucket.other += 1

    const statusKey = normalizeExportStatusKey(row.status)
    if (statusKey === 'in_use') bucket.inUse += 1
    else if (statusKey === 'idle') bucket.idle += 1
    else if (statusKey === 'repair') bucket.repair += 1
    else if (statusKey === 'scrapped') bucket.scrapped += 1
  }

  const sortedBuckets = Array.from(bucketMap.values()).sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total
    return a.dept.localeCompare(b.dept, 'zh-CN')
  })

  const totalCount = rows.length
  const totals = {
    total: totalCount,
    desktop: 0,
    laptop: 0,
    server: 0,
    other: 0,
    inUse: 0,
    idle: 0,
    repair: 0,
    scrapped: 0,
  }

  const dataRows = sortedBuckets.map((b, idx) => {
    totals.desktop += b.desktop
    totals.laptop += b.laptop
    totals.server += b.server
    totals.other += b.other
    totals.inUse += b.inUse
    totals.idle += b.idle
    totals.repair += b.repair
    totals.scrapped += b.scrapped
    const share = totalCount > 0 ? `${((b.total / totalCount) * 100).toFixed(1)}%` : '0.0%'
    return [
      idx + 1,
      b.dept,
      b.total,
      b.desktop,
      b.laptop,
      b.server,
      b.other,
      b.inUse,
      b.idle,
      b.repair,
      b.scrapped,
      share,
    ]
  })

  const titleRow = [`${companyTitle} 各部门 IT 资产汇总`, ...Array.from({ length: headers.length - 1 }, () => '')]
  const subtitleRow = [
    `导出时间：${exportedAtText}   |   涉及部门：${sortedBuckets.length} 个   |   资产总计：${totalCount} 台`,
    ...Array.from({ length: headers.length - 1 }, () => ''),
  ]
  const summaryRow = [
    '合计',
    `共 ${sortedBuckets.length} 个部门`,
    totals.total,
    totals.desktop,
    totals.laptop,
    totals.server,
    totals.other,
    totals.inUse,
    totals.idle,
    totals.repair,
    totals.scrapped,
    totalCount > 0 ? '100.0%' : '0.0%',
  ]

  const hasData = dataRows.length > 0
  const emptyRow = ['暂无部门资产汇总数据', ...Array.from({ length: headers.length - 1 }, () => '')]
  const matrix = hasData
    ? [titleRow, subtitleRow, headers, ...dataRows, summaryRow]
    : [titleRow, subtitleRow, headers, emptyRow, summaryRow]

  const ws = XLSXStyle.utils.aoa_to_sheet(matrix)
  // 不使用跨列合并单元格，避免 Excel 内点击筛选排序时触发“所有合并单元格需大小相同”报错
  if (!hasData) {
    ws['!merges'] = [{ s: { r: 3, c: 0 }, e: { r: 3, c: headers.length - 1 } }]
  }

  const colBounds: Array<[number, number]> = [
    [8, 10],
    [18, 30],
    [11, 14],
    [10, 12],
    [10, 12],
    [10, 12],
    [11, 13],
    [10, 12],
    [10, 12],
    [10, 12],
    [10, 12],
    [11, 13],
  ]
  const colWidths = computeSmartColWidths(headers, dataRows, colBounds)
  const summaryRowIdx = matrix.length - 1

  applySheetStyling(ws, colWidths, {
    titleRowIdx: 0,
    subtitleRowIdx: 1,
    headerRowIdx: 2,
    summaryRowIdx,
    emptyRowIdx: hasData ? undefined : 3,
    leftAlignCols: [1],
    boldCols: [2],
    rowMatrix: matrix,
    minDataRowHpt: 22,
  })

  const lastFilterRow = hasData ? 3 + dataRows.length : 3
  setWorksheetPrintAndFreeze(ws, {
    freezeRows: 3,
    autofilterRef: `A3:${XLSXStyle.utils.encode_col(headers.length - 1)}${lastFilterRow}`,
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })

  return ws
}

export function sortItAssetExportRows(rows: Array<Record<string, any>>): Array<Record<string, any>> {
  return [...rows].sort((a, b) => {
    const noA = cleanCellText(a.assetNo ?? a.asset_no)
    const noB = cleanCellText(b.assetNo ?? b.asset_no)
    if (!noA && noB) return 1
    if (noA && !noB) return -1
    if (noA !== noB) return noA.localeCompare(noB, 'zh-CN', { numeric: true })
    const deptA = cleanCellText(a.useDept ?? a.use_dept)
    const deptB = cleanCellText(b.useDept ?? b.use_dept)
    return deptA.localeCompare(deptB, 'zh-CN')
  })
}

export function buildItAssetExportWorkbook(
  input: Array<Record<string, any>> | ItAssetExportWorkbookInput,
) {
  const rawRows = Array.isArray(input) ? input : (Array.isArray(input?.rows) ? input.rows : [])
  const rows = sortItAssetExportRows(rawRows)
  const exportedAtText = formatExportDateTime(Array.isArray(input) ? undefined : input?.exportedAt)
  const explicitCompany = Array.isArray(input) ? '' : cleanCellText(input?.companyTitle)
  const companyTitle = explicitCompany || String(process.env.COMPANY_DISPLAY_NAME || '').trim() || '示例企业有限公司'

  const wb = XLSXStyle.utils.book_new()
  const headers = [
    '资产编号',
    '资产名称',
    '设备类型',
    '品牌',
    '规格型号',
    'SN序列号',
    '使用部门',
    '使用人',
    '存放地点',
    '购置日期',
    '资产状态',
    'CPU',
    '内存',
    '硬盘',
    '操作系统',
    'IP地址',
    'MAC地址',
    '保修到期日',
    '备注',
  ]

  const dataRows = rows.map((row) => {
    const rawType = row.deviceType || row.device_type || ''
    const typeKey = normalizeExportDeviceTypeKey(rawType)
    const typeLabel = DEVICE_TYPE_LABELS[typeKey] || cleanCellText(rawType) || ''

    const rawStatus = row.status || ''
    const statusKey = normalizeExportStatusKey(rawStatus)
    const statusLabel = STATUS_LABELS[statusKey] || cleanCellText(rawStatus) || ''

    return [
      row.assetNo || row.asset_no || '',
      row.assetName || row.asset_name || '',
      typeLabel,
      row.brand || '',
      row.model || '',
      row.serialNo || row.serial_no || '',
      row.useDept || row.use_dept || '',
      row.userName || row.user_name || '',
      row.location || '',
      row.purchaseDate || row.purchase_date || '',
      statusLabel,
      row.cpuSpec || row.cpu_spec || '',
      row.memorySpec || row.memory_spec || '',
      row.diskSpec || row.disk_spec || '',
      row.osVersion || row.os_version || '',
      row.ipAddress || row.ip_address || '',
      row.macAddress || row.mac_address || '',
      row.warrantyDate || row.warranty_date || '',
      row.remark || '',
    ]
  })

  const hasData = dataRows.length > 0
  const emptyRow = ['暂无 IT 资产数据', ...Array.from({ length: headers.length - 1 }, () => '')]
  const matrix = hasData
    ? [headers, ...dataRows]
    : [headers, emptyRow]

  const ws = XLSXStyle.utils.aoa_to_sheet(matrix)
  // 第 1 行直接为表头，无顶部标题行与跨列合并，确保 Excel 中任意列筛选/排序零阻碍
  if (!hasData) {
    ws['!merges'] = [{ s: { r: 1, c: 0 }, e: { r: 1, c: headers.length - 1 } }]
  }

  const exportColBounds: Array<[number, number]> = [
    [14, 22], // 0 资产编号
    [18, 34], // 1 资产名称
    [11, 14], // 2 设备类型
    [10, 18], // 3 品牌
    [18, 32], // 4 规格型号
    [16, 26], // 5 SN序列号
    [14, 24], // 6 使用部门
    [10, 16], // 7 使用人
    [16, 28], // 8 存放地点
    [13, 15], // 9 购置日期
    [11, 14], // 10 资产状态
    [20, 38], // 11 CPU
    [10, 16], // 12 内存
    [14, 26], // 13 硬盘
    [18, 30], // 14 操作系统
    [15, 20], // 15 IP地址
    [19, 22], // 16 MAC地址
    [13, 15], // 17 保修到期日
    [20, 42], // 18 备注
  ]
  const colWidths = computeSmartColWidths(headers, dataRows, exportColBounds)

  applySheetStyling(ws, colWidths, {
    headerRowIdx: 0,
    emptyRowIdx: hasData ? undefined : 1,
    leftAlignCols: [1, 4, 5, 8, 11, 13, 14, 18],
    assetNoColIdx: 0,
    deviceTypeColIdx: 2,
    statusColIdx: 10,
    rowMatrix: matrix,
    minDataRowHpt: 22,
  })

  const lastFilterRow = hasData ? 1 + dataRows.length : 1
  setWorksheetPrintAndFreeze(ws, {
    freezeRows: 1,
    autofilterRef: `A1:${XLSXStyle.utils.encode_col(headers.length - 1)}${lastFilterRow}`,
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })

  XLSXStyle.utils.book_append_sheet(wb, ws, 'IT电脑资产台账')

  const deptWs = buildDeptSummarySheet(rows, companyTitle, exportedAtText)
  XLSXStyle.utils.book_append_sheet(wb, deptWs, '部门汇总')

  return wb
}

function patchWorksheetXml(xml: string, ws: any): string {
  let patched = xml

  const pageSetup: SheetPageSetup | undefined = ws?.['!pageSetup']
  if (pageSetup?.fitToPage && !/<sheetPr\b/.test(patched)) {
    patched = patched.replace(
      /<dimension\b/,
      '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension',
    )
  }

  const view: SheetFreezeView | undefined = Array.isArray(ws?.['!views']) ? ws['!views'][0] : undefined
  if (view && view.state === 'frozen' && ((view.ySplit ?? 0) > 0 || (view.xSplit ?? 0) > 0)) {
    const ySplit = view.ySplit ?? 0
    const xSplit = view.xSplit ?? 0
    const topLeftCell = view.topLeftCell || `${XLSXStyle.utils.encode_col(xSplit)}${ySplit + 1}`
    const activePane = xSplit > 0 && ySplit > 0
      ? 'bottomRight'
      : ySplit > 0
        ? 'bottomLeft'
        : 'topRight'
    const yAttr = ySplit > 0 ? ` ySplit="${ySplit}"` : ''
    const xAttr = xSplit > 0 ? ` xSplit="${xSplit}"` : ''
    const paneXml = `<pane${xAttr}${yAttr} topLeftCell="${topLeftCell}" activePane="${activePane}" state="frozen"/><selection pane="${activePane}" activeCell="${topLeftCell}" sqref="${topLeftCell}"/>`
    patched = patched.replace(
      /<sheetViews><sheetView([^>]*)\/><\/sheetViews>/,
      `<sheetViews><sheetView$1>${paneXml}</sheetView></sheetViews>`,
    )
  }

  if (pageSetup && !/<pageSetup\b/.test(patched)) {
    const attrs: string[] = []
    if (pageSetup.paperSize !== undefined) attrs.push(`paperSize="${pageSetup.paperSize}"`)
    if (pageSetup.orientation) attrs.push(`orientation="${pageSetup.orientation}"`)
    if (pageSetup.fitToWidth !== undefined) attrs.push(`fitToWidth="${pageSetup.fitToWidth}"`)
    if (pageSetup.fitToHeight !== undefined) attrs.push(`fitToHeight="${pageSetup.fitToHeight}"`)
    const pageSetupTag = `<pageSetup ${attrs.join(' ')}/>`
    if (/<pageMargins\b[^>]*\/>/.test(patched)) {
      patched = patched.replace(/(<pageMargins\b[^>]*\/>)/, `$1${pageSetupTag}`)
    } else if (/<ignoredErrors\b/.test(patched)) {
      patched = patched.replace(/<ignoredErrors\b/, `${pageSetupTag}<ignoredErrors`)
    } else {
      patched = patched.replace(/<\/worksheet>/, `${pageSetupTag}</worksheet>`)
    }
  }

  return patched
}

export function serializeItAssetWorkbook(wb: any): Buffer {
  const rawBuffer = XLSXStyle.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  const sheetNames: string[] = Array.isArray(wb?.SheetNames) ? wb.SheetNames : []
  if (!sheetNames.length) return rawBuffer

  const needsPatch = sheetNames.some((name) => {
    const ws = wb?.Sheets?.[name]
    return Boolean(ws?.['!views'] || ws?.['!pageSetup'])
  })
  if (!needsPatch) return rawBuffer

  const files = unzipSync(new Uint8Array(rawBuffer))
  let modified = false
  sheetNames.forEach((name, idx) => {
    const ws = wb.Sheets[name]
    const entryPath = `xl/worksheets/sheet${idx + 1}.xml`
    const entryBytes = files[entryPath]
    if (!entryBytes || (!ws?.['!views'] && !ws?.['!pageSetup'])) return
    const xml = strFromU8(entryBytes)
    const patched = patchWorksheetXml(xml, ws)
    if (patched !== xml) {
      files[entryPath] = strToU8(patched)
      modified = true
    }
  })

  if (!modified) return rawBuffer
  return Buffer.from(zipSync(files))
}

export function sendItAssetExcel(event: H3Event, wb: any, fileName: string) {
  const buffer = serializeItAssetWorkbook(wb)
  setResponseHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`)
  return buffer
}

export function parseItAssetImportBuffer(buffer: Buffer | Uint8Array): ItAssetImportParseResult {
  const XLSX = getXlsxSync()
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false })
  const firstSheetName = workbook.SheetNames?.[0]
  if (!firstSheetName) {
    throw new Error('Excel 文件中没有读取到工作表')
  }
  const sheet = workbook.Sheets[firstSheetName]
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' }) as unknown[][]
  if (!matrix.length) {
    throw new Error('Excel 工作表为空')
  }

  let headerRowIdx = -1
  let columnMapping: Array<{ colIdx: number; field: keyof ParsedItAssetImportRow }> = []

  for (let i = 0; i < Math.min(matrix.length, 5); i += 1) {
    const row = Array.isArray(matrix[i]) ? matrix[i] : []
    const mapped: Array<{ colIdx: number; field: keyof ParsedItAssetImportRow }> = []
    for (let c = 0; c < row.length; c += 1) {
      const normalized = normalizeHeaderName(row[c])
      const field = HEADER_FIELD_MAP[normalized]
      if (field) mapped.push({ colIdx: c, field })
    }
    if (mapped.some((m) => m.field === 'assetName')) {
      headerRowIdx = i
      columnMapping = mapped
      break
    }
  }

  if (headerRowIdx < 0) {
    throw new Error('未识别到“资产名称”表头列，请下载标准导入模板后再填报')
  }

  const rows: ParsedItAssetImportRow[] = []
  const errors: ItAssetImportParseError[] = []
  let dataCount = 0

  for (let r = headerRowIdx + 1; r < matrix.length; r += 1) {
    const rawRow = Array.isArray(matrix[r]) ? matrix[r] : []
    const hasAnyValue = rawRow.some((cell) => cleanCellText(cell) !== '')
    if (!hasAnyValue) continue

    const rowNo = r + 1
    const rawValues: Partial<Record<keyof ParsedItAssetImportRow, unknown>> = {}
    for (const { colIdx, field } of columnMapping) {
      rawValues[field] = rawRow[colIdx]
    }

    const assetName = cleanCellText(rawValues.assetName)
    if (assetName === TEMPLATE_SAMPLE_ASSET_NAME) continue

    dataCount += 1
    if (dataCount > IT_ASSET_IMPORT_MAX_ROWS) {
      throw new Error(`单次最多导入 ${IT_ASSET_IMPORT_MAX_ROWS} 条记录，请拆分文件后重试`)
    }

    if (!assetName) {
      errors.push({ rowNo, message: '资产名称不能为空' })
      continue
    }

    const rawType = cleanCellText(rawValues.deviceType)
    const normalizedType = rawType
      ? DEVICE_TYPE_ALIASES[rawType.toLowerCase()] || DEVICE_TYPE_ALIASES[rawType]
      : 'desktop'
    if (!normalizedType) {
      errors.push({ rowNo, message: `设备类型"${rawType}"无法识别` })
      continue
    }

    const rawStatus = cleanCellText(rawValues.status)
    const normalizedStatus = rawStatus
      ? STATUS_ALIASES[rawStatus.toLowerCase()] || STATUS_ALIASES[rawStatus]
      : 'in_use'
    if (!normalizedStatus) {
      errors.push({ rowNo, message: `资产状态"${rawStatus}"无法识别` })
      continue
    }

    const purchaseParsed = parseExcelDateCell(rawValues.purchaseDate)
    if (purchaseParsed.error) {
      errors.push({ rowNo, message: `购置日期：${purchaseParsed.error}` })
      continue
    }

    const warrantyParsed = parseExcelDateCell(rawValues.warrantyDate)
    if (warrantyParsed.error) {
      errors.push({ rowNo, message: `保修到期日：${warrantyParsed.error}` })
      continue
    }

    rows.push({
      rowNo,
      assetNo: cleanCellText(rawValues.assetNo).slice(0, 64),
      assetName: assetName.slice(0, 120),
      deviceType: normalizedType,
      brand: cleanCellText(rawValues.brand).slice(0, 64),
      model: cleanCellText(rawValues.model).slice(0, 120),
      serialNo: cleanCellText(rawValues.serialNo).slice(0, 100),
      useDept: cleanCellText(rawValues.useDept).slice(0, 100),
      userName: cleanCellText(rawValues.userName).slice(0, 64),
      location: cleanCellText(rawValues.location).slice(0, 120),
      purchaseDate: purchaseParsed.value,
      status: normalizedStatus,
      cpuSpec: cleanCellText(rawValues.cpuSpec).slice(0, 100),
      memorySpec: cleanCellText(rawValues.memorySpec).slice(0, 64),
      diskSpec: cleanCellText(rawValues.diskSpec).slice(0, 64),
      osVersion: cleanCellText(rawValues.osVersion).slice(0, 80),
      ipAddress: cleanCellText(rawValues.ipAddress).slice(0, 64),
      macAddress: cleanCellText(rawValues.macAddress).slice(0, 64),
      warrantyDate: warrantyParsed.value,
      remark: cleanCellText(rawValues.remark).slice(0, 500),
    })
  }

  return { rows, errors }
}
