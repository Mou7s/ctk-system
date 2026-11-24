import { getQuotationAnalysis } from '../../../../../utils/quotation'

export default defineEventHandler((event) => getQuotationAnalysis(event, 'DOMESTIC'))
