import { getQuery } from 'h3'
import { getAuthSession } from '../../../../utils/auth'
import { K3CloudError } from '../../../../utils/k3'
import { queryK3Locations } from '../../../../utils/stock-document'
import { apiError, apiSuccess, errorMessage } from '../../../../utils/response'

export default defineEventHandler(async (event) => {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)
  try {
    const query = getQuery(event) as Record<string, unknown>
    return apiSuccess(await queryK3Locations({ stock: query.stock }))
  } catch (error) {
    if (error instanceof K3CloudError) {
      console.error(`[NitroK3:stockDocument/locations:${error.kind}]`, errorMessage(error, 'unknown error'))
      return apiError(error.message, error.statusCode)
    }
    console.error('[NitroK3:stockDocument/locations]', errorMessage(error, 'unknown error'))
    return apiError('金蝶库位列表加载失败，请检查金蝶连接或稍后重试', 502)
  }
})
