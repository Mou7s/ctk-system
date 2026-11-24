import { downloadQuotation } from '../../../../../utils/quotation'

export default defineEventHandler((event) => downloadQuotation(event, 'DOMESTIC'))
