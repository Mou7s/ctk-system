import { listExceptionReports } from '../../../../utils/exception-read'

export default defineEventHandler((event) => listExceptionReports(event))
