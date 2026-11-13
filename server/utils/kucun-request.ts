import type { H3Event } from 'h3'
import { getQuery, readBody } from 'h3'

export async function getKucunRequestQuery(event: H3Event): Promise<Record<string, unknown>> {
  const query = { ...(getQuery(event) as Record<string, unknown>) }
  const body = await readBody(event)
  if (typeof body === 'string') {
    Object.assign(query, Object.fromEntries(new URLSearchParams(body)))
  } else if (body && typeof body === 'object' && !Array.isArray(body)) {
    Object.assign(query, body)
  }
  return query
}
