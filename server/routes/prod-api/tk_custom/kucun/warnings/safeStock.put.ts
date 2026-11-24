import { withWriteSession } from '../../../../../utils/write'
import { apiError, apiSuccess } from '../../../../../utils/response'
import { updateMaterialSafeStock } from '../../../../../utils/kucun-warning-write'

/**
 * PUT /prod-api/tk_custom/kucun/warnings/safeStock
 * body: { materialCode, stockOrgCode, safeStock }
 * 修改安全库存：写金蝶 T_BD_MATERIALSTOCK.FSAFESTOCK（回读校验）+ 更新本地快照行。
 */
export default defineEventHandler((event) =>
  withWriteSession(event, 'kucun/warnings/safeStock', null, async (session, _connection) => {
    const body = (await readBody(event).catch(() => ({}))) as Record<string, unknown>
    const materialCode = String(body.materialCode ?? '').trim()
    const stockOrgCode = String(body.stockOrgCode ?? '').trim()
    const safeStock = Number(body.safeStock)
    if (!materialCode || !stockOrgCode) return apiError('物料编码或库存组织缺失', 400)
    if (!Number.isFinite(safeStock) || safeStock < 0) return apiError('安全库存必须为非负数字', 400)

    const result = await updateMaterialSafeStock(materialCode, stockOrgCode, safeStock)
    return apiSuccess({
      materialCode,
      stockOrgCode,
      safeStock: result.safeStock,
      warningStatus: result.warningStatus || null,
      actualTotal: result.actualTotal,
      materialId: result.materialId,
      operator: session.userName,
    })
  }, '修改安全库存失败'),
)
