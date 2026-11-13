import type { H3Event } from 'h3'
import { deleteCookie, getCookie, getHeader, setCookie, setResponseHeader } from 'h3'
import { getGarnet } from './redis'
import { getNitroServerConfig } from './runtime'
import { signNitroToken, verifyNitroToken } from './jwt'

export const AUTH_COOKIE = 'Admin-Token'
export const AUTH_SESSION_PREFIX = 'auth_sessions:'
export const LEGACY_SESSION_PREFIX = 'login_tokens:'
/**
 * 会话键前缀。会话与普通缓存同表（sys_cache）存放，任何「清空缓存」的操作都必须
 * 跳过这些前缀，否则等于把在线用户全部踢下线。
 */
export const SESSION_KEY_PREFIXES = [AUTH_SESSION_PREFIX, LEGACY_SESSION_PREFIX]

export interface AuthRole {
  roleId?: number
  roleName?: string
  roleKey: string
  dataScope?: string
  status?: string
}

export interface AuthUser {
  userId: number
  deptId: number | null
  userName: string
  nickName: string
  email?: string | null
  phonenumber?: string | null
  sex?: string | null
  avatar?: string | null
  status?: string
  delFlag?: string
  roles: AuthRole[]
}

export interface AuthSession {
  version: 1
  tokenId: string
  userId: number
  deptId: number | null
  userName: string
  roles: string[]
  permissions: string[]
  user: AuthUser
  loginTime: number
  expireTime: number
  ipaddr?: string
  browser?: string
  os?: string
}

export function extractToken(event: H3Event): string | undefined {
  const authorization = getHeader(event, 'authorization')
  if (authorization?.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length).trim()
  }
  return getCookie(event, AUTH_COOKIE) || undefined
}

function parseJson(value: string | null): Record<string, any> | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function normalizeLegacySession(raw: Record<string, any>, tokenId: string): AuthSession | null {
  const rawUser = raw.user || {}
  const roles = Array.isArray(rawUser.roles)
    ? rawUser.roles.map((role: any) => String(role.roleKey || role.role_key || '')).filter(Boolean)
    : []
  const permissions = Array.isArray(raw.permissions) ? raw.permissions.map(String) : []
  const userId = Number(raw.userId || rawUser.userId || rawUser.user_id)
  const userName = String(rawUser.userName || rawUser.user_name || '')
  const expireTime = Number(raw.expireTime || 0)
  if (!userId || !userName || !expireTime) return null

  const user: AuthUser = {
    userId,
    deptId: raw.deptId == null ? (rawUser.deptId ?? rawUser.dept_id ?? null) : raw.deptId,
    userName,
    nickName: String(rawUser.nickName || rawUser.nick_name || ''),
    email: rawUser.email ?? null,
    phonenumber: rawUser.phonenumber ?? null,
    sex: rawUser.sex ?? null,
    avatar: rawUser.avatar ?? null,
    status: rawUser.status,
    delFlag: rawUser.delFlag || rawUser.del_flag,
    roles: Array.isArray(rawUser.roles) ? rawUser.roles.map((role: any) => ({
      roleId: Number(role.roleId || role.role_id) || undefined,
      roleName: role.roleName || role.role_name,
      roleKey: String(role.roleKey || role.role_key || ''),
      dataScope: role.dataScope || role.data_scope,
      status: role.status,
    })).filter((role: AuthRole) => role.roleKey) : [],
  }

  return {
    version: 1,
    tokenId,
    userId,
    deptId: user.deptId,
    userName,
    roles,
    permissions,
    user,
    loginTime: Number(raw.loginTime || Date.now()),
    expireTime,
    ipaddr: raw.ipaddr,
    browser: raw.browser,
    os: raw.os,
  }
}

export function sessionKey(tokenId: string): string {
  return `${AUTH_SESSION_PREFIX}${tokenId}`
}

export function legacySessionKey(tokenId: string): string {
  return `${LEGACY_SESSION_PREFIX}${tokenId}`
}

export async function saveAuthSession(session: AuthSession): Promise<void> {
  const config = getNitroServerConfig()
  const ttl = Math.max(60, Math.ceil((session.expireTime - Date.now()) / 1000))
  await getGarnet().set(sessionKey(session.tokenId), JSON.stringify(session), 'EX', ttl)

  // Compatibility bridge for legacy session format.
  const legacy = {
    userId: session.userId,
    deptId: session.deptId,
    token: session.tokenId,
    loginTime: session.loginTime,
    expireTime: session.expireTime,
    ipaddr: session.ipaddr || '',
    browser: session.browser || '',
    os: session.os || '',
    permissions: session.permissions,
    user: {
      ...session.user,
      roles: session.user.roles,
    },
  }
  await getGarnet().set(legacySessionKey(session.tokenId), JSON.stringify(legacy), 'EX', ttl)
  void config
}

export async function deleteAuthSession(tokenId: string): Promise<void> {
  await getGarnet().del(sessionKey(tokenId), legacySessionKey(tokenId))
}

export async function getAuthSession(event: H3Event): Promise<{ token: string; session: AuthSession } | null> {
  const token = extractToken(event)
  if (!token) return null

  const config = getNitroServerConfig()
  const verify = (secret: string) => verifyNitroToken(token, secret)
    || verifyNitroToken(token, secret, { allowExpired: true })
  const claims = verify(config.authTokenSecret)
    || (config.legacyTokenSecret !== config.authTokenSecret ? verify(config.legacyTokenSecret) : null)
  if (!claims) return null

  const garnet = getGarnet()
  const current = parseJson(await garnet.get(sessionKey(claims.login_user_key)))
  const session = current
    ? current as unknown as AuthSession
    : normalizeLegacySession(parseJson(await garnet.get(legacySessionKey(claims.login_user_key))) || {}, claims.login_user_key)
  if (!session || session.tokenId !== claims.login_user_key || session.expireTime <= Date.now()) {
    return null
  }

  const now = Date.now()
  const shouldRefresh = session.expireTime - now <= 20 * 60 * 1000
    || claims.exp <= Math.floor(now / 1000) + 20 * 60
  if (shouldRefresh) {
    session.loginTime = now
    session.expireTime = session.loginTime + config.tokenExpireMinutes * 60 * 1000
    await saveAuthSession(session)
    const refreshedToken = signNitroToken(session.tokenId, config.authTokenSecret, config.tokenExpireMinutes)
    await setAuthCookie(event, refreshedToken)
    // The readable compatibility cookie is maintained by the browser client.
    // This header lets it replace an about-to-expire Bearer token without
    // exposing the HttpOnly session cookie itself.
    setResponseHeader(event, 'x-nitro-token', refreshedToken)
    return { token: refreshedToken, session }
  }

  return { token, session }
}

export async function setAuthCookie(event: H3Event, token: string): Promise<void> {
  const config = getNitroServerConfig()
  const forwardedProto = getHeader(event, 'x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase()
  const socket = event.node.req.socket as { encrypted?: boolean } | undefined
  const secure = forwardedProto === 'https' || (!forwardedProto && Boolean(socket?.encrypted))
  setCookie(event, AUTH_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: config.tokenExpireMinutes * 60,
  })
}

export function clearAuthCookie(event: H3Event): void {
  deleteCookie(event, AUTH_COOKIE, { path: '/' })
}

export function hasPermission(session: AuthSession, permission: string): boolean {
  if (session.userId === 1 || session.permissions.includes('*:*:*')) return true
  return session.permissions.some((item) => item === permission || item === '*' || item.endsWith(':*') && permission.startsWith(item.slice(0, -1)))
}

export function hasRole(session: AuthSession, role: string): boolean {
  if (session.userId === 1 || session.roles.includes('admin')) return true
  return session.roles.some((item) => item === role || item === '*' || item.endsWith('*') && role.startsWith(item.slice(0, -1)))
}
