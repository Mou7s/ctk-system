import { exportExceptionReports } from '../../../../utils/exception-read'
import { sendExceptionExcel } from '../../../../utils/exception-export'

export default defineEventHandler((event) => exportExceptionReports(event, sendExceptionExcel))
