import { createSystemWriteHandler } from '../../../../utils/system-write'

export default createSystemWriteHandler('role-data-scope', { refreshSessions: true })
