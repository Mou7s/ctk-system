import { withWriteSession } from '../../../../../utils/write'
import { apiSuccess } from '../../../../../utils/response'
import { batchUpdateSafeStock, batchRemoveWarning } from '../../../../../utils/kucun-warning-write'

/**
 * PUT /prod-api/tk_custom/kucun/warnings/batch
 * body: { action: 'safeStock' | 'remove', items: [{ materialCode, stockOrgCode, safeStock? }] }
 * 批量设置安全库存 / 批量移除预警：逐条独立写入+回读校验，返回逐条成功/失败结果。
 */
export default defineEventHandler((event) =>
  withWriteSession(event, 'kucun/warnings/batch', null, async (session, _connection) => {
    const body = (await readBody(event).catch(() => ({}))) as Record<string, unknown>
    const action = String(body.action ?? '').trim()
    const itemsRaw = Array.isArray(body.items) ? body.items : []
    if (!['safeStock', 'remove'].includes(action)) return apiError('action 必须为 safeStock 或 remove', 400)
    if (!itemsRaw.length) return apiError('items 不能为空', 400)
    if (itemsRaw.length > 200) return apiError('单次批量不能超过 200 条', 400)

    const items = itemsRaw.map((raw: any) => ({
      materialCode: String(raw?.materialCode ?? '').trim(),
      stockOrgCode: String(raw?.stockOrgCode ?? '100').trim() || '100',
      safeStock: Number(raw?.safeStock),
    }))
    if (items.some((item) => !item.materialCode)) return apiError('存在缺失物料编码的条目', 400)
    if (action === 'safeStock' && items.some((item) => !Number.isFinite(item.safeStock) || item.safeStock < 0)) {
      return apiError('存在无效的安全库存数值', 400)
    }

    const outcome = action === 'safeStock'
      ? await batchUpdateSafeStock(items)
      : await batchRemoveWarning(items)

    const okCount = outcome.results.filter((r) => r.ok).length
    const failCount = outcome.results.length - okCount
    return apiSuccess({
      ...outcome,
      operator: session.userName,
      summary: `成功 ${okCount} 条${failCount ? `，失败 ${failCount} 条` : ''}`,
    })
  }, '批量操作失败'),
)
