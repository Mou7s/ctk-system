import type { H3Event } from 'h3'
import { getRouterParam } from 'h3'
import { getGarnet } from './redis'
import { apiError, apiSuccess } from './response'

/**
 * sys_cache 的键分组：用于监控页的「键分布」图。
 * 前缀清单与 db/sql/20260915_sys_cache_state_table.sql 头部说明保持一致。
 */
const KEY_GROUPS: Array<{ prefix: string; label: string }> = [
  { prefix: 'auth_sessions:', label: '会话（Nitro）' },
  { prefix: 'login_tokens:', label: '会话（Java 兼容）' },
  { prefix: 'captcha_codes:', label: '验证码' },
  { prefix: 'pwd_err_cnt:', label: '登录失败锁' },
  { prefix: 'nitro:write:', label: '写请求幂等键' },
  { prefix: 'tk:video:play-token:', label: '视频播放票据' },
]

function parseInfo(raw: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of String(raw || '').split(/\r?\n/)) {
    const separator = line.indexOf(':')
    if (separator <= 0 || line.startsWith('#')) continue
    result[line.slice(0, separator)] = line.slice(separator + 1)
  }
  return result
}

/**
 * 按前缀统计存活键的数量。
 *
 * 取代原先的 Redis「命令统计」饼图：换到 MySQL 后没有按命令统计（INFO commandstats
 * 永远为空），这块本来就画不出东西；改成键分布后这个位置才真正有信息量。
 */
async function queryCacheKeyBreakdown(): Promise<Array<{ name: string; value: string }>> {
  const keys = await getGarnet().keys('*')
  const counts = new Map<string, number>()
  for (const key of keys) {
    const group = KEY_GROUPS.find((item) => String(key).startsWith(item.prefix))
    const label = group ? group.label : '其他'
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([name, total]) => ({ name, value: String(total) }))
}

export async function queryMonitorCacheInfo() {
  const cache = getGarnet()
  const [infoRaw, dbSize] = await Promise.all([
    cache.info(),
    cache.dbsize(),
  ])

  let keyBreakdown: Array<{ name: string; value: string }> = []
  try {
    keyBreakdown = await queryCacheKeyBreakdown()
  } catch (error) {
    console.error('[NitroMonitor] cache key breakdown failed:', error instanceof Error ? error.message : 'unknown error')
  }

  return {
    info: parseInfo(infoRaw),
    dbSize,
    // 字段名保持不变，前端沿用同一个图表位置。
    commandStats: keyBreakdown,
  }
}

function decodeParam(raw: unknown): string {
  const value = String(raw || '').trim()
  if (!value) return ''
  try {
    return decodeURIComponent(value).trim()
  } catch {
    return value
  }
}

export async function queryMonitorCacheKeys(event: H3Event) {
  const cacheName = decodeParam(getRouterParam(event, 'cacheName'))
  if (!cacheName || cacheName.length > 120 || /[\r\n*?\[\]]/.test(cacheName)) return apiError('缓存名称不符合规范')
  try {
    const keys = await getGarnet().keys(`${cacheName}*`)
    return apiSuccess([...new Set(keys.map(String))].sort())
  } catch (error) {
    console.error('[NitroMonitor] cache keys failed:', error instanceof Error ? error.message : 'unknown error')
    return apiError('缓存服务暂不可用', 503)
  }
}

export async function queryMonitorCacheValue(event: H3Event) {
  const cacheName = decodeParam(getRouterParam(event, 'cacheName'))
  const cacheKey = decodeParam(getRouterParam(event, 'cacheKey'))
  if (!cacheName || !cacheKey || cacheName.length > 120 || cacheKey.length > 512 || /[\r\n]/.test(cacheKey)) return apiError('缓存参数不符合规范')
  try {
    const value = await getGarnet().get(cacheKey)
    return apiSuccess({ cacheName, cacheKey, cacheValue: value })
  } catch (error) {
    console.error('[NitroMonitor] cache value failed:', error instanceof Error ? error.message : 'unknown error')
    return apiError('缓存服务暂不可用', 503)
  }
}
