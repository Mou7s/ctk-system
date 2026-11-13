import { getAuthSession } from '../../../../../utils/auth'
import { K3CloudError } from '../../../../../utils/k3'
import { queryGxjhPreview } from '../../../../../utils/operation-planning-read'
import { apiError, apiSuccess, errorMessage } from '../../../../../utils/response'

export default defineEventHandler(async (event) => {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)

  try {
    const preview = await queryGxjhPreview(event)
    if (!preview) return apiError('未找到对应流程单', 404)
    return apiSuccess(preview)
  } catch (error) {
    if (error instanceof Error && error.message === '流程单号不能为空') {
      return apiError(error.message, 400)
    }
    if (error instanceof K3CloudError) {
      console.error(`[NitroK3:gxjh-preview:${error.kind}]`, errorMessage(error, 'unknown error'))
      return apiError(error.message, error.statusCode)
    }
    console.error('[NitroK3:gxjh-preview]', errorMessage(error, 'unknown error'))
    return apiError('查询金蝶工序汇报预览失败', 502)
  }
})
