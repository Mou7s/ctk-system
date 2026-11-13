import { getNitroServerConfig } from './runtime'
import { errorMessage } from './response'

export interface JukeboxFetchResult {
  response: Response
  details: any
}

export class JukeboxRemoteError extends Error {
  readonly statusCode: number

  constructor(message: string, statusCode = 502) {
    super(message)
    this.name = 'JukeboxRemoteError'
    this.statusCode = statusCode
  }
}

function addNoProxyHost(hostname: string) {
  for (const key of ['NO_PROXY', 'no_proxy']) {
    const values = String(process.env[key] || '').split(',').map((item) => item.trim()).filter(Boolean)
    if (!values.some((item) => item === hostname || item === `.${hostname}`)) {
      values.push(hostname)
      process.env[key] = values.join(',')
    }
  }
}

export async function fetchPlayer(path: string, init: RequestInit = {}, timeoutMs?: number): Promise<JukeboxFetchResult> {
  const config = getNitroServerConfig()
  if (!config.jukeboxServiceToken) {
    throw new JukeboxRemoteError('播放器服务认证未配置', 503)
  }
  const base = config.jukeboxBaseUrl.replace(/\/+$/, '')
  const hostname = new URL(base).hostname
  addNoProxyHost(hostname)

  const controller = new AbortController()
  const timeout = Math.max(1000, Number(timeoutMs || config.jukeboxTimeoutMs || 10000))
  const timer = setTimeout(() => controller.abort(), timeout)
  const headers = new Headers(init.headers)
  headers.set('authorization', `Bearer ${config.jukeboxServiceToken}`)
  try {
    const response = await fetch(`${base}${path}`, { ...init, headers, signal: controller.signal })
    const text = await response.text()
    let details: any = text
    try { details = JSON.parse(text) } catch { /* keep the player text */ }
    if (!response.ok) {
      const statusCode = response.status === 401 ? 503 : response.status >= 500 ? 502 : response.status
      throw new JukeboxRemoteError(`播放器返回 HTTP ${response.status}`, statusCode)
    }
    return { response, details }
  } catch (error) {
    if (error instanceof JukeboxRemoteError) throw error
    throw new JukeboxRemoteError(errorMessage(error, '播放器连接失败'), 502)
  } finally {
    clearTimeout(timer)
  }
}
