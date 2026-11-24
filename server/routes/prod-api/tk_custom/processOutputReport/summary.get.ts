import { getQuery } from 'h3'
import { getAuthSession } from '../../../../utils/auth'
import { apiError, apiSuccess, errorMessage } from '../../../../utils/response'
import { ProcessOutputInputError, queryProcessOutputSummary } from '../../../../utils/process-output-read'
import { SqlServerError } from '../../../../utils/sqlserver'

export default defineEventHandler(async (event) => {
  if (!await getAuthSession(event)) return apiError('登录状态已过期', 401)
  try {
    return apiSuccess(await queryProcessOutputSummary(getQuery(event) as Record<string, unknown>))
  } catch (error) {
    if (error instanceof ProcessOutputInputError) return apiError(error.message, error.statusCode)
    if (error instanceof SqlServerError) {
      console.error(`[NitroSqlServer:processOutputReport/summary:${error.kind}]`, errorMessage(error, 'unknown error'))
      return apiError(error.message, error.statusCode)
    }
    console.error('[NitroSqlServer:processOutputReport/summary]', errorMessage(error, 'unknown error'))
    return apiError('查询工序产量汇总失败，请检查 SQL Server 或 MySQL 连接后重试', 502)
  }
})
