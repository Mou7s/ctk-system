import type { H3Event } from 'h3'
import { getHeader, getRequestURL, readBody } from 'h3'
import type { PoolConnection, RowDataPacket } from 'mysql2/promise'
import { AUTH_SESSION_PREFIX, getAuthSession, hasPermission, saveAuthSession, type AuthSession } from './auth'
import { getGarnet } from './redis'
import { findUserByUsername, getUserPermissions, getUserRoleKeys } from './user-repository'
import { getMysqlPool, mysqlQueryOptions } from './mysql'
import { apiError, apiSuccess, errorMessage } from './response'

export class NitroWriteError extends Error {
  readonly statusCode: number

  constructor(message: string, statusCode = 500) {
    super(message)
    this.name = 'NitroWriteError'
    this.statusCode = statusCode
  }
}

export function writeFail(message: string, statusCode = 500): never {
  throw new NitroWriteError(message, statusCode)
}

export type WriteBody = Record<string, any>

export async function bodyOf(event: H3Event): Promise<WriteBody> {
  const body = await readBody(event)
  if (!body || typeof body !== 'object' || Array.isArray(body)) writeFail('请求参数不符合规范')
  return body as WriteBody
}

export function text(value: unknown): string {
  return String(Array.isArray(value) ? value[0] ?? '' : value ?? '').trim()
}

export function nullableText(value: unknown): string | null {
  const valueText = text(value)
  return valueText === '' ? null : valueText
}

export function positiveId(value: unknown, label = '参数'): number {
  const id = Number(text(value))
  if (!Number.isSafeInteger(id) || id <= 0) writeFail(`${label}不符合规范`)
  return id
}

export function optionalId(value: unknown): number | null {
  if (value == null || text(value) === '') return null
  return positiveId(value)
}

export function decimal(value: unknown, label: string, options: { required?: boolean; positive?: boolean } = {}): number | null {
  if (value == null || text(value) === '') {
    if (options.required) writeFail(`${label}不能为空`)
    return null
  }
  const number = Number(value)
  if (!Number.isFinite(number) || (options.positive ? number <= 0 : number < 0)) {
    writeFail(options.positive ? `${label}必须大于0` : `${label}不能小于0`)
  }
  return number
}

export function requiredText(value: unknown, label: string, maxLength?: number): string {
  const valueText = text(value)
  if (!valueText) writeFail(`${label}不能为空`)
  if (maxLength && valueText.length > maxLength) writeFail(`${label}长度不能超过${maxLength}个字符`)
  return valueText
}

export function idList(value: unknown, label = '参数'): number[] {
  const values = Array.isArray(value) ? value : text(value).split(',')
  const ids = values.map((item) => positiveId(item, label))
  if (!ids.length) writeFail(`${label}不能为空`)
  return [...new Set(ids)]
}

export function stringIdList(value: unknown, label = '参数'): string[] {
  const values = Array.isArray(value) ? value : text(value).split(',')
  const ids = values.map((item) => requiredText(item, label))
  if (!ids.length) writeFail(`${label}不能为空`)
  return [...new Set(ids)]
}

export function sqlPlaceholders(values: unknown[]): string {
  if (!values.length) writeFail('参数不能为空')
  return values.map(() => '?').join(', ')
}

export function affectedRows(result: any): number {
  return Number(result?.affectedRows || 0)
}

export function javaAjax(rows: number, successMessage = '操作成功') {
  return rows > 0 ? apiSuccess(undefined, successMessage) : apiError('操作失败', 500)
}

export async function withWriteSession<T>(
  event: H3Event,
  label: string,
  permission: string | null,
  work: (session: AuthSession, connection: PoolConnection) => Promise<T>,
  failureMessage = '操作失败',
  afterCommit?: (session: AuthSession) => Promise<void>,
): Promise<T | ReturnType<typeof apiError>> {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)
  if (permission && !hasPermission(authenticated.session, permission)) return apiError('没有权限访问该接口', 403)

  let connection: PoolConnection | undefined
  try {
    connection = await getMysqlPool().getConnection()
    await connection.beginTransaction()
    const result = await work(authenticated.session, connection)
    await connection.commit()
    if (afterCommit) {
      try {
        await afterCommit(authenticated.session)
      } catch (error) {
        // Permission refresh must not turn a committed business write into a
        // false failure. The next login still reads the current MySQL state.
        console.error(`[NitroWrite:${label}] session refresh failed:`, errorMessage(error, 'unknown error'))
      }
    }
    return result
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback()
      } catch (rollbackError) {
        console.error(`[NitroWrite:${label}] rollback failed:`, errorMessage(rollbackError, 'unknown error'))
      }
    }
    if (error instanceof NitroWriteError) return apiError(error.message, error.statusCode)
    console.error(`[NitroWrite:${label}] failed:`, errorMessage(error, 'unknown error'))
    return apiError(failureMessage, 500)
  } finally {
    connection?.release()
  }
}

export interface IdempotencyClaim {
  key: string
  requestId: string
  fingerprint: string
  replay?: unknown
}

function writeFingerprint(value: unknown): string {
  const payload = JSON.stringify(value ?? null)
  let hash = 2166136261
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * Claim a high-risk write request in Garnet. The request key is deliberately
 * scoped by user and operation so a retry can replay its own result without
 * allowing one user to consume another user's response.
 */
export async function claimWriteRequest(
  session: AuthSession,
  label: string,
  requestId: string,
  body: unknown,
): Promise<IdempotencyClaim> {
  const normalized = requiredText(requestId, '幂等键', 64)
  const fingerprint = writeFingerprint(body)
  const key = `nitro:write:${label}:${session.userId}:${normalized}`
  const garnet = getGarnet()
  const current = await garnet.get(key)
  if (current) {
    try {
      const parsed = JSON.parse(current) as { status?: string; fingerprint?: string; response?: unknown }
      if (parsed.fingerprint !== fingerprint) writeFail('同一幂等键对应的请求内容不一致', 409)
      if (parsed.status === 'done') return { key, requestId: normalized, fingerprint, replay: parsed.response }
      writeFail('相同请求正在处理中，请稍后查询结果', 409)
    } catch (error) {
      if (error instanceof NitroWriteError) throw error
      writeFail('幂等请求状态损坏，请更换幂等键', 409)
    }
  }

  const acquired = await garnet.set(
    key,
    JSON.stringify({ status: 'processing', fingerprint }),
    'NX',
    'EX',
    15 * 60,
  )
  if (acquired !== 'OK') {
    const raced = await garnet.get(key)
    if (raced) {
      try {
        const parsed = JSON.parse(raced) as { status?: string; fingerprint?: string; response?: unknown }
        if (parsed.fingerprint !== fingerprint) writeFail('同一幂等键对应的请求内容不一致', 409)
        if (parsed.status === 'done') return { key, requestId: normalized, fingerprint, replay: parsed.response }
      } catch {
        // The next request receives the stable conflict response below.
      }
    }
    writeFail('相同请求正在处理中，请稍后查询结果', 409)
  }
  return { key, requestId: normalized, fingerprint }
}

export async function finishWriteRequest(claim: IdempotencyClaim, response: unknown): Promise<void> {
  await getGarnet().set(
    claim.key,
    JSON.stringify({ status: 'done', fingerprint: claim.fingerprint, response }),
    'EX',
    15 * 60,
  )
}

export async function releaseWriteRequest(claim: IdempotencyClaim): Promise<void> {
  await getGarnet().del(claim.key)
}

export async function withIdempotentWriteSession<T>(
  event: H3Event,
  label: string,
  permission: string | null,
  requestId: string,
  requestBody: unknown,
  work: (session: AuthSession, connection: PoolConnection, claim: IdempotencyClaim) => Promise<T>,
  failureMessage = '操作失败',
  afterCommit?: (session: AuthSession) => Promise<void>,
): Promise<T | ReturnType<typeof apiError>> {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)
  if (permission && !hasPermission(authenticated.session, permission)) return apiError('没有权限访问该接口', 403)

  let claim: IdempotencyClaim
  try {
    claim = await claimWriteRequest(authenticated.session, label, requestId, requestBody)
  } catch (error) {
    if (error instanceof NitroWriteError) return apiError(error.message, error.statusCode)
    console.error(`[NitroWrite:${label}] idempotency claim failed:`, errorMessage(error, 'unknown error'))
    return apiError('幂等状态服务不可用', 503)
  }
  if ('replay' in claim) return claim.replay as T

  let response: any
  let businessResponse: any
  const wrappedAfterCommit = async (session: AuthSession) => {
    if (businessResponse?.code === 200) {
      await finishWriteRequest(claim, businessResponse)
    }
    if (afterCommit) await afterCommit(session)
  }
  try {
    response = await withWriteSession(
      event,
      label,
      permission,
      async (session, connection) => {
        businessResponse = await work(session, connection, claim)
        return businessResponse
      },
      failureMessage,
      wrappedAfterCommit,
    )
    if (response?.code !== 200) await releaseWriteRequest(claim)
    return response
  } catch (error) {
    try {
      await releaseWriteRequest(claim)
    } catch (releaseError) {
      console.error(`[NitroWrite:${label}] idempotency release failed:`, errorMessage(releaseError, 'unknown error'))
    }
    throw error
  }
}

/**
 * Public writes such as registration cannot use the authenticated-session
 * wrapper, but still need the same transaction and retry boundary.
 */
export async function withPublicIdempotentWriteSession<T>(
  event: H3Event,
  label: string,
  requestId: string,
  requestBody: unknown,
  work: (session: AuthSession, connection: PoolConnection, claim: IdempotencyClaim) => Promise<T>,
  failureMessage = '操作失败',
  afterCommit?: () => Promise<void>,
): Promise<T | ReturnType<typeof apiError>> {
  const publicSession = {
    version: 1 as const,
    tokenId: 'public',
    userId: 0,
    deptId: null,
    userName: 'anonymous',
    roles: [],
    permissions: [],
    user: { userId: 0, deptId: null, userName: 'anonymous', nickName: '匿名用户', roles: [] },
    loginTime: Date.now(),
    expireTime: Date.now() + 15 * 60 * 1000,
  } satisfies AuthSession
  let claim: IdempotencyClaim
  try {
    claim = await claimWriteRequest(publicSession, label, requestId, requestBody)
  } catch (error) {
    if (error instanceof NitroWriteError) return apiError(error.message, error.statusCode)
    console.error(`[NitroWrite:${label}] idempotency claim failed:`, errorMessage(error, 'unknown error'))
    return apiError('幂等状态服务不可用', 503)
  }
  if ('replay' in claim) return claim.replay as T

  let connection: PoolConnection | undefined
  let businessResponse: any
  try {
    connection = await getMysqlPool().getConnection()
    await connection.beginTransaction()
    businessResponse = await work(publicSession, connection, claim)
    await connection.commit()
    try {
      if (businessResponse?.code === 200) await finishWriteRequest(claim, businessResponse)
      if (afterCommit) await afterCommit()
    } catch (afterCommitError) {
      console.error(`[NitroWrite:${label}] after-commit action failed:`, errorMessage(afterCommitError, 'unknown error'))
    }
    return businessResponse
  } catch (error) {
    if (connection) {
      try { await connection.rollback() } catch (rollbackError) { console.error(`[NitroWrite:${label}] rollback failed:`, errorMessage(rollbackError, 'unknown error')) }
    }
    try { await releaseWriteRequest(claim) } catch (releaseError) { console.error(`[NitroWrite:${label}] idempotency release failed:`, errorMessage(releaseError, 'unknown error')) }
    if (error instanceof NitroWriteError) return apiError(error.message, error.statusCode)
    console.error(`[NitroWrite:${label}] failed:`, errorMessage(error, 'unknown error'))
    return apiError(failureMessage, 500)
  } finally {
    connection?.release()
  }
}

/**
 * Refresh all Nitro sessions after a menu/role/user write. This mirrors the
 * Java online-permission refresher while keeping the refresh best-effort and
 * outside the business transaction.
 */
export async function refreshNitroSessions(): Promise<void> {
  const garnet = getGarnet()
  let cursor = '0'
  do {
    const [nextCursor, keys] = await garnet.scan(cursor, 'MATCH', `${AUTH_SESSION_PREFIX}*`, 'COUNT', '100')
    cursor = nextCursor
    for (const key of keys) {
      const raw = await garnet.get(key)
      if (!raw) continue
      try {
        const session = JSON.parse(raw) as AuthSession
        const dbUser = await findUserByUsername(session.userName)
        if (!dbUser) continue
        const { password: _password, ...user } = dbUser
        session.user = user
        session.roles = await getUserRoleKeys(user)
        session.permissions = await getUserPermissions(user.userId)
        await saveAuthSession(session)
      } catch (error) {
        console.error('[NitroWrite:SessionRefresh] failed:', errorMessage(error, 'unknown error'))
      }
    }
  } while (cursor !== '0')
}

export async function queryOne(connection: PoolConnection, sql: string, params: unknown[] = []): Promise<RowDataPacket | null> {
  const [rows] = await connection.query<RowDataPacket[]>(mysqlQueryOptions(sql), params)
  return rows[0] || null
}

export async function assertExists(connection: PoolConnection, sql: string, params: unknown[], message: string): Promise<RowDataPacket> {
  const row = await queryOne(connection, sql, params)
  if (!row) writeFail(message)
  return row
}

function normalizeClientIp(raw: unknown): string {
  const first = String(raw || '').split(',')[0]?.trim() || ''
  return first.replace(/^::ffff:/i, '')
}

export function extractClientIp(event: H3Event, fallbackIp = ''): string {
  const headerIp = normalizeClientIp(getHeader(event, 'x-forwarded-for'))
    || normalizeClientIp(getHeader(event, 'x-real-ip'))
    || normalizeClientIp(getHeader(event, 'remote-host'))
  const socketIp = normalizeClientIp(event?.node?.req?.socket?.remoteAddress)
  const resolved = headerIp || socketIp || normalizeClientIp(fallbackIp) || '0.0.0.0'
  return resolved.slice(0, 128)
}

export async function insertOperationLog(
  event: H3Event,
  connection: PoolConnection,
  session: AuthSession,
  title: string,
  businessType: number,
  body: unknown,
  result: unknown = { code: 200 },
): Promise<void> {
  try {
    const requestUrl = getRequestURL(event).pathname.slice(0, 255)
    const operIp = extractClientIp(event, session?.ipaddr)
    const safeTitle = String(title || '').slice(0, 50)
    const requestMethod = String(event?.node?.req?.method || '').slice(0, 10)
    const operName = String(session?.userName || '').slice(0, 50)
    const parameter = JSON.stringify(redactLogValue(body)).slice(0, 2000)
    const jsonResult = JSON.stringify(result).slice(0, 2000)
    await connection.query(mysqlQueryOptions(`
      INSERT INTO sys_oper_log
        (title, business_type, method, request_method, operator_type, oper_name, dept_name,
         oper_url, oper_ip, oper_location, oper_param, json_result, status, error_msg, oper_time, cost_time)
      VALUES (?, ?, ?, ?, 0, ?, '', ?, ?, '', ?, ?, 0, '', NOW(), 0)
    `), [safeTitle, businessType, 'Nitro', requestMethod, operName, requestUrl, operIp, parameter, jsonResult])
  } catch (error) {
    // Java's @Log is asynchronous and must not turn a successful business write
    // into a failed request when the audit table is unavailable.
    console.error('[NitroWrite:OperationLog] failed:', errorMessage(error, 'unknown error'))
  }
}

/**
 * Record an audit row after a mutation that is committed by another data
 * source, such as the K3 SQL Server connection. The audit write is best effort
 * and must not turn a committed external mutation into a false failure.
 */
export async function recordStandaloneOperationLog(
  event: H3Event,
  session: AuthSession,
  title: string,
  businessType: number,
  body: unknown,
  result: unknown = { code: 200 },
): Promise<void> {
  let connection: PoolConnection | undefined
  try {
    connection = await getMysqlPool().getConnection()
    await connection.beginTransaction()
    await insertOperationLog(event, connection, session, title, businessType, body, result)
    await connection.commit()
  } catch (error) {
    if (connection) {
      try { await connection.rollback() } catch (rollbackError) {
        console.error('[NitroWrite:StandaloneOperationLog] rollback failed:', errorMessage(rollbackError, 'unknown error'))
      }
    }
    console.error('[NitroWrite:StandaloneOperationLog] failed:', errorMessage(error, 'unknown error'))
  } finally {
    connection?.release()
  }
}

function redactLogValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactLogValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => {
    const lowered = key.toLowerCase()
    return [key, /password|passwd|token|secret|authorization/i.test(lowered) ? '[redacted]' : redactLogValue(item)]
  }))
}
