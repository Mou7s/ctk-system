import { withReadSession } from '../../../../../utils/read'
import { queryKucunWarningRows } from '../../../../../utils/kucun-warning-read'
import { sendKucunWarningExcel } from '../../../../../utils/kucun-warning-export'

/** 导出库存预警 Excel（本地快照，只读）。样式与每日企微推送附件一致：双 Sheet『全部』+『偏低明细』。 */
export default defineEventHandler((event) =>
  withReadSession(event, 'KucunWarnings', async (_session, pool) => {
    const rows = await queryKucunWarningRows(pool)
    return sendKucunWarningExcel(event, rows as Array<Record<string, unknown>>)
  }, '导出库存预警失败'),
)