import { handleWecomEmployeeSync } from '../../../../utils/wecom-sync'

export default defineEventHandler((event) => handleWecomEmployeeSync(event, true))
