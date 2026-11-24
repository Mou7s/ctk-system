import { getExceptionReport } from '../../../../utils/exception-read'

export default defineEventHandler((event) => getExceptionReport(event))
