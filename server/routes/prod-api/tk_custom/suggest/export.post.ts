import { exportSuggest } from '../../../../utils/suggest-read'
import { sendSuggestExcel } from '../../../../utils/suggest-export'

export default defineEventHandler((event) => exportSuggest(event, sendSuggestExcel))
