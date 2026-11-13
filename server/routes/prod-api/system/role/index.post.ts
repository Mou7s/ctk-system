import { createSystemWriteHandler } from '../../../../utils/system-write'

export default createSystemWriteHandler('role-add', { refreshSessions: true })
