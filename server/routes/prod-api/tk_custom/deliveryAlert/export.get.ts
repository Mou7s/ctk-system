import { deliveryAlertRead } from '../../../../utils/sales-delivery-alert-http'
export default defineEventHandler(event => deliveryAlertRead(event, 'export'))
