import { createDisabledEndpointHandler } from '../../../../../../utils/disabled-endpoints'
export default defineEventHandler(createDisabledEndpointHandler('抽奖兑换会产生业务副作用，当前 Nitro 不接受未验收请求'))
