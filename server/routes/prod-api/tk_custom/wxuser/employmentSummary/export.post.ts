import { readBody } from 'h3'
import { getAuthSession, hasPermission } from '../../../../../utils/auth'
import { getMysqlPool, mysqlQueryOptions } from '../../../../../utils/mysql'
import { errorMessage, apiError } from '../../../../../utils/response'
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
} from '../../../../../utils/wecom-employment-summary'
import { sendWecomEmploymentExcel } from '../../../../../utils/wecom-employment-export'

function bodyText(value: unknown): string {
  return String(Array.isArray(value) ? value[0] ?? '' : value ?? '').trim()
}

function validDate(value: unknown, label: string): string | null {
  const text = bodyText(value)
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
    const body = await readBody<Record<string, unknown>>(event)
    const startDate = validDate(body?.startDate, '开始日期')
    const endDate = validDate(body?.endDate, '结束日期')
    const eventType = bodyText(body?.eventType)
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
    const pool = getMysqlPool()
    const [events] = await pool.query<EmploymentEventRow[]>(mysqlQueryOptions(`
      SELECT event_id, userid, event_type, event_at, name, dept, position, sync_batch_id,
        leave_reason_code, leave_reason_remark
      FROM wxuser_employment_event
      WHERE ${conditions.join(' AND ')}
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
    const ratedDepartmentRows = departmentRows.map((row) => ({
      ...row,
      leaveRate: rateResult.ratesByDepartment.get(departmentStatKey(row)) ?? null,
    }))
    const range = `${startDate || '全部'}-${endDate || '全部'}`
    const reasonResult = buildLeaveReasonStats(events)
    return sendWecomEmploymentExcel(
      event,
      ratedDepartmentRows,
      `（${range}）入离职汇总`,
      `入离职汇总_${range}.xlsx`,
      {
        leaveRate: rateResult.overallRate,
        reasonStats: reasonResult.stats,
        reasonLeaveTotal: reasonResult.leaveTotal,
      },
    )
  } catch (error) {
    console.error('[NitroWxuserEmploymentSummaryExport] failed:', errorMessage(error, 'unknown error'))
    return apiError(errorMessage(error, '导出入离职汇总失败'), 500)
  }
})
