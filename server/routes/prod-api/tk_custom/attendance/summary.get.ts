import { getAttendanceSummary } from '../../../../utils/attendance-read'

export default defineEventHandler((event) => getAttendanceSummary(event))
