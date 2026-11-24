import { getRouterParam } from 'h3'
import { getAuthSession } from '../../../../../utils/auth'
import { getMysqlPool } from '../../../../../utils/mysql'
import { queryWmsLocation } from '../../../../../utils/wms-structure'
import { apiError, apiSuccess, errorMessage } from '../../../../../utils/response'

export default defineEventHandler(async (event) => {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)

  try {
    const location = await queryWmsLocation(getMysqlPool(), getRouterParam(event, 'locationCode'))
    if (!location) return apiError('库位不存在')
    return apiSuccess(location)
  } catch (error) {
    console.error('[NitroWmsStructure] location lookup failed:', errorMessage(error, 'unknown error'))
    return apiError('获取库位信息失败', 500)
  }
})
