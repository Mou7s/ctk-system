/**
 * 报价单「有效期」的服务端口径（与 app/packages/shared/quotationValidity.js 同一份）。
 *
 * 模板 A6 那句是 `Quotation Valid: ________ days`：导出只认天数，
 * 导入也只认 `Quotation Valid: 60 days` 这种「数字 + day(s)」写法。
 * 所以这里负责两件事：
 *   ① 导出前把有效期归一成 `<n>days`（周/月/纯数字/中文「天」都折算，认不出的原样保留）；
 *   ② 导入时用同一份正则把这句话读回 `60days`，保证导出→再上传是同一条链路。
 * app/__tests__/quotation-validity.spec.js 会拿客户端那份与这里对拍。
 */
export const QUOTATION_VALIDITY_UNIT = 'days'

export const QUOTATION_VALIDITY_PATTERN_SOURCE = 'quotation\\s*valid\\s*:\\s*([0-9]{1,4})\\s*days?'

const VALIDITY_WEEK_DAYS = 7
const VALIDITY_MONTH_DAYS = 30

export function normalizeQuotationValidity(value: unknown): string {
  const raw = String(value ?? '').trim()
  if (raw === '') return ''
  const days = /^(\d{1,4})\s*(?:d|day|days|天|日)?$/iu.exec(raw)
  if (days) return `${Number(days[1])}${QUOTATION_VALIDITY_UNIT}`
  const weeks = /^(\d{1,4})\s*(?:w|wk|wks|week|weeks|周)$/iu.exec(raw)
  if (weeks) return `${Number(weeks[1]) * VALIDITY_WEEK_DAYS}${QUOTATION_VALIDITY_UNIT}`
  const months = /^(\d{1,4})\s*(?:m|mo|mos|month|months|个月|月)$/iu.exec(raw)
  if (months) return `${Number(months[1]) * VALIDITY_MONTH_DAYS}${QUOTATION_VALIDITY_UNIT}`
  return raw
}

/** 从 A6 整句话里读回有效期（读不到返回空串） */
export function extractQuotationValidity(text: unknown): string {
  const match = new RegExp(QUOTATION_VALIDITY_PATTERN_SOURCE, 'iu').exec(String(text ?? ''))
  return match ? `${match[1]}${QUOTATION_VALIDITY_UNIT}` : ''
}
