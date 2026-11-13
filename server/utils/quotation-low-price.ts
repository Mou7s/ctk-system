import { getHeader, readBody, readMultipartFormData, type H3Event } from 'h3'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { hasPermission } from './auth'
import { withReadSession } from './read'
import { mysqlQueryOptions } from './mysql'
import { apiError, apiSuccess } from './response'
import { domesticPriceToKpcs, domesticQuotationUnit } from '../../app/packages/shared/domesticQuotationUnits'

type BusinessType = 'DOMESTIC' | 'FOREIGN'
type Line = Record<string, any>
const normalized = (value: unknown) => String(value ?? '').trim().toUpperCase()

export function comparableQuotationPrice(line: Line, businessType: BusinessType): number | null {
  const value = line.reviewPriceRmb ?? line.originalPriceRmb
  if (value == null || String(value).trim() === '') return null
  if (!domesticQuotationUnit(line.unit)) return null
  const price = Number(businessType === 'DOMESTIC' ? domesticPriceToKpcs(value, line.unit) : value)
  return Number.isFinite(price) && price > 0 ? Math.round((price + Number.EPSILON) * 100) / 100 : null
}

// Compare only the quotation owner’s approved history for the same customer.
export async function quotationLowPriceWarnings(pool: Pool, lines: Line[], businessType: BusinessType, excludeId = 0, customerName = '', salespersonId = 0) {
  if (!customerName.trim() || !Number.isSafeInteger(salespersonId) || salespersonId <= 0) return []
  const warnings: Line[] = []
  const references = new Map<string, any>()
  for (const [index, line] of lines.entries()) {
    const mpn = normalized(line.ctkMpn)
    const pack = normalized(line.packageName)
    const price = comparableQuotationPrice(line, businessType)
    if (!mpn || price == null) continue
    const key = JSON.stringify([mpn, pack])
    if (!references.has(key)) {
      const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`
        SELECT l.final_price_rmb AS price, l.unit, q.quote_no AS quoteNo,
          q.customer_name AS customerName, DATE_FORMAT(q.quote_date, '%Y-%m-%d') AS quoteDate
        FROM tk_quotation_line l JOIN tk_quotation q ON q.id = l.quotation_id
        WHERE q.business_type = ? AND q.status = 'APPROVED' AND q.id <> ?
          AND UPPER(TRIM(l.ctk_mpn)) = ? AND UPPER(TRIM(COALESCE(l.package_name, ''))) = ?
          AND TRIM(q.customer_name) = TRIM(?) AND q.salesperson_id = ?
          AND l.final_price_rmb > 0
          AND UPPER(TRIM(l.unit)) IN ('K', 'KPCS', 'KPC', '千只', '千个', 'PCS', 'PC', '只', '个')
        ORDER BY COALESCE(q.final_review_time, q.create_time) DESC, q.id DESC, l.line_no DESC, l.id DESC
        LIMIT 1
      `), [businessType, excludeId, mpn, pack, customerName.trim(), salespersonId])
      references.set(key, rows[0] || null)
    }
    const reference = references.get(key)
    if (!reference) continue
    const previous = comparableQuotationPrice({ originalPriceRmb: reference.price, unit: reference.unit }, businessType)
    if (previous == null || price >= previous) continue
    warnings.push({ lineNo: line.lineNo || index + 1, ctkMpn: mpn, packageName: pack,
      currentPrice: price, previousPrice: previous, unit: 'KPCS', currency: 'CNY',
      decreasePercent: Number(((previous - price) / previous * 100).toFixed(2)),
      quoteNo: reference.quoteNo, customerName: reference.customerName, quoteDate: reference.quoteDate })
  }
  return warnings
}

export function checkQuotationLowPrices(event: H3Event, businessType: BusinessType = 'FOREIGN') {
  return withReadSession(event, 'QuotationLowPrice', async (session, pool) => {
    const prefix = businessType === 'DOMESTIC' ? 'tk_custom:domesticQuotation:' : 'tk_custom:quotation:'
    if (!hasPermission(session, prefix + 'list') && !hasPermission(session, prefix + 'upload')) return apiError('没有报价单访问权限', 403)
    let lines: Line[] = []
    let id = 0
    let customerName = ''
    let salespersonId = session.userId
    if (getHeader(event, 'content-type')?.includes('multipart/form-data')) {
      const parts = await readMultipartFormData(event)
      const file = parts?.find(part => part.name === 'file')
      if (!file || file.data.length > 20 * 1024 * 1024) return apiError('请选择不超过20MB的报价单文件', 400)
      try {
        const { parseDomesticQuotationWorkbook, parseQuotationWorkbook } = await import('./quotation-parser')
        const parsed = businessType === 'DOMESTIC' ? parseDomesticQuotationWorkbook(file.data, file.filename) : parseQuotationWorkbook(file.data, file.filename)
        lines = parsed.lines
        customerName = String(parsed.customerName || '').trim()
      } catch (error) { return apiError(error instanceof Error ? error.message : '报价单解析失败', 400) }
      id = Number(parts?.find(part => part.name === 'id')?.data.toString() || 0)
    } else {
      const body = await readBody(event) || {}
      lines = Array.isArray(body.lines) ? body.lines : []
      id = Number(body.id || 0)
      customerName = String(body.customerName || '').trim()
    }
    if (!Number.isSafeInteger(id) || id < 0 || lines.some(line => !line || typeof line !== 'object' || Array.isArray(line))) return apiError('报价比价参数不符合规范', 400)
    if (id) {
      const [headers] = await pool.query<RowDataPacket[]>(mysqlQueryOptions('SELECT salesperson_id, customer_name FROM tk_quotation WHERE id = ? AND business_type = ?'), [id, businessType])
      const canReview = ['initialReview', 'secondReview', 'finalReview'].some(action => hasPermission(session, prefix + action))
      if (!headers[0] || (Number(headers[0].salesperson_id) !== session.userId && session.userId !== 1 && !canReview)) return apiError('没有权限查看此报价单', 403)
      salespersonId = Number(headers[0].salesperson_id)
      // Stored document ownership is authoritative; unsaved edits may change its customer.
      if (!customerName) customerName = String(headers[0].customer_name || '').trim()
      if (!lines.length) {
        const [stored] = await pool.query<RowDataPacket[]>(mysqlQueryOptions('SELECT line_no AS lineNo, ctk_mpn AS ctkMpn, package_name AS packageName, unit, original_price_rmb AS originalPriceRmb FROM tk_quotation_line WHERE quotation_id = ? ORDER BY line_no'), [id])
        lines = stored
      }
    }
    return apiSuccess(await quotationLowPriceWarnings(pool, lines, businessType, id, customerName, salespersonId))
  }, '历史报价比价失败，请稍后重试')
}
