import { exportQuotationAnalysis } from '../../../../../utils/quotation'

export default defineEventHandler((event) => exportQuotationAnalysis(event, 'DOMESTIC'))
