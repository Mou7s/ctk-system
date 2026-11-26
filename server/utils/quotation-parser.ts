import { domesticPriceToKpcs, domesticQuotationUnit } from '../../app/packages/shared/domesticQuotationUnits.js'
import { getXlsxSync } from './lazy-deps'
import { DEFAULT_QUOTATION_UNIT, formatQuotationOptionViolations, normalizeQuotationOptionValue, quotationOptionViolations } from './quotation-options'
import { extractQuotationValidity, normalizeQuotationValidity } from './quotation-validity'
import { isCurrentQuotationTemplateHeader } from '../../app/packages/shared/quotationColumns.js'

/**
 * 报价单明细行（2026-09-16 新模板「标准报价单模板」口径）：
 * - 报价日期 / 交期改为**行级**（单据级不再有这两个字段）；
 * - 新增国家、客户性质、友商型号、汇率、备注；
 * - 取消产品描述列（description 不再录入）；
 * - 美元价不手填：千只美元价 = 人民币单价 ÷ 汇率（自动算），单只美元价 = 千只价 ÷ 1000。
 */
export interface QuotationLineInput {
  lineNo: number
  quoteDate: string | null
  country: string
  customerStyle: string
  quoteTo: string
  endUser: string
  application: string
  customerMaterialName?: string
  minPackCount?: number | null
  manufacturer: string
  manufacturerMpn: string
  qty: number | null
  unit: string
  ctkMpn: string
  materialCode: string
  packageName: string
  dieSize: string
  spqReel: string
  originalPriceRmb: number | null
  rate: number | null
  /** 千只美元价（自动算，不接受手填） */
  originalPriceUsd: number | null
  leadTime: string
  datasheet: string
  remark: string
}

export interface ParsedQuotationWorkbook {
  sheetName: string
  deliveryTerms: string
  validity: string
  paymentTerm: string
  contact: string
  customerName: string
  city?: string
  customerAddress?: string
  customerPhone?: string
  customerApplication?: string
  endUser: string
  country?: string
  customerStyle?: string
  rate?: number | null
  quoteDate?: string | null
  lines: QuotationLineInput[]
}

function text(value: unknown): string {
  return String(value ?? '').trim()
}

const PLACEHOLDER_TEXT = /^(?:\/{1,2}|-{1,2}|n\/?a|null|undefined|待定|无|tbd|\?)$/iu

/**
 * 文本列清洗：客户表里用 /  -  N/A  待定 表示「没有」，入库前统一成空串。
 * 与 app/packages/shared/quotationText.js 的 cleanQuotationText 保持同一口径。
 */
export /** 选项列（国家/客户性质/单位）落库前统一成清单里的写法：KPCS → kpcs */
function optionText(key: string, value: unknown): string {
  return String(normalizeQuotationOptionValue(key, cleanQuotationText(value)) ?? '')
}

function cleanQuotationText(value: unknown): string {
  const cleaned = text(value).replace(/[\u00a0\u3000]/gu, ' ').trim()
  return PLACEHOLDER_TEXT.test(cleaned) ? '' : cleaned
}

function normalize(value: unknown): string {
  return text(value).replace(/\s+/gu, '').toLowerCase()
}

// 单价统一保留两位小数（人民币/美元同口径），与页面显示、导出保持一致
function roundPrice2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function parseMinPackCount(value: unknown, lineNo: number): number | null {
  if (value == null || text(value) === '') return null
  const count = Number(value)
  if (!Number.isFinite(count) || count < 0.000001 || count > 999999999999 || Math.abs(count * 1e6 - Math.round(count * 1e6)) > 0.001) throw new Error(`第${lineNo}行最小包装数必须为正数，KPCS最多6位小数`)
  return count
}

function parsePrice(value: unknown): number | null {
  if (value == null) return null
  const raw = text(value)
  if (!raw || PLACEHOLDER_TEXT.test(raw) || /^waiting$/iu.test(raw)) return null
  const cleaned = raw.replace(/[￥¥$,]/gu, '').trim()
  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed)) return null
  return roundPrice2(parsed)
}

/** 汇率：保留四位小数，必须为正数 */
function parseRate(value: unknown): number | null {
  if (value == null) return null
  const raw = text(value).replace(/[￥¥$,\s]/gu, '')
  if (!raw || PLACEHOLDER_TEXT.test(raw)) return null
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.round((parsed + Number.EPSILON) * 10000) / 10000
}

/** 千只美元价 = 人民币千只价 ÷ 汇率（缺任一则算不出，返回 null） */
export function computeUsdPriceKpcs(rmb: number | null, rate: number | null): number | null {
  if (rmb == null || rate == null || !Number.isFinite(rate) || rate <= 0) return null
  return roundPrice2(rmb / rate)
}

/** 单只美元价 = 千只美元价 ÷ 1000（不入库，页面与导出实时算；五位小数，与前端同口径） */
export function computeUsdPricePc(usdKpcs: number | null): number | null {
  if (usdKpcs == null || !Number.isFinite(usdKpcs)) return null
  return Math.round((usdKpcs / 1000 + Number.EPSILON) * 100000) / 100000
}

function nullableNumber(value: unknown): number | null {
  if (value == null || text(value) === '') return null
  const parsed = Number(text(value).replaceAll(',', ''))
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * 交期列在模板里是日期格式（英语(美国) 07-Mar-01）：Excel 里存的是日期序列号，
 * cellDates 打开时读出来是 Date。这里统一按日期读成 YYYY-MM-DD；
 * 业务员偶尔填文本（如 "30days"）时原样保留；数字太小的（如填 30 表示 30 天）不按日期解释。
 */
function leadTimeText(value: unknown): string {
  if (value == null || text(value) === '') return ''
  if (value instanceof Date) return dateText(value) || ''
  if (typeof value === 'number' && Number.isFinite(value) && value > 20000) return dateText(value) || text(value)
  return cleanQuotationText(value)
}

function dateText(value: unknown): string | null {
  if (value == null || text(value) === '') return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const pad = (part: number) => String(part).padStart(2, '0')
    // SheetJS 在 cellDates 模式下把 Excel 日期序列号换算成时间戳时带浮点误差，
    // 结果常落在前一天 23:59（本地）—— 直接读本地字段会让报价日期整体差一天。
    // 这里按「最近的 UTC 整天」取整再读 UTC 字段：日期列没有时间部分，取整是安全的。
    const dayStart = new Date(Math.round(value.getTime() / 86400000) * 86400000)
    return `${dayStart.getUTCFullYear()}-${pad(dayStart.getUTCMonth() + 1)}-${pad(dayStart.getUTCDate())}`
  }
  if (typeof value === 'number') {
    // 门槛与页面（app/packages/shared/quotationGrid.js）和交期列一致：小的数字不是日期序列号。
    // 报价日期这一列填「2」多半是把序号/天数填错列，不能再像以前那样悄悄变成 1900-01-02。
    if (!Number.isFinite(value) || value <= 20000) return null
    const parsed = (getXlsxSync() as any).SSF?.parse_date_code?.(value)
    if (parsed?.y && parsed?.m && parsed?.d) {
      return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
    }
  }
  const raw = text(value)
  const ymd = /^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/u.exec(raw)
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`
  // 年可以是 4 位（2026）也可以是 2 位（页面显示用的 01-Dec-26）；
  // 交替顺序不能反：\d{4} 在前，否则 '1-Dec-2026' 只会吃到 '20'
  const dMy = /^(\d{1,2})\s*[\/-]\s*([A-Za-z]+)\s*[\/-]\s*(\d{4}|\d{2})/u.exec(raw)
  if (dMy) {
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    }
    const month = months[dMy[2].slice(0, 3).toLowerCase()]
    if (month) return `${dMy[3]}-${month}-${dMy[1].padStart(2, '0')}`
  }
  return null
}

function rowHasValues(row: unknown[]): boolean {
  return row.slice(0, 24).some((value) => text(value) !== '')
}

function isHeaderRow(row: unknown[]): boolean {
  const values = row.map(normalize)
  return values.some((val) => val.includes('s/n') || val.includes('序号') || val.includes('序列'))
    && values.some((val) => val.includes('mpn') || val.includes('型号') || val.includes('quoteto') || val.includes('客户'))
}

export interface ColumnMapping {
  sn: number
  quoteDate: number
  country: number
  customerStyle: number
  quoteTo: number
  endUser: number
  application: number
  manufacturer: number
  manufacturerMpn: number
  qty: number
  unit: number
  ctkMpn: number
  materialCode: number
  package: number
  dieSize: number
  spq: number
  priceRmb: number
  rate: number
  priceUsd: number
  priceUsdPc: number
  leadTime: number
  datasheet: number
  remark: number
}

/**
 * 表头 → 列号映射。默认值按旧模板位置；现行 16 列外贸模板按双语表头识别。
 * 判定顺序即优先级，几个必须靠前的：
 * - 「客户性质」先于「客户」，否则会被 quoteTo 抢走；
 * - 「友商型号 / MPN」先于「友商 / Manufacturer」，且 MPN 规则排除 CTK MPN；
 * - 「1只单价（美元）」先于「千只单价（美元）」，否则两列都落进 priceUsd；
 * - 产品描述列已从模板删除：识别到也忽略（不入库）。
 */
export function detectColumnMapping(headers: unknown[][]): ColumnMapping {
  // 新模板的终端客户在单头，不占明细列；旧模板仍通过表头名称识别明细级终端客户。
  const mapping: ColumnMapping = {
    sn: 0,
    quoteDate: -1,
    country: -1,
    customerStyle: -1,
    quoteTo: -1,
    endUser: -1,
    application: -1,
    manufacturer: -1,
    manufacturerMpn: -1,
    qty: -1,
    unit: -1,
    ctkMpn: -1,
    materialCode: -1,
    package: -1,
    dieSize: -1,
    spq: -1,
    priceRmb: -1,
    rate: -1,
    priceUsd: -1,
    priceUsdPc: -1,
    leadTime: -1,
    datasheet: -1,
    remark: -1,
  }

  const combinedCols: string[] = []
  const maxLen = Math.max(...headers.map((h) => h.length), 22)
  for (let c = 0; c < maxLen; c += 1) {
    const colLabels = headers.map((h) => normalize(h[c])).filter(Boolean).join('|')
    combinedCols.push(colLabels)
  }

  let matchedAny = false
  combinedCols.forEach((col, index) => {
    if (!col) return
    if (col.includes('s/n') || col.includes('序号') || col.includes('序列')) { mapping.sn = index; matchedAny = true }
    else if (col.includes('报价日期') || col.includes('quotedate')) { mapping.quoteDate = index; matchedAny = true }
    else if (col.includes('国家') || col.includes('country')) { mapping.country = index; matchedAny = true }
    else if (col.includes('客户性质') || col.includes('style')) { mapping.customerStyle = index; matchedAny = true }
    else if (col.includes('enduser') || col.includes('终端')) { mapping.endUser = index; matchedAny = true }
    else if (col.includes('quoteto') || (col.includes('客户') && !col.includes('终端'))) { mapping.quoteTo = index; matchedAny = true }
    else if (col.includes('applicaiton') || col.includes('application') || col.includes('应用')) { mapping.application = index; matchedAny = true }
    else if (col.includes('友商型号') || (col.includes('mpn') && !col.includes('ctk'))) { mapping.manufacturerMpn = index; matchedAny = true }
    else if (col.includes('manufacturer') || col.includes('友商') || col.includes('原厂')) { mapping.manufacturer = index; matchedAny = true }
    else if (col.includes('desprition') || col.includes('description') || col.includes('描述')) {
      // 新模板已删除「产品描述」列：旧模板上传时这一列直接忽略
    } else if (col.includes('qty') || col.includes('数量')) { mapping.qty = index; matchedAny = true }
    else if (col.includes('物料编码') || col.includes('materialcode') || col.includes('itemcode') || col.includes('materialnumber')) { mapping.materialCode = index; matchedAny = true }
    else if (col.includes('物料名称') || col.includes('materialname') || col.includes('ctkmpn') || col.includes('ctk型号') || col.includes('型号')) { mapping.ctkMpn = index; matchedAny = true }
    else if (col.includes('package') || col.includes('封装')) { mapping.package = index; matchedAny = true }
    else if (col.includes('diesize') || col.includes('芯片大小') || col.includes('芯片尺寸')) { mapping.dieSize = index; matchedAny = true }
    else if (col.includes('spq') || col.includes('reel') || col.includes('包装') || col.includes('(pcs)')) { mapping.spq = index; matchedAny = true }
    else if (col.includes('rmb') || col.includes('单价（元）') || col.includes('人民币')) { mapping.priceRmb = index; matchedAny = true }
    else if (col.includes('rate') || col.includes('汇率')) { mapping.rate = index; matchedAny = true }
    else if (col.includes('1只') || col.includes('usdpc')) { mapping.priceUsdPc = index; matchedAny = true }
    else if (col.includes('usd') || col.includes('美元')) { mapping.priceUsd = index; matchedAny = true }
    else if (col.includes('l/t') || col.includes('交期') || col.includes('leadtime')) { mapping.leadTime = index; matchedAny = true }
    else if (col.includes('datasheet') || col.includes('规格书') || col.includes('资料')) { mapping.datasheet = index; matchedAny = true }
    else if (col.includes('remark') || col.includes('备注')) { mapping.remark = index; matchedAny = true }
  })

  // 若完全未匹配到任何表头（如无表头的历史极端测试或损坏文件），回退到旧版 15 列兜底位置
  if (!matchedAny) {
    mapping.quoteTo = 1
    mapping.endUser = 2
    mapping.application = 3
    mapping.manufacturer = 4
    mapping.qty = 6
    mapping.ctkMpn = 8
    mapping.package = 9
    mapping.spq = 10
    mapping.priceRmb = 11
    mapping.priceUsd = 12
    mapping.datasheet = 13
  }

  return mapping
}

/**
 * 历史模板把商务字段压成一整句（当前 15 列模板在第 4 行分栏，在第 5 行放联系人）：
 *   Trading Terms: … ;    Quotation Valid: … days    Payment terms: …    Contact: …    Email: … Phone: … Whatsapp: …
 * 这里按关键词切出贸易条款 / 有效期 / 付款方式 / 联系人（业务员自由填写的那部分）；
 * 后面的 Email/Phone/Whatsapp/Wechat 由导出时按业务员档案生成，不参与入库。
 */
/** 空白模板里的下划线占位（业务员没填的项）或直接在填空槽敲字残留的下划线：清洗为干净文本 */
function clearTermPlaceholder(value: unknown): string {
  const raw = text(value)
  if (/^[\s_]+$/u.test(raw)) return ''
  return raw.replace(/^[\s_]+|[\s_]+$/gu, '').trim()
}

function extractTermsSentence(matrix: unknown[][]): { deliveryTerms: string; validity: string; paymentTerm: string; contact: string } {
  let deliveryTerms = ''
  let validity = ''
  let paymentTerm = ''
  let contact = ''

  for (let r = 0; r < Math.min(matrix.length, 8); r += 1) {
    const row = matrix[r] || []
    for (let c = 0; c < row.length; c += 1) {
      const cell = row[c]
      const raw = text(cell)
      if (!raw) continue
      const norm = normalize(raw)
      const delivery = /trading\s*terms\s*:\s*([\s\S]*?)(?=\s*(?:quotation\s*valid|payment\s*terms?|contact|email|phone|whatsapp|wechat)\s*:|$)/iu.exec(raw)
      const valid = extractQuotationValidity(raw)
      const payment = /payment\s*terms?\s*:\s*([\s\S]*?)(?=\s*(?:contact|email|phone|whatsapp|wechat)\s*:|quotation\s*valid\s*:|$)/iu.exec(raw)
      const contactMatch = /contact\s*:\s*([\s\S]*?)(?=\s*(?:email|phone|whatsapp|wechat)\s*:|$)/iu.exec(raw)
      const nextValue = () => {
        for (let next = c + 1; next < Math.min(row.length, c + 7); next += 1) {
          const value = text(row[next])
          if (value) return value
        }
        return ''
      }

      if (!deliveryTerms) {
        const sentenceValue = clearTermPlaceholder(text(delivery?.[1] || '').replace(/[;；]+\s*$/u, '').trim())
        if (sentenceValue) deliveryTerms = sentenceValue
        else if (norm.includes('tradingterms') || norm.includes('deliveryterms') || norm.includes('贸易条款')) {
          deliveryTerms = clearTermPlaceholder(nextValue().replace(/[;；]+\s*$/u, '').trim())
        }
      }
      if (!validity) {
        validity = valid
          || (/^\d{1,4}\s*days?$/iu.test(raw) ? normalizeQuotationValidity(raw) : '')
          || (norm.includes('quotationvalid') || norm.includes('有效期') ? clearTermPlaceholder(nextValue()) : '')
      }
      if (!paymentTerm) {
        const sentenceValue = clearTermPlaceholder(text(payment?.[1] || '').replace(/^payment\s*terms?\s*:\s*/iu, '').replace(/[;；]+\s*$/u, '').trim())
        if (sentenceValue) paymentTerm = sentenceValue
        else if (norm.includes('paymentterm') || norm.includes('付款方式')) {
          paymentTerm = clearTermPlaceholder(nextValue().replace(/[;；]+\s*$/u, '').trim())
        }
      }
      if (!contact) {
        const sentenceValue = clearTermPlaceholder(text(contactMatch?.[1] || ''))
        if (sentenceValue) {
          contact = sentenceValue
        } else if (norm.includes('contact') || norm.includes('联系人') || norm.includes('联系方式')) {
          const candidate = nextValue()
          const match = /contact\s*:\s*([\s\S]*?)(?=\s*(?:email|phone|whatsapp|wechat)\s*:|$)/iu.exec(candidate)
          contact = clearTermPlaceholder(match?.[1] || candidate)
        }
      }
    }
  }
  return { deliveryTerms, validity, paymentTerm, contact }
}

/** 分散单元格格式兜底：兼容历史模板，并读取当前 15 列模板的独立 Contact 块。 */
function extractLegacyMetadata(matrix: unknown[][]): { deliveryTerms: string; validity: string; paymentTerm: string; contact: string } {
  let deliveryTerms = ''
  let validity = ''
  let paymentTerm = ''
  let contact = ''

  for (let r = 0; r < Math.min(matrix.length, 7); r += 1) {
    const row = matrix[r] || []
    for (let c = 0; c < row.length; c += 1) {
      const cellVal = text(row[c])
      const norm = normalize(cellVal)
      if (norm.includes('deliveryterms') || norm.includes('贸易条款')) {
        deliveryTerms = clearTermPlaceholder(text(row[c + 1] || row[c + 2]))
      } else if (/^\d+days$/iu.test(cellVal) && !validity) {
        validity = cellVal
      } else if (norm.includes('valid') || norm.includes('有效期')) {
        const nextVal = text(row[c + 1] || row[c + 2])
        if (nextVal) validity = nextVal
      } else if (norm.includes('paymentterm') || norm.includes('付款方式')) {
        paymentTerm = clearTermPlaceholder(cellVal.replace(/^payment\s*terms?\s*:\s*/iu, '').trim()) || clearTermPlaceholder(text(row[c + 1]))
      } else if (!paymentTerm && (norm.includes('deposit') || norm.includes('beforeship') || norm.includes('t/t') || /^net\s*\d+/iu.test(cellVal))) {
        paymentTerm = clearTermPlaceholder(cellVal.replace(/^payment\s*terms?\s*:\s*/iu, '').trim())
      } else if (!contact && (norm.includes('contact') || norm.includes('联系人') || norm.includes('联系方式'))) {
        const value = text(row[c + 1] || row[c + 2])
        const match = /contact\s*:\s*([^\r\n]*)/iu.exec(value)
        contact = clearTermPlaceholder(match?.[1] || value)
      }
    }
  }

  return { deliveryTerms, validity, paymentTerm, contact }
}

function extractHeaderFields(matrix: unknown[][]): {
  customerName: string
  endUser: string
  country: string
  city: string
  customerStyle: string
  rate: number | null
  quoteDate: string | null
} {
  let customerName = ''
  let endUser = ''
  let city = ''
  let country = ''
  let customerStyle = ''
  let rate: number | null = null
  let quoteDate: string | null = null

  // 单头字段只扫描明细表头之前的区域，避免把旧模板明细列标题误读成单头值。
  for (let r = 0; r < Math.min(matrix.length, 7); r += 1) {
    const row = matrix[r] || []
    for (let c = 0; c < row.length; c += 1) {
      const cellVal = text(row[c])
      const norm = normalize(cellVal)
      if (!norm) continue

      // 终端客户是整单共用的单头字段。
      if (norm.includes('enduser') || norm.includes('终端客户')) {
        for (let next = c + 1; next < Math.min(row.length, c + 3); next += 1) {
          const val = cleanQuotationText(row[next])
          if (val) {
            endUser = val
            break
          }
        }
      }

      // 客户名称：匹配「客户」或「quoteto」，排除「终端」
      if (!customerName && (norm.includes('quoteto') || norm.includes('客户')) && !norm.includes('终端') && !norm.includes('性质') && !norm.includes('style')) {
        for (let next = c + 1; next < Math.min(row.length, c + 3); next += 1) {
          const val = cleanQuotationText(row[next])
          if (val && !/^(?:国家|country|性质|style|汇率|rate|日期|date)$/iu.test(val)) {
            customerName = val
            break
          }
        }
      }
      // 城市只读取标签紧邻的值，空值不能越过合并区误读付款方式。
      if (/^(?:城市(?:\/city|city)?|city)[:：]?$/iu.test(norm)) city = cleanQuotationText(row[c + 1])
      // 国家
      if (norm.includes('country') || norm.includes('国家')) {
        for (let next = c + 1; next < Math.min(row.length, c + 3); next += 1) {
          const val = optionText('country', row[next])
          if (val) {
            country = val
            break
          }
        }
      }
      // 客户性质
      if (norm.includes('style') || norm.includes('性质') || norm.includes('客户性质')) {
        for (let next = c + 1; next < Math.min(row.length, c + 3); next += 1) {
          const val = optionText('customerStyle', row[next])
          if (val) {
            customerStyle = val
            break
          }
        }
      }
      // 汇率
      if ((norm.includes('rate') || norm.includes('汇率')) && !norm.includes('千只') && !norm.includes('usd')) {
        for (let next = c + 1; next < Math.min(row.length, c + 3); next += 1) {
          const val = parseRate(row[next])
          if (val != null) {
            rate = val
            break
          }
        }
      }
      // 报价日期
      if ((norm.includes('date') || norm.includes('日期')) && !norm.includes('交期') && !norm.includes('leadtime')) {
        for (let next = c + 1; next < Math.min(row.length, c + 3); next += 1) {
          const val = dateText(row[next])
          if (val) {
            quoteDate = val
            break
          }
        }
      }
    }
  }

  return {
    customerName,
    endUser,
    city,
    country,
    customerStyle,
    rate,
    quoteDate: quoteDate || null,
  }
}

function extractMetadata(matrix: unknown[][]): { deliveryTerms: string; validity: string; paymentTerm: string; contact: string } {
  const sentence = extractTermsSentence(matrix)
  const legacy = extractLegacyMetadata(matrix)
  return {
    deliveryTerms: sentence.deliveryTerms || legacy.deliveryTerms,
    validity: sentence.validity || legacy.validity,
    paymentTerm: sentence.paymentTerm || legacy.paymentTerm,
    // Contact 可来自旧模板的一整句，或当前模板 A5:O5 的联系信息行。
    contact: sentence.contact || legacy.contact,
  }
}

export function parseQuotationWorkbook(
  data: Uint8Array,
  originalFilename = '报价单.xlsx',
  options: { requireLatestTemplate?: boolean } = {},
): ParsedQuotationWorkbook {
  if (!/\.xlsx$/iu.test(originalFilename)) throw new Error('报价单只支持 .xlsx 文件')
  const XLSX = getXlsxSync()
  const workbook = XLSX.read(Buffer.from(data), { type: 'buffer', cellDates: true, cellStyles: true })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error('报价单没有可读取的工作表')
  const sheet = workbook.Sheets[sheetName]
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null }) as unknown[][]

  const isDomesticHeader = (row: unknown[]) => {
    const cells = row.map(normalize)
    return cells.some((cell) => cell.includes('序号'))
      && cells.some((cell) => (cell.includes('品名') || cell.includes('ctk物料名称')))
      && cells.some((cell) => cell.includes('型号') || cell.includes('ctk物料名称'))
      && cells.some((cell) => cell.includes('含税单价'))
  }
  if (matrix.some(isDomesticHeader)) throw new Error('检测到内贸报价单模板，请从“内贸销售报价单”页面上传')

  if (options.requireLatestTemplate && (sheetName !== '报价单' || !isCurrentQuotationTemplateHeader(matrix[5]))) {
    throw new Error('该文件不是最新版外贸报价单模板，请下载最新模板后再上传')
  }

  const headerRowIndex = options.requireLatestTemplate ? 5 : matrix.findIndex(isHeaderRow)
  if (headerRowIndex < 0) throw new Error('未找到报价单明细表头，请使用标准报价单模板')

  const headerRows = [matrix[headerRowIndex] || []]
  if (!options.requireLatestTemplate && matrix[headerRowIndex + 1] && !rowHasValues(matrix[headerRowIndex + 1]?.slice(6, 7))) {
    headerRows.push(matrix[headerRowIndex + 1])
  }
  const colMap = detectColumnMapping(headerRows)

  const meta = extractMetadata(matrix)
  const headerFields = extractHeaderFields(matrix)

  // 明细区起点：只跳过表头行（英文行 + 中文行）。
  let dataStartIndex = headerRowIndex + 1
  while (dataStartIndex < matrix.length && isHeaderRow(matrix[dataStartIndex] || [])) dataStartIndex += 1

  const rawLines = matrix.slice(dataStartIndex).filter(rowHasValues)
  const lines: QuotationLineInput[] = rawLines.map((row, idx) => {
    const rmb = parsePrice(row[colMap.priceRmb])
    const rate = colMap.rate >= 0 ? parseRate(row[colMap.rate]) : headerFields.rate
    return {
      lineNo: idx + 1,
      quoteDate: colMap.quoteDate >= 0 ? dateText(row[colMap.quoteDate]) : headerFields.quoteDate,
      country: colMap.country >= 0 ? optionText('country', row[colMap.country]) : headerFields.country,
      customerStyle: colMap.customerStyle >= 0 ? optionText('customerStyle', row[colMap.customerStyle]) : headerFields.customerStyle,
      quoteTo: colMap.quoteTo >= 0 ? cleanQuotationText(row[colMap.quoteTo]) : headerFields.customerName,
      endUser: cleanQuotationText(row[colMap.endUser]),
      application: cleanQuotationText(row[colMap.application]),
      manufacturer: cleanQuotationText(row[colMap.manufacturer]),
      manufacturerMpn: colMap.manufacturerMpn >= 0 ? cleanQuotationText(row[colMap.manufacturerMpn]) : '',
      qty: nullableNumber(row[colMap.qty]),
      unit: DEFAULT_QUOTATION_UNIT,
      ctkMpn: cleanQuotationText(row[colMap.ctkMpn]),
      materialCode: colMap.materialCode >= 0 ? cleanQuotationText(row[colMap.materialCode]) : '',
      packageName: cleanQuotationText(row[colMap.package]),
      dieSize: colMap.dieSize >= 0 ? cleanQuotationText(row[colMap.dieSize]) : '',
      spqReel: cleanQuotationText(row[colMap.spq]),
      originalPriceRmb: rmb,
      rate,
      originalPriceUsd: computeUsdPriceKpcs(rmb, rate),
      leadTime: colMap.leadTime >= 0 ? leadTimeText(row[colMap.leadTime]) : '',
      datasheet: cleanQuotationText(row[colMap.datasheet]),
      remark: colMap.remark >= 0 ? cleanQuotationText(row[colMap.remark]) : '',
    }
  }).filter((line) => [
    line.ctkMpn, line.materialCode, line.qty, line.application, line.manufacturer, line.manufacturerMpn,
    line.packageName, line.dieSize, line.spqReel, line.originalPriceRmb, line.leadTime, line.datasheet, line.remark,
  ].some((val) => val != null && String(val).trim() !== ''))

  if (!lines.length) throw new Error('报价单中未检测到有效的产品明细行')

  // 多客户强阻断拦截：一张单只允许一个客户
  const distinctCustomers = Array.from(new Set(lines.map((l) => l.quoteTo).filter(Boolean)))
  if (distinctCustomers.length > 1) {
    throw new Error(`报价单包含多个不同客户（${distinctCustomers.join('、')}），一张报价单仅允许一个客户`)
  }

  // 兼容旧模板的明细级「终端客户」列；若一张旧模板内填了多个值，拒绝静默丢失。
  const distinctEndUsers = Array.from(new Set(lines.map((line) => line.endUser).filter(Boolean)))
  if (distinctEndUsers.length > 1) {
    throw new Error(`报价单包含多个不同终端客户（${distinctEndUsers.join('、')}），请统一填写单头终端客户`)
  }
  const finalEndUser = headerFields.endUser || distinctEndUsers[0] || ''
  const headerEndUserLines = lines.map((line) => ({ ...line, endUser: '' }))

  // 选项列（国家 / 客户性质）必须落在下拉清单内
  const optionViolations = quotationOptionViolations(lines.map((line, index) => ({ ...line, rowLabel: `第${index + 1}行` })))
  if (optionViolations.length) throw new Error(formatQuotationOptionViolations(optionViolations))

  const finalCustomer = distinctCustomers[0] || headerFields.customerName || ''
  const finalCountry = lines.find((l) => l.country)?.country || headerFields.country || '中国'
  const finalStyle = lines.find((l) => l.customerStyle)?.customerStyle || headerFields.customerStyle || '终端'
  const finalRate = lines.find((l) => l.rate != null)?.rate ?? headerFields.rate ?? 6.7000
  const finalQuoteDate = lines.find((l) => l.quoteDate)?.quoteDate || headerFields.quoteDate || null

  return {
    sheetName,
    deliveryTerms: meta.deliveryTerms || 'EXW Dongguan',
    validity: meta.validity || '30days',
    paymentTerm: meta.paymentTerm || '30% deposit, and 70% before shipping',
    contact: meta.contact || '',
    customerName: finalCustomer,
    endUser: finalEndUser,
    city: headerFields.city,
    country: finalCountry,
    customerStyle: finalStyle,
    rate: finalRate,
    quoteDate: finalQuoteDate,
    lines: headerEndUserLines,
  }
}

/**
 * Parse the domestic sales template. Its columns and header block are a separate
 * contract from the foreign trade workbook, so it intentionally does not pass
 * through detectColumnMapping or the foreign trade defaults.
 */
export function parseDomesticQuotationWorkbook(data: Uint8Array, originalFilename = '内贸销售报价单模板.xlsx'): ParsedQuotationWorkbook {
  if (!/\.xlsx$/iu.test(originalFilename)) throw new Error('内贸报价单只支持 .xlsx 文件')
  const XLSX = getXlsxSync()
  const workbook = XLSX.read(Buffer.from(data), { type: 'buffer', cellDates: true, cellStyles: true })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error('内贸报价单没有可读取的工作表')
  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: null }) as unknown[][]
  const domesticHeaderIndex = matrix.findIndex((row) => {
    const cells = row.map(normalize)
    return cells.some((cell) => cell.includes('序号'))
      && cells.some((cell) => (cell.includes('品名') || cell.includes('ctk物料名称')))
      && cells.some((cell) => cell.includes('型号') || cell.includes('ctk物料名称'))
      && cells.some((cell) => cell.includes('含税单价'))
  })
  if (domesticHeaderIndex < 0) throw new Error('未找到内贸报价单表头，请使用内贸销售报价单模板')
  const headers = matrix[domesticHeaderIndex].map(normalize)
  const approvedLayout = headers.some(cell => cell.includes('品号'))
  const newLayout = headers.some(cell => cell.includes('客户物料名称'))
  const onlineLayout = newLayout && domesticHeaderIndex === 10 && !approvedLayout
  const modernLayout = approvedLayout || onlineLayout
  const offset = newLayout ? 1 : 0
  const ctkColumn = headers.findIndex(cell => cell.includes('ctk物料名称'))
  const customerMaterialColumn = headers.findIndex(cell => cell.includes('客户物料名称'))
  const packageColumn = headers.findIndex(cell => cell.includes('封装'))
  const packIsKpcs = headers.some(cell => cell.includes('最小包装') && cell.includes('kpcs'))
  const priceIsKpcs = headers.some(cell => cell.includes('含税单价') && (cell.includes('kpcs') || cell.includes('/k')))
  const priceIsPcs = headers.some(cell => cell.includes('含税单价') && /(?:元\/pcs|元／pcs)/iu.test(cell))
  const packColumn = headers.findIndex(cell => cell.includes('最小包装'))
  const priceColumn = headers.findIndex(cell => cell.includes('含税单价'))
  const remarkColumn = headers.findIndex(cell => cell.includes('备注'))
  const unitColumn = headers.findIndex(cell => cell.startsWith('单位'))
  const brandColumn = headers.findIndex(cell => cell.includes('品牌'))

  const labeledValue = (value: unknown, label: RegExp) => {
    const match = label.exec(text(value))
    return cleanQuotationText(match?.[1] || '')
  }
  const customerName = labeledValue(matrix[5]?.[0], /客户(?:\s*[（(]To\.?[）)])?\s*[:：]\s*(.*)$/iu)
  const contact = labeledValue(matrix[modernLayout ? 8 : 6]?.[0], /联系人(?:\s*[（(]Attn\.?[）)])?\s*[:：]\s*(.*)$/iu)
  const rawDate = labeledValue(matrix[modernLayout ? 8 : 6]?.[modernLayout ? 6 : 4], /日期(?:\s*[（(].*?[）)])?\s*[:：]\s*(.*)$/iu)
  const quoteDate = dateText(rawDate.replace(/年|月/gu, '-').replace(/日/gu, ''))
  const customerAddress = modernLayout ? labeledValue(matrix[6]?.[0], /地址(?:\s*[（(].*?[）)])?\s*[:：]\s*(.*)$/iu) : ''
  const customerPhone = modernLayout ? labeledValue(matrix[7]?.[0], /电话(?:\s*[（(].*?[）)])?\s*[:：]\s*(.*)$/iu) : ''
  const paymentTerm = modernLayout ? cleanQuotationText(matrix[5]?.[7]) || '现金' : '现金'
  const customerApplication = modernLayout ? cleanQuotationText(matrix[6]?.[7]) : ''
  const customerStyle = modernLayout ? optionText('customerStyle', matrix[7]?.[7]) : '终端'
  if (modernLayout && !customerStyle) throw new Error('请在内贸报价单抬头选择客户性质')
  const styleViolations = quotationOptionViolations([{ customerStyle, rowLabel: '表头' }])
  if (styleViolations.length) throw new Error(formatQuotationOptionViolations(styleViolations))
  if (!customerName) throw new Error('请在内贸报价单抬头填写客户名称')

  // Locate the footer rather than assuming a fixed number of detail rows.
  const footerIndex = matrix.findIndex((row, index) => index > domesticHeaderIndex && /^(?:以上|附注|制表)/u.test(text(row[0])))
  const detailRows = matrix.slice(domesticHeaderIndex + 1, footerIndex < 0 ? undefined : footerIndex)
  const lines: QuotationLineInput[] = detailRows
    .filter((row) => rowHasValues(row))
    .map((row, index) => {
      const rawUnit = cleanQuotationText(unitColumn < 0 ? '' : row[unitColumn]) || (priceIsKpcs ? 'KPCS' : priceIsPcs ? 'PCS' : '')
      if (!domesticQuotationUnit(rawUnit)) throw new Error(`第${index + 1}行计价单位缺失或无法识别，请明确PCS或KPCS后导入`)
      const packValue = packColumn < 0 ? null : row[packColumn]
      return {
      lineNo: index + 1,
      quoteDate,
      country: '中国',
      customerStyle,
      quoteTo: customerName,
      endUser: '',
      application: onlineLayout ? '' : cleanQuotationText(row[approvedLayout ? 2 : 1]),
      customerMaterialName: customerMaterialColumn >= 0 ? cleanQuotationText(row[customerMaterialColumn]) : '',
      minPackCount: parseMinPackCount(packValue == null || text(packValue) === '' ? null : packIsKpcs ? packValue : Number(packValue) / 1000, index + 1),
      manufacturer: approvedLayout && brandColumn >= 0 ? cleanQuotationText(row[brandColumn]) : '',
      manufacturerMpn: '',
      qty: null,
      unit: 'KPCS',
      ctkMpn: cleanQuotationText(row[onlineLayout ? ctkColumn : approvedLayout ? 3 : 2 + offset]),
      materialCode: approvedLayout ? cleanQuotationText(row[1]) : '',
      packageName: cleanQuotationText(row[packageColumn >= 0 ? packageColumn : approvedLayout ? 4 : 3 + offset]),
      dieSize: '',
      spqReel: '',
      originalPriceRmb: parsePrice(domesticPriceToKpcs(row[priceColumn], rawUnit)),
      rate: null,
      originalPriceUsd: null,
      leadTime: '',
      datasheet: '',
      remark: remarkColumn >= 0 ? cleanQuotationText(row[remarkColumn]) : '',
    }})
    .filter((line) => line.application || line.ctkMpn || line.packageName || line.originalPriceRmb != null || line.remark)

  if (!lines.length) throw new Error('内贸报价单中没有有效的产品明细')
  for (const [index, line] of lines.entries()) {
    if (!line.ctkMpn) throw new Error(`第${index + 1}行必须填写型号`)
    if (line.originalPriceRmb == null || line.originalPriceRmb <= 0) throw new Error(`第${index + 1}行必须填写大于0的含税单价`)
    if (line.unit.length > 64) throw new Error(`第${index + 1}行单位不能超过64个字符`)
  }

  return {
    sheetName,
    deliveryTerms: '',
    validity: '',
    paymentTerm,
    contact,
    customerName,
    customerAddress,
    customerPhone,
    customerApplication,
    endUser: '',
    country: '中国',
    customerStyle,
    rate: null,
    quoteDate,
    lines,
  }
}
