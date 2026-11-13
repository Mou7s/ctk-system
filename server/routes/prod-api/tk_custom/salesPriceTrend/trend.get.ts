import { getQuery } from 'h3'
import { getAuthSession, hasPermission } from '../../../../utils/auth'
import { querySalesPriceTrend, SalesPriceTrendInputError } from '../../../../utils/sales-price-trend'
import { SqlServerError } from '../../../../utils/sqlserver'
import { apiError, apiSuccess, errorMessage } from '../../../../utils/response'

export default defineEventHandler(async (event) => {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)
  if (!hasPermission(authenticated.session, 'tk_custom:salesPriceTrend:list')) return apiError('没有权限访问该接口', 403)

  try {
    return apiSuccess(await querySalesPriceTrend(getQuery(event) as Record<string, unknown>))
  } catch (error) {
    if (error instanceof SalesPriceTrendInputError) return apiError(error.message, 400)
    if (error instanceof SqlServerError) {
      console.error(`[NitroSqlServer:salesPriceTrend/trend:${error.kind}]`, errorMessage(error, 'unknown error'))
      return apiError(error.message, error.statusCode)
    }
    console.error('[NitroSqlServer:salesPriceTrend/trend]', errorMessage(error, 'unknown error'))
    return apiError('查询金蝶销售价格走势失败，请检查 SQL Server 连接或稍后重试', 502)
  }
})
