import { withReadSession } from '../../../../utils/read'
import { apiSuccess } from '../../../../utils/response'
import { runKucunWarningPush } from '../../../../utils/nitro-jobs/kucun-warning-send'

/**
 * POST /prod-api/tk_custom/kucun/sendWarningMsg
 * body: { receiverIds: 'a,b,c' }（可选；不传用 sys_config 的接收人）
 * 手动推送库存预警 Excel 到企业微信（与每日 112 相同链路，复用同一发送器）。
 */
export default defineEventHandler((event) =>
  withReadSession(event, 'kucun/sendWarningMsg', async () => {
    const body = (await readBody(event).catch(() => ({}))) as Record<string, unknown>
    const manualReceivers = String(body.receiverIds ?? '')
      .split(/[,|]/)
      .map((item) => item.trim())
      .filter(Boolean)

    const result = await runKucunWarningPush(manualReceivers.length ? manualReceivers : undefined)
    if (result.skipped) {
      return apiSuccess({ ...result, message: result.skipped }, `已跳过：${result.skipped}`)
    }
    const parts = [`发送成功 ${result.sent.length} 人`]
    if (result.failed.length) parts.push(`失败 ${result.failed.length} 人（${result.failed.map((f) => f.userId).join(',')}）`)
    return apiSuccess(
      { ...result, message: parts.join('，') },
      `库存预警已推送：偏低 ${result.belowCount} 项，${parts.join('，')}`,
    )
  }, '推送库存预警失败'),
)
