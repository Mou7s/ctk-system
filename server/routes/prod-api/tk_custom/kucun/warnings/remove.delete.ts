import { withWriteSession } from '../../../../../utils/write'
import { apiSuccess } from '../../../../../utils/response'
import { disableMaterialSafeStockWarning } from '../../../../../utils/kucun-warning-write'

/**
 * DELETE /prod-api/tk_custom/kucun/warnings/remove
 * body: { materialCode, stockOrgCode }
 * 移除预警：关闭金蝶安全库存预警开关（回读校验）+ 删除本地快照行（后续同步不再纳入）。
 */
export default defineEventHandler((event) =>
  withWriteSession(event, 'kucun/warnings/remove', null, async (session, _connection) => {
    const body = (await readBody(event).catch(() => ({}))) as Record<string, unknown>
    const materialCode = String(body.materialCode ?? '').trim()
    const stockOrgCode = String(body.stockOrgCode ?? '').trim()
    if (!materialCode || !stockOrgCode) return apiError('物料编码或库存组织缺失', 400)

    const result = await disableMaterialSafeStockWarning(materialCode, stockOrgCode)
    return apiSuccess({
      materialCode,
      stockOrgCode,
      materialId: result.materialId,
      localDeleted: result.localDeleted,
      operator: session.userName,
    })
  }, '移除库存预警失败'),
)
