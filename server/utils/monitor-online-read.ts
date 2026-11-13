import type { H3Event } from 'h3'
import { getQuery } from 'h3'
import { getAuthSession } from './auth'
import { getGarnet } from './redis'
import { apiError, apiSuccessFields, errorMessage } from './response'

const legacyPrefix = 'login_tokens:'

type LegacyLoginUser = {
  token?: string
  userName?: string
  username?: string
  ipaddr?: string
  loginLocation?: string
  browser?: string
  os?: string
  loginTime?: number | string
  user?: {
    userName?: string
    username?: string
    deptName?: string
    dept?: { deptName?: string }
  }
}

type OnlineRow = {
  tokenId: string
  deptName: string
  userName: string
  ipaddr: string
  loginLocation: string
  browser: string
  os: string
  loginTime: number
}

function extractStringField(value: string, name: string): string {
  const match = value.match(new RegExp(`"${name}"\\s*:\\s*"([^"\\\\]*)"`))
  return match?.[1] || ''
}

function extractNumberField(value: string, name: string): number {
  const match = value.match(new RegExp(`"${name}"\\s*:\\s*(-?\\d+)`))
  const parsed = Number(match?.[1] || 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseTruncatedLegacySession(value: string, tokenId: string): OnlineRow | null {
  const userName = extractStringField(value, 'userName') || extractStringField(value, 'username')
  if (!userName) return null
  return {
    tokenId: extractStringField(value, 'token') || tokenId,
    deptName: extractStringField(value, 'deptName'),
    userName,
    ipaddr: extractStringField(value, 'ipaddr'),
    loginLocation: extractStringField(value, 'loginLocation'),
    browser: extractStringField(value, 'browser'),
    os: extractStringField(value, 'os'),
    loginTime: extractNumberField(value, 'loginTime'),
  }
}

function parseLegacySession(value: string | null, tokenId: string): OnlineRow | null {
  if (!value) return null
  try {
    const raw = JSON.parse(value) as LegacyLoginUser
    const user = raw.user || {}
    const userName = String(raw.userName || raw.username || user.userName || user.username || '')
    if (!userName) return null
    const deptName = String(user.deptName || user.dept?.deptName || '')
    const loginTime = Number(raw.loginTime || 0)
    return {
      tokenId: String(raw.token || tokenId),
      deptName,
      userName,
      ipaddr: String(raw.ipaddr || ''),
      loginLocation: String(raw.loginLocation || ''),
      browser: String(raw.browser || ''),
      os: String(raw.os || ''),
      loginTime: Number.isFinite(loginTime) ? loginTime : 0,
    }
  } catch {
    return parseTruncatedLegacySession(value, tokenId)
  }
}

export async function listOnlineUsers(event: H3Event) {
  if (!await getAuthSession(event)) return apiError('登录状态已过期', 401)

  try {
    const query = getQuery(event) as Record<string, unknown>
    const ipaddr = String(query.ipaddr || '').trim()
    const userName = String(query.userName || '').trim()
    const garnet = getGarnet()
    const keys = await garnet.keys(`${legacyPrefix}*`)
    const values = keys.length ? await garnet.mget(...keys) : []
    const rows = keys.map((key, index) => parseLegacySession(values[index], key.slice(legacyPrefix.length)))
      .filter((row): row is OnlineRow => Boolean(row))
      .filter((row) => {
        if (ipaddr && userName) return row.ipaddr === ipaddr && row.userName === userName
        if (ipaddr) return row.ipaddr === ipaddr
        if (userName) return row.userName === userName
        return true
      })
      .reverse()

    return apiSuccessFields({ rows, total: rows.length })
  } catch (error) {
    console.error('[NitroMonitor] online list failed:', errorMessage(error, 'unknown error'))
    return apiError('获取在线用户失败', 500)
  }
}
