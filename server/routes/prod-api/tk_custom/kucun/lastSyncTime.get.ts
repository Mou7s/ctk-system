import { withReadSession, dataResult } from '../../../../utils/read'
import { queryKucunLastSyncTime } from '../../../../utils/kucun-read'

export default defineEventHandler(async (event) => {
  return withReadSession(event, 'kucun/lastSyncTime', async (_session, pool) => {
    return dataResult(await queryKucunLastSyncTime(pool))
  }, '查询库存同步时间失败')
})

