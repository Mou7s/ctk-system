import { getAuthSession, hasRole } from '../../../utils/auth'
import { apiError, apiSuccess, errorMessage } from '../../../utils/response'
import { checkK3Connection, K3CloudError } from '../../../utils/k3'

export default defineEventHandler(async (event) => {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)
  if (!hasRole(authenticated.session, 'admin')) return apiError('无权执行金蝶连通性检查', 403)
  try {
    return apiSuccess(await checkK3Connection())
  } catch (error) {
    if (error instanceof K3CloudError) {
      console.error(`[NitroK3:health:${error.kind}]`, errorMessage(error, 'unknown error'))
      return apiError(error.message, error.statusCode)
    }
    console.error('[NitroK3] health check failed:', errorMessage(error, 'unknown error'))
    return apiError('金蝶服务暂不可用', 502)
  }
})
