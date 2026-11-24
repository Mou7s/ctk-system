import { listKucunWarningMaterials } from '../../../../../utils/kucun-warning-read'

/**
 * GET /prod-api/tk_custom/kucun/warnings/materials
 * query: { keyword?, limit?, stockOrgCode? }
 * 搜索金蝶组织 100 下所有已审核未禁用且具备库存子表的物料（不限成品组，涵盖原材料/包材/辅材/半成品/成品）。
 */
export default defineEventHandler(listKucunWarningMaterials)
