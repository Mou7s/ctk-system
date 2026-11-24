import { createSystemWriteHandler } from '../../../../utils/system-write'

export default createSystemWriteHandler('user-delete', { refreshSessions: true })
