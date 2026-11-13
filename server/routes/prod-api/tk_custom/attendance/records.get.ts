import { listAttendanceRecords } from '../../../../utils/attendance-read'

export default defineEventHandler((event) => listAttendanceRecords(event))
