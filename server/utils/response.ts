export function apiSuccess<T>(data?: T, msg = '操作成功') {
  return {
    code: 200,
    msg,
    ...(data === undefined ? {} : { data }),
  }
}

// Legacy AjaxResult uses top-level fields for login, captcha, and
// user-info responses. Keep those endpoints compatible while ordinary list
// and detail responses continue to use the conventional `data` field.
export function apiSuccessFields<T extends Record<string, unknown>>(fields: T, msg = '操作成功') {
  return {
    code: 200,
    msg,
    ...fields,
  }
}

export function apiError(msg: string, code = 500, data?: unknown) {
  return {
    code,
    msg,
    ...(data === undefined ? {} : { data }),
  }
}

export function errorMessage(error: unknown, fallback = '操作失败'): string {
  const message = error instanceof Error && error.message ? error.message : fallback
  return message
    .replace(/((?:["']?(?:password|passwd|secret|token|authorization|appsecret|app_secret)["']?)\s*[:=]\s*["']?(?:Bearer\s+)?)[^\s,;&"']+/gi, '$1[redacted]')
    .replace(/(?:jdbc:)?mysql:\/\/[^\s]+/gi, 'mysql://[redacted]')
    .replace(/redis:\/\/[^\s]+/gi, 'redis://[redacted]')
}
