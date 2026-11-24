import { getQuery } from 'h3'
import { getAuthSession, hasPermission } from '../../../../utils/auth'
import {
  queryCustomerOverdueAr,
  CustomerOverdueArInputError,
} from '../../../../utils/customer-overdue-ar'
import { SqlServerError } from '../../../../utils/sqlserver'
import { apiError, apiSuccess, errorMessage } from '../../../../utils/response'

const PERMISSION = 'tk_custom:customerOverdueAr:list'

export default defineEventHandler(async (event) => {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)
  if (!hasPermission(authenticated.session, PERMISSION)) return apiError('没有权限访问该接口', 403)

  try {
    return apiSuccess({
      ...await queryCustomerOverdueAr(getQuery(event) as Record<string, unknown>),
      canConfigureAlert: authenticated.session.userId === 1,
      canEditRemark: authenticated.session.userId === 1,
    })
  } catch (error) {
    if (error instanceof CustomerOverdueArInputError) return apiError(error.message, error.statusCode)
    if (error instanceof SqlServerError) {
      console.error(`[NitroSqlServer:customerOverdueAr/list:${error.kind}]`, errorMessage(error, 'unknown error'))
      return apiError(error.message, error.statusCode)
    }
    console.error('[NitroSqlServer:customerOverdueAr/list]', errorMessage(error, 'unknown error'))
    return apiError('查询客户逾期应收失败，请检查 SQL Server 连接或稍后重试', 502)
  }
})
