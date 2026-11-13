import { finishedInventoryOnly, finishedInventoryMaterials } from '../../../../../../utils/inventory-visibility'
import { getRouterParam } from 'h3'
import { getAuthSession } from '../../../../../../utils/auth'
import { K3CloudError } from '../../../../../../utils/k3'
import { queryLocalStockMaterialInventory } from '../../../../../../utils/local-stock-inventory-read'
import { apiError, apiSuccess, errorMessage } from '../../../../../../utils/response'

export default defineEventHandler(async (event) => {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)
  try {
    const code = String(getRouterParam(event, 'materialCode') || '').trim().toUpperCase()
    if (finishedInventoryOnly(authenticated.session) && !(await finishedInventoryMaterials()).includes(code)) return apiError('无权查看非成品库存', 403)
    return apiSuccess(await queryLocalStockMaterialInventory(getRouterParam(event, 'materialCode')))
  } catch (error) {
    if (error instanceof K3CloudError) {
      console.error(`[NitroK3:localStock/staging/inventory:${error.kind}]`, errorMessage(error, 'unknown error'))
      return apiError(error.message, error.statusCode)
    }
    console.error('[NitroK3:localStock/staging/inventory]', errorMessage(error, 'unknown error'))
    return apiError(error instanceof Error ? error.message : '金蝶完整库存查询失败', 502)
  }
})
