import { getAuthSession } from '../../../../utils/auth'
import { K3CloudError } from '../../../../utils/k3'
import { queryGxjh } from '../../../../utils/operation-planning-read'
import { apiError, errorMessage } from '../../../../utils/response'

export default defineEventHandler(async (event) => {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)
  try {
    return await queryGxjh(event)
  } catch (error) {
    if (error instanceof K3CloudError) {
      console.error(`[NitroK3:gxjh:${error.kind}]`, errorMessage(error, 'unknown error'))
      return apiError(error.message, error.statusCode)
    }
    console.error('[NitroK3:gxjh]', errorMessage(error, 'unknown error'))
    return apiError('查询金蝶工序计划失败', 502)
  }
})
