import { finishedInventoryOnly, finishedInventoryMaterials } from '../../../../utils/inventory-visibility'
import { withReadSession } from '../../../../utils/read'
import { kucunSummaryExportRows, queryKucunSummaryRows } from '../../../../utils/kucun-read'
import { sendKucunExcel } from '../../../../utils/kucun-export'
import { getKucunRequestQuery } from '../../../../utils/kucun-request'

export default defineEventHandler(async (event) => {
  const query = await getKucunRequestQuery(event)
  const result = await withReadSession(event, 'kucun/export1', async (_session, pool) => {
    const materials = finishedInventoryOnly(_session) ? await finishedInventoryMaterials() : undefined
    const rows = await queryKucunSummaryRows(pool, query, materials)
    return sendKucunExcel(event, kucunSummaryExportRows(rows), 'D栋库存.xlsx')
  }, '导出库存汇总失败')
  return result
})
