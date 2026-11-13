import { updateTimeOfGXLL } from '../../../utils/execute-sql'
import { createExecuteSqlRoute } from '../../../utils/execute-sql-write'

export default defineEventHandler(createExecuteSqlRoute({
  label: 'update-time-of-gxll',
  title: '更新未领料信息',
  operation: async (body) => updateTimeOfGXLL(body.dateStr),
}))
