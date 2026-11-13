import { createSystemWriteHandler } from '../../../../utils/system-write'

export default createSystemWriteHandler('role-status', { refreshSessions: true })
