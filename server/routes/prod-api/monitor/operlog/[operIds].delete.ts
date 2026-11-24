import { createMonitorAdminWriteHandler } from '../../../../utils/monitor-admin-write'
export default defineEventHandler(createMonitorAdminWriteHandler('oper-delete'))
