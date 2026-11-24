import { dataResult, withReadSession } from '../../../../../utils/read'
import { queryKucunWarningSyncTime } from '../../../../../utils/kucun-warning-read'

export default defineEventHandler(async (event) => {
  return withReadSession(event, 'kucun/warnings/syncTime', async (_session, pool) => {
    return dataResult(await queryKucunWarningSyncTime(pool))
  }, '查询库存预警同步时间失败')
})
