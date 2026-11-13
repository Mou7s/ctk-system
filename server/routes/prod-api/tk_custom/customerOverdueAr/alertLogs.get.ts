import { overdueAlertRead } from '../../../../utils/customer-overdue-ar-alert-http'
export default defineEventHandler(event => overdueAlertRead(event, 'logs'))
