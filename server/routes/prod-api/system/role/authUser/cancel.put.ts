import { createSystemWriteHandler } from '../../../../../utils/system-write'

export default createSystemWriteHandler('role-auth-cancel', { refreshSessions: true })
