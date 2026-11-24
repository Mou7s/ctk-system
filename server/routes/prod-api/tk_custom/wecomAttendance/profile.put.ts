import { readBody } from 'h3'
import { getAuthSession, hasPermission } from '../../../../utils/auth'
import { getMysqlPool } from '../../../../utils/mysql'
import { apiError, apiSuccessFields, errorMessage } from '../../../../utils/response'
import {
  FINANCE_GROUP_OPTIONS,
  upsertWecomAttendanceProfile,
} from '../../../../utils/wecom-attendance-calc'

const PERMISSION = 'tk_custom:wecomAttendance:list'

function bodyText(value: unknown): string {
  return String(Array.isArray(value) ? value[0] ?? '' : value ?? '').trim()
}

export default defineEventHandler(async (event) => {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)
  if (!hasPermission(authenticated.session, PERMISSION)) {
    return apiError('没有权限访问该接口', 403)
  }

  try {
    const body = (await readBody<Record<string, unknown>>(event).catch(() => ({}))) || {}
    const userid = bodyText(body.userid)
    if (!userid || userid.length > 64) {
      return apiError('userid 不符合规范', 400)
    }

    const employeeCode = bodyText(body.employeeCode)
    if (employeeCode.length > 32) {
      return apiError('工号长度不能超过 32 个字符', 400)
    }

    const employeeName = bodyText(body.employeeName)
    const financeGroup = bodyText(body.financeGroup)
    if (financeGroup && !(FINANCE_GROUP_OPTIONS as readonly string[]).includes(financeGroup)) {
      return apiError(`财务分组只能是：${FINANCE_GROUP_OPTIONS.join('、')}`, 400)
    }

    const remark = bodyText(body.remark)
    if (remark.length > 255) {
      return apiError('备注最多 255 字', 400)
    }

    const updatedBy = String(authenticated.session.userName || '').slice(0, 64) || null
    await upsertWecomAttendanceProfile(getMysqlPool(), {
      userid,
      employeeCode,
      employeeName,
      financeGroup,
      remark: remark || null,
      updatedBy,
    })

    return apiSuccessFields({
      userid,
      employeeCode,
      financeGroup,
      remark: remark || '',
    }, '保存员工财务档案成功')
  } catch (error) {
    console.error('[WecomAttendanceProfile] save failed:', errorMessage(error, 'unknown error'))
    return apiError(errorMessage(error, '保存员工财务档案失败'), 500)
  }
})
