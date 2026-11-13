import { getHeader, readBody } from 'h3'
import { getAuthSession, type AuthSession } from './auth'
import { ExecuteSqlInputError } from './execute-sql'
import { K3CloudError } from './k3'
import { apiError, apiSuccess, errorMessage } from './response'
import { SqlServerError } from './sqlserver'
import {
  claimWriteRequest,
  finishWriteRequest,
  recordStandaloneOperationLog,
  releaseWriteRequest,
  text,
  type IdempotencyClaim,
  NitroWriteError,
} from './write'

export type ExecuteSqlOperationResult = Record<string, unknown>
export type ExecuteSqlNotificationResult = {
  status: 'sent' | 'failed' | 'skipped'
  message?: string
}

export class ExecuteSqlPartialError extends Error {
  readonly statusCode = 502
  readonly data: ExecuteSqlOperationResult

  constructor(message: string, data: ExecuteSqlOperationResult) {
    super(message)
    this.name = 'ExecuteSqlPartialError'
    this.data = data
  }
}

type ExecuteSqlOperation = (
  body: Record<string, unknown>,
  session: AuthSession,
) => Promise<ExecuteSqlOperationResult>

type ExecuteSqlNotify = (
  outcome: 'success' | 'failure',
  durationMs: number,
) => Promise<ExecuteSqlNotificationResult>

async function safeNotify(
  notify: ExecuteSqlNotify | undefined,
  outcome: 'success' | 'failure',
  durationMs: number,
): Promise<ExecuteSqlNotificationResult | undefined> {
  if (!notify) return undefined
  try {
    return await notify(outcome, durationMs)
  } catch (error) {
    console.error('[NitroExecuteSql:notification]', errorMessage(error, '企业微信通知失败'))
    return { status: 'failed', message: '企业微信通知失败' }
  }
}

export function createExecuteSqlRoute(options: {
  label: string
  title: string
  businessType?: number
  operation: ExecuteSqlOperation
  notify?: ExecuteSqlNotify
}) {
  return async (event: any) => {
    const authenticated = await getAuthSession(event)
    if (!authenticated) return apiError('登录状态已过期', 401)

    const rawBody = await readBody<unknown>(event)
    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
      return apiError('请求参数不符合规范', 400)
    }
    const body = rawBody as Record<string, unknown>
    const requestId = text(getHeader(event, 'idempotency-key')) || text(body.requestId)
    if (!requestId) return apiError('幂等键不能为空', 400)
    const reason = text(body.reason)
    if (!reason) return apiError('操作原因不能为空', 400)
    if (reason.length > 255) return apiError('操作原因长度不能超过255个字符', 400)
    const requestBody = { ...body, requestId, reason }

    let claim: IdempotencyClaim
    try {
      claim = await claimWriteRequest(
        authenticated.session,
        `kingdee:${options.label}`,
        requestId,
        requestBody,
      )
    } catch (error) {
      if (error instanceof NitroWriteError) return apiError(error.message, error.statusCode)
      console.error(`[NitroExecuteSql:${options.label}:idempotency]`, errorMessage(error, 'unknown error'))
      return apiError('幂等状态服务不可用', 503)
    }
    if ('replay' in claim) return claim.replay

    const startedAt = Date.now()
    let response: any
    try {
      const result = await options.operation(requestBody, authenticated.session)
      const durationMs = Date.now() - startedAt
      const notification = await safeNotify(options.notify, 'success', durationMs)
      const data = {
        operation: options.label,
        status: 'success',
        durationMs,
        ...result,
        ...(notification
          ? { notificationStatus: notification.status, notificationMessage: notification.message }
          : {}),
      }
      response = apiSuccess(data, `${options.title}成功`)
      await finishWriteRequest(claim, response).catch((error) => {
        console.error(`[NitroExecuteSql:${options.label}:idempotency-finish]`, errorMessage(error, 'unknown error'))
      })
    } catch (error) {
      const durationMs = Date.now() - startedAt
      const notification = await safeNotify(options.notify, 'failure', durationMs)
      const detail = error instanceof ExecuteSqlPartialError
        ? error.data
        : {}
      const status = error instanceof ExecuteSqlPartialError ? 'partial' : 'failed'
      const data = {
        operation: options.label,
        status,
        durationMs,
        ...detail,
        ...(notification
          ? { notificationStatus: notification.status, notificationMessage: notification.message }
          : {}),
      }
      const statusCode = error instanceof ExecuteSqlInputError || error instanceof SqlServerError || error instanceof K3CloudError || error instanceof ExecuteSqlPartialError
        ? error.statusCode
        : Number((error as { statusCode?: number })?.statusCode) || 502
      const message = error instanceof ExecuteSqlInputError || error instanceof SqlServerError || error instanceof K3CloudError || error instanceof ExecuteSqlPartialError
        ? error.message
        : '金蝶快捷指令执行失败，请检查后端依赖或稍后重试'
      response = apiError(message, statusCode, data)
      if (error instanceof ExecuteSqlPartialError) {
        await finishWriteRequest(claim, response).catch((finishError) => {
          console.error(`[NitroExecuteSql:${options.label}:idempotency-finish]`, errorMessage(finishError, 'unknown error'))
        })
      } else {
        await releaseWriteRequest(claim).catch((releaseError) => {
          console.error(`[NitroExecuteSql:${options.label}:idempotency-release]`, errorMessage(releaseError, 'unknown error'))
        })
      }
      console.error(`[NitroExecuteSql:${options.label}]`, errorMessage(error, message))
    }

    try {
      await recordStandaloneOperationLog(
        event,
        authenticated.session,
        options.title,
        options.businessType ?? 2,
        requestBody,
        response,
      )
    } catch (error) {
      // The SQL/K3 operation has already completed. An audit-log failure must
      // never turn a committed business result into a false failure.
      console.error(`[NitroExecuteSql:${options.label}:audit]`, errorMessage(error, '操作日志记录失败'))
    }
    return response
  }
}
