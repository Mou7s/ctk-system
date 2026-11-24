import { finishedInventoryOnly, finishedInventoryMaterials } from '../../../../utils/inventory-visibility'
import { withReadSession } from '../../../../utils/read'
import { kucunDetailExportRows, queryKucunList } from '../../../../utils/kucun-read'
import { sendKucunExcel } from '../../../../utils/kucun-export'
import { getKucunRequestQuery } from '../../../../utils/kucun-request'

export default defineEventHandler(async (event) => {
  const query = await getKucunRequestQuery(event)
  const result = await withReadSession(event, 'kucun/export', async (_session, pool) => {
    const materials = finishedInventoryOnly(_session) ? await finishedInventoryMaterials() : undefined
    const rows = []
    let pageNum = 1
    const pageSize = 5000
    while (true) {
      const page = await queryKucunList(pool, { ...query, pageNum, pageSize }, materials)
      rows.push(...page.rows)
      if (rows.length >= page.total || page.rows.length === 0) break
      pageNum += 1
    }
    return sendKucunExcel(event, kucunDetailExportRows(rows), 'D栋库存数据.xlsx')
  }, '导出库存明细失败')
  return result
})
