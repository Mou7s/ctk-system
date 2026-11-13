import type { H3Event } from 'h3'
import { getHeader, getRequestURL, getRouterParam, getRouterParams, readBody } from 'h3'
import { SESSION_KEY_PREFIXES, deleteAuthSession } from './auth'
import { getGarnet } from './redis'
import { apiError, apiSuccess } from './response'
import { insertOperationLog, text, withIdempotentWriteSession } from './write'

type Kind = 'cache-name' | 'cache-key' | 'cache-all' | 'online-force'

function decodePathSegment(value: unknown): string {
  const raw = text(value)
  if (!raw) return ''
  try {
    return decodeURIComponent(raw).trim()
  } catch {
    return raw
  }
}

function pathText(event: H3Event, name: string): string {
  const direct = getRouterParam(event, name)
  if (direct != null && text(direct)) return decodePathSegment(direct)
  const params = getRouterParams(event) as Record<string, unknown>
  const named = params?.[name]
  if (named != null && text(named)) return decodePathSegment(named)
  const segments = getRequestURL(event).pathname.split('/').filter(Boolean)
  return decodePathSegment(segments.at(-1))
}

export function createMonitorWriteHandler(kind: Kind) {
  return async (event: H3Event) => {
    const method = String((event as any)?.method || (event as any)?.node?.req?.method || '').toUpperCase()
    const rawBody = method === 'GET' || method === 'HEAD' ? undefined : await readBody(event).catch(() => undefined)
    const body = rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody) ? rawBody as Record<string, any> : {}
    const target = kind === 'cache-name' ? pathText(event, 'cacheName')
      : kind === 'cache-key' ? pathText(event, 'cacheKey')
        : kind === 'online-force' ? pathText(event, 'tokenId') : 'all'
    if (!target) return apiError('缓存或会话参数不能为空', 400)
    const requestKey = text(getHeader(event, 'idempotency-key')) || text(body.requestId) || crypto.randomUUID()
    return withIdempotentWriteSession(
      event,
      `monitor:${kind}`,
      null,
      requestKey,
      { target, requestId: requestKey },
      async (session, connection) => {
        const garnet = getGarnet()
        let deleted = 0
        let skipped = 0
        if (kind === 'online-force') {
          await deleteAuthSession(target)
          deleted = 1
        } else if (kind === 'cache-key') {
          deleted = Number(await garnet.del(target))
        } else {
          const keys = kind === 'cache-all' ? await garnet.keys('*') : await garnet.keys(`${target}*`)
          // 会话与缓存同表存放，所以「清理全部缓存」不能连会话一起删——那等于把所有人踢下线。
          // 会话只能通过「在线用户 → 强退」逐个失效。
          const targets = keys.filter((key) => !SESSION_KEY_PREFIXES.some((prefix) => String(key).startsWith(prefix)))
          skipped = keys.length - targets.length
          if (targets.length) deleted = Number(await garnet.del(...targets))
        }
        const result = apiSuccess(skipped ? { deleted, skipped } : { deleted }, '操作成功')
        await insertOperationLog(
          event,
          connection,
          session,
          kind === 'online-force' ? '在线用户' : '缓存监控',
          kind === 'online-force' ? 6 : 3,
          kind === 'online-force' ? { requestId: requestKey } : { target, requestId: requestKey },
          result,
        )
        return result
      },
      '清理监控数据失败',
    )
  }
}
