import type { H3Event } from 'h3'
import { apiError } from './response'

export function createDisabledEndpointHandler(message: string) {
  return async (_event: H3Event) => apiError(message, 410)
}
