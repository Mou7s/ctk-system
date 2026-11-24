import { readBody } from 'h3'
import { getAuthSession, hasPermission } from '../../../utils/auth'
import { executeBillQuery, K3CloudError } from '../../../utils/k3'
import { apiError, apiSuccess, errorMessage } from '../../../utils/response'

export default defineEventHandler(async (event) => {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)
  if (!hasPermission(authenticated.session, 'tk_custom:kingdee:query')) return apiError('无权查询金蝶数据', 403)

  const body = await readBody<Record<string, unknown>>(event)
  const formId = String(body?.formId || '').trim()
  const fieldKeys = body?.fieldKeys
  if (!/^[A-Z][A-Za-z0-9_]+$/.test(formId) || (!Array.isArray(fieldKeys) && typeof fieldKeys !== 'string')) {
    return apiError('金蝶查询参数不合法', 400)
  }
  if (String(fieldKeys).length > 4000 || String(body?.filterString || '').length > 8000) {
    return apiError('金蝶查询参数过长', 400)
  }

  try {
    return apiSuccess(await executeBillQuery({
      formId,
      fieldKeys: fieldKeys as string | string[],
      filterString: body?.filterString as string | unknown[] | undefined,
      orderString: typeof body?.orderString === 'string' ? body.orderString : '',
      startRow: Number(body?.startRow || 0),
      limit: Number(body?.limit || 1000),
    }))
  } catch (error) {
    if (error instanceof K3CloudError) {
      console.error(`[NitroK3:query:${error.kind}]`, errorMessage(error, 'unknown error'))
      return apiError(error.message, error.statusCode)
    }
    console.error('[NitroK3] query failed:', errorMessage(error, 'unknown error'))
    return apiError('金蝶查询失败', 502)
  }
})
