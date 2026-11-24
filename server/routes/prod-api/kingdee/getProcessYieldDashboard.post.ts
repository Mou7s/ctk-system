import { readBody } from 'h3'
import { getAuthSession } from '../../../utils/auth'
import { ProcessYieldInputError, queryProcessYieldDashboard } from '../../../utils/process-yield'
import { apiError, apiSuccess, errorMessage } from '../../../utils/response'
import { SqlServerError } from '../../../utils/sqlserver'

export default defineEventHandler(async (event) => {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)
  try {
    return apiSuccess(await queryProcessYieldDashboard(await readBody<Record<string, unknown>>(event)))
  } catch (error) {
    if (error instanceof ProcessYieldInputError) return apiError(error.message, error.statusCode)
    if (error instanceof SqlServerError) {
      console.error(`[NitroSqlServer:processYield/dashboard:${error.kind}]`, errorMessage(error, 'unknown error'))
      return apiError(error.message, error.statusCode)
    }
    console.error('[NitroSqlServer:processYield/dashboard]', errorMessage(error, 'unknown error'))
    return apiError('查询生产质量看板失败，请检查 SQL Server 连接或稍后重试', 502)
  }
})
