import { checkQuotationLowPrices } from '../../../../../utils/quotation-low-price'
export default defineEventHandler(event => checkQuotationLowPrices(event, 'DOMESTIC'))
