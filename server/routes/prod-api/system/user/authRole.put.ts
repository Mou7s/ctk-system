import { createSystemWriteHandler } from '../../../../utils/system-write'

export default createSystemWriteHandler('user-auth-role', { refreshSessions: true })
