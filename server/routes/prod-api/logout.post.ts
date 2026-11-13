import { apiError, apiSuccess, errorMessage } from '../../utils/response'
import { clearAuthCookie, deleteAuthSession, getAuthSession } from '../../utils/auth'
import { recordLoginInfo } from '../../utils/user-repository'
import { getRequestIP } from 'h3'

export default defineEventHandler(async (event) => {
  let failed = false
  try {
    const authenticated = await getAuthSession(event)
    if (authenticated) {
      await deleteAuthSession(authenticated.session.tokenId)
      await recordLoginInfo(authenticated.session.userName, '0', '退出成功', getRequestIP(event, { xForwardedFor: true }) || '0.0.0.0', '')
    }
  } catch (error) {
    failed = true
    console.error('[NitroAuth] logout failed:', errorMessage(error, 'unknown error'))
  } finally {
    clearAuthCookie(event)
  }
  if (failed) return apiError('退出服务暂不可用', 503)
  return apiSuccess(undefined, '退出成功')
})
