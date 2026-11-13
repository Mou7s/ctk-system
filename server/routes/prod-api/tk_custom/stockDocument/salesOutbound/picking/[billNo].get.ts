import { getRouterParam } from 'h3'
import { getAuthSession } from '../../../../../../utils/auth'
import { K3CloudError } from '../../../../../../utils/k3'
import { queryK3SalesOutboundPicking } from '../../../../../../utils/stock-document'
import { apiError, apiSuccess, errorMessage } from '../../../../../../utils/response'

export default defineEventHandler(async (event) => {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)
  try {
    return apiSuccess(await queryK3SalesOutboundPicking(getRouterParam(event, 'billNo')))
  } catch (error) {
    if (error instanceof K3CloudError) {
      console.error(`[NitroK3:stockDocument/salesOutbound/picking:${error.kind}]`, errorMessage(error, 'unknown error'))
      return apiError(error.message, error.statusCode)
    }
    console.error('[NitroK3:stockDocument/salesOutbound/picking]', errorMessage(error, 'unknown error'))
    return apiError(error instanceof Error ? error.message : '读取出库拣货库存失败，请检查金蝶连接或稍后重试', 500)
  }
})
