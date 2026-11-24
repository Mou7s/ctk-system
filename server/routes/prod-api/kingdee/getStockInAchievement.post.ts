import { readBody } from 'h3'
import { getAuthSession } from '../../../utils/auth'
import { ProcessYieldInputError, queryStockInAchievementData } from '../../../utils/process-yield'
import { SqlServerError } from '../../../utils/sqlserver'
import { apiError, errorMessage } from '../../../utils/response'

export default defineEventHandler(async (event) => {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)
  try {
    return await queryStockInAchievementData(await readBody<Record<string, unknown>>(event))
  } catch (error) {
    if (error instanceof ProcessYieldInputError) return apiError(error.message, error.statusCode)
    if (error instanceof SqlServerError) {
      console.error(`[NitroSqlServer:stockInAchievement:${error.kind}]`, errorMessage(error, 'unknown error'))
      return apiError(error.message, error.statusCode)
    }
    console.error('[NitroSqlServer:stockInAchievement]', errorMessage(error, 'unknown error'))
    return apiError('查询封装直通率失败，请检查 SQL Server 连接或稍后重试', 502)
  }
})
