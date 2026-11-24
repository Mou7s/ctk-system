import { buildIndexOfKingdee } from '../../../utils/execute-sql'
import { notifyExecuteSql } from '../../../utils/execute-sql-wecom'
import { createExecuteSqlRoute } from '../../../utils/execute-sql-write'

export default defineEventHandler(createExecuteSqlRoute({
  label: 'build-index-of-kingdee',
  title: '重建索引',
  operation: async () => buildIndexOfKingdee(),
  notify: (outcome, durationMs) => notifyExecuteSql('ops', outcome, durationMs),
}))
