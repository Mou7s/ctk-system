import { getExceptionDashboard } from '../../../../utils/exception-read'

export default defineEventHandler((event) => getExceptionDashboard(event))
