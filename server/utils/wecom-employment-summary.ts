import type { Pool, RowDataPacket } from 'mysql2/promise'
import { fetchWecomDepartments, loadWecomContactConfig } from './wecom-contacts'
import { mysqlQueryOptions } from './mysql'

export interface EmploymentEventRow extends RowDataPacket {
  event_id: number
  userid: string
  event_type: 'hire' | 'leave'
  event_at: string
  name: string | null
  dept: string | null
  position: string | null
  sync_batch_id: number | null
  leave_reason_code?: string | null
  leave_reason_remark?: string | null
}

export type LeaveReasonOption = {
  code: string
  label: string
  fullText: string
}

export const LEAVE_REASON_UNFILLED_CODE = ''

export const LEAVE_REASON_UNFILLED_LABEL = '未填写'

export const LEAVE_REASON_OPTIONS: LeaveReasonOption[] = [
  { code: 'R01', label: '站立劳累', fullText: '站得脚痛，做不了' },
  { code: 'R02', label: '家庭原因', fullText: '家庭原因，家里有事，回家照顾老人、小孩' },
  { code: 'R03', label: '身体原因', fullText: '身体不舒服，生病，身体扛不住' },
  { code: 'R04', label: '个人发展', fullText: '个人发展规划' },
  { code: 'R05', label: '薪资偏低', fullText: '工资太低' },
  { code: 'R06', label: '工作量大', fullText: '工作量大，内容繁重，无法适应' },
  { code: 'R07', label: '试用不通过', fullText: '试用不通过，工作散漫，纪律性差，请假多' },
  { code: 'R08', label: '不适应环境', fullText: '个人原因，不适应工作环境' },
  { code: 'R09', label: '不适应夜班', fullText: '不适应夜班' },
  { code: 'R10', label: '环境炎热劳累', fullText: '工作环境太热、太累' },
]

const LEAVE_REASON_CODES = new Set(LEAVE_REASON_OPTIONS.map((option) => option.code))

export function normalizeLeaveReasonCode(value: unknown): string | null {
  const text = String(value || '').trim().toUpperCase()
  if (!text) return null
  return LEAVE_REASON_CODES.has(text) ? text : null
}

export function leaveReasonLabel(code: string | null | undefined): string {
  if (!code) return LEAVE_REASON_UNFILLED_LABEL
  return LEAVE_REASON_OPTIONS.find((option) => option.code === code)?.label || LEAVE_REASON_UNFILLED_LABEL
}

export type LeaveReasonStat = {
  code: string
  label: string
  fullText: string
  count: number
  rate: number | null
}

export function buildLeaveReasonStats(events: EmploymentEventRow[]): { stats: LeaveReasonStat[]; leaveTotal: number } {
  const leaveEvents = events.filter((row) => row.event_type === 'leave')
  const leaveTotal = leaveEvents.length
  const counts = new Map<string, number>()
  for (const row of leaveEvents) {
    const code = normalizeLeaveReasonCode(row.leave_reason_code) || LEAVE_REASON_UNFILLED_CODE
    counts.set(code, (counts.get(code) || 0) + 1)
  }
  const rate = (count: number): number | null => (
    leaveTotal > 0 ? Math.round((count / leaveTotal) * 10000) / 100 : null
  )
  const stats: LeaveReasonStat[] = LEAVE_REASON_OPTIONS.map((option) => {
    const count = counts.get(option.code) || 0
    return { code: option.code, label: option.label, fullText: option.fullText, count, rate: rate(count) }
  })
  const unfilledCount = counts.get(LEAVE_REASON_UNFILLED_CODE) || 0
  stats.push({
    code: LEAVE_REASON_UNFILLED_CODE,
    label: LEAVE_REASON_UNFILLED_LABEL,
    fullText: '人事尚未补录离职原因',
    count: unfilledCount,
    rate: rate(unfilledCount),
  })
  return { stats, leaveTotal }
}

export interface WxuserSummaryRow extends RowDataPacket {
  userid: string
  name: string | null
  dept: string | null
  leader_dept: string | null
  status: string | null
}

export type DepartmentStat = {
  department: string
  hireCount: number
  leaveCount: number
  activeCount: number
  leaveRate: number | null
  leader: string
  activeNames: string[]
  hireNames: string[]
  leaveNames: string[]
  departmentId?: number
  parentDepartment?: string | null
  level?: number
  hasChildren?: boolean
}

export type WecomDepartmentRow = {
  id: number
  parentId: number
  order: number
  name: string
}

export type WecomEmploymentSnapshot = {
  snapshotDate: string
  contacts: WxuserSummaryRow[]
}

export type EmploymentRateResult = {
  available: boolean
  message: string | null
  overallRate: number | null
  averageActiveCount: number | null
  ratesByDepartment: Map<string, number | null>
}

export function unavailableEmploymentRate(message: string): EmploymentRateResult {
  return {
    available: false,
    message,
    overallRate: null,
    averageActiveCount: null,
    ratesByDepartment: new Map(),
  }
}

const DEPARTMENT_GROUPS: Record<string, string> = {
  国际一部: '国际部',
  国际二部: '国际部',
  国际1部: '国际部',
  国际2部: '国际部',
  销售1部: '营销部',
  销售2部: '营销部',
  销售3部: '营销部',
  销售4部: '营销部',
  销售5部: '营销部',
  销售一部: '营销部',
  销售二部: '营销部',
  销售三部: '营销部',
  销售四部: '营销部',
  销售五部: '营销部',
}

export function normalizeDepartmentName(value: unknown): string {
  const text = String(value || '').trim()
  return DEPARTMENT_GROUPS[text] || text
}

export function departmentNames(value: unknown): string[] {
  return [...new Set(
    String(value || '')
      .split('、')
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => !/^\d+$/.test(item))
      .map(normalizeDepartmentName),
  )]
}

export async function loadWecomDepartmentHierarchy(pool: Pool): Promise<WecomDepartmentRow[]> {
  try {
    const config = await loadWecomContactConfig(pool)
    return await fetchWecomDepartments(config)
  } catch (error) {
    console.warn(
      '[NitroWxuserEmploymentSummary] department hierarchy unavailable, using flat names:',
      error instanceof Error ? error.message : String(error),
    )
    return []
  }
}

function sqlDateOnly(value: unknown): string {
  if (value instanceof Date) {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  const text = String(value || '').replace('T', ' ')
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : ''
}

export async function loadWecomEmploymentSnapshots(
  pool: Pool,
  startDate: string,
  endDate: string,
): Promise<WecomEmploymentSnapshot[]> {
  try {
    const [batchRows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`
      SELECT
        batch_id,
        DATE(COALESCE(finished_at, started_at)) AS snapshot_date
      FROM wxuser_sync_batch
      WHERE sync_type = 'employee'
        AND status = 'completed'
        AND COALESCE(finished_at, started_at) >= ?
        AND COALESCE(finished_at, started_at) < DATE_ADD(?, INTERVAL 1 DAY)
      ORDER BY snapshot_date DESC, batch_id DESC
    `), [startDate, endDate])

    const latestBatchByDate = new Map<string, number>()
    for (const row of batchRows) {
      const snapshotDate = sqlDateOnly(row.snapshot_date)
      const batchId = Number(row.batch_id || 0)
      if (snapshotDate && batchId && !latestBatchByDate.has(snapshotDate)) {
        latestBatchByDate.set(snapshotDate, batchId)
      }
    }

    const batchIds = [...latestBatchByDate.values()]
    if (!batchIds.length) return []

    const placeholders = batchIds.map(() => '?').join(', ')
    const [memberRows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`
      SELECT batch_id, userid, name, dept, position
      FROM wxuser_sync_member_snapshot
      WHERE batch_id IN (${placeholders})
      ORDER BY batch_id, userid
    `), batchIds)

    const contactsByBatch = new Map<number, WxuserSummaryRow[]>()
    for (const row of memberRows) {
      const batchId = Number(row.batch_id || 0)
      if (!batchId) continue
      const contacts = contactsByBatch.get(batchId) || []
      contacts.push({
        userid: String(row.userid || ''),
        name: row.name == null ? null : String(row.name),
        dept: row.dept == null ? null : String(row.dept),
        leader_dept: null,
        status: 'active',
      } as WxuserSummaryRow)
      contactsByBatch.set(batchId, contacts)
    }

    return [...latestBatchByDate.entries()]
      .map(([snapshotDate, batchId]) => ({
        snapshotDate,
        contacts: contactsByBatch.get(batchId) || [],
      }))
      .sort((left, right) => left.snapshotDate.localeCompare(right.snapshotDate))
  } catch (error) {
    console.warn(
      '[NitroWxuserEmploymentSummary] employment snapshots unavailable:',
      error instanceof Error ? error.message : String(error),
    )
    return []
  }
}

function getDepartmentStat(stats: Map<string, DepartmentStat>, department: string): DepartmentStat {
  let stat = stats.get(department)
  if (!stat) {
    stat = {
      department,
      hireCount: 0,
      leaveCount: 0,
      activeCount: 0,
      leaveRate: null,
      leader: '',
      activeNames: [],
      hireNames: [],
      leaveNames: [],
    }
    stats.set(department, stat)
  }
  return stat
}

function appendUnique(values: string[], value: string | null): void {
  const text = String(value || '').trim()
  if (text && !values.includes(text)) values.push(text)
}

type DepartmentNode = {
  key: string
  id: number
  parentKey: string | null
  name: string
  order: number
  level: number
  children: string[]
}

function mergeDepartmentStat(target: DepartmentStat, source: DepartmentStat): void {
  target.hireCount += source.hireCount
  target.leaveCount += source.leaveCount
  target.activeCount += source.activeCount
  for (const name of source.activeNames) appendUnique(target.activeNames, name)
  for (const name of source.hireNames) appendUnique(target.hireNames, name)
  for (const name of source.leaveNames) appendUnique(target.leaveNames, name)

  const leaders = target.leader ? target.leader.split('、').filter(Boolean) : []
  for (const name of source.leader.split('、').filter(Boolean)) appendUnique(leaders, name)
  target.leader = leaders.join('、')
}

function finalizeDepartmentStats(stats: DepartmentStat[]): DepartmentStat[] {
  return stats.map((stat) => ({ ...stat, leaveRate: stat.leaveRate ?? null }))
}

export function departmentStatKey(stat: Pick<DepartmentStat, 'department' | 'departmentId'>): string {
  return stat.departmentId == null ? `name:${stat.department}` : `id:${stat.departmentId}`
}

// 汇总表不做层级：只保留末级部门行，同一人不再同时出现在父子行
export function selectLeafDepartmentStats(stats: DepartmentStat[]): DepartmentStat[] {
  return stats.filter((stat) => !stat.hasChildren)
}

function calendarDates(startDate: string, endDate: string): string[] {
  const dates: string[] = []
  const current = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  while (current <= end) {
    const year = current.getFullYear()
    const month = String(current.getMonth() + 1).padStart(2, '0')
    const day = String(current.getDate()).padStart(2, '0')
    dates.push(`${year}-${month}-${day}`)
    current.setDate(current.getDate() + 1)
  }
  return dates
}

function roundedRate(leaveCount: number, averageActiveCount: number): number | null {
  return averageActiveCount > 0
    ? Math.round((leaveCount / averageActiveCount) * 10000) / 100
    : null
}

export function calculateEmploymentRates(
  departmentStats: DepartmentStat[],
  events: EmploymentEventRow[],
  startDate: string,
  endDate: string,
  snapshots: WecomEmploymentSnapshot[],
  departments: WecomDepartmentRow[] = [],
): EmploymentRateResult {
  const ratesByDepartment = new Map<string, number | null>()
  if (!snapshots.length) {
    return unavailableEmploymentRate('统计期间没有企业微信在职快照，暂无法计算离职率')
  }

  const expectedDates = calendarDates(startDate, endDate)
  const snapshotByDate = new Map(snapshots.map((snapshot) => [snapshot.snapshotDate, snapshot]))
  const missingDates = expectedDates.filter((date) => !snapshotByDate.has(date))
  if (missingDates.length) {
    return unavailableEmploymentRate(`统计期间企业微信在职快照不完整，缺少 ${missingDates.length} 天，暂无法计算离职率`)
  }

  const snapshotDays = expectedDates.map((date) => snapshotByDate.get(date) as WecomEmploymentSnapshot)
  const dailyDepartmentCounts = new Map<string, number[]>()
  const dailyActiveCounts: number[] = []

  for (const snapshot of snapshotDays) {
    dailyActiveCounts.push(new Set(snapshot.contacts.map((contact) => contact.userid).filter(Boolean)).size)
    const dailyStats = buildDepartmentStats(snapshot.contacts, [], departments)
    for (const stat of dailyStats) {
      const key = departmentStatKey(stat)
      const values = dailyDepartmentCounts.get(key) || []
      values.push(stat.activeCount)
      dailyDepartmentCounts.set(key, values)
    }
  }

  const uniqueLeaveEvents: EmploymentEventRow[] = []
  const leaveUserIds = new Set<string>()
  for (const event of events) {
    if (event.event_type !== 'leave') continue
    const userid = String(event.userid || '').trim()
    if (!userid || leaveUserIds.has(userid)) continue
    leaveUserIds.add(userid)
    uniqueLeaveEvents.push(event)
  }
  const leaveStats = buildDepartmentStats([], uniqueLeaveEvents, departments)
  const leaveCountsByDepartment = new Map(leaveStats.map((stat) => [departmentStatKey(stat), stat.leaveCount]))

  for (const stat of departmentStats) {
    const dailyCounts = dailyDepartmentCounts.get(departmentStatKey(stat)) || []
    const averageActiveCount = dailyCounts.length === snapshotDays.length
      ? dailyCounts.reduce((sum, count) => sum + count, 0) / snapshotDays.length
      : 0
    ratesByDepartment.set(
      departmentStatKey(stat),
      roundedRate(leaveCountsByDepartment.get(departmentStatKey(stat)) || 0, averageActiveCount),
    )
  }

  const averageActiveCount = dailyActiveCounts.reduce((sum, count) => sum + count, 0) / dailyActiveCounts.length
  return {
    available: true,
    message: null,
    overallRate: roundedRate(leaveUserIds.size, averageActiveCount),
    averageActiveCount,
    ratesByDepartment,
  }
}

function buildHierarchicalStats(
  stats: Map<string, DepartmentStat>,
  departments: WecomDepartmentRow[],
): DepartmentStat[] {
  const rows = departments.filter((row) => row.id > 0 && row.name)
  if (!rows.length) return finalizeDepartmentStats([...stats.values()])

  const rowsById = new Map(rows.map((row) => [row.id, row]))
  const nodeKeyById = new Map<number, string>()
  const nodes = new Map<string, DepartmentNode>()

  function resolveNodeKey(id: number, trail = new Set<number>()): string | null {
    if (nodeKeyById.has(id)) return nodeKeyById.get(id) || null
    const row = rowsById.get(id)
    if (!row || trail.has(id)) return null

    const nextTrail = new Set(trail)
    nextTrail.add(id)
    const parentKey = row.parentId > 0 ? resolveNodeKey(row.parentId, nextTrail) : null
    const key = `${parentKey || 'root'}::${normalizeDepartmentName(row.name)}`
    nodeKeyById.set(id, key)
    return key
  }

  for (const row of rows) {
    const key = resolveNodeKey(row.id)
    if (!key) continue
    const parentKey = row.parentId > 0 ? resolveNodeKey(row.parentId) : null
    const existing = nodes.get(key)
    if (existing) {
      existing.id = Math.min(existing.id, row.id)
      existing.order = Math.min(existing.order, row.order)
      continue
    }
    nodes.set(key, {
      key,
      id: row.id,
      parentKey,
      name: normalizeDepartmentName(row.name),
      order: row.order,
      level: 0,
      children: [],
    })
  }

  for (const node of nodes.values()) node.children = []
  for (const node of nodes.values()) {
    if (node.parentKey && nodes.has(node.parentKey)) {
      nodes.get(node.parentKey)?.children.push(node.key)
    } else {
      node.parentKey = null
    }
  }

  function nodeLevel(key: string, trail = new Set<string>()): number {
    const node = nodes.get(key)
    if (!node || !node.parentKey || trail.has(key)) return 0
    const nextTrail = new Set(trail)
    nextTrail.add(key)
    return nodeLevel(node.parentKey, nextTrail) + 1
  }

  for (const node of nodes.values()) node.level = nodeLevel(node.key)

  const hierarchyStats = new Map<string, DepartmentStat>()
  const assignedNames = new Set<string>()
  for (const node of nodes.values()) {
    const source = !assignedNames.has(node.name) ? stats.get(node.name) : undefined
    if (source) assignedNames.add(node.name)
    const parent = node.parentKey ? nodes.get(node.parentKey) : null
    hierarchyStats.set(node.key, {
      ...(source || getDepartmentStat(new Map(), node.name)),
      department: node.name,
      departmentId: node.id,
      parentDepartment: parent?.name || null,
      level: node.level,
      hasChildren: node.children.length > 0,
      activeNames: [...(source?.activeNames || [])],
      hireNames: [...(source?.hireNames || [])],
      leaveNames: [...(source?.leaveNames || [])],
    })
  }

  const deepestFirst = [...nodes.values()].sort((left, right) => right.level - left.level)
  for (const node of deepestFirst) {
    const target = hierarchyStats.get(node.key)
    if (!target || !node.parentKey) continue
    const parent = hierarchyStats.get(node.parentKey)
    if (parent) mergeDepartmentStat(parent, target)
  }

  const sortChildren = (leftKey: string, rightKey: string) => {
    const left = nodes.get(leftKey)
    const right = nodes.get(rightKey)
    if (!left || !right) return 0
    return left.order - right.order || left.id - right.id
  }
  const result: DepartmentStat[] = []
  const appendTree = (key: string) => {
    const stat = hierarchyStats.get(key)
    const node = nodes.get(key)
    if (!stat || !node) return
    result.push(stat)
    for (const childKey of [...node.children].sort(sortChildren)) appendTree(childKey)
  }

  const roots = [...nodes.values()]
    .filter((node) => !node.parentKey)
    .sort((left, right) => left.order - right.order || left.id - right.id)
  for (const root of roots) appendTree(root.key)

  for (const [name, stat] of stats) {
    if (!assignedNames.has(name)) result.push(stat)
  }

  return finalizeDepartmentStats(result)
}

export function buildDepartmentStats(
  contacts: WxuserSummaryRow[],
  events: EmploymentEventRow[],
  departments: WecomDepartmentRow[] = [],
): DepartmentStat[] {
  const stats = new Map<string, DepartmentStat>()

  for (const contact of contacts) {
    for (const department of departmentNames(contact.dept)) {
      const stat = getDepartmentStat(stats, department)
      if (contact.status == null || contact.status === 'active') {
        stat.activeCount += 1
        appendUnique(stat.activeNames, contact.name)
      }
    }
    for (const department of departmentNames(contact.leader_dept)) {
      const stat = getDepartmentStat(stats, department)
      const leaders = stat.leader ? stat.leader.split('、').filter(Boolean) : []
      appendUnique(leaders, contact.name)
      stat.leader = leaders.join('、')
    }
  }

  for (const row of events) {
    for (const department of departmentNames(row.dept)) {
      const stat = getDepartmentStat(stats, department)
      if (row.event_type === 'hire') {
        stat.hireCount += 1
        appendUnique(stat.hireNames, row.name)
      }
      if (row.event_type === 'leave') {
        stat.leaveCount += 1
        appendUnique(stat.leaveNames, row.name)
      }
    }
  }

  if (departments.length) return buildHierarchicalStats(stats, departments)

  return finalizeDepartmentStats([...stats.values()])
    .sort((left, right) => left.department.localeCompare(right.department, 'zh-CN'))
}
