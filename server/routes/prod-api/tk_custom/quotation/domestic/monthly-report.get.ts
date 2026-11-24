import { domesticMonthlyQuotationRead } from '../../../../../utils/domestic-quotation-monthly-http'

export default defineEventHandler(event => domesticMonthlyQuotationRead(event, 'status'))
