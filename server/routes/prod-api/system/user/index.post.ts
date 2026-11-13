import { createSystemWriteHandler } from '../../../../utils/system-write'

export default defineEventHandler(createSystemWriteHandler('user-add', { refreshSessions: true }))
