import { getAuthSession } from '../../../utils/auth'
import { collectMonitorServerInfo } from '../../../utils/monitor-server-read'
import { apiError, apiSuccess, errorMessage } from '../../../utils/response'

export default defineEventHandler(async (event) => {
  if (!await getAuthSession(event)) return apiError('登录状态已过期', 401)

  try {
    const data = await collectMonitorServerInfo()
    return apiSuccess(data)
  } catch (error) {
    console.error('[NitroMonitor] server info failed:', errorMessage(error, 'unknown error'))
    return apiError('获取服务信息失败', 500)
  }
})
