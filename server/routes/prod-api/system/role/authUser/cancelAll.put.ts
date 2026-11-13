import { createSystemWriteHandler } from '../../../../../utils/system-write'

export default createSystemWriteHandler('role-auth-cancel-all', { refreshSessions: true })
