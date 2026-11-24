import { getAuthSession } from '../../../../utils/auth'
import { getMysqlPool } from '../../../../utils/mysql'
import { queryWmsOverview } from '../../../../utils/wms-structure'
import { apiError, apiSuccess, errorMessage } from '../../../../utils/response'

export default defineEventHandler(async (event) => {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)

  try {
    return apiSuccess(await queryWmsOverview(getMysqlPool()))
  } catch (error) {
    console.error('[NitroWmsStructure] overview failed:', errorMessage(error, 'unknown error'))
    return apiError('获取仓库结构失败', 500)
  }
})
