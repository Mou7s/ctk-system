import { getQuery } from 'h3'
import { getAuthSession, hasPermission } from '../../../../utils/auth'
import { getMysqlPool } from '../../../../utils/mysql'
import { apiError, errorMessage } from '../../../../utils/response'
import {
  calculateWecomAttendanceReport,
  type AttendanceScope,
} from '../../../../utils/wecom-attendance-calc'

const PERMISSION = 'tk_custom:wecomAttendance:list'

function textParam(value: unknown): string {
  return String(Array.isArray(value) ? value[0] ?? '' : value ?? '').trim()
}

function defaultRange(): { startDate: string; endDate: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return { startDate: `${y}-${m}-01`, endDate: `${y}-${m}-${d}` }
}

export default defineEventHandler(async (event) => {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)
  if (!hasPermission(authenticated.session, PERMISSION)) {
    return apiError('没有权限访问该接口', 403)
  }

  try {
    const q = getQuery(event) as Record<string, unknown>
    const def = defaultRange()
    const startDate = textParam(q.startDate) || def.startDate
    const endDate = textParam(q.endDate) || def.endDate
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return apiError('日期格式应为 YYYY-MM-DD', 400)
    }
    if (startDate > endDate) {
      return apiError('开始日期不能晚于结束日期', 400)
    }
    const rawScope = textParam(q.scope) || 'all'
    const scope: AttendanceScope = ['all', 'workshop', 'office', 'guard'].includes(rawScope)
      ? (rawScope as AttendanceScope)
      : 'all'
    const financeGroup = textParam(q.financeGroup)
    const keyword = textParam(q.keyword)

    const report = await calculateWecomAttendanceReport(getMysqlPool(), {
      startDate,
      endDate,
      scope,
      financeGroup,
      keyword,
    })
    return { code: 200, msg: '操作成功', data: report }
  } catch (error) {
    console.error('[WecomAttendanceReport] failed:', errorMessage(error, 'unknown error'))
    return apiError(errorMessage(error, '查询考勤核算失败'), 500)
  }
})
