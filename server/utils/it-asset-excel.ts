import * as XLSX from 'xlsx/xlsx.mjs'
import * as XLSXStyleModule from 'xlsx-js-style'
import { setResponseHeader, type H3Event } from 'h3'

const XLSXStyle: any = (XLSXStyleModule as any).default || XLSXStyleModule

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

function thinBorder() {
  const side = { style: 'thin', color: { rgb: 'FFCBD5E1' } }
  return { top: side, bottom: side, left: side, right: side }
}

function applySheetStyling(
  ws: any,
  colWidths: number[],
  options: { titleRowIdx?: number; headerRowIdx: number; leftAlignCols?: number[] },
) {
  const ref = ws['!ref']
  if (!ref) return
  const range = XLSXStyle.utils.decode_range(ref)
  const leftCols = new Set(options.leftAlignCols || [])
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    const isTitle = options.titleRowIdx !== undefined && r === options.titleRowIdx
    const isHeader = r === options.headerRowIdx
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const addr = XLSXStyle.utils.encode_cell({ r, c })
      const cell = ws[addr]
      if (!cell) continue
      cell.s = {
        border: thinBorder(),
        font: {
          name: '微软雅黑',
          sz: isTitle ? 13 : 10,
          bold: isTitle || isHeader,
          color: { rgb: isHeader ? 'FFFFFFFF' : 'FF0F172A' },
        },
        fill: isTitle
          ? { fgColor: { rgb: 'FFE2E8F0' } }
          : isHeader
            ? { fgColor: { rgb: 'FF1E3A5F' } }
            : r % 2 === 1
              ? { fgColor: { rgb: 'FFF8FAFC' } }
              : undefined,
        alignment: {
          horizontal: isTitle || isHeader ? 'center' : (leftCols.has(c) ? 'left' : 'center'),
          vertical: 'center',
          wrapText: true,
        },
      }
    }
  }
  ws['!cols'] = colWidths.map((wch) => ({ wch }))
  const rows: any[] = []
  if (options.titleRowIdx !== undefined) rows[options.titleRowIdx] = { hpt: 28 }
  rows[options.headerRowIdx] = { hpt: 24 }
  ws['!rows'] = rows
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
  const ws1 = XLSXStyle.utils.aoa_to_sheet([[...IT_ASSET_EXCEL_HEADERS], sampleRow])
  applySheetStyling(
    ws1,
    [16, 26, 12, 12, 22, 18, 16, 12, 18, 14, 12, 14, 10, 14, 18, 16, 20, 14, 24],
    { headerRowIdx: 0, leftAlignCols: [1, 4, 8, 18] },
  )
  XLSXStyle.utils.book_append_sheet(wb, ws1, 'IT资产导入模板')

  const guideRows = [
    ['字段名称', '是否必填', '填表说明与可选值'],
    ['资产编号', '选填', '留空时系统按 TK-PC-0001 自动递增生成；填写则使用指定编号（不能与已有记录重复）'],
    ['资产名称*', '必填', '例如：办公台式机、商务笔记本、研发工作站'],
    ['设备类型', '选填', '可选：台式机、笔记本、一体机、工作站、显示器、服务器、其他设备（留空默认“台式机”）'],
    ['资产状态', '选填', '可选：在用、闲置、维修中、已报废（留空默认“在用”）'],
    ['使用部门 / 使用人', '选填', '支持与企业微信通讯录部门和姓名匹配；若人员姓名唯一且部门未填，系统会自动补全'],
    ['购置日期 / 保修到期日', '选填', '格式 YYYY-MM-DD（如 2026-03-15），也支持 Excel 标准日期单元格'],
    ['示例行处理', '提示', '第 2 行为示例行，上传前可删除；若未删除且名称仍为示例提示文本，系统会自动忽略该行'],
  ]
  const ws2 = XLSXStyle.utils.aoa_to_sheet(guideRows)
  applySheetStyling(ws2, [24, 12, 72], { headerRowIdx: 0, leftAlignCols: [0, 2] })
  XLSXStyle.utils.book_append_sheet(wb, ws2, '填写说明')

  return wb
}

export function buildItAssetExportWorkbook(rows: Array<Record<string, any>>) {
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
    '打印次数',
    '最近打印时间',
    '备注',
  ]
  const companyTitle = String(process.env.COMPANY_DISPLAY_NAME || '').trim() || '示例企业有限公司'
  const titleRow = [
    `${companyTitle} IT电脑资产台账（共 ${rows.length} 台）`,
    ...Array.from({ length: headers.length - 1 }, () => ''),
  ]
  const dataRows = rows.map((row) => [
    row.assetNo || row.asset_no || '',
    row.assetName || row.asset_name || '',
    DEVICE_TYPE_LABELS[String(row.deviceType || row.device_type || '')] || row.deviceType || row.device_type || '',
    row.brand || '',
    row.model || '',
    row.serialNo || row.serial_no || '',
    row.useDept || row.use_dept || '',
    row.userName || row.user_name || '',
    row.location || '',
    row.purchaseDate || row.purchase_date || '',
    STATUS_LABELS[String(row.status || '')] || row.status || '',
    row.cpuSpec || row.cpu_spec || '',
    row.memorySpec || row.memory_spec || '',
    row.diskSpec || row.disk_spec || '',
    row.osVersion || row.os_version || '',
    row.ipAddress || row.ip_address || '',
    row.macAddress || row.mac_address || '',
    row.warrantyDate || row.warranty_date || '',
    Number(row.printCount ?? row.print_count ?? 0),
    row.lastPrintedAt || row.last_printed_at || '',
    row.remark || '',
  ])

  const ws = XLSXStyle.utils.aoa_to_sheet([titleRow, headers, ...dataRows])
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }]
  applySheetStyling(
    ws,
    [16, 22, 12, 12, 22, 18, 16, 12, 18, 13, 11, 16, 11, 14, 18, 16, 20, 13, 10, 20, 26],
    { titleRowIdx: 0, headerRowIdx: 1, leftAlignCols: [1, 4, 8, 11, 14, 20] },
  )
  XLSXStyle.utils.book_append_sheet(wb, ws, 'IT电脑资产台账')
  return wb
}

export function sendItAssetExcel(event: H3Event, wb: any, fileName: string) {
  const buffer = XLSXStyle.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  setResponseHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`)
  return buffer
}

export function parseItAssetImportBuffer(buffer: Buffer | Uint8Array): ItAssetImportParseResult {
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
