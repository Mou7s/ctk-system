import { handleCBData } from '../../../utils/execute-sql'
import { notifyExecuteSql } from '../../../utils/execute-sql-wecom'
import { createExecuteSqlRoute } from '../../../utils/execute-sql-write'

export default defineEventHandler(createExecuteSqlRoute({
  label: 'handle-cb-data',
  title: '优化成本数据',
  operation: async () => handleCBData(),
  notify: (outcome, durationMs) => notifyExecuteSql('cost', outcome, durationMs),
}))
