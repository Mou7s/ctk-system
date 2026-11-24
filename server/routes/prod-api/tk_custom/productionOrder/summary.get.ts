import { getQuery } from 'h3'
import { getAuthSession } from '../../../../utils/auth'
import { K3CloudError } from '../../../../utils/k3'
import { ProductionOrderInputError, queryProductionOrderSummary } from '../../../../utils/production-order'
import { apiError, apiSuccess, errorMessage } from '../../../../utils/response'

export default defineEventHandler(async (event) => {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)

  try {
    return apiSuccess(await queryProductionOrderSummary(getQuery(event) as Record<string, unknown>))
  } catch (error) {
    if (error instanceof ProductionOrderInputError) return apiError(error.message, error.statusCode)
    if (error instanceof K3CloudError) {
      console.error(`[NitroK3:productionOrder/summary:${error.kind}]`, errorMessage(error, 'unknown error'))
      return apiError(error.message, error.statusCode)
    }
    console.error('[NitroK3:productionOrder/summary]', errorMessage(error, 'unknown error'))
    return apiError('汇总金蝶生产订单失败，请检查金蝶连接或稍后重试', 502)
  }
})
