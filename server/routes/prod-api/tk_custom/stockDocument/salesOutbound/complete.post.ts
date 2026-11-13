import { getHeader, readBody } from 'h3'
import { apiError } from '../../../../../utils/response'
import { completeSalesOutbound } from '../../../../../utils/sales-outbound-write'
import { text } from '../../../../../utils/write'

export default defineEventHandler(async (event) => {
  const rawBody = await readBody(event)
  const body = rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody)
    ? rawBody as Record<string, any>
    : {}
  const requestKey = text(getHeader(event, 'idempotency-key')) || text(body.requestId)
  return completeSalesOutbound(event, body, requestKey)
})
