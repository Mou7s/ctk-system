import { createSystemWriteHandler } from '../../../../utils/system-write'

export default createSystemWriteHandler('role-delete', { refreshSessions: true })
