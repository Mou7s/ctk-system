import { getQuery } from 'h3'
import { getAuthSession } from '../../../../utils/auth'
import { K3CloudError } from '../../../../utils/k3'
import { queryK3DocumentList, StockDocumentInputError } from '../../../../utils/stock-document'
import { apiError, apiSuccess, errorMessage } from '../../../../utils/response'

export default defineEventHandler(async (event) => {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)
  try {
    return apiSuccess(await queryK3DocumentList('salesOutbound', getQuery(event) as Record<string, unknown>))
  } catch (error) {
    if (error instanceof StockDocumentInputError) {
      return apiError(error.message, error.statusCode)
    }
    if (error instanceof K3CloudError) {
      console.error(`[NitroK3:stockDocument/salesOutbound:${error.kind}]`, errorMessage(error, 'unknown error'))
      return apiError(error.message, error.statusCode)
    }
    console.error('[NitroK3:stockDocument/salesOutbound]', errorMessage(error, 'unknown error'))
    return apiError('金蝶单据查询失败，请检查金蝶连接或稍后重试', 502)
  }
})
