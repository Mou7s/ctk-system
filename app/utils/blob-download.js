/**
 * 导出/下载响应体判定。
 *
 * Nitro 的业务失败统一返回 HTTP 200 + application/json（如 { code, msg }），
 * 当请求带了 responseType: 'blob' 时，这段 JSON 会被当成二进制落成假文件，
 * 因此必须在下载前按内容类型识别。注意 Content-Type 可能带 charset 后缀。
 */

const JSON_CONTENT_TYPE = /^application\/(?:[\w.+-]*\+)?json\b/i

export function isJsonBlob(data) {
  return JSON_CONTENT_TYPE.test(String(data?.type || ''))
}

/**
 * 命中 JSON 错误体时返回可展示的 msg；正常文件返回空串。
 */
export async function readBlobErrorMessage(data, fallback = '导出失败，请检查金蝶连接或稍后重试') {
  if (!isJsonBlob(data)) return ''
  try {
    const parsed = JSON.parse(await data.text())
    return String(parsed?.msg || '') || fallback
  } catch {
    return fallback
  }
}
