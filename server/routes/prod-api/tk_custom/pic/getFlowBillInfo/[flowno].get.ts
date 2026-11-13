import { getAuthSession } from '../../../../../utils/auth'
import { K3CloudError } from '../../../../../utils/k3'
import { queryFlowBillInfo } from '../../../../../utils/operation-planning-read'
import { apiError, errorMessage } from '../../../../../utils/response'

export default defineEventHandler(async (event) => {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)
  try {
    return await queryFlowBillInfo(event)
  } catch (error) {
    if (error instanceof K3CloudError) {
      console.error(`[NitroK3:pic/getFlowBillInfo:${error.kind}]`, errorMessage(error, 'unknown error'))
      return apiError(error.message, error.statusCode)
    }
    console.error('[NitroK3:pic/getFlowBillInfo]', errorMessage(error, 'unknown error'))
    return apiError('查询金蝶流程单失败', 502)
  }
})
