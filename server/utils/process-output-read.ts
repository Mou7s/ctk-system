import type { RowDataPacket } from 'mysql2/promise'
import { getMysqlPool, mysqlQueryOptions } from './mysql'
import { queryK3SqlServer, sqlStringParameter } from './sqlserver'

export class ProcessOutputInputError extends Error {
  readonly statusCode = 500

  constructor(message: string) {
    super(message)
    this.name = 'ProcessOutputInputError'
  }
}

type Input = Record<string, unknown>
type RawOutput = {
  packageName: string
  processName: string
  processSort: number | null
  outputQty: number
}
type Target = {
  id: string | null
  packageName: string | null
  processName: string | null
  targetCapacity: number | null
  sortNo: number | null
  status: string | null
  remark: string | null
  createBy: string | null
  createTime: string | null
  updateBy: string | null
  updateTime: string | null
}
type Staff = {
  id: string | null
  reportDate: string | null
  processName: string | null
  staffCount: number | null
  remark: string | null
  createBy: string | null
  createTime: string | null
  updateBy: string | null
  updateTime: string | null
}
type TableDefinition = {
  tableName: string
  packageOrder: string[]
  processOrder: string[]
}
type Period = {
  startSql: string
  endSql: string
  businessDate: string
  label: string
  days: number
  showStaffRows: boolean
}

const PERIOD_DAY = 'day'
const PERIOD_WEEK = 'week'
const PERIOD_MONTH = 'month'
const TOTAL_LABEL = '合计'
const SMALL_SIGNAL_TABLE = '塑封小信号产品'
const POWER_TABLE = '塑封功率器件产品'
const GLASS_TABLE = '玻封产品'

const PROCESS_ORDER: Record<string, number> = {
  固晶: 10,
  焊线: 20,
  模压: 30,
  测试分选: 60,
  包装入库: 9990,
  组装: 110,
  烧结: 120,
  玻封上锡: 130,
  外观全检: 140,
  打印: 150,
  上带: 160,
  玻封包装: 170,
}

const TABLES: TableDefinition[] = [
  {
    tableName: SMALL_SIGNAL_TABLE,
    packageOrder: ['SOD-123', 'SOD-323', 'SOD-523', 'SOT-23 6R/27R', 'SOT23-3L/5L/6L', 'DFN1006'],
    processOrder: ['固晶', '焊线', '模压', '测试分选', '包装入库'],
  },
  {
    tableName: POWER_TABLE,
    packageOrder: ['PDFN3X3', 'PDFN5X6', 'TO-252'],
    processOrder: ['固晶', '焊线', '模压', '测试分选', '包装入库'],
  },
  {
    tableName: GLASS_TABLE,
    packageOrder: [GLASS_TABLE],
    processOrder: ['组装', '烧结', '玻封上锡', '外观全检', '打印', '上带', '玻封包装'],
  },
]

const SUPPORTED_PACKAGES = new Set(TABLES.flatMap((table) => table.packageOrder))

function scalar(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value
}

function text(value: unknown): string {
  return String(scalar(value) ?? '').trim()
}

function zeroTime(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function parseDatePart(value: string, pattern: 'date' | 'month' | 'datetime'): Date | null {
  const match = pattern === 'month'
    ? value.match(/^(\d{4})-(\d{2})$/)
    : pattern === 'datetime'
      ? value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/)
      : value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const parts = match.slice(1).map(Number)
  const date = pattern === 'month'
    ? new Date(Date.UTC(parts[0], parts[1] - 1, 1))
    : pattern === 'datetime'
      ? new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5] || 0))
      : new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
  if (Number.isNaN(date.getTime())) return null
  if (pattern === 'month' && (date.getUTCFullYear() !== parts[0] || date.getUTCMonth() !== parts[1] - 1)) return null
  if (pattern === 'date' && (date.getUTCFullYear() !== parts[0] || date.getUTCMonth() !== parts[1] - 1 || date.getUTCDate() !== parts[2])) return null
  if (pattern === 'datetime' && (date.getUTCFullYear() !== parts[0] || date.getUTCMonth() !== parts[1] - 1 || date.getUTCDate() !== parts[2] || date.getUTCHours() !== parts[3] || date.getUTCMinutes() !== parts[4] || date.getUTCSeconds() !== (parts[5] || 0))) return null
  return date
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
}

function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()))
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function localDateString(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function sqlDateTime(date: Date): string {
  return `${dateOnly(date)} ${date.toISOString().slice(11, 19)}`
}

function formatDateLabel(date: Date): string {
  return dateOnly(date)
}

function periodDays(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000) * 100000000) / 100000000
}

function parseFlexibleDate(value: string, periodType: string): Date {
  const parsed = periodType === PERIOD_MONTH ? parseDatePart(value, 'month') || parseDatePart(value, 'date') : parseDatePart(value, 'date')
  if (!parsed) throw new ProcessOutputInputError('统计日期格式不正确')
  return parsed
}

function resolvePeriod(input: Input): Period {
  const reportDate = text(input.reportDate)
  const periodType = text(input.periodType) || PERIOD_DAY
  if (reportDate && (reportDate.includes(',') || reportDate.includes('~'))) {
    const separator = reportDate.includes(',') ? ',' : '~'
    const parts = reportDate.split(separator)
    if (parts.length === 2) {
      const left = parts[0].trim()
      const right = parts[1].trim()
      const isMonth = /^\d{4}-\d{2}$/.test(left)
      const hasTime = left.length >= 19 || right.length >= 19
      const start = parseDatePart(left, isMonth ? 'month' : hasTime ? 'datetime' : 'date')
      const parsedEnd = parseDatePart(right, isMonth ? 'month' : hasTime ? 'datetime' : 'date')
      if (start && parsedEnd) {
        const end = isMonth ? addMonths(parsedEnd, 1) : hasTime ? parsedEnd : addDays(zeroTime(parsedEnd), 1)
        if (end <= start) throw new ProcessOutputInputError('结束时间必须晚于开始时间')
        const days = periodDays(start, end)
        const isMidnightRange = hasTime
          && start.getUTCHours() === 0 && start.getUTCMinutes() === 0 && start.getUTCSeconds() === 0
          && end.getUTCHours() === 0 && end.getUTCMinutes() === 0 && end.getUTCSeconds() === 0
        const displayEndDate = isMidnightRange ? addDays(end, -1) : parsedEnd
        const startLabel = isMonth ? left : formatDateLabel(start)
        const endLabel = isMonth ? right : formatDateLabel(displayEndDate)
        return {
          startSql: sqlDateTime(start),
          endSql: sqlDateTime(end),
          businessDate: dateOnly(start),
          label: startLabel === endLabel ? startLabel : `${startLabel} 至 ${endLabel}`,
          days,
          showStaffRows: days <= 1,
        }
      }
    }
  }

  const base = parseFlexibleDate(reportDate || localDateString(), periodType)
  let start = zeroTime(base)
  let end: Date
  if (periodType === PERIOD_WEEK) {
    const day = start.getUTCDay() || 7
    start = addDays(start, 1 - day)
    end = addDays(start, 7)
  } else if (periodType === PERIOD_MONTH) {
    start = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
    end = addMonths(start, 1)
  } else {
    end = addDays(start, 1)
  }
  const label = periodType === PERIOD_DAY
    ? formatDateLabel(start)
    : periodType === PERIOD_MONTH
      ? start.toISOString().slice(0, 7)
      : `${formatDateLabel(start)} 至 ${formatDateLabel(addDays(end, -1))}`
  const days = periodDays(start, end)
  return {
    startSql: sqlDateTime(start),
    endSql: sqlDateTime(end),
    businessDate: dateOnly(start),
    label,
    days,
    showStaffRows: days <= 1,
  }
}

export function normalizePackageName(specification: string, materialName: string, materialNumber: string): string {
  const value = specification || materialName
  if (!value) return ''
  const fullText = `${specification} ${materialName} ${materialNumber}`.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (fullText.includes('SOT23') && (fullText.includes('6R') || fullText.includes('27R'))) return 'SOT-23 6R/27R'
  const base = value.split(/[\/／]/)[0].trim().toUpperCase()
  if (base.includes('LL') || base.includes('DO-')) return GLASS_TABLE
  if (['SOT-23(6R)', 'SOT-23 6R', 'SOT-23-6R', 'SOT-23(27R)', 'SOT-23-27R', 'SOT-23 27R'].includes(base)) return 'SOT-23 6R/27R'
  if (['SOT23-3L', 'SOT23-5L', 'SOT23-6L', 'SOT-23-3L', 'SOT-23-5L', 'SOT-23-6L'].includes(base)) return 'SOT23-3L/5L/6L'
  const normalizedPdfn = base.replace(/[×*]/g, 'X')
  if (/^PDFN(?:3(?:\.3)?[X-]3(?:\.3)?|3030|3333)(?:$|[-\s])/.test(normalizedPdfn)) return 'PDFN3X3'
  if (/^PDFN(?:5(?:\.0)?[X-]6(?:\.0)?|5060)(?:$|[-\s])/.test(normalizedPdfn)) return 'PDFN5X6'
  if (base === 'TO252' || base === 'TO-252') return 'TO-252'
  if (base.startsWith('DFN1006')) return 'DFN1006'
  return SUPPORTED_PACKAGES.has(base) ? base : ''
}

export function normalizeProcessName(value: string): string {
  let processName = value.trim()
  if (!processName || processName === '外观全检') return ''
  if (processName.endsWith('部') && processName.length > 1) processName = processName.slice(0, -1)
  return Object.prototype.hasOwnProperty.call(PROCESS_ORDER, processName) ? processName : ''
}

function tableDefinitions(tableName: string): TableDefinition[] {
  if (!tableName) return TABLES
  return TABLES.filter((table) => table.tableName === tableName).length ? TABLES.filter((table) => table.tableName === tableName) : TABLES
}

function targetRow(row: RowDataPacket): Target {
  return {
    id: row.id == null ? null : String(row.id),
    packageName: row.package_name == null ? null : String(row.package_name),
    processName: row.process_name == null ? null : String(row.process_name),
    targetCapacity: row.target_capacity == null ? null : Number(row.target_capacity),
    sortNo: row.sort_no == null ? null : Number(row.sort_no),
    status: row.status == null ? null : String(row.status),
    remark: row.remark == null ? null : String(row.remark),
    createBy: row.create_by == null ? null : String(row.create_by),
    createTime: row.create_time == null ? null : String(row.create_time),
    updateBy: row.update_by == null ? null : String(row.update_by),
    updateTime: row.update_time == null ? null : String(row.update_time),
  }
}

function staffRow(row: RowDataPacket): Staff {
  return {
    id: row.id == null ? null : String(row.id),
    reportDate: row.report_date == null ? null : String(row.report_date),
    processName: row.process_name == null ? null : String(row.process_name),
    staffCount: row.staff_count == null ? null : Number(row.staff_count),
    remark: row.remark == null ? null : String(row.remark),
    createBy: row.create_by == null ? null : String(row.create_by),
    createTime: row.create_time == null ? null : String(row.create_time),
    updateBy: row.update_by == null ? null : String(row.update_by),
    updateTime: row.update_time == null ? null : String(row.update_time),
  }
}

async function queryOutput(period: Period, packageName: string, processName: string): Promise<RawOutput[]> {
  const rows = await queryK3SqlServer<RowDataPacket>(async (request) => {
    sqlStringParameter(request, 'startDate', period.startSql)
    sqlStringParameter(request, 'endDate', period.endSql)
    return request.query(`
      SELECT mat_l.FSPECIFICATION AS specification,
             mat_l.FNAME AS materialName,
             mat.FNUMBER AS materialNumber,
             proc_l.FNAME AS processName,
             MIN(entry.FOPERNUMBER) AS operNumber,
             SUM(a.FQUAQTY) AS totalQty
      FROM T_SFC_OPTRPT rpt
      JOIN T_SFC_OPTRPTENTRY entry ON entry.FID = rpt.FID
      JOIN T_SFC_OPTRPTENTRY_A a ON a.FENTRYID = entry.FENTRYID
      LEFT JOIN T_BD_MATERIAL mat ON mat.FMATERIALID = entry.FMATERIALID
      LEFT JOIN T_BD_MATERIAL_L mat_l ON mat_l.FMATERIALID = entry.FMATERIALID AND mat_l.FLOCALEID = 2052
      LEFT JOIN T_SFC_OPTRPTENTRY_B b ON b.FENTRYID = entry.FENTRYID
      LEFT JOIN T_ENG_PROCESS_L proc_l ON proc_l.FID = b.FPROCESSID AND proc_l.FLOCALEID = 2052
      WHERE rpt.FDOCUMENTSTATUS = 'C'
        AND rpt.FCANCELSTATUS = 'A'
        AND rpt.FDATE >= @startDate AND rpt.FDATE < @endDate
        AND a.FQUAQTY > 0
      GROUP BY mat_l.FSPECIFICATION, mat_l.FNAME, mat.FNUMBER, proc_l.FNAME
      ORDER BY MIN(entry.FOPERNUMBER) ASC
    `)
  })
  const normalizedProcessFilter = processName ? normalizeProcessName(processName) : ''
  const result: RawOutput[] = []
  const byKey = new Map<string, RawOutput>()
  for (const row of rows) {
    const rawSpec = String(row.specification || '')
    const rawProc = String(row.processName || '')
    const packageValue = normalizePackageName(rawSpec, String(row.materialName || ''), String(row.materialNumber || ''))
    const processValue = normalizeProcessName(rawProc)
    const outputQty = round(Number(row.totalQty || 0), 6)
    if (!packageValue || !processValue || outputQty === 0) continue
    if (packageName && packageValue !== packageName && !rawSpec.toUpperCase().includes(packageName.toUpperCase())) continue
    if (processName && processValue !== (normalizedProcessFilter || processName) && !rawProc.includes(processName)) continue
    const key = `${packageValue}||${processValue}`
    const existing = byKey.get(key)
    if (existing) {
      existing.outputQty = round(existing.outputQty + outputQty, 6)
      if (row.operNumber != null && (existing.processSort == null || Number(row.operNumber) < existing.processSort)) existing.processSort = Number(row.operNumber)
    } else {
      const next = { packageName: packageValue, processName: processValue, processSort: row.operNumber == null ? null : Number(row.operNumber), outputQty }
      byKey.set(key, next)
      result.push(next)
    }
  }
  return result
}

async function queryTargets(packageName: string, processName: string): Promise<Target[]> {
  const pool = getMysqlPool()
  const conditions = ['status = ?']
  const params: unknown[] = ['0']
  if (packageName) { conditions.push("package_name LIKE CONCAT('%', ?, '%')"); params.push(packageName) }
  if (processName) { conditions.push('process_name = ?'); params.push(processName) }
  const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`
    SELECT id, package_name, process_name, target_capacity, sort_no, status, remark, create_by,
           DATE_FORMAT(create_time, '%Y-%m-%d %H:%i:%s') AS create_time,
           update_by, DATE_FORMAT(update_time, '%Y-%m-%d %H:%i:%s') AS update_time
    FROM tk_process_output_target
    WHERE ${conditions.join(' AND ')}
    ORDER BY sort_no ASC, process_name ASC, package_name ASC
  `), params)
  return rows.map(targetRow)
}

async function queryStaff(reportDate: string): Promise<Staff[]> {
  const pool = getMysqlPool()
  const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`
    SELECT id, DATE_FORMAT(report_date, '%Y-%m-%d') AS report_date, process_name, staff_count, remark, create_by,
           DATE_FORMAT(create_time, '%Y-%m-%d %H:%i:%s') AS create_time,
           update_by, DATE_FORMAT(update_time, '%Y-%m-%d %H:%i:%s') AS update_time
    FROM tk_process_output_staff
    WHERE report_date = ?
    ORDER BY process_name ASC
  `), [reportDate])
  return rows.map(staffRow)
}

function numberValue(value: unknown): number {
  const result = Number(value)
  return Number.isFinite(result) ? result : 0
}

function round(value: number, scale: number): number {
  const factor = 10 ** scale
  return Math.round((value + Number.EPSILON) * factor) / factor
}

function multiplyTarget(value: number | null, days: number): number | null {
  return value == null ? null : round(value * days / 30, 2)
}

function rate(outputQty: number, targetCapacity: number | null): number | null {
  if (targetCapacity == null || targetCapacity === 0) return null
  return round(outputQty / targetCapacity, 4)
}

function average(totalQty: number, staffCount: number | null): number | null {
  if (staffCount == null || staffCount === 0) return null
  return round(totalQty / staffCount, 2)
}

function toTableProcessName(definition: TableDefinition, value: string): string {
  const normalized = normalizeProcessName(value)
  return normalized && definition.processOrder.includes(normalized) ? normalized : ''
}

function containsPackage(definition: TableDefinition, value: string | null): boolean {
  return Boolean(value) && definition.packageOrder.includes(value as string)
}

function containsTarget(definition: TableDefinition, value: string | null): boolean {
  return containsPackage(definition, value) || value === definition.tableName
}

function buildTable(definition: TableDefinition, days: number, outputRows: RawOutput[], targets: Target[], staffItems: Staff[]) {
  const processSort = new Map<string, number>()
  const processNames = new Set<string>()
  const packageNames = new Set<string>()
  for (const row of outputRows) {
    if (!containsPackage(definition, row.packageName) || !row.processName) continue
    const processName = toTableProcessName(definition, row.processName)
    if (processName) {
      packageNames.add(row.packageName)
      processNames.add(processName)
      if (row.processSort != null && (!processSort.has(processName) || row.processSort < (processSort.get(processName) as number))) processSort.set(processName, row.processSort)
    }
  }
  for (const target of targets) {
    if (!containsTarget(definition, target.packageName)) continue
    if (containsPackage(definition, target.packageName)) packageNames.add(target.packageName as string)
    if (target.processName) {
      const processName = toTableProcessName(definition, target.processName)
      if (processName) {
        processNames.add(processName)
        if (target.sortNo != null && !processSort.has(processName)) processSort.set(processName, target.sortNo)
      }
    }
  }
  if (packageNames.size || processNames.size) definition.processOrder.forEach((item) => { const normalized = normalizeProcessName(item); if (normalized) processNames.add(normalized) })
  const orderedProcesses = [...processNames].sort((left, right) => (PROCESS_ORDER[left] ?? processSort.get(left) ?? 5000) - (PROCESS_ORDER[right] ?? processSort.get(right) ?? 5000) || left.localeCompare(right))
  const processes = orderedProcesses.map((processName) => ({ processName, sortNo: PROCESS_ORDER[processName] ?? processSort.get(processName) ?? 5000 }))
  const outputMap = new Map<string, Map<string, number>>()
  for (const row of outputRows) {
    if (!containsPackage(definition, row.packageName)) continue
    const processName = toTableProcessName(definition, row.processName)
    if (!outputMap.has(row.packageName)) outputMap.set(row.packageName, new Map())
    const map = outputMap.get(row.packageName) as Map<string, number>
    map.set(processName, round((map.get(processName) || 0) + numberValue(row.outputQty), 6))
  }
  const targetMap = new Map<string, Map<string, number | null>>()
  const totalTargetMap = new Map<string, number | null>()
  for (const target of targets) {
    if (!containsPackage(definition, target.packageName)) continue
    const processName = toTableProcessName(definition, target.processName || '')
    if (!targetMap.has(target.packageName as string)) targetMap.set(target.packageName as string, new Map())
    targetMap.get(target.packageName as string)?.set(processName, multiplyTarget(target.targetCapacity, days))
  }
  for (const target of targets) {
    if (target.packageName !== definition.tableName) continue
    totalTargetMap.set(toTableProcessName(definition, target.processName || ''), multiplyTarget(target.targetCapacity, days))
  }
  const totalCells: Record<string, any> = {}
  const rows: any[] = []
  for (const packageName of definition.packageOrder.filter((item) => packageNames.has(item))) {
    const cells: Record<string, any> = {}
    for (const processName of orderedProcesses) {
      const outputQty = outputMap.get(packageName)?.get(processName) || 0
      const targetCapacity = targetMap.get(packageName)?.get(processName) ?? null
      cells[processName] = { outputQty, targetCapacity, achievementRate: rate(outputQty, targetCapacity), reason: null }
      const totalCell = totalCells[processName] || { outputQty: 0, reason: null }
      totalCell.outputQty = round(totalCell.outputQty + outputQty, 6)
      if (targetCapacity != null) totalCell.targetCapacity = (totalCell.targetCapacity || 0) + targetCapacity
      totalCells[processName] = totalCell
    }
    rows.push({ packageName, cells })
  }
  for (const processName of orderedProcesses) {
    const totalCell = totalCells[processName] || { outputQty: 0, reason: null }
    if (totalTargetMap.has(processName)) totalCell.targetCapacity = totalTargetMap.get(processName)
    totalCell.achievementRate = rate(totalCell.outputQty, totalCell.targetCapacity ?? null)
    totalCells[processName] = totalCell
  }
  const staffCounts: Record<string, number> = {}
  const processSet = new Set(orderedProcesses)
  for (const staff of staffItems) if (staff.processName && processSet.has(staff.processName)) staffCounts[staff.processName] = staff.staffCount as number
  const averageValues: Record<string, number | null> = {}
  for (const processName of orderedProcesses) averageValues[processName] = average(totalCells[processName]?.outputQty || 0, staffCounts[processName] ?? null)
  return {
    tableName: definition.tableName,
    processes,
    rows,
    totalRow: { packageName: TOTAL_LABEL, cells: totalCells },
    staffCounts,
    averageValues,
  }
}

export async function queryProcessOutputSummary(input: Input) {
  const period = resolvePeriod(input)
  const packageName = text(input.packageName)
  const processName = text(input.processName)
  const definitions = tableDefinitions(text(input.tableName))
  const outputRows = await queryOutput(period, packageName, processName)
  const filteredOutput = definitions.length === TABLES.length ? outputRows : outputRows.filter((row) => definitions.some((definition) => containsPackage(definition, row.packageName)))
  const [targets, staffItems] = await Promise.all([queryTargets(packageName, processName), period.showStaffRows ? queryStaff(period.businessDate) : Promise.resolve([])])
  const tables = definitions.map((definition) => buildTable(definition, period.days, filteredOutput, targets, staffItems))
  const first = tables[0]
  return {
    reportDate: period.label,
    processes: first?.processes || [],
    rows: first?.rows || [],
    totalRow: first?.totalRow || { packageName: TOTAL_LABEL, cells: {} },
    staffCounts: first?.staffCounts || {},
    averageValues: first?.averageValues || {},
    tables,
    targets,
    staffItems,
    showStaffRows: period.showStaffRows,
  }
}
