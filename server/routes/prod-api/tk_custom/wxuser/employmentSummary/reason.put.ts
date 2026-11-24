import { readBody } from 'h3'
import { getAuthSession, hasPermission } from '../../../../../utils/auth'
import { getMysqlPool, mysqlQueryOptions } from '../../../../../utils/mysql'
import { apiError, apiSuccessFields, errorMessage } from '../../../../../utils/response'
import { normalizeLeaveReasonCode } from '../../../../../utils/wecom-employment-summary'

const PERMISSION = 'tk_custom:employmentSummary:list'

function bodyText(value: unknown): string {
  return String(Array.isArray(value) ? value[0] ?? '' : value ?? '').trim()
}

export default defineEventHandler(async (event) => {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)
  if (!hasPermission(authenticated.session, PERMISSION)) return apiError('没有权限访问该接口', 403)

  try {
    const body = await readBody<Record<string, unknown>>(event)
    const eventId = Number(body?.eventId)
    if (!Number.isInteger(eventId) || eventId <= 0) return apiError('离职事件 ID 不符合规范', 400)

    const rawCode = bodyText(body?.reasonCode)
    const reasonCode = rawCode ? normalizeLeaveReasonCode(rawCode) : null
    if (rawCode && !reasonCode) return apiError('离职原因编码不符合规范', 400)

    const remark = bodyText(body?.reasonRemark)
    if (remark.length > 500) return apiError('备注最多 500 字', 400)

    const pool = getMysqlPool()
    const [existing] = await pool.query(mysqlQueryOptions(`
      SELECT event_id, event_type
      FROM wxuser_employment_event
      WHERE event_id = ?
      LIMIT 1
    `), [eventId]) as unknown as Array<{ event_id: number; event_type: string }[]>
    const target = (existing || [])[0]
    if (!target) return apiError('离职事件不存在', 404)
    if (target.event_type !== 'leave') return apiError('只有离职事件可以填写离职原因', 400)

    await pool.query(mysqlQueryOptions(`
      UPDATE wxuser_employment_event
      SET leave_reason_code = ?,
        leave_reason_remark = ?,
        reason_updated_by = ?,
        reason_updated_at = NOW()
      WHERE event_id = ?
    `), [
      reasonCode,
      remark || null,
      String(authenticated.session.userName || '').slice(0, 64) || null,
      eventId,
    ])

    return apiSuccessFields({
      eventId,
      reasonCode,
      reasonRemark: remark || null,
    }, '保存离职原因成功')
  } catch (error) {
    console.error('[NitroWxuserEmploymentLeaveReason] save failed:', errorMessage(error, 'unknown error'))
    return apiError(errorMessage(error, '保存离职原因失败'), 500)
  }
})
