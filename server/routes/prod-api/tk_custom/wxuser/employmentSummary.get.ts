import { getQuery } from 'h3'
import { getAuthSession, hasPermission } from '../../../../utils/auth'
import { getMysqlPool, mysqlQueryOptions } from '../../../../utils/mysql'
import { apiError, apiSuccessFields, errorMessage } from '../../../../utils/response'
import {
  buildDepartmentStats,
  buildLeaveReasonStats,
  calculateEmploymentRates,
  departmentStatKey,
  loadWecomDepartmentHierarchy,
  loadWecomEmploymentSnapshots,
  selectLeafDepartmentStats,
  unavailableEmploymentRate,
  type EmploymentEventRow,
  type WxuserSummaryRow,
} from '../../../../utils/wecom-employment-summary'

function queryText(value: unknown): string {
  return String(Array.isArray(value) ? value[0] ?? '' : value ?? '').trim()
}

function validDate(value: unknown, label: string): string | null {
  const text = queryText(value)
  if (!text) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`${label}格式应为 YYYY-MM-DD`)
  return text
}

const PERMISSION = 'tk_custom:employmentSummary:list'

export default defineEventHandler(async (event) => {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)
  if (!hasPermission(authenticated.session, PERMISSION)) return apiError('没有权限访问该接口', 403)

  try {
    const query = getQuery(event)
    const startDate = validDate(query.startDate, '开始日期')
    const endDate = validDate(query.endDate, '结束日期')
    const eventType = queryText(query.eventType)
    if (eventType && !['hire', 'leave'].includes(eventType)) return apiError('事件类型不符合规范', 400)
    if (startDate && endDate && startDate > endDate) return apiError('开始日期不能晚于结束日期', 400)

    const conditions: string[] = ["source <> 'wecom_sync_backfill'"]
    const params: string[] = []
    if (startDate) {
      conditions.push('event_at >= ?')
      params.push(startDate)
    }
    if (endDate) {
      conditions.push('event_at < DATE_ADD(?, INTERVAL 1 DAY)')
      params.push(endDate)
    }
    if (eventType) {
      conditions.push('event_type = ?')
      params.push(eventType)
    }
    const whereSql = conditions.join(' AND ')
    const pool = getMysqlPool()
    const [events] = await pool.query<EmploymentEventRow[]>(mysqlQueryOptions(`
      SELECT event_id, userid, event_type, event_at, name, dept, position, sync_batch_id,
        leave_reason_code, leave_reason_remark
      FROM wxuser_employment_event
      WHERE ${whereSql}
      ORDER BY event_at DESC, event_id DESC
    `), params)
    const [contacts] = await pool.query<WxuserSummaryRow[]>(mysqlQueryOptions(`
      SELECT userid, name, dept, leader_dept, status
      FROM wxuser
    `))

    const departments = await loadWecomDepartmentHierarchy(pool)
    const departmentRows = selectLeafDepartmentStats(buildDepartmentStats(contacts, events, departments))
    const rateResult = !eventType && startDate && endDate
      ? calculateEmploymentRates(
        departmentRows,
        events,
        startDate,
        endDate,
        await loadWecomEmploymentSnapshots(pool, startDate, endDate),
        departments,
      )
      : unavailableEmploymentRate(
        eventType
          ? '选择事件类型后无法计算完整离职率，请将事件类型切换为全部'
          : '需要指定开始日期和结束日期才能计算离职率',
      )
    const hireCount = events.filter((row) => row.event_type === 'hire').length
    const leaveCount = events.filter((row) => row.event_type === 'leave').length
    const reasonResult = buildLeaveReasonStats(events)
    const reportRows = departmentRows.map((row) => ({
      department: row.department,
      hireCount: row.hireCount,
      hireNames: row.hireNames,
      leaveCount: row.leaveCount,
      leaveNames: row.leaveNames,
      leaveRate: rateResult.ratesByDepartment.get(departmentStatKey(row)) ?? null,
      ...(row.level == null ? {} : {
        departmentId: row.departmentId,
        parentDepartment: row.parentDepartment,
        level: row.level,
        hasChildren: row.hasChildren,
      }),
    }))

    return apiSuccessFields({
      summary: {
        hireCount,
        leaveCount,
        leaveRate: rateResult.overallRate,
        leaveRateAvailable: rateResult.available,
        leaveRateMessage: rateResult.message,
        departmentRows: reportRows,
        reasonStats: reasonResult.stats,
        reasonLeaveTotal: reasonResult.leaveTotal,
      },
      rows: events.slice(0, 500).map((row) => ({
        eventId: Number(row.event_id),
        userid: row.userid,
        eventType: row.event_type,
        eventAt: row.event_at,
        name: row.name,
        dept: row.dept,
        position: row.position,
        batchId: row.sync_batch_id == null ? null : Number(row.sync_batch_id),
        reasonCode: row.leave_reason_code || null,
        reasonRemark: row.leave_reason_remark || null,
      })),
    }, '查询入离职汇总成功')
  } catch (error) {
    console.error('[NitroWxuserEmploymentSummary] read failed:', errorMessage(error, 'unknown error'))
    return apiError(errorMessage(error, '获取入离职汇总失败'), 500)
  }
})
