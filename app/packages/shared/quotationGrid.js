// 报价明细网格的列定义与单元格归一化（唯一来源）。
// 2026-09-16 新模板口径：报价日期/交期行级，新增国家、客户性质、友商型号、汇率、备注，
// 取消产品描述；美元价不手填 —— 千只美元价 = 人民币单价 ÷ 汇率，1只美元价 = 千只价 ÷ 1000。
import { normalizeQuotationOptionValue, quotationOptionRule } from './quotationOptions.js'

const NUMERIC_QUOTATION_GRID_KEYS = new Set([
  'qty',
  'originalPriceRmb',
  'originalPriceUsd',
  'rate',
  'initialPriceRmb',
  'initialPriceUsd',
  'finalPriceRmb',
  'finalPriceUsd',
])

// 单价列统一两位小数：手输 12.4444 也按 12.44 落库，避免页面显示与保存值不一致
const QUOTATION_GRID_PRICE_KEYS = new Set([
  'originalPriceRmb',
  'originalPriceUsd',
  'initialPriceRmb',
  'initialPriceUsd',
  'finalPriceRmb',
  'finalPriceUsd',
])

// 汇率单独四位小数
const QUOTATION_GRID_RATE_KEYS = new Set(['rate'])

// 列定义（唯一来源）：终端客户、国家/客户性质/客户/报价日期/汇率均属于单头；这里仅放物料明细。
export const QUOTATION_GRID_BASE_COLUMNS = [
  { prop: 'application', name: '应用', size: 130 },
  { prop: 'manufacturer', name: '友商', size: 120 },
  { prop: 'manufacturerMpn', name: '友商型号', size: 130 },
  { prop: 'qty', name: '数量', size: 90 },
  { prop: 'materialCode', name: '物料编码', size: 150 },
  { prop: 'ctkMpn', name: '物料名称', size: 200 },
  { prop: 'packageName', name: '封装', size: 100 },
  { prop: 'dieSize', name: '芯片大小', size: 110 },
  { prop: 'spqReel', name: 'SPQ / Reel', size: 110 },
]

export const QUOTATION_GRID_DATASHEET_COLUMN = { prop: 'datasheet', name: '规格书', size: 160 }

// Excel 模板整块粘贴列序，独立于页面显示顺序。
// 美元两列（usdKpcs / usdPc）是按人民币价与汇率算出来的只读列，粘贴时忽略。
export const QUOTATION_GRID_PASTE_COLUMN_PROPS = [
  'materialCode',
  'ctkMpn',
  'packageName',
  'originalPriceRmb',
  'application',
  'manufacturer',
  'manufacturerMpn',
  'qty',
  'dieSize',
  'spqReel',
  'usdKpcs',
  'usdPc',
  'leadTime',
  'datasheet',
  'remark',
]

// 外贸显示列序：芯片大小紧跟封装，保留 Excel 模板整块粘贴映射。
export const QUOTATION_GRID_DISPLAY_COLUMN_PROPS = QUOTATION_GRID_PASTE_COLUMN_PROPS
  .filter((prop) => prop !== 'dieSize')
  .flatMap((prop) => prop === 'packageName' ? [prop, 'dieSize'] : [prop])

export function roundQuotationPrice(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return value
  return Math.round((number + Number.EPSILON) * 100) / 100
}

/** 汇率保留四位小数 */
export function roundQuotationRate(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return value
  return Math.round((number + Number.EPSILON) * 10000) / 10000
}

/** 千只美元价 = 人民币单价 ÷ 汇率（汇率缺失或非正数时算不出） */
export function computeQuotationUsdKpcs(rmb, rate) {
  const price = Number(rmb)
  const exchange = Number(rate)
  if (!Number.isFinite(price) || !Number.isFinite(exchange) || exchange <= 0) return null
  return roundQuotationPrice(price / exchange)
}

// ── 交期列的日期口径 ───────────────────────────────────────────────────────
// 模板里交期是「英语(美国)」日期格式（07-Mar-01 = dd-mmm-yy），服务端下载时把 ISO 写成
// Excel 序列号并套这个格式。所以：
//   · 页面显示 = dd-mmm-yy（和 Excel 里看到的一样）
//   · 落库/提交 = YYYY-MM-DD（服务端 excelDateSerial 只认这个，别把显示文本存进去）
// 文本交期（如 "30days"）两边都原样保留。
const QUOTATION_LEAD_TIME_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const QUOTATION_LEAD_TIME_MONTH_INDEX = QUOTATION_LEAD_TIME_MONTHS
  .reduce((map, name, index) => ({ ...map, [name.toLowerCase()]: index + 1 }), {})
// 序列号小于这个值不按日期解释（和解析器同一道门槛：填 30 表示「30 天」而不是 1900-01-30）
const QUOTATION_LEAD_TIME_SERIAL_MIN = 20000

function pad2(value) {
  return String(value).padStart(2, '0')
}

function isoFromParts(year, month, day) {
  const y = Number(year)
  const m = Number(month)
  const d = Number(day)
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return `${String(y).padStart(4, '0')}-${pad2(m)}-${pad2(d)}`
}

/** 两位年按 Excel 的口径还原：00-29 → 20xx，30-99 → 19xx */
function fullYear(value) {
  const text = String(value)
  if (text.length === 4) return text
  const yy = Number(text)
  if (!Number.isFinite(yy)) return null
  return String(yy < 30 ? 2000 + yy : 1900 + yy)
}

function isoFromExcelSerial(serial) {
  const days = Number(serial)
  if (!Number.isFinite(days) || days <= QUOTATION_LEAD_TIME_SERIAL_MIN) return null
  const date = new Date(Math.round((days - 25569) * 86400000))
  if (Number.isNaN(date.getTime())) return null
  return isoFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
}

/**
 * 任意写法 → YYYY-MM-DD；不是日期（如 "30days"、空值）返回 null。
 * 认：Date、Excel 序列号、"2026-12-01"、"2026/12/1"、"01-Dec-26"、"1-Dec-2026"。
 */
export function quotationLeadTimeIso(value) {
  if (value == null || String(value).trim() === '') return null
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return isoFromParts(value.getFullYear(), value.getMonth() + 1, value.getDate())
  }
  if (typeof value === 'number') return isoFromExcelSerial(value)

  const raw = String(value).trim()
  const ymd = /^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/u.exec(raw)
  if (ymd) return isoFromParts(ymd[1], ymd[2], ymd[3])
  // 注意交替顺序：\d{4} 必须写在 \d{2} 前面，否则 '1-Dec-2026' 只会吃到 '20'（2020 年）
  const dMy = /^(\d{1,2})[\s\/-]([A-Za-z]{3,})[\s\/-](\d{4}|\d{2})/u.exec(raw)
  if (dMy) {
    const month = QUOTATION_LEAD_TIME_MONTH_INDEX[dMy[2].slice(0, 3).toLowerCase()]
    if (!month) return null
    return isoFromParts(fullYear(dMy[3]), month, dMy[1])
  }
  const serial = /^\d{5}(\.\d+)?$/u.exec(raw)
  return serial ? isoFromExcelSerial(Number(raw)) : null
}

// ── 报价日期列的日期口径 ───────────────────────────────────────────────────
// 报价日期在模板 B 列（格式 yyyy-mm-dd）与库里都是 YYYY-MM-DD，只有网格单元格是自由输入口：
// 不统一就会出现 2026/9/18、2026.9.8、Excel 序列号这些写法（用户 2026-09-18 口径：这一列
// 也要按 YYYY-MM-DD 显示与填写，和交期一样只留一套日期口径）。
//   · 页面显示 = YYYY-MM-DD
//   · 落库/提交 = YYYY-MM-DD（服务端 dateOnly 只认这个：第N行报价日期格式必须为YYYY-MM-DD）
// 认不出来的写法原样保留，不悄悄丢掉业务员填的内容；页面在明细工具条提示「不是日期」，
// 提交时按行报错（与服务端同一句话的口径）。
/**
 * 任意写法 → YYYY-MM-DD；不是日期返回 null。认：
 * Date、Excel 序列号、`2026-9-8` / `2026/9/8` / `2026.9.8`、只填年月 `2026-9`（按 1 号）、
 * `08-Sep-26` / `8-Sep-2026`。
 */
export function quotationDateIso(value) {
  if (value == null || String(value).trim() === '') return null
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return isoFromParts(value.getFullYear(), value.getMonth() + 1, value.getDate())
  }
  if (typeof value === 'number') return isoFromExcelSerial(value)

  const raw = String(value).trim()
  const ymd = /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/u.exec(raw)
  if (ymd) return isoFromParts(ymd[1], ymd[2], ymd[3])
  // 只填年月（历史数据里出现过「2026-9」）：按当月 1 号，与粘贴解析 cleanQuoteDate 同口径
  const monthOnly = /^(\d{4})[\/\-.](\d{1,2})$/u.exec(raw)
  if (monthOnly) return isoFromParts(monthOnly[1], monthOnly[2], 1)
  // 注意交替顺序：\d{4} 必须写在 \d{2} 前面，否则 '1-Sep-2026' 只会吃到 '20'
  const dMy = /^(\d{1,2})[\s\/\-]([A-Za-z]{3,})[\s\/\-](\d{4}|\d{2})/u.exec(raw)
  if (dMy) {
    const month = QUOTATION_LEAD_TIME_MONTH_INDEX[dMy[2].slice(0, 3).toLowerCase()]
    if (!month) return null
    return isoFromParts(fullYear(dMy[3]), month, dMy[1])
  }
  const serial = /^\d{5}(\.\d+)?$/u.exec(raw)
  return serial ? isoFromExcelSerial(Number(raw)) : null
}

/** 页面显示：统一 YYYY-MM-DD（2026/9/18 → 2026-09-18）；认不出来的写法原样，空值给空串 */
export function formatQuotationDate(value) {
  const iso = quotationDateIso(value)
  if (iso) return iso
  return value == null ? '' : String(value).trim()
}

/** 落库/提交：日期归一成 ISO，认不出的写法原样（唯一入口，别在别处再写一套） */
export function normalizeQuotationDate(value) {
  if (value == null || String(value).trim() === '') return ''
  return quotationDateIso(value) || String(value).trim()
}

/** 页面显示：日期 → Excel 的 dd-mmm-yy（01-Dec-26），文本交期原样 */
export function formatQuotationLeadTime(value) {
  const iso = quotationLeadTimeIso(value)
  if (!iso) return value == null ? '' : String(value).trim()
  const [year, month, day] = iso.split('-')
  return `${day}-${QUOTATION_LEAD_TIME_MONTHS[Number(month) - 1]}-${year.slice(2)}`
}

/** 落库/提交：日期归一成 ISO，文本原样（唯一入口，别在别处再写一套） */
export function normalizeQuotationLeadTime(value) {
  if (value == null || String(value).trim() === '') return ''
  const iso = quotationLeadTimeIso(value)
  return iso || String(value).trim()
}

/** 1只美元价 = 千只美元价 ÷ 1000（保留五位小数，2026-09-24 口径：四位会把 0.00175 截成 0.0018）
 *  千只价算不出来（空值/'')时返回 null 而不是 0：Number(null) === 0 会让页面显示成
 *  $0.00000，看着像「已经算过了」。服务端 computeUsdPricePc 也是「usd 为空就为空」。
 */
export function computeQuotationUsdPc(usdKpcs) {
  if (usdKpcs == null || String(usdKpcs).trim() === '') return null
  const value = Number(usdKpcs)
  if (!Number.isFinite(value)) return null
  return Math.round((value / 1000 + Number.EPSILON) * 100000) / 100000
}

// 单元格显示文本：先按两位小数归一再去 toFixed，
// 否则 52.005 这类二进制表示误差会让显示的两位与存取的值差一分钱。
export function formatQuotationPrice(value) {
  if (value == null || String(value).trim() === '') return ''
  const number = Number(value)
  if (!Number.isFinite(number)) return String(value)
  return roundQuotationPrice(number).toFixed(2)
}

/** 1只美元价的显示：金额很小，保留五位小数（与 computeQuotationUsdPc、导出同口径） */
export function formatQuotationUsdPc(value) {
  if (value == null || String(value).trim() === '') return ''
  const number = Number(value)
  if (!Number.isFinite(number)) return String(value)
  return (Math.round((number + Number.EPSILON) * 100000) / 100000).toFixed(5)
}

// RevoGrid 的行数据：单价列渲染成两位小数字符串（54 → '54.00'，12.4444 → '12.44'），
// 历史库里 4 位小数的旧单据在表格里也只看到两位。
export function buildQuotationGridSource(lines) {
  return (Array.isArray(lines) ? lines : []).map((line) => {
    const next = { ...line }
    for (const prop of QUOTATION_GRID_PRICE_KEYS) {
      if (next[prop] != null && String(next[prop]).trim() !== '') next[prop] = formatQuotationPrice(next[prop])
    }
    if (next.rate != null && String(next.rate).trim() !== '') next.rate = roundQuotationRate(next.rate)
    // 美元两列是按人民币价与汇率算出来的只读展示列（不手填、不单独落库）
    const usdKpcs = computeQuotationUsdKpcs(line?.originalPriceRmb, line?.rate)
    next.usdKpcs = formatQuotationPrice(usdKpcs)
    next.usdPc = formatQuotationUsdPc(computeQuotationUsdPc(usdKpcs))
    // 交期：网格里显示成 Excel 的 dd-mmm-yy，跟模板/打印出来的报价单长得一样
    next.leadTime = formatQuotationLeadTime(line?.leadTime)
    // 报价日期：网格里统一成 YYYY-MM-DD（模板 B 列、库里、导出都是这个格式）
    next.quoteDate = formatQuotationDate(line?.quoteDate)
    // displayPrice* = 成交价：只在终审通过时冻结（业务员报价看 originalPrice* 列）
    next.displayPriceRmb = formatQuotationPrice(line?.finalPriceRmb)
    next.displayPriceUsd = formatQuotationPrice(line?.finalPriceUsd)
    return next
  })
}

export function normalizeGridValue(prop, value) {
  // 报价日期：手输/粘贴进来的 2026/9/18、2026.9.8、Excel 序列号都要回落成落库口径 YYYY-MM-DD
  if (String(prop) === 'quoteDate') return normalizeQuotationDate(value)
  // 交期：编辑/粘贴进来的 dd-mmm-yy 也要回落成落库口径 YYYY-MM-DD
  if (String(prop) === 'leadTime') return normalizeQuotationLeadTime(value)
  // 选项列（国家/客户性质/单位）：手输 KPCS 这类写法统一成清单里的 kpcs
  if (quotationOptionRule(String(prop))) return String(normalizeQuotationOptionValue(prop, value == null ? '' : value) ?? '')
  if (String(prop) === 'materialCode') {
    if (value == null) return ''
    if (typeof value === 'object') {
      const extracted = String(value.materialCode || value.number || value.value || '').trim()
      return extracted === '[object Object]' ? '' : extracted
    }
    const str = String(value).trim()
    return str === '[object Object]' ? '' : str
  }
  // 物料名称与封装：若传入了选项对象或脏字符串 [object Object]，解构成可读字符串
  if (String(prop) === 'ctkMpn') {
    if (value == null) return ''
    if (typeof value === 'object') {
      const extracted = String(value.ctkMpn || value.value || value.name || value.number || '').trim()
      return extracted === '[object Object]' ? '' : extracted
    }
    const str = String(value).trim()
    return str === '[object Object]' ? '' : str
  }
  if (String(prop) === 'packageName') {
    if (value == null) return ''
    if (typeof value === 'object') {
      const extracted = String(value.packageName || value.value || value.name || '').trim()
      return extracted === '[object Object]' ? '' : extracted
    }
    const str = String(value).trim()
    return str === '[object Object]' ? '' : str
  }
  if (!NUMERIC_QUOTATION_GRID_KEYS.has(String(prop))) return value ?? ''
  if (value == null || String(value).trim() === '') return null
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    if (QUOTATION_GRID_RATE_KEYS.has(String(prop))) return roundQuotationRate(value)
    return QUOTATION_GRID_PRICE_KEYS.has(String(prop)) ? roundQuotationPrice(value) : value
  }

  // 单价列常带货币符号（Excel / 页面列表复制出来就是 ￥49.20、$4.50），先剥符号再解析，
  // 否则 Number('￥49.20') 是 NaN，值会以文本原样显示在单元格里。
  const normalized = QUOTATION_GRID_PRICE_KEYS.has(String(prop)) || QUOTATION_GRID_RATE_KEYS.has(String(prop))
    ? String(value).replace(/[￥¥$,]/g, '').trim()
    : String(value).replace(/,/g, '').trim()
  const number = Number(normalized)
  if (!Number.isFinite(number)) return value
  if (QUOTATION_GRID_RATE_KEYS.has(String(prop))) return roundQuotationRate(number)
  return QUOTATION_GRID_PRICE_KEYS.has(String(prop)) ? roundQuotationPrice(number) : number
}

function applyModelPatch(line, model, prop, value) {
  const next = { ...(line || {}), ...(model || {}) }
  if (prop != null && value !== undefined) next[prop] = value
  return Object.fromEntries(Object.entries(next).map(([key, item]) => [key, normalizeGridValue(key, item)]))
}

export function applyQuotationGridEdit(existingLines, detail = {}) {
  const nextLines = (Array.isArray(existingLines) ? existingLines : []).map((line) => ({ ...line }))
  const rowIndex = Number.isInteger(detail.rowIndex) ? detail.rowIndex : detail.rgRow
  const prop = detail.prop == null ? null : String(detail.prop)

  if (Number.isInteger(rowIndex) && rowIndex >= 0) {
    nextLines[rowIndex] = applyModelPatch(nextLines[rowIndex], detail.model, prop, detail.val)
  }

  const models = detail.models || detail.data
  if (models && typeof models === 'object') {
    Object.entries(models).forEach(([index, model]) => {
      const row = Number(index)
      if (!Number.isInteger(row) || row < 0) return
      nextLines[row] = applyModelPatch(nextLines[row], model)
    })
  }

  return nextLines
}
