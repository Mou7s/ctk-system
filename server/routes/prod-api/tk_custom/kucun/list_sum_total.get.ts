import { finishedInventoryOnly, finishedInventoryMaterials } from '../../../../utils/inventory-visibility'
import { getQuery } from 'h3'
import { withReadSession } from '../../../../utils/read'
import { queryKucunTotals } from '../../../../utils/kucun-read'

export default defineEventHandler(async (event) => {
  const query = getQuery(event) as Record<string, unknown>
  return withReadSession(event, 'kucun/list_sum_total', async (_session, pool) => queryKucunTotals(pool, query, finishedInventoryOnly(_session) ? await finishedInventoryMaterials() : undefined), '查询库存统计失败')
})

