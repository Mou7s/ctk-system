import { readBody } from 'h3'
import { getAuthSession, hasPermission } from '../../../../utils/auth'
import { getMysqlPool } from '../../../../utils/mysql'
import { apiError, errorMessage } from '../../../../utils/response'
import {
  calculateWecomAttendanceReport,
  type AttendanceScope,
} from '../../../../utils/wecom-attendance-calc'
import { sendWecomAttendanceExcel } from '../../../../utils/wecom-attendance-export'

const PERMISSION = 'tk_custom:wecomAttendance:list'

function bodyText(value: unknown): string {
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
    const body = (await readBody<Record<string, unknown>>(event).catch(() => ({}))) || {}
    const def = defaultRange()
    const startDate = bodyText(body.startDate) || def.startDate
    const endDate = bodyText(body.endDate) || def.endDate
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return apiError('日期格式应为 YYYY-MM-DD', 400)
    }
    if (startDate > endDate) {
      return apiError('开始日期不能晚于结束日期', 400)
    }
    const rawScope = bodyText(body.scope) || 'all'
    const scope: AttendanceScope = ['all', 'workshop', 'office', 'guard'].includes(rawScope)
      ? (rawScope as AttendanceScope)
      : 'all'
    const financeGroup = bodyText(body.financeGroup)
    const keyword = bodyText(body.keyword)

    const report = await calculateWecomAttendanceReport(getMysqlPool(), {
      startDate,
      endDate,
      scope,
      financeGroup,
      keyword,
    })
    const scopeName = scope === 'workshop' ? '车间' : scope === 'office' ? '办公室' : scope === 'guard' ? '保安' : '全厂'
    const fileName = `财务考勤核算_${scopeName}_${startDate}_${endDate}.xlsx`
    return sendWecomAttendanceExcel(event, report, fileName)
  } catch (error) {
    console.error('[WecomAttendanceExport] failed:', errorMessage(error, 'unknown error'))
    return apiError(errorMessage(error, '导出考勤表失败'), 500)
  }
})
