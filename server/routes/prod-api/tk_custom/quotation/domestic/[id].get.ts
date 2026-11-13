import { getQuotation } from '../../../../../utils/quotation'

export default defineEventHandler((event) => getQuotation(event, 'DOMESTIC'))
