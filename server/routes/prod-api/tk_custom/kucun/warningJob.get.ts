import { withReadSession } from '../../../../utils/read'
import { apiSuccess } from '../../../../utils/response'
import { readWarningReceivers, readWarningPushTime } from '../../../../utils/nitro-jobs/kucun-warning-send'
import { isNitroJobEnabled } from '../../../../utils/nitro-jobs/types'
import { NITRO_JOB_MAP } from '../../../../utils/nitro-jobs/registry'

/** GET /prod-api/tk_custom/kucun/warningJob —— 播报设置回显（开关/时间/接收人）。 */
export default defineEventHandler((event) =>
  withReadSession(event, 'kucun/warningJob', async () => {
    const def = NITRO_JOB_MAP.get('kucunWarningPush')!
    let enabled = false
    try {
      enabled = await isNitroJobEnabled(def)
    } catch {
      /* 开关读取失败按关闭处理 */
    }
    let hour = 8
    let minute = 0
    try {
      ({ hour, minute } = await readWarningPushTime())
    } catch {
      /* 时间读取失败用默认 08:00 */
    }
    let receivers = ''
    try {
      receivers = (await readWarningReceivers()).join(',')
    } catch {
      /* 接收人读取失败返回空 */
    }
    return apiSuccess({ enabled, hour, minute, receivers })
  }, '获取播报设置失败'),
)
