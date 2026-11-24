import { createSystemWriteHandler } from '../../../../utils/system-write'

export default createSystemWriteHandler('user-status', { refreshSessions: true })
