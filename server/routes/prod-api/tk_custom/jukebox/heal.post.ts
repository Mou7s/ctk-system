import { createDisabledEndpointHandler } from '../../../../utils/disabled-endpoints'
export default defineEventHandler(createDisabledEndpointHandler('播放器重启必须在独立播放器主机上经授权执行'))
