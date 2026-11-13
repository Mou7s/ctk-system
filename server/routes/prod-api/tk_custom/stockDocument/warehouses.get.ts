import { getAuthSession } from '../../../../utils/auth'
import { K3CloudError } from '../../../../utils/k3'
import { queryK3Warehouses } from '../../../../utils/stock-document'
import { apiError, apiSuccess, errorMessage } from '../../../../utils/response'

export default defineEventHandler(async (event) => {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)
  try {
    return apiSuccess(await queryK3Warehouses())
  } catch (error) {
    if (error instanceof K3CloudError) {
      console.error(`[NitroK3:stockDocument/warehouses:${error.kind}]`, errorMessage(error, 'unknown error'))
      return apiError(error.message, error.statusCode)
    }
    console.error('[NitroK3:stockDocument/warehouses]', errorMessage(error, 'unknown error'))
    return apiError('金蝶仓库列表加载失败，请检查金蝶连接或稍后重试', 502)
  }
})
