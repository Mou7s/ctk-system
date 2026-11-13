// 报价单「有效期」的统一口径（2026-09-18 用户口径）。
//
// 为什么只能给「天数」：
//   · 模板 A6 那句是 `Quotation Valid: ________ days`，导出时把有效期拼进这句话；
//   · 导入侧（服务端解析器 extractTermsSentence / 页面预览解析）只认
//     `Quotation Valid: 60 days` 这种「数字 + day(s)」写法，读出来存成 `60days`。
// 所以下拉里给的都是 <n>days；业务员手输的纯数字 / 周 / 月 / 中文「天」在导出时统一折算成天数，
// 保证「页面选什么 → 导出什么 → 再上传还能读回来」是同一条链路，不会导出成一句读不回来的话。
// 服务端同一份口径在 server/utils/quotation-validity.ts，spec 会对拍两边。
export const QUOTATION_VALIDITY_OPTIONS = [
  '7days',
  '15days',
  '30days',
  '45days',
  '60days',
  '90days',
  '120days',
  '180days',
]

export const QUOTATION_VALIDITY_UNIT = 'days'

/** 导入侧认的正则（页面预览解析用它构建 RegExp，服务端解析器保持同一份写法） */
export const QUOTATION_VALIDITY_PATTERN_SOURCE = 'quotation\\s*valid\\s*:\\s*([0-9]{1,4})\\s*days?'

// 折算口径：1 周 = 7 天；1 个月 = 30 天（模板那句话里没有「月」的位置，只能折成天数）
const VALIDITY_WEEK_DAYS = 7
const VALIDITY_MONTH_DAYS = 30

/**
 * 归一成导出用的 `<n>days`：
 *   '60' / '60days' / '60 days' / '60天'  → '60days'
 *   '2weeks' / '2w'                      → '14days'
 *   '3months' / '3mo'                    → '90days'
 * 认不出的写法原样返回（导出时不再硬拼 " days"，否则会写出「永久 days」这种句子）。
 */
export function normalizeQuotationValidity(value) {
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

/** 下拉里的标准档位判定（业务员手输的其它写法仍允许，只是不在下拉里） */
export function isQuotationValidityOption(value) {
  return QUOTATION_VALIDITY_OPTIONS.includes(String(value ?? '').trim())
}
