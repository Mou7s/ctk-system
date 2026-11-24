import { withReadSession } from '../../../../../utils/read'
import { apiSuccess } from '../../../../../utils/response'
import { syncKucunWarningsFromK3 } from '../../../../../utils/kucun-warning-sync'

/**
 * 从金蝶刷新库存预警快照（手动触发）。
 * 金蝶仅只读查询（安全库存 + 即时库存），写本地 kucun_warning 快照表。
 */
export default defineEventHandler((event) =>
  withReadSession(event, 'KucunWarnings', async () => {
    const result = await syncKucunWarningsFromK3()
    return apiSuccess({
      rows: result.rows,
      syncTime: result.syncTime,
      stockOrgName: result.stockOrgName,
    })
  }, '从金蝶刷新库存预警失败'),
)
