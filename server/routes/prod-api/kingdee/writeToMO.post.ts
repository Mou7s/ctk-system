import { writeToMO } from '../../../utils/execute-sql'
import { createExecuteSqlRoute } from '../../../utils/execute-sql-write'

export default defineEventHandler(createExecuteSqlRoute({
  label: 'write-to-mo',
  title: '更新工序计划单号到生产订单',
  operation: async () => writeToMO(),
}))
