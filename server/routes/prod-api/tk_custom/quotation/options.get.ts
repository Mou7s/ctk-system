import { getQuery } from 'h3'
import { getAuthSession, hasPermission } from '../../../../utils/auth'
import { listQuotationCustomerOptions, listQuotationPaymentTermOptions } from '../../../../utils/quotation'
import { querySalesPriceTrendOptions, SalesPriceTrendInputError } from '../../../../utils/sales-price-trend'
import { SqlServerError } from '../../../../utils/sqlserver'
import { apiError, apiSuccess, errorMessage } from '../../../../utils/response'

export default defineEventHandler(async (event) => {
  const query = getQuery(event) as Record<string, unknown>

  // 客户下拉只取历史报价单里出现过的客户（本地 MySQL），不再查金蝶客户主档；
  // 报价单不写金蝶，主档里没有的客户直接按文本保存，无需先建档。
  if (String(query.type || '').trim().toLowerCase() === 'customer') {
    return listQuotationCustomerOptions(event)
  }
  if (String(query.type || '').trim().toLowerCase() === 'payment-term') {
    return listQuotationPaymentTermOptions(event)
  }

  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)
  if (!hasPermission(authenticated.session, 'tk_custom:quotation:upload')) return apiError('没有报价单基础资料查询权限', 403)

  try {
    return apiSuccess(await querySalesPriceTrendOptions(query))
  } catch (error) {
    if (error instanceof SalesPriceTrendInputError) return apiError(error.message, 500)
    if (error instanceof SqlServerError) {
      console.error(`[NitroSqlServer:quotation/options:${error.kind}]`, errorMessage(error, 'unknown error'))
      return apiError(error.message, error.statusCode)
    }
    console.error('[NitroSqlServer:quotation/options]', errorMessage(error, 'unknown error'))
    return apiError('查询金蝶基础资料失败，请检查 SQL Server 连接或稍后重试', 502)
  }
})
