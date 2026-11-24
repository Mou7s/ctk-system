import { createDisabledEndpointHandler } from '../../../../utils/disabled-endpoints'
export default defineEventHandler(createDisabledEndpointHandler('播放器已并入系统进程运行，容器重启必须在部署主机上经授权执行'))
