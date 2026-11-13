import { withWriteSession } from '../../../../../utils/write'
import { apiSuccess } from '../../../../../utils/response'
import { enableMaterialSafeStockWarning } from '../../../../../utils/kucun-warning-write'

/**
 * POST /prod-api/tk_custom/kucun/warnings/enable
 * body: { materialCode, stockOrgCode?, safeStock }
 * 新增物料预警：任意已审核未禁用的金蝶物料，设安全库存并开启预警开关（回读校验），
 * UPSERT 本地快照行（物料立即出现在列表）。stockOrgCode 缺省为 100。
 */
export default defineEventHandler((event) =>
  withWriteSession(event, 'kucun/warnings/enable', null, async (session, _connection) => {
    const body = (await readBody(event).catch(() => ({}))) as Record<string, unknown>
    const materialCode = String(body.materialCode ?? '').trim()
    const stockOrgCode = String(body.stockOrgCode ?? '100').trim() || '100'
    const safeStock = Number(body.safeStock)
    if (!materialCode) return apiError('物料编码缺失', 400)
    if (!Number.isFinite(safeStock) || safeStock < 0) return apiError('安全库存必须为非负数字', 400)

    const result = await enableMaterialSafeStockWarning(materialCode, stockOrgCode, safeStock)
    return apiSuccess({
      ...result,
      stockOrgCode,
      operator: session.userName,
    })
  }, '新增物料预警失败'),
)
