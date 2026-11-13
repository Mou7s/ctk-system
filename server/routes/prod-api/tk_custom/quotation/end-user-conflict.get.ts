import { checkQuotationEndUserConflict } from '../../../../utils/quotation-end-user-conflict'

export default defineEventHandler((event) => checkQuotationEndUserConflict(event))
