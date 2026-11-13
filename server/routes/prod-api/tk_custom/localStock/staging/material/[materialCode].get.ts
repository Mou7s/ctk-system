import { finishedInventoryOnly, finishedInventoryMaterials } from '../../../../../../utils/inventory-visibility'
import { getRouterParam } from 'h3'
import { getAuthSession } from '../../../../../../utils/auth'
import { K3CloudError } from '../../../../../../utils/k3'
import { SqlServerError } from '../../../../../../utils/sqlserver'
import { queryLocalStockLegacyStaging } from '../../../../../../utils/local-stock-staging-read'
import { apiError, apiSuccess, errorMessage } from '../../../../../../utils/response'

export default defineEventHandler(async (event) => {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)
  try {
    const code = String(getRouterParam(event, 'materialCode') || '').trim().toUpperCase()
    if (finishedInventoryOnly(authenticated.session) && !(await finishedInventoryMaterials()).includes(code)) return apiError('无权查看非成品库存', 403)
    return apiSuccess(await queryLocalStockLegacyStaging(getRouterParam(event, 'materialCode')))
  } catch (error) {
    if (error instanceof K3CloudError || error instanceof SqlServerError) {
      console.error(`[NitroLocalStockStaging:${error.kind}]`, errorMessage(error, 'unknown error'))
      return apiError(error.message, error.statusCode)
    }
    console.error('[NitroLocalStockStaging]', errorMessage(error, 'unknown error'))
    return apiError(error instanceof Error ? error.message : '旧标签库存查询失败', 500)
  }
})
