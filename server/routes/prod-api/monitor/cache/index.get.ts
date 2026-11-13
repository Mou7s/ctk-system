import { getAuthSession } from '../../../../utils/auth'
import { apiError, apiSuccess, errorMessage } from '../../../../utils/response'
import { queryMonitorCacheInfo } from '../../../../utils/monitor-cache-read'

export default defineEventHandler(async (event) => {
  if (!await getAuthSession(event)) return apiError('登录状态已过期', 401)

  try {
    return apiSuccess(await queryMonitorCacheInfo())
  } catch (error) {
    console.error('[NitroMonitor] cache info failed:', errorMessage(error, 'unknown error'))
    return apiError('获取缓存信息失败', 500)
  }
})
