import { createSystemWriteHandler } from '../../../../utils/system-write'

export default createSystemWriteHandler('user-reset-password', { refreshSessions: true })
