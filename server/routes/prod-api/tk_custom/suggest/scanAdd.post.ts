import { createDisabledEndpointHandler } from '../../../../utils/disabled-endpoints'
export default defineEventHandler(createDisabledEndpointHandler('匿名扫码建议写入需要先完成幂等与滥用验收'))
