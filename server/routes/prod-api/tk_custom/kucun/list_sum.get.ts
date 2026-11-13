import { finishedInventoryOnly, finishedInventoryMaterials } from '../../../../utils/inventory-visibility'
import { getQuery } from 'h3'
import { withReadSession, tableResult } from '../../../../utils/read'
import { queryKucunSummaryPage } from '../../../../utils/kucun-read'

export default defineEventHandler(async (event) => {
  const query = getQuery(event) as Record<string, unknown>
  return withReadSession(event, 'kucun/list_sum', async (_session, pool) => {
    const materials = finishedInventoryOnly(_session) ? await finishedInventoryMaterials() : undefined
    const result = await queryKucunSummaryPage(pool, query, materials)
    return tableResult(result.rows, result.total, '查询成功')
  }, '查询库存汇总失败')
})

