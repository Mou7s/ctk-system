import { runMoCloseOnce } from '../../../utils/production-order-close'
import { getAuthSession } from '../../../utils/auth'
import { apiError } from '../../../utils/response'

export default defineEventHandler(async (event) => {
  if (!await getAuthSession(event)) return apiError('登录状态已过期', 401)
  // 102手动预览：只返回候选，不真写
  const r = await runMoCloseOnce({ dryRun: true })
  return { dryRun: true, ...r }
})
