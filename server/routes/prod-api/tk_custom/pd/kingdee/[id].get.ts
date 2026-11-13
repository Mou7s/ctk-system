import { getAuthSession } from '../../../../../utils/auth'
import { K3CloudError } from '../../../../../utils/k3'
import { queryPdFromKingdee } from '../../../../../utils/pd-kingdee-read'
import { apiError, apiSuccess, errorMessage } from '../../../../../utils/response'

export default defineEventHandler(async (event) => {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)
  try {
    return apiSuccess(await queryPdFromKingdee(event))
  } catch (error) {
    if (error instanceof K3CloudError) {
      console.error(`[NitroK3:pd/kingdee:${error.kind}]`, errorMessage(error, 'unknown error'))
      return apiError(error.message, error.statusCode)
    }
    console.error('[NitroK3:pd/kingdee]', errorMessage(error, 'unknown error'))
    return apiError('获取金蝶盘点详情失败', 500)
  }
})
