import { getExceptionStats } from '../../../../utils/exception-read'

export default defineEventHandler((event) => getExceptionStats(event))
