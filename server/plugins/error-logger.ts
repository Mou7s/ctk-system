import { errorMessage } from '../utils/response'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (error, { event }) => {
    const path = event?.path || '<unknown>'
    const message = errorMessage(error, 'unknown error')
    console.error(`[Nitro] request failed: ${event?.node?.req?.method || 'UNKNOWN'} ${path}: ${message}`)
  })
})
