import { createDisabledEndpointHandler } from '../../../../utils/disabled-endpoints'
export default defineEventHandler(createDisabledEndpointHandler('销售出库解冻属于金蝶高风险写操作，当前 Nitro 不接受未验收请求'))
