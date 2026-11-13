import { createSystemWriteHandler } from '../../../../utils/system-write'

export default createSystemWriteHandler('user-edit', { refreshSessions: true })
