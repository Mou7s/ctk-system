import { getAuthSession } from '../../../../utils/auth'
import { errorMessage } from '../../../../utils/response'
import { exportProcessOutputSummary } from '../../../../utils/process-output-export'
import { SqlServerError } from '../../../../utils/sqlserver'

export default defineEventHandler(async (event) => {
  if (!await getAuthSession(event)) return { code: 401, msg: '登录状态已过期' }
  try {
    return await exportProcessOutputSummary(event)
  } catch (error) {
    if (error instanceof SqlServerError) {
      console.error(`[NitroSqlServer:processOutputReport/export:${error.kind}]`, errorMessage(error, 'unknown error'))
    } else {
      console.error('[NitroSqlServer:processOutputReport/export]', errorMessage(error, 'unknown error'))
    }
    return { code: 502, msg: '导出工序产量失败，请检查 SQL Server 或 MySQL 连接后重试' }
  }
})
