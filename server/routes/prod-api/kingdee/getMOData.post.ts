import { readBody } from 'h3'
import { getAuthSession } from '../../../utils/auth'
import { queryMoData } from '../../../utils/mo-read'
import { SqlServerError } from '../../../utils/sqlserver'
import { apiError, apiSuccess, errorMessage } from '../../../utils/response'

export default defineEventHandler(async (event) => {
  if (!await getAuthSession(event)) return apiError('登录状态已过期', 401)

  try {
    const result = await queryMoData(await readBody<Record<string, unknown>>(event))
    return apiSuccess({ rows: result.rows, total: result.total, pageNum: result.pageNum, pageSize: result.pageSize })
  } catch (error) {
    if (error instanceof SqlServerError) {
      console.error(`[NitroSqlServer:getMOData:${error.kind}]`, errorMessage(error, 'unknown error'))
      return apiError('查询生产进度失败，请检查 SQL Server 连接或稍后重试', error.statusCode)
    }
    console.error('[NitroSqlServer:getMOData]', errorMessage(error, 'unknown error'))
    return apiError('查询生产进度失败，请检查 SQL Server 连接或稍后重试', 502)
  }
})
