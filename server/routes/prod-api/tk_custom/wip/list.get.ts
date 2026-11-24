import { getQuery } from 'h3'
import { getAuthSession } from '../../../../utils/auth'
import { queryWipReport, weakWipFilterMessage, WipQueryLimitError } from '../../../../utils/wip'
import { SqlServerError } from '../../../../utils/sqlserver'
import { apiError, apiSuccess, errorMessage } from '../../../../utils/response'

export default defineEventHandler(async (event) => {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)

  const query = getQuery(event) as Record<string, unknown>
  // 不填筛选是合法请求：页首屏就要出「全厂封装 × 工序」矩阵（实测 5.1s / 16.2 万行工序计划），
  // 所以这里不再要求「至少一个条件」，只在给了条件时拦截单字符的弱条件。
  const weakMessage = weakWipFilterMessage(query)
  if (weakMessage) return apiError(weakMessage, 400)

  try {
    return apiSuccess(await queryWipReport(query))
  } catch (error) {
    if (error instanceof WipQueryLimitError) return apiError(error.message, 429)
    if (error instanceof SqlServerError) {
      console.error(`[NitroSqlServer:wip/list:${error.kind}]`, errorMessage(error, 'unknown error'))
      return apiError(error.message, error.statusCode)
    }
    console.error('[NitroSqlServer:wip/list]', errorMessage(error, 'unknown error'))
    return apiError(error instanceof Error ? error.message : '查询工序计划在制数据失败', 502)
  }
})
