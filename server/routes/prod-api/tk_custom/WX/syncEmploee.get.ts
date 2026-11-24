import { handleWecomEmployeeSync } from '../../../../utils/wecom-sync'

// GET is intentionally preview-only unless the legacy apply query is explicit.
export default defineEventHandler((event) => handleWecomEmployeeSync(event))
