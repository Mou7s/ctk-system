import { dataResult, withReadSession } from '../../../../utils/read'
import { queryKucunWarningWecomUsers } from '../../../../utils/kucun-warning-read'

export default defineEventHandler(async (event) => {
  return withReadSession(event, 'kucun/wecomUsers', async (_session, pool) => {
    return dataResult(await queryKucunWarningWecomUsers(pool))
  }, '获取企微成员失败')
})
