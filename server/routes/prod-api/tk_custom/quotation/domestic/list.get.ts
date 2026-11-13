import { listQuotations } from '../../../../../utils/quotation'

export default defineEventHandler((event) => listQuotations(event, 'DOMESTIC'))
