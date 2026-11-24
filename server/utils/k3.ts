import { getNitroK3Config } from './k3-config'
import type { NitroServerConfig } from './runtime'
import { isDemoScope } from './data-scope'
import { DemoModeError } from './demo'

const QUERY_SERVICE = 'Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.ExecuteBillQuery'
const LOGIN_SERVICE = 'Kingdee.BOS.WebApi.ServicesStub.AuthService.LoginByAppSecret'
const SAVE_SERVICE = 'Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.Save'
const PUSH_SERVICE = 'Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.Push'
const SUBMIT_SERVICE = 'Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.Submit'
const AUDIT_SERVICE = 'Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.Audit'
const UN_AUDIT_SERVICE = 'Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.UnAudit'
const DELETE_SERVICE = 'Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.Delete'

export interface K3QueryInput {
  formId: string
  fieldKeys: string | string[]
  filterString?: string | unknown[]
  orderString?: string
  topRowCount?: number
  startRow?: number
  limit?: number
  maxLimit?: number
  subSystemId?: string
}

export type K3FailureKind = 'config' | 'timeout' | 'unavailable' | 'permission' | 'query'

export class K3CloudError extends Error {
  readonly kind: K3FailureKind
  readonly statusCode: number

  constructor(kind: K3FailureKind, message: string, statusCode: number, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'K3CloudError'
    this.kind = kind
    this.statusCode = statusCode
  }
}

interface K3ClientState {
  cookie: string
  baseUrl: string
}

const globalState = globalThis as typeof globalThis & { __nitroK3State?: K3ClientState; __nitroK3Login?: Promise<void> }

function serviceUrl(baseUrl: string, service: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${service}.common.kdsvc`
}

function ensureK3NoProxy(baseUrl: string): void {
  let hostname = ''
  try {
    hostname = new URL(baseUrl).hostname
  } catch {
    return
  }
  if (!hostname) return

  for (const name of ['NO_PROXY', 'no_proxy']) {
    const entries = String(process.env[name] || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
    if (entries.includes('*') || entries.some((entry) => entry === hostname || entry === `.${hostname}`)) continue
    entries.push(hostname)
    process.env[name] = entries.join(',')
  }
}

function readCookie(response: Response): string | null {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] }
  const values = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : (headers.get('set-cookie') || '').split(/,(?=[^;]+=[^;]+)/)
  const cookies = values
    .map((value) => (value || '').trim().split(';', 1)[0] || '')
    .filter((value) => value.includes('='))
  return cookies.length ? cookies.join('; ') : null
}

function baseUrls(config: NitroServerConfig): string[] {
  return [config.k3BaseUrl, config.k3BaseUrlIntranet].filter(Boolean).filter((url, index, all) => all.indexOf(url) === index)
}

function timeoutMs(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(1000, parsed) : fallback
}

async function fetchWithTimeout(url: string, init: RequestInit, durationMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), durationMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (controller.signal.aborted) {
      throw new K3CloudError('timeout', 'K3Cloud 请求超时', 504, { cause: error })
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function classifyK3Error(error: unknown, fallback: K3FailureKind = 'unavailable'): K3CloudError {
  if (error instanceof K3CloudError) return error
  const value = error as { code?: string; message?: string } | null
  if (value?.code === 'ECONNRESET' || value?.code === 'ECONNREFUSED' || /fetch failed|socket|network|connect/i.test(String(value?.message || ''))) {
    return new K3CloudError('unavailable', 'K3Cloud 服务暂不可用', 502, { cause: error })
  }
  return new K3CloudError(fallback, fallback === 'query' ? 'K3Cloud 查询失败' : 'K3Cloud 服务暂不可用', 502, { cause: error })
}

function k3ResponseErrorMessage(body: any): string {
  const status = body?.Result?.ResponseStatus
  if (!status || typeof status !== 'object') return ''
  const errors = Array.isArray(status.Errors) ? status.Errors : []
  const failed = status.IsSuccess === false || Number(status.ErrorCode) >= 400 || errors.length > 0
  if (!failed) return ''
  const firstError = errors.find((item: any) => item?.Message)
  return String(firstError?.Message || body?.Message || 'K3Cloud 查询失败').trim()
}

function isK3SessionFailure(value: unknown): boolean {
  return /会话(?:信息)?(?:已丢失|失效|过期)|请重新登录|未登录|登录失效|登录过期|not\s*(?:login|logged?\s*in)|session\s*(?:lost|expired|invalid)/i.test(String(value ?? ''))
}

function requiredK3Config(name: string, value: string): string {
  if (!value) throw new K3CloudError('config', `缺少 ${name}`, 503)
  return value
}

async function loginWithBase(baseUrl: string, config: NitroServerConfig): Promise<string> {
  ensureK3NoProxy(baseUrl)
  const response = await fetchWithTimeout(serviceUrl(baseUrl, LOGIN_SERVICE), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      acctID: requiredK3Config('NUXT_K3_DBID', config.k3DbId),
      username: requiredK3Config('NUXT_K3_USERNAME', config.k3Username),
      appId: requiredK3Config('NUXT_K3_APP_ID', config.k3AppId),
      appSecret: requiredK3Config('NUXT_K3_APP_SECRET', config.k3AppSecret),
      lcid: config.k3Lcid,
    }),
  }, timeoutMs(config.k3ConnectTimeoutMs, 5000))
  const text = await response.text()
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new K3CloudError('permission', 'K3Cloud 登录权限失败', 502)
    throw new K3CloudError('unavailable', `K3Cloud 登录 HTTP ${response.status}`, 502)
  }
  let body: any = null
  try { body = JSON.parse(text) } catch { body = null }
  const responseError = k3ResponseErrorMessage(body)
  if (responseError) {
    throw new K3CloudError('permission', `K3Cloud 登录失败：${responseError}`, 502)
  }
  const status = body?.LoginResultType ?? body?.Result?.ResponseStatus
  if (body && typeof status === 'number' && status !== 1 && status !== 0) {
    throw new K3CloudError('permission', 'K3Cloud 登录被拒绝', 502)
  }
  return readCookie(response) || ''
}

async function ensureLogin(force = false): Promise<void> {
  const config = await getNitroK3Config()
  const urls = baseUrls(config)
  if (!urls.length) throw new K3CloudError('config', '缺少 NUXT_K3_BASE_URL', 503)
  if (!force && globalState.__nitroK3State?.cookie) return
  if (globalState.__nitroK3Login) return globalState.__nitroK3Login

  globalState.__nitroK3Login = (async () => {
    let lastError: unknown
    for (const baseUrl of urls) {
      try {
        const cookie = await loginWithBase(baseUrl, config)
        globalState.__nitroK3State = { cookie, baseUrl }
        return
      } catch (error) {
        lastError = classifyK3Error(error)
      }
    }
    throw lastError instanceof K3CloudError ? lastError : new K3CloudError('unavailable', 'K3Cloud 登录失败', 502)
  })().finally(() => {
    globalState.__nitroK3Login = undefined
  })

  return globalState.__nitroK3Login
}

async function requestRead(payload: unknown): Promise<any> {
  const config = await getNitroK3Config()
  await ensureLogin()
  const urls = baseUrls(config)
  const current = globalState.__nitroK3State
  const ordered = current ? [current.baseUrl, ...urls.filter((url) => url !== current.baseUrl)] : urls
  let lastError: unknown
  let authRetried = false

  for (let endpointIndex = 0; endpointIndex < ordered.length; endpointIndex++) {
    const baseUrl = ordered[endpointIndex]
    try {
      ensureK3NoProxy(baseUrl)
      const cookie = globalState.__nitroK3State?.baseUrl === baseUrl ? globalState.__nitroK3State.cookie : ''
      const response = await fetchWithTimeout(serviceUrl(baseUrl, QUERY_SERVICE), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify({ data: payload }),
      }, timeoutMs(config.k3RequestTimeoutMs, 30000))
      const text = await response.text()
      let body: any = null
      try { body = JSON.parse(text) } catch { body = text }
      const responseError = k3ResponseErrorMessage(body)
      if (response.status === 401 || isK3SessionFailure(responseError || text)) {
        if (authRetried) throw new K3CloudError('permission', 'K3Cloud 查询会话失效，请检查 K3Cloud 登录配置', 502)
        authRetried = true
        await ensureLogin(true)
        endpointIndex--
        continue
      }
      if (response.status === 403) throw new K3CloudError('permission', 'K3Cloud 查询权限失败', 502)
      if (!response.ok) throw new K3CloudError(response.status >= 500 ? 'unavailable' : 'query', `K3Cloud 查询 HTTP ${response.status}`, 502)
      if (responseError) throw new K3CloudError('query', `K3Cloud 查询失败：${responseError}`, 502)
      globalState.__nitroK3State = { baseUrl, cookie: readCookie(response) || cookie }
      return body
    } catch (error) {
      lastError = classifyK3Error(error, 'query')
    }
  }

  throw lastError instanceof K3CloudError ? lastError : new K3CloudError('unavailable', 'K3Cloud 查询失败', 502)
}

export async function executeBillQuery(input: K3QueryInput): Promise<any> {
  if (isDemoScope()) return []
  const fieldKeys = Array.isArray(input.fieldKeys) ? input.fieldKeys.join(',') : input.fieldKeys
  return requestRead({
    FormId: input.formId,
    FieldKeys: fieldKeys,
    FilterString: input.filterString ?? [],
    OrderString: input.orderString || '',
    TopRowCount: input.topRowCount || 0,
    StartRow: Math.max(0, input.startRow || 0),
    Limit: Math.min(Math.max(1, input.limit || 1000), Math.max(1, input.maxLimit || 5000)),
    SubSystemId: input.subSystemId || '',
  })
}

export interface K3OperationResult {
  raw: any
  responseStatus: any
  successEntities: any[]
}

function operationMessage(body: any): string {
  const status = body?.Result?.ResponseStatus
  const error = Array.isArray(status?.Errors) ? status.Errors.find((item: any) => item?.Message) : null
  return String(error?.Message || body?.Message || 'K3Cloud 操作失败')
}

function operationResult(body: any, action: string, requireEntity = false): K3OperationResult {
  const status = body?.Result?.ResponseStatus
  if (!status || status.IsSuccess !== true) {
    throw new K3CloudError('query', `${action}失败：${operationMessage(body)}`, 502)
  }
  const successEntities = Array.isArray(status.SuccessEntitys) ? status.SuccessEntitys : []
  if (requireEntity && !successEntities.length) {
    throw new K3CloudError('query', `${action}成功但未返回单据结果`, 502)
  }
  return { raw: body, responseStatus: status, successEntities }
}

async function requestOperation(
  service: string,
  formId: string,
  data: unknown,
  options: { retryOnAuthFailure?: boolean } = {},
): Promise<any> {
  const config = await getNitroK3Config()
  await ensureLogin()
  const urls = baseUrls(config)
  const current = globalState.__nitroK3State
  const ordered = current ? [current.baseUrl, ...urls.filter((url) => url !== current.baseUrl)] : urls
  let lastError: unknown
  let authRetried = false

  for (let endpointIndex = 0; endpointIndex < ordered.length; endpointIndex++) {
    const baseUrl = ordered[endpointIndex]
    try {
      ensureK3NoProxy(baseUrl)
      const cookie = globalState.__nitroK3State?.baseUrl === baseUrl ? globalState.__nitroK3State.cookie : ''
      const response = await fetchWithTimeout(serviceUrl(baseUrl, service), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify({ parameters: [formId, typeof data === 'string' ? data : JSON.stringify(data)] }),
      }, timeoutMs(config.k3RequestTimeoutMs, 30000))
      const text = await response.text()
      let body: any = null
      try { body = JSON.parse(text) } catch { body = text }
      const responseError = k3ResponseErrorMessage(body)
      if (response.status === 401 || isK3SessionFailure(responseError || text)) {
        if (options.retryOnAuthFailure === false) {
          throw new K3CloudError('permission', 'K3Cloud 操作会话失效，未自动重试', 502)
        }
        if (authRetried) throw new K3CloudError('permission', 'K3Cloud 操作会话失效，请检查 K3Cloud 登录配置', 502)
        authRetried = true
        await ensureLogin(true)
        endpointIndex--
        continue
      }
      if (response.status === 403) throw new K3CloudError('permission', 'K3Cloud 操作权限失败', 502)
      if (!response.ok) throw new K3CloudError(response.status >= 500 ? 'unavailable' : 'query', `K3Cloud 操作 HTTP ${response.status}`, 502)
      if (responseError) throw new K3CloudError('query', `K3Cloud 操作失败：${responseError}`, 502)
      globalState.__nitroK3State = { baseUrl, cookie: readCookie(response) || cookie }
      return body
    } catch (error) {
      if (options.retryOnAuthFailure === false) throw error
      lastError = classifyK3Error(error, 'query')
    }
  }

  throw lastError instanceof K3CloudError ? lastError : new K3CloudError('unavailable', 'K3Cloud 操作失败', 502)
}

export async function saveBill(formId: string, payload: Record<string, unknown>, action = '保存单据', requireEntity = false): Promise<K3OperationResult> {
  if (isDemoScope()) throw new DemoModeError()
  const response = await requestOperation(SAVE_SERVICE, requiredK3Config('FormId', formId), payload)
  return operationResult(response, action, requireEntity)
}

export async function submitBill(formId: string, numbers: string[], action = '提交单据'): Promise<K3OperationResult> {
  if (isDemoScope()) throw new DemoModeError()
  if (!numbers.length) throw new K3CloudError('query', '提交单据号不能为空', 400)
  const response = await requestOperation(SUBMIT_SERVICE, requiredK3Config('FormId', formId), { Numbers: numbers })
  return operationResult(response, action)
}

export async function pushBill(formId: string, payload: Record<string, unknown>, action = '下推单据', requireEntity = true): Promise<K3OperationResult> {
  if (isDemoScope()) throw new DemoModeError()
  const response = await requestOperation(PUSH_SERVICE, requiredK3Config('FormId', formId), payload)
  return operationResult(response, action, requireEntity)
}

export async function auditBill(formId: string, numbers: string[], action = '审核单据'): Promise<K3OperationResult> {
  if (isDemoScope()) throw new DemoModeError()
  if (!numbers.length) throw new K3CloudError('query', '审核单据号不能为空', 400)
  const response = await requestOperation(AUDIT_SERVICE, requiredK3Config('FormId', formId), { Numbers: numbers })
  return operationResult(response, action)
}

export async function unAuditBill(formId: string, numbers: string[], action = '反审核单据'): Promise<K3OperationResult> {
  if (isDemoScope()) throw new DemoModeError()
  if (!numbers.length) throw new K3CloudError('query', '反审核单据号不能为空', 400)
  const response = await requestOperation(
    UN_AUDIT_SERVICE,
    requiredK3Config('FormId', formId),
    { Numbers: numbers },
    { retryOnAuthFailure: false },
  )
  return operationResult(response, action)
}

export async function deleteBill(formId: string, numbers: string[], action = '删除单据'): Promise<K3OperationResult> {
  if (isDemoScope()) throw new DemoModeError()
  if (!numbers.length) throw new K3CloudError('query', '删除单据号不能为空', 400)
  const response = await requestOperation(
    DELETE_SERVICE,
    requiredK3Config('FormId', formId),
    { Numbers: numbers },
    { retryOnAuthFailure: false },
  )
  return operationResult(response, action)
}

export async function checkK3Connection(): Promise<{ baseUrl: string; loggedIn: true }> {
  if (isDemoScope()) throw new DemoModeError()
  await ensureLogin()
  return { baseUrl: globalState.__nitroK3State?.baseUrl || '', loggedIn: true }
}
