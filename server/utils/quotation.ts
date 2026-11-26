import { resizeDomesticDetailRows, syncQuotationPrintArea } from './quotation-template-rows'
import crypto from 'node:crypto'
import { allocateQuotationNumber } from './quotation-number'
import { domesticPriceToKpcs, domesticQuotationUnit, pcsToKpcs, domesticPriceToPcs, domesticPackToPcs } from '../../app/packages/shared/domesticQuotationUnits.js'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getHeader, getQuery, getRouterParam, readMultipartFormData, setHeader, type H3Event } from 'h3'
import { unzipSync, zipSync } from 'fflate'
import { getXlsxSync, loadXlsx } from './lazy-deps'
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise'
import { getNitroServerConfig } from './runtime'
import { apiError, apiSuccess, apiSuccessFields } from './response'
import { getAuthSession, hasPermission, type AuthSession } from './auth'
import { getMysqlPool, mysqlQueryOptions } from './mysql'
import { pageRequest, queryPage, queryText, withReadSession } from './read'
import {
  bodyOf,
  decimal,
  NitroWriteError,
  text,
  withIdempotentWriteSession,
  writeFail,
} from './write'
import { DEFAULT_QUOTATION_UNIT, formatQuotationOptionViolations, normalizeQuotationOptionValue, quotationOptionDisplayLabel, quotationOptionViolations } from './quotation-options'
import { computeUsdPriceKpcs, computeUsdPricePc, parseDomesticQuotationWorkbook, parseQuotationWorkbook, type ParsedQuotationWorkbook, type QuotationLineInput } from './quotation-parser'
import { normalizeQuotationValidity } from './quotation-validity'
import { findQuotationEndUserConflicts } from './quotation-end-user-conflict'
import { quotationPriceAdjustment } from '../../app/packages/shared/quotationAnalysis'
import {
  attachQuotationApprovedNotify,
  attachQuotationNotify,
  attachQuotationReturnNotify,
  type QuotationNotifyStage,
  type QuotationNotifyTarget,
  type QuotationReturnNotifyTarget,
} from './quotation-notify'

/**
 * 写接口的入参校验（bodyOf / normalizeFormPayload / ID 校验）跑在写事务包装之外，
 * writeFail 抛出的 NitroWriteError 若直接逃出 handler，会被 Nitro 顶层渲染成
 * HTTP 500 的 h3 错误页（{"error":true,"url":...,"statusCode":500}），前端拿不到 msg，
 * 只能兜底显示「网络连接异常」/「报价单保存失败」，真实原因（如"客户不能为空"）
 * 被埋进服务端日志。这里统一转成本仓库约定的 { code, msg } 响应体。
 */
export function withQuotationWriteBody<T>(handler: (event: H3Event) => Promise<T>) {
  return async (event: H3Event) => {
    try {
      return await handler(event)
    } catch (error) {
      if (error instanceof NitroWriteError) return apiError(error.message, error.statusCode)
      throw error
    }
  }
}

/**
 * 事务提交后发送企微提醒（实现见 quotation-notify.ts）。
 * 提醒失败只写进返回体 data.notify，业务结果与 code 不变；幂等重放不经过这里，一次提交只提醒一次。
 */
async function runQuotationNotify(
  stage: QuotationNotifyStage,
  target: QuotationNotifyTarget | null,
  response: unknown,
): Promise<void> {
  if (!target) return
  await attachQuotationNotify(response, stage, target)
}

async function runQuotationApprovedNotify(
  target: QuotationNotifyTarget | null,
  applicantId: number | null,
  response: unknown,
): Promise<void> {
  if (!target || !applicantId) return
  await attachQuotationApprovedNotify(response, target, applicantId)
}

/** 退回通知：收件人由调用方按「该单历史经手人」动态给出，不走 sys_config 的固定收件人配置 */
async function runQuotationReturnNotify(
  target: QuotationReturnNotifyTarget | null,
  recipients: string[],
  response: unknown,
): Promise<void> {
  if (!target) return
  await attachQuotationReturnNotify(response, target, recipients)
}

export const QUOTATION_PERMISSIONS = {
  list: 'tk_custom:quotation:list',
  upload: 'tk_custom:quotation:upload',
  initialReview: 'tk_custom:quotation:initialReview',
  secondReview: 'tk_custom:quotation:secondReview',
  finalReview: 'tk_custom:quotation:finalReview',
  download: 'tk_custom:quotation:download',
  analysis: 'tk_custom:quotation:analysis',
} as const

export type QuotationBusinessType = 'FOREIGN' | 'DOMESTIC'

export const DOMESTIC_QUOTATION_PERMISSIONS = {
  list: 'tk_custom:domesticQuotation:list',
  upload: 'tk_custom:domesticQuotation:upload',
  initialReview: 'tk_custom:domesticQuotation:initialReview',
  secondReview: 'tk_custom:domesticQuotation:secondReview',
  finalReview: 'tk_custom:domesticQuotation:finalReview',
  download: 'tk_custom:domesticQuotation:download',
  analysis: 'tk_custom:domesticQuotation:analysis',
} as const

const QUOTATION_PERMISSIONS_BY_TYPE = {
  FOREIGN: QUOTATION_PERMISSIONS,
  DOMESTIC: DOMESTIC_QUOTATION_PERMISSIONS,
} as const

function quotationPermissions(businessType: QuotationBusinessType) {
  return QUOTATION_PERMISSIONS_BY_TYPE[businessType]
}

export type QuotationReviewStage = 'initial' | 'second' | 'final'

const REVIEW_STAGE_LABELS: Record<QuotationReviewStage, string> = {
  initial: '初审',
  second: '二审',
  final: '终审',
}

/**
 * 报价单状态机：内外贸都是草稿 → 待初审 → 待二审 → 待终审 → 已通过；
 * 初审 / 二审 / 终审都可以「退回」，退回一律落到「已退回」= 单据回到业务员手里；
 * 业务员改完重新提交时从初审重跑（不再存在「退回到某一级审核人」）。
 * 审核人可在当前环节改价并留意见，不改条款；退回时不保存改价。
 */
export type QuotationStatus = 'DRAFT' | 'PENDING_INITIAL' | 'PENDING_SECOND' | 'PENDING_FINAL' | 'RETURNED' | 'APPROVED'

function exportPaymentTerm(value: unknown): string {
  return String(value ?? '').trim().replace(/^payment\s*term\s*:\s*/iu, '')
}

const LINE_COLUMNS = `
  id, quotation_id, line_no, quote_date, country, customer_style, quote_to, end_user, application,
  manufacturer, manufacturer_mpn, qty, unit, ctk_mpn, material_code, package_name, die_size, spq_reel,
  original_price_rmb, rate, original_price_usd, lead_time, remark, datasheet,
  initial_price_rmb, initial_price_usd, final_price_rmb, final_price_usd, customer_material_name, min_pack_count
`

function statusLabel(status: unknown): string {
  return ({
    DRAFT: '草稿',
    PENDING_INITIAL: '待初审',
    PENDING_SECOND: '待二审',
    PENDING_FINAL: '待终审',
    RETURNED: '已退回',
    APPROVED: '已通过',
    // 旧口径的历史状态（退回到某一级审核人），只为展示存量老单而保留
    RETURNED_TO_INITIAL: '已退回',
    RETURNED_TO_SECOND: '已退回',
  } as Record<string, string>)[String(status)] || String(status || '')
}

function formatDateTime(value: unknown): string | null {
  if (value == null || value === '') return null
  if (typeof value === 'string') return value.includes('T') ? value.slice(0, 19).replace('T', ' ') : value
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return String(value)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
}

function formatDate(value: unknown): string | null {
  const full = formatDateTime(value)
  return full ? full.slice(0, 10) : null
}

function sessionName(session: AuthSession): string {
  return session.user.nickName || session.userName
}

function storageRoot(): string {
  const configured = String(process.env.TK_QUOTATION_STORAGE_PATH || process.env.NUXT_QUOTATION_STORAGE_PATH || '').trim()
  if (configured) {
    try {
      const parsed = resolve(configured)
      const driveMatch = parsed.match(/^([a-zA-Z]:)/)
      if (!driveMatch || existsSync(driveMatch[1] + '\\') || existsSync(driveMatch[1] + '/')) {
        return parsed
      }
    } catch {}
  }
  const profilePath = String(getNitroServerConfig().profilePath || '').trim()
  if (profilePath) {
    try {
      const rootDir = resolve(profilePath, '..', 'quotation-private')
      const driveMatch = rootDir.match(/^([a-zA-Z]:)/)
      if (!driveMatch || existsSync(driveMatch[1] + '\\') || existsSync(driveMatch[1] + '/')) {
        return rootDir
      }
    } catch {}
  }
  return resolve(process.cwd(), 'runtime/quotation-private')
}

function safeStoragePath(relativePath: string): string | null {
  const root = storageRoot()
  const relative = String(relativePath || '').replaceAll('\\', '/')
  if (!root || !relative || relative.includes('\0') || relative.split('/').some((part) => part === '..')) return null
  const candidate = resolve(root, relative)
  if (candidate !== root && !candidate.startsWith(`${root}\\`) && !candidate.startsWith(`${root}/`)) return null
  return candidate
}

async function saveSourceFile(file: { data: Uint8Array; filename?: string }) {
  const root = storageRoot()
  const now = new Date()
  const folder = `quotations/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`
  const relativePath = `${folder}/${crypto.randomUUID().replaceAll('-', '')}.xlsx`
  const target = safeStoragePath(relativePath)
  if (target) {
    try {
      await mkdir(resolve(target, '..'), { recursive: true })
      await writeFile(target, Buffer.from(file.data), { flag: 'wx' })
      return { target, relativePath }
    } catch {}
  }
  const fallbackRoot = resolve(process.cwd(), 'runtime/quotation-private')
  const fallbackTarget = resolve(fallbackRoot, relativePath)
  await mkdir(resolve(fallbackTarget, '..'), { recursive: true })
  await writeFile(fallbackTarget, Buffer.from(file.data), { flag: 'wx' })
  return { target: fallbackTarget, relativePath }
}

function mapQuotationRow(row: any) {
  return {
    id: Number(row.id),
    businessType: row.business_type || 'FOREIGN',
    quoteNo: row.quote_no,
    inputMode: row.input_mode || 'UPLOAD',
    originalName: row.original_name,
    sourceSheetName: row.source_sheet_name,
    quoteDate: formatDate(row.quote_date),
    customerName: row.customer_name || '',
    endUser: row.end_user || '',
    country: row.country || '',
    customerStyle: row.customer_style || '',
    rate: row.rate == null ? null : Number(row.rate),
    deliveryTerms: row.delivery_terms || '',
    validity: row.validity || '',
    paymentTerm: row.payment_term || '',
    contactText: row.contact_text || '',
    city: row.city || '',
    customerAddress: row.customer_address || '',
    customerPhone: row.customer_phone || '',
    customerApplication: row.customer_application || '',
    salespersonId: Number(row.salesperson_id),
    salespersonName: row.salesperson_name || '',
    status: row.status,
    statusLabel: statusLabel(row.status),
    lineCount: Number(row.line_count || 0),
    initialReviewerId: row.initial_reviewer_id == null ? null : Number(row.initial_reviewer_id),
    initialReviewerName: row.initial_reviewer_name || '',
    initialReviewTime: formatDateTime(row.initial_review_time),
    initialComment: row.initial_comment || '',
    secondReviewerId: row.second_reviewer_id == null ? null : Number(row.second_reviewer_id),
    secondReviewerName: row.second_reviewer_name || '',
    secondReviewTime: formatDateTime(row.second_review_time),
    secondComment: row.second_comment || '',
    finalReviewerId: row.final_reviewer_id == null ? null : Number(row.final_reviewer_id),
    finalReviewerName: row.final_reviewer_name || '',
    finalReviewTime: formatDateTime(row.final_review_time),
    finalComment: row.final_comment || '',
    createTime: formatDateTime(row.create_time),
    updateTime: formatDateTime(row.update_time),
  }
}

function mapLineRow(row: any) {
  return {
    id: Number(row.id),
    quotationId: Number(row.quotation_id),
    lineNo: Number(row.line_no),
    quoteDate: formatDate(row.quote_date),
    country: row.country || '',
    customerStyle: row.customer_style || '',
    quoteTo: row.quote_to || '',
    endUser: row.end_user || '',
    application: row.application || '',
    customerMaterialName: row.customer_material_name || '',
    minPackCount: row.min_pack_count == null ? null : Number(row.min_pack_count),
    manufacturer: row.manufacturer || '',
    manufacturerMpn: row.manufacturer_mpn || '',
    qty: row.qty == null ? null : Number(row.qty),
    unit: row.unit || '',
    ctkMpn: row.ctk_mpn || '',
    materialCode: row.material_code || '',
    packageName: row.package_name || '',
    dieSize: row.die_size || '',
    spqReel: row.spq_reel || '',
    originalPriceRmb: row.original_price_rmb == null ? null : Number(row.original_price_rmb),
    rate: row.rate == null ? null : Number(row.rate),
    originalPriceUsd: row.original_price_usd == null ? null : Number(row.original_price_usd),
    leadTime: row.lead_time || '',
    remark: row.remark || '',
    datasheet: row.datasheet || '',
    initialPriceRmb: row.initial_price_rmb == null ? null : Number(row.initial_price_rmb),
    initialPriceUsd: row.initial_price_usd == null ? null : Number(row.initial_price_usd),
    finalPriceRmb: row.final_price_rmb == null ? null : Number(row.final_price_rmb),
    finalPriceUsd: row.final_price_usd == null ? null : Number(row.final_price_usd),
  }
}

function mapRevisionRow(row: any) {
  const actionLabels: Record<string, string> = {
    UPLOAD: '上传报价单',
    DRAFT_SAVE: '保存报价单草稿',
    SUBMIT_INITIAL: '提交初审',
    APPROVE_INITIAL: '初审通过并提交二审',
    APPROVE_INITIAL_TO_FINAL: '初审通过并提交终审',
    APPROVE_SECOND: '二审通过并提交终审',
    RETURN_BY_INITIAL: '初审退回业务员',
    RETURN_BY_SECOND: '二审退回业务员',
    RETURN_BY_FINAL: '终审退回业务员',
    APPROVE_FINAL: '终审通过',
    UNDO_INITIAL: '撤销初审通过',
    UNDO_SECOND: '撤销二审通过',
    UNDO_FINAL: '撤销终审通过',
    WITHDRAW_TO_DRAFT: '撤回为草稿',
    // 旧口径的历史动作，只为展示存量留痕而保留
    RESUBMIT_FINAL: '退回后再次提交终审',
    RETURN_TO_INITIAL: '退回初审',
    RETURN_TO_SECOND: '退回二审',
  }
  return {
    id: Number(row.id),
    stage: row.stage || '',
    action: row.action || '',
    actionLabel: actionLabels[row.action] || row.action || '',
    comment: row.comment_text || '',
    operatorName: row.operator_name || '',
    createTime: formatDateTime(row.create_time),
  }
}

export function canViewAllQuotations(session: AuthSession, businessType: QuotationBusinessType = 'FOREIGN'): boolean {
  const permissions = quotationPermissions(businessType)
  const businessWildcard = businessType === 'DOMESTIC' ? 'tk_custom:domesticQuotation:*' : 'tk_custom:quotation:*'
  return session.userId === 1
    || session.roles?.includes('admin')
    || session.permissions?.includes('*:*:*')
    || session.permissions?.includes(businessWildcard)
    || hasPermission(session, permissions.initialReview)
    || hasPermission(session, permissions.secondReview)
    || hasPermission(session, permissions.finalReview)
}

function reviewerCapabilities(session: AuthSession, row: any, businessType: QuotationBusinessType = 'FOREIGN') {
  const permissions = quotationPermissions(businessType)
  const isOwner = Number(row.salesperson_id) === session.userId
  const canReviewAll = canViewAllQuotations(session, businessType)
  const isAdmin = session.userId === 1
  const canUpload = hasPermission(session, permissions.upload)
  // 「已退回」对业务员等同草稿：可编辑、可重新提交（重新提交从初审重跑）
  const status = String(row.status)
  const editable = status === 'DRAFT' || status === 'RETURNED'
  // 2026-09-27 前内贸初审后直接进终审、没有二审人，这类旧单撤销只能回到初审
  const legacyDomesticFinal = businessType === 'DOMESTIC' && row.second_reviewer_id == null
  const undoStage = status === 'APPROVED' ? 'final' : status === 'PENDING_FINAL' ? (legacyDomesticFinal ? 'initial' : 'second') : status === 'PENDING_SECOND' ? 'initial' : ''
  const undoPermission = undoStage === 'second' ? permissions.secondReview : undoStage === 'initial' ? permissions.initialReview : permissions.finalReview
  return {
    undoReviewStage: undoStage,
    canUndoReview: Boolean(undoStage) && hasPermission(session, undoPermission) && Number(row[`${undoStage}_reviewer_id`]) === session.userId,
    canEditDraft: canUpload && isOwner && editable,
    canDeleteDraft: canUpload && (isOwner || isAdmin) && status === 'DRAFT',
    canInitialReview: hasPermission(session, permissions.initialReview)
      && status === 'PENDING_INITIAL',
    canSecondReview: hasPermission(session, permissions.secondReview)
      && status === 'PENDING_SECOND',
    canFinalReview: hasPermission(session, permissions.finalReview)
      && status === 'PENDING_FINAL',
    canDownload: hasPermission(session, permissions.download)
      && status === 'APPROVED'
      && (isOwner || canReviewAll),
    canUpload,
    canRemind: isOwner && ['PENDING_INITIAL', 'PENDING_SECOND', 'PENDING_FINAL'].includes(status),
    canWithdraw: canUpload
      && (isOwner || isAdmin)
      && status === 'PENDING_INITIAL',
  }
}

async function fetchQuotation(pool: Pool | PoolConnection, id: number, forUpdate = false, businessType: QuotationBusinessType = 'FOREIGN') {
  const lock = forUpdate ? ' FOR UPDATE' : ''
  const [headers] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`SELECT * FROM tk_quotation WHERE id = ? AND business_type = ? LIMIT 1${lock}`), [id, businessType])
  const header = headers[0]
  if (!header) return null
  const [lines] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`SELECT ${LINE_COLUMNS} FROM tk_quotation_line WHERE quotation_id = ? ORDER BY line_no, id`), [id])
  return { header, lines }
}

async function fetchRevisions(pool: Pool, id: number) {
  const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`
    SELECT id, stage, action, comment_text, operator_name, create_time
    FROM tk_quotation_revision
    WHERE quotation_id = ?
    ORDER BY create_time ASC, id ASC
  `), [id])
  // 每一轮从业务员「提交初审」开始：退回后重新提交会开启新的一轮，历史轮次与意见全部保留
  let round = 0
  return rows.map((row) => {
    if (String(row.action) === 'SUBMIT_INITIAL' || String(row.action) === 'UPLOAD') round += 1
    return { ...mapRevisionRow(row), round: Math.max(round, 1) }
  })
}

async function snapshot(pool: PoolConnection, quotationId: number, businessType: QuotationBusinessType = 'FOREIGN') {
  const quotation = await fetchQuotation(pool, quotationId, false, businessType)
  return JSON.stringify({
    header: quotation ? mapQuotationRow(quotation.header) : null,
    lines: quotation?.lines.map(mapLineRow) || [],
  })
}

async function insertRevision(
  connection: PoolConnection,
  quotationId: number,
  stage: string,
  action: string,
  comment: string,
  session: AuthSession,
  businessType: QuotationBusinessType = 'FOREIGN',
) {
  await connection.execute(mysqlQueryOptions(`
    INSERT INTO tk_quotation_revision
      (quotation_id, stage, action, comment_text, snapshot_json, operator_id, operator_name, create_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
  `), [quotationId, stage, action, comment || '', await snapshot(connection, quotationId, businessType), session.userId, sessionName(session)])
}

export const MAX_CUSTOMER_OPTION_ROWS = 200

/**
 * 报价单「客户名称」下拉的候选来源：只取历史报价单里已出现过的客户（tk_quotation.customer_name 去重），
 * 不再查金蝶客户主档。报价单本身只写本地库，客户在主档里不存在也直接按文本保存，
 * 不需要先去金蝶建客户资料。数据范围与列表口径一致：可看全部的角色取全量，普通业务员只取本人单据的客户。
 */
export async function listQuotationCustomerOptions(event: H3Event) {
  return withReadSession(event, 'QuotationCustomerOptions', async (session, pool) => {
    if (!hasPermission(session, QUOTATION_PERMISSIONS.upload)) return apiError('没有报价单基础资料查询权限', 403)
    const query = getQuery(event) as Record<string, unknown>
    const keyword = queryText(query.keyword)
    const requestedLimit = Number(query.limit)
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(Math.floor(requestedLimit), MAX_CUSTOMER_OPTION_ROWS)
      : MAX_CUSTOMER_OPTION_ROWS
    const conditions = ["q.business_type = 'FOREIGN'", "q.status <> 'DELETED'", "TRIM(COALESCE(q.customer_name, '')) <> ''"]
    const params: unknown[] = []
    if (!canViewAllQuotations(session)) {
      conditions.push('q.salesperson_id = ?')
      params.push(session.userId)
    }
    if (keyword) {
      conditions.push("q.customer_name LIKE CONCAT('%', ?, '%')")
      params.push(keyword)
    }
    const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`
      SELECT TRIM(q.customer_name) AS name, COUNT(*) AS quoteCount, MAX(q.quote_date) AS lastQuoteDate
      FROM tk_quotation q
      WHERE ${conditions.join(' AND ')}
      GROUP BY TRIM(q.customer_name)
      ORDER BY MAX(q.quote_date) DESC, COUNT(*) DESC, name ASC
      LIMIT ?
    `), [...params, limit])
    return apiSuccess(rows.map((row) => ({
      name: String(row.name || ''),
      quoteCount: Number(row.quoteCount || 0),
      lastQuoteDate: formatDate(row.lastQuoteDate),
    })), '查询成功')
  }, '获取报价单客户失败')
}

export const MAX_PAYMENT_TERM_OPTION_ROWS = 200

/** 付款方式下拉只取历史报价单里实际保存过的值，并遵循报价单列表的数据范围。 */
export async function listQuotationPaymentTermOptions(event: H3Event) {
  return withReadSession(event, 'QuotationPaymentTermOptions', async (session, pool) => {
    if (!hasPermission(session, QUOTATION_PERMISSIONS.upload)) return apiError('没有报价单基础资料查询权限', 403)
    const query = getQuery(event) as Record<string, unknown>
    const requestedLimit = Number(query.limit)
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(Math.floor(requestedLimit), MAX_PAYMENT_TERM_OPTION_ROWS)
      : MAX_PAYMENT_TERM_OPTION_ROWS
    const conditions = ["q.business_type = 'FOREIGN'", "q.status <> 'DELETED'", "TRIM(COALESCE(q.payment_term, '')) <> ''"]
    const params: unknown[] = []
    if (!canViewAllQuotations(session)) {
      conditions.push('q.salesperson_id = ?')
      params.push(session.userId)
    }
    const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`
      SELECT TRIM(q.payment_term) AS name, COUNT(*) AS quoteCount, MAX(q.quote_date) AS lastQuoteDate
      FROM tk_quotation q
      WHERE ${conditions.join(' AND ')}
      GROUP BY TRIM(q.payment_term)
      ORDER BY MAX(q.quote_date) DESC, COUNT(*) DESC, name ASC
      LIMIT ?
    `), [...params, limit])
    return apiSuccess(rows.map((row) => String(row.name || '')).filter(Boolean), '查询成功')
  }, '获取报价单付款方式失败')
}

function queryFilters(query: Record<string, unknown>, session: AuthSession, canViewAll: boolean, businessType: QuotationBusinessType) {
  const conditions = ['q.status <> \'DELETED\'', 'q.business_type = ?']
  const params: unknown[] = [businessType]
  const keyword = queryText(query.keyword)
  const status = queryText(query.status)
  const customer = queryText(query.customer)
  const salesperson = queryText(query.salesperson)
  const from = queryText(query.from)
  const to = queryText(query.to)
  if (!canViewAll) {
    // 普通业务员：强制只能看自己的所有单据（包括草稿与已提交单据）
    conditions.push('q.salesperson_id = ?')
    params.push(session.userId)
  } else {
    // 管理员与审批人：可以看到所有人已提交的单据，未提交草稿仅对自己可见
    conditions.push('(q.status <> \'DRAFT\' OR q.salesperson_id = ?)')
    params.push(session.userId)
    if (salesperson) {
      conditions.push('q.salesperson_name LIKE CONCAT(\'%\', ?, \'%\')')
      params.push(salesperson)
    }
  }
  if (keyword) {
    conditions.push('(q.quote_no LIKE CONCAT(\'%\', ?, \'%\') OR q.customer_name LIKE CONCAT(\'%\', ?, \'%\') OR q.original_name LIKE CONCAT(\'%\', ?, \'%\'))')
    params.push(keyword, keyword, keyword)
  }
  if (status) {
    conditions.push('q.status = ?')
    params.push(status)
  }
  if (customer) {
    conditions.push('q.customer_name LIKE CONCAT(\'%\', ?, \'%\')')
    params.push(customer)
  }
  // 单据级报价日期已废弃：列表按提交时间（create_time）筛选
  if (/^\d{4}-\d{2}-\d{2}$/u.test(from)) {
    conditions.push('DATE(q.create_time) >= ?')
    params.push(from)
  }
  if (/^\d{4}-\d{2}-\d{2}$/u.test(to)) {
    conditions.push('DATE(q.create_time) <= ?')
    params.push(to)
  }
  return { where: ` WHERE ${conditions.join(' AND ')}`, params }
}

export async function listQuotations(event: H3Event, businessType: QuotationBusinessType = 'FOREIGN') {
  return withReadSession(event, 'QuotationList', async (session, pool) => {
    const permissions = quotationPermissions(businessType)
    if (!hasPermission(session, permissions.list)) return apiError('没有权限访问报价单', 403)
    const query = getQuery(event) as Record<string, unknown>
    const page = pageRequest(query)
    const canViewAll = canViewAllQuotations(session, businessType)
    const filters = queryFilters(query, session, canViewAll, businessType)
    if (queryText(query.groupBy) === 'customer') {
      const customerExpr = "COALESCE(NULLIF(TRIM(q.customer_name), ''), '')"
      const [countRows] = await pool.query<RowDataPacket[]>(
        mysqlQueryOptions(`SELECT COUNT(DISTINCT ${customerExpr}) AS total, COUNT(*) AS quoteTotal FROM tk_quotation q${filters.where}`),
        filters.params,
      )
      const total = Number(countRows[0]?.total || 0)
      const quoteTotal = Number(countRows[0]?.quoteTotal || 0)
      if (!total) {
        return apiSuccessFields({ rows: [], total: 0, quoteTotal: 0 }, '查询成功')
      }
      const [customerRows] = await pool.query<RowDataPacket[]>(
        mysqlQueryOptions(`
          SELECT ${customerExpr} AS customer_key, MAX(q.update_time) AS latest_update_time, MAX(q.id) AS latest_id
          FROM tk_quotation q${filters.where}
          GROUP BY ${customerExpr}
          ORDER BY latest_update_time DESC, latest_id DESC
          LIMIT ?, ?
        `),
        [...filters.params, page.offset, page.pageSize],
      )
      const customerKeys = customerRows.map((row) => String(row.customer_key ?? ''))
      if (!customerKeys.length) {
        return apiSuccessFields({ rows: [], total, quoteTotal }, '查询成功')
      }
      const placeholders = customerKeys.map(() => '?').join(', ')
      const [quoteRows] = await pool.query<RowDataPacket[]>(
        mysqlQueryOptions(`
          SELECT q.* FROM tk_quotation q${filters.where}
            AND ${customerExpr} IN (${placeholders})
          ORDER BY q.update_time DESC, q.id DESC
        `),
        [...filters.params, ...customerKeys],
      )
      return apiSuccessFields({
        rows: quoteRows.map((row) => ({ ...mapQuotationRow(row), ...reviewerCapabilities(session, row, businessType) })),
        total,
        quoteTotal,
      }, '查询成功')
    }
    const result = await queryPage(
      pool,
      `SELECT COUNT(*) AS total FROM tk_quotation q${filters.where}`,
      `SELECT q.* FROM tk_quotation q${filters.where} ORDER BY q.update_time DESC, q.id DESC LIMIT ?, ?`,
      filters.params,
      [...filters.params, page.offset, page.pageSize],
    )
    return apiSuccessFields({ rows: result.rows.map((row) => ({ ...mapQuotationRow(row), ...reviewerCapabilities(session, row, businessType) })), total: result.total }, '查询成功')
  }, '获取报价单列表失败')
}

export async function getQuotation(event: H3Event, businessType: QuotationBusinessType = 'FOREIGN') {
  return withReadSession(event, 'QuotationDetail', async (session, pool) => {
    const permissions = quotationPermissions(businessType)
    if (!hasPermission(session, permissions.list)) return apiError('没有权限访问报价单', 403)
    const id = Number(queryText(getRouterParam(event, 'id')))
    if (!Number.isSafeInteger(id) || id <= 0) return apiError('报价单ID不符合规范')
    const quotation = await fetchQuotation(pool, id, false, businessType)
    if (!quotation) return apiError('报价单不存在', 404)
    const canViewAll = canViewAllQuotations(session, businessType)
    if (Number(quotation.header.salesperson_id) !== session.userId && !canViewAll) {
      return apiError('没有权限查看此报价单', 403)
    }
    const header = mapQuotationRow(quotation.header)
    const firstLine = quotation.lines[0]
    const headerEndUser = header.endUser || firstLine?.end_user || ''
    const headerCountry = header.country || firstLine?.country || ''
    const headerCustomerStyle = header.customerStyle || firstLine?.customer_style || ''
    const headerRate = header.rate ?? (firstLine?.rate != null ? Number(firstLine.rate) : null)
    const headerQuoteDate = header.quoteDate || formatDate(firstLine?.quote_date) || ''
    const rawConflicts = businessType === 'FOREIGN' && headerEndUser
      ? await findQuotationEndUserConflicts(pool, headerEndUser, header.salespersonId, id)
      : []
    const endUserConflictCount = rawConflicts.length
    const endUserConflicts = canViewAll ? rawConflicts : []
    return apiSuccess({
      ...header,
      endUser: headerEndUser,
      country: headerCountry,
      customerStyle: headerCustomerStyle,
      rate: headerRate,
      quoteDate: headerQuoteDate,
      endUserConflictCount,
      endUserConflicts,
      ...reviewerCapabilities(session, quotation.header, businessType),
      lines: quotation.lines.map((line) => ({ ...mapLineRow(line), endUser: headerEndUser || line.end_user || '' })),
      revisions: await fetchRevisions(pool, id),
    })
  }, '获取报价单详情失败')
}

function requestId(event: H3Event, value?: unknown): string {
  return text(getHeader(event, 'idempotency-key')) || text(value) || crypto.randomUUID()
}

/** 明细行 INSERT 的列顺序（与 lineBaseParams 一一对应） */
const LINE_INSERT_COLUMNS = `
  quotation_id, line_no, quote_date, country, customer_style, quote_to, end_user, application,
  manufacturer, manufacturer_mpn, qty, unit, ctk_mpn, material_code, package_name, die_size, spq_reel,
  original_price_rmb, rate, original_price_usd, lead_time, remark, datasheet,
  initial_price_rmb, initial_price_usd, final_price_rmb, final_price_usd, customer_material_name, min_pack_count
`

function lineBaseParams(quotationId: number, line: QuotationLineInput) {
  return [
    quotationId, line.lineNo, line.quoteDate, line.country, line.customerStyle, line.quoteTo,
    line.endUser, line.application, line.manufacturer, line.manufacturerMpn, line.qty, line.unit,
    line.ctkMpn, line.materialCode, line.packageName, line.dieSize, line.spqReel,
    line.originalPriceRmb, line.rate, line.originalPriceUsd, line.leadTime, line.remark, line.datasheet,
  ]
}

/** 提交：同时把「业务员报价」存成初审价快照（initial = original） */
function lineParams(quotationId: number, line: QuotationLineInput) {
  return [...lineBaseParams(quotationId, line), line.originalPriceRmb, line.originalPriceUsd, null, null, line.customerMaterialName || '', line.minPackCount ?? null]
}

/** 存草稿：不写初审/终审价 */
function formLineParams(quotationId: number, line: QuotationLineInput) {
  return [...lineBaseParams(quotationId, line), null, null, null, null, line.customerMaterialName || '', line.minPackCount ?? null]
}

function boundedText(value: unknown, label: string, maxLength: number): string {
  const valueText = text(value)
  if (valueText.length > maxLength) writeFail(`${label}不能超过${maxLength}个字符`)
  return valueText
}

function formLineHasValues(line: any): boolean {
  return [
    line?.quoteDate, line?.country, line?.customerStyle, line?.quoteTo, line?.application, line?.customerMaterialName, line?.minPackCount,
    line?.manufacturer, line?.manufacturerMpn, line?.qty, line?.unit, line?.ctkMpn, line?.materialCode, line?.packageName,
    line?.dieSize, line?.spqReel, line?.originalPriceRmb, line?.rate, line?.leadTime,
    line?.datasheet, line?.remark,
  ].some((value) => text(value) !== '')
}

function normalizeMinPackCount(value: unknown, lineNo: number): number | null {
  if (value == null || String(value).trim() === '') return null
  const count = Number(value)
  if (!Number.isFinite(count) || count < 0.000001 || count > 999999999999 || Math.abs(count * 1e6 - Math.round(count * 1e6)) > 0.001) writeFail(`第${lineNo}行最小包装数必须为正数，KPCS最多6位小数`)
  return count
}

function domesticCustomerStyle(value: unknown): string {
  const customerStyle = String(normalizeQuotationOptionValue('customerStyle', boundedText(value, '客户性质', 32)) || '终端')
  const violations = quotationOptionViolations([{ customerStyle, rowLabel: '表头' }])
  if (violations.length) writeFail(formatQuotationOptionViolations(violations))
  return customerStyle
}

function normalizeFormLines(body: any, customerName: string, action: 'save' | 'submit', businessType: QuotationBusinessType): QuotationLineInput[] {
  const rawLines = Array.isArray(body.lines) ? body.lines.filter(line => formLineHasValues(businessType === 'DOMESTIC' ? { ...line, unit: '' } : line)) : []
  const lines = rawLines.map((line: any, index: number) => {
    const lineNo = index + 1
    const sourceUnit = line.unit || 'KPCS'
    if (businessType === 'DOMESTIC' && !domesticQuotationUnit(sourceUnit)) writeFail(`第${lineNo}行单位需为KPCS或PCS，不能猜测换算`)
    const rmb = nullablePrice(businessType === 'DOMESTIC' ? domesticPriceToKpcs(line.originalPriceRmb, sourceUnit) : line.originalPriceRmb, `第${lineNo}行人民币单价`)
    const rate = line.rate == null || text(line.rate) === ''
      ? null
      : decimal(line.rate, `第${lineNo}行汇率`, { positive: true })
    const domestic = businessType === 'DOMESTIC'
    return {
      lineNo,
      quoteDate: dateOnly(line.quoteDate || (domestic ? body.quoteDate : ''), `第${lineNo}行报价日期`),
      country: domestic ? '中国' : String(normalizeQuotationOptionValue('country', boundedText(line.country, `第${lineNo}行国家`, 64)) ?? ''),
      customerStyle: domestic ? domesticCustomerStyle(body.customerStyle) : String(normalizeQuotationOptionValue('customerStyle', boundedText(line.customerStyle, `第${lineNo}行客户性质`, 32)) ?? ''),
      quoteTo: boundedText(line.quoteTo || customerName, `第${lineNo}行客户`, 255),
      // 终端客户改为报价单单头字段；历史明细列保留兼容但新行写空值。
      endUser: '',
      application: boundedText(line.application, `第${lineNo}行应用`, 255),
      customerMaterialName: domestic ? boundedText(line.customerMaterialName, `第${lineNo}行客户物料名称`, 255) : '',
      minPackCount: domestic ? normalizeMinPackCount(domesticQuotationUnit(sourceUnit) === 'PCS' ? pcsToKpcs(normalizeMinPackCount(line.minPackCount, lineNo)) : line.minPackCount, lineNo) : null,
      manufacturer: boundedText(line.manufacturer, `第${lineNo}行友商`, 255),
      manufacturerMpn: boundedText(line.manufacturerMpn, `第${lineNo}行友商型号`, 255),
      qty: line.qty == null || text(line.qty) === '' ? null : decimal(line.qty, `第${lineNo}行数量`),
      unit: domestic ? 'KPCS' : DEFAULT_QUOTATION_UNIT,
      ctkMpn: boundedText(line.ctkMpn, `第${lineNo}行物料名称`, 255),
      materialCode: boundedText(line.materialCode, `第${lineNo}行物料编码`, 255),
      packageName: boundedText(line.packageName, `第${lineNo}行封装`, 255),
      dieSize: boundedText(line.dieSize, `第${lineNo}行芯片大小`, 255),
      spqReel: boundedText(line.spqReel, `第${lineNo}行SPQ/Reel`, 255),
      originalPriceRmb: rmb,
      rate,
      // 美元价不接受手填：千只美元价 = 人民币单价 ÷ 汇率
      originalPriceUsd: computeUsdPriceKpcs(rmb, rate),
      leadTime: boundedText(line.leadTime, `第${lineNo}行交期`, 64),
      remark: boundedText(line.remark, `第${lineNo}行备注`, 500),
      datasheet: boundedText(line.datasheet, `第${lineNo}行规格书`, 500),
    }
  })
  if (businessType === 'DOMESTIC') {
    if (!lines.length) writeFail('内贸报价单至少填写一行明细')
    lines.forEach((line, index) => {
      if (!line.ctkMpn) writeFail(`第${index + 1}行必须填写型号`)
      if (line.originalPriceRmb == null || line.originalPriceRmb <= 0) writeFail(`第${index + 1}行必须填写大于0的含税单价`)
    })
  } else {
    // 外贸选项列：国家 / 客户性质 / 单位必须是下拉里的值（保存草稿也不放脏值进库）
    const optionViolations = quotationOptionViolations(lines.map((line, index) => ({
      country: line.country,
      customerStyle: line.customerStyle,
      unit: DEFAULT_QUOTATION_UNIT,
      rowLabel: `第${index + 1}行`,
    })))
    if (optionViolations.length) writeFail(formatQuotationOptionViolations(optionViolations))
  }

  if (businessType === 'FOREIGN' && action === 'submit') {
    if (!lines.length) writeFail('至少填写一行报价明细')
    lines.forEach((line, index) => {
      if (!line.application) writeFail(`第${index + 1}行必须填写应用`)
      if (line.rate == null) writeFail(`第${index + 1}行必须填写汇率`)
    })
  }
  return lines
}

function normalizeFormPayload(body: any, action: 'save' | 'submit', businessType: QuotationBusinessType) {
  if (!['save', 'submit'].includes(action)) writeFail('报价单保存动作不符合规范')
  const customerName = boundedText(body.customerName, '客户', 255)
  const legacyEndUsers = Array.from(new Set((Array.isArray(body.lines) ? body.lines : [])
    .map((line: any) => boundedText(line?.endUser, '终端客户', 255))
    .filter(Boolean)))
  if (legacyEndUsers.length > 1) writeFail('一张报价单只能填写一个终端客户，请移至单头填写')
  if ((action === 'submit' || businessType === 'DOMESTIC') && !customerName) writeFail('客户不能为空')
  const endUser = boundedText(body.endUser || legacyEndUsers[0] || '', '终端客户', 255)
  if (businessType === 'FOREIGN' && action === 'submit' && !endUser) writeFail('终端客户不能为空')
  const lines = normalizeFormLines(body, customerName, action, businessType)
  const firstLine = lines[0]
  const country = businessType === 'DOMESTIC' ? '中国' : boundedText(body.country || firstLine?.country || '', '国家', 64)
  const customerStyle = businessType === 'DOMESTIC' ? domesticCustomerStyle(body.customerStyle) : boundedText(body.customerStyle || firstLine?.customerStyle || '', '客户性质', 32)
  const rate = businessType === 'DOMESTIC'
    ? null
    : body.rate != null && text(body.rate) !== ''
      ? decimal(body.rate, '基准汇率', { positive: true })
      : (firstLine?.rate ?? null)
  const quoteDate = body.quoteDate ? dateOnly(body.quoteDate, '报价日期') : (firstLine?.quoteDate || null)
  return {
    action,
    customerName,
    endUser,
    country,
    customerStyle,
    rate,
    quoteDate,
    deliveryTerms: boundedText(body.deliveryTerms, '贸易条款', 255),
    validity: boundedText(body.validity, '有效期', 255),
    paymentTerm: boundedText(body.paymentTerm, businessType === 'DOMESTIC' ? '客户收款方式' : '付款方式', 500) || (businessType === 'DOMESTIC' ? '现金' : ''),
    contactText: boundedText(body.contactText, '联系人', 255),
    city: businessType === 'FOREIGN' ? boundedText(body.city, '城市 / City', 128) : '',
    customerAddress: boundedText(body.customerAddress, '客户地址', 500),
    customerPhone: boundedText(body.customerPhone, '客户电话', 64),
    customerApplication: businessType === 'DOMESTIC' ? boundedText(body.customerApplication, '客户应用', 255) : '',
    lines,
  }
}

async function insertQuotationLines(connection: PoolConnection, quotationId: number, lines: QuotationLineInput[], draft: boolean) {
  for (let index = 0; index < lines.length; index += 1) {
    // 序号即明细顺序 1..N：导出模板按 `detailStartRow + line_no - 1` 定位行（见 populateQuotationWorkbook），
    // 且表上有 UNIQUE(quotation_id, line_no)。这里按当前顺序统一重编号，任何来源（Excel 上传 / 表单 / 粘贴）
    // 带来的重复或跳号都不会再让整单写入失败。
    const line: QuotationLineInput = { ...lines[index], lineNo: index + 1 }
    await connection.execute(mysqlQueryOptions(`
      INSERT INTO tk_quotation_line
        (${LINE_INSERT_COLUMNS})
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `), draft ? formLineParams(quotationId, line) : lineParams(quotationId, line))
  }
}

async function createQuotationHandler(event: H3Event, businessType: QuotationBusinessType = 'FOREIGN') {
  const permissions = quotationPermissions(businessType)
  const body = await bodyOf(event)
  const action = text(body.action) as 'save' | 'submit'
  const payload = normalizeFormPayload(body, action, businessType)
  const requestKey = requestId(event, body.requestId)
  let businessResult: any = null
  let notifyTarget: QuotationNotifyTarget | null = null
  return withIdempotentWriteSession(
    event,
    `quotation:${businessType}:create:${action}`,
    permissions.upload,
    requestKey,
    payload,
    async (session, connection) => {
      const number = await allocateQuotationNumber(connection, businessType)
      const status: QuotationStatus = action === 'submit' ? 'PENDING_INITIAL' : 'DRAFT'
      const result: any = await connection.execute(mysqlQueryOptions(`
        INSERT INTO tk_quotation
          (business_type, quote_no, input_mode, original_name, storage_path, source_sheet_name,
           quote_date, customer_name, end_user, country, customer_style, rate,
           delivery_terms, validity, payment_term, contact_text,
           salesperson_id, salesperson_name, status, line_count, customer_address, customer_phone, customer_application${businessType === 'FOREIGN' ? ', city' : ''}, create_time, update_time)
        VALUES (?, ?, 'FORM', '系统录入', '', '报价单', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${businessType === 'FOREIGN' ? ', ?' : ''}, NOW(), NOW())
      `), [
        businessType, number, payload.quoteDate, payload.customerName, payload.endUser, payload.country, payload.customerStyle, payload.rate,
        payload.deliveryTerms, payload.validity, payload.paymentTerm, payload.contactText || '',
        session.userId, sessionName(session), status, payload.lines.length, payload.customerAddress, payload.customerPhone, payload.customerApplication, ...(businessType === 'FOREIGN' ? [payload.city] : []),
      ])
      const quotationId = Number(result[0]?.insertId)
      await insertQuotationLines(connection, quotationId, payload.lines, action === 'save')
      await insertRevision(connection, quotationId, 'SALES', action === 'save' ? 'DRAFT_SAVE' : 'SUBMIT_INITIAL', '', session, businessType)
      if (action === 'submit') {
        notifyTarget = {
          businessType,
          quotationId,
          quoteNo: number,
          customerName: payload.customerName,
          salespersonName: sessionName(session),
          lineCount: payload.lines.length,
          operatorName: sessionName(session),
        }
      }
      businessResult = apiSuccess({ id: quotationId, quoteNo: number, status, statusLabel: statusLabel(status) }, action === 'save' ? '报价单草稿已保存' : '报价单已提交初审')
      return businessResult
    },
    '报价单创建失败',
    async () => runQuotationNotify('initial', notifyTarget, businessResult),
  )
}

async function updateQuotationDraftHandler(event: H3Event, businessType: QuotationBusinessType = 'FOREIGN') {
  const permissions = quotationPermissions(businessType)
  const body = await bodyOf(event)
  const quotationId = Number(getRouterParam(event, 'id'))
  if (!Number.isSafeInteger(quotationId) || quotationId <= 0) writeFail('报价单ID不符合规范')
  const action = text(body.action) as 'save' | 'submit'
  const payload = normalizeFormPayload(body, action, businessType)
  const requestKey = requestId(event, body.requestId)
  let businessResult: any = null
  let notifyTarget: QuotationNotifyTarget | null = null
  return withIdempotentWriteSession(
    event,
    `quotation:${businessType}:draft:${action}`,
    permissions.upload,
    requestKey,
    { id: quotationId, ...payload },
    async (session, connection) => {
      const quotation = await fetchQuotation(connection, quotationId, true, businessType)
      if (!quotation) writeFail('报价单不存在', 404)
      if (Number(quotation.header.salesperson_id) !== session.userId) writeFail('只能编辑自己创建的报价单', 403)
      const editableStatus = String(quotation.header.status)
      if (!['DRAFT', 'RETURNED'].includes(editableStatus)) writeFail('只有草稿或已退回的报价单可以编辑', 409)
      if (businessType === 'DOMESTIC' && quotation.lines.some(line => !domesticQuotationUnit(line.unit))
        && (body.lines || []).filter(formLineHasValues).some(line => !domesticQuotationUnit(line.unit))) {
        writeFail('历史报价存在单位待核对的明细，请先明确原计价单位，不会自动将空白单位视为KPCS', 409)
      }
      const status: QuotationStatus = action === 'submit' ? 'PENDING_INITIAL' : 'DRAFT'
      await connection.execute(mysqlQueryOptions(`
        UPDATE tk_quotation
        SET input_mode = 'FORM', original_name = '系统录入', storage_path = '', source_sheet_name = '报价单',
            quote_date = ?, customer_name = ?, end_user = ?, country = ?, customer_style = ?, rate = ?,
            delivery_terms = ?, validity = ?, payment_term = ?, contact_text = ?,
            status = ?, line_count = ?, customer_address = ?, customer_phone = ?, customer_application = ?${businessType === 'FOREIGN' ? ', city = ?' : ''}, update_time = NOW()
        WHERE id = ? AND salesperson_id = ? AND status IN ('DRAFT', 'RETURNED')
      `), [
        payload.quoteDate, payload.customerName, payload.endUser, payload.country, payload.customerStyle, payload.rate,
        payload.deliveryTerms, payload.validity, payload.paymentTerm, payload.contactText || '',
        status, payload.lines.length, payload.customerAddress, payload.customerPhone, payload.customerApplication, ...(businessType === 'FOREIGN' ? [payload.city] : []), quotationId, session.userId,
      ])
      await connection.execute(mysqlQueryOptions('DELETE FROM tk_quotation_line WHERE quotation_id = ?'), [quotationId])
      await insertQuotationLines(connection, quotationId, payload.lines, action === 'save')
      await insertRevision(connection, quotationId, 'SALES', action === 'save' ? 'DRAFT_SAVE' : 'SUBMIT_INITIAL', '', session, businessType)
      if (action === 'submit') {
        notifyTarget = {
          businessType,
          quotationId,
          quoteNo: quotation.header.quote_no,
          customerName: payload.customerName,
          salespersonName: sessionName(session),
          lineCount: payload.lines.length,
          operatorName: sessionName(session),
        }
      }
      businessResult = apiSuccess({ id: quotationId, status, statusLabel: statusLabel(status) }, action === 'save' ? '报价单草稿已保存' : '报价单已提交初审')
      return businessResult
    },
    '报价单草稿保存失败',
    async () => runQuotationNotify('initial', notifyTarget, businessResult),
  )
}

async function uploadQuotationHandler(event: H3Event, businessType: QuotationBusinessType = 'FOREIGN') {
  const permissions = quotationPermissions(businessType)
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)
  if (!hasPermission(authenticated.session, permissions.upload)) return apiError('没有上传报价单权限', 403)

  const parts = await readMultipartFormData(event)
  const file = (parts || []).find((part) => part.name === 'file' && part.filename)
  const requestPart = (parts || []).find((part) => part.name === 'requestId' && !part.filename)
  const actionPart = (parts || []).find((part) => part.name === 'action' && !part.filename)
  const idPart = (parts || []).find((part) => part.name === 'id' && !part.filename)
  const action = actionPart ? Buffer.from(actionPart.data).toString('utf8').trim() : 'submit'
  // 带 id = 用上传的 Excel 覆盖已有的草稿/已退回单据（业务员改完重新上传），不带 = 新建
  const targetId = idPart ? Number(Buffer.from(idPart.data).toString('utf8').trim()) : 0
  if (targetId !== 0 && (!Number.isSafeInteger(targetId) || targetId <= 0)) return apiError('报价单ID不符合规范')
  const isDraft = action === 'save'
  const initialStatus: QuotationStatus = isDraft ? 'DRAFT' : 'PENDING_INITIAL'
  const requestKey = requestId(event, requestPart ? Buffer.from(requestPart.data).toString('utf8') : '')
  if (!file?.data?.length) return apiError('请选择报价单文件')
  if (file.data.length > 20 * 1024 * 1024) return apiError('报价单文件不能超过20MB')

  let parsed: ParsedQuotationWorkbook
  try {
    parsed = businessType === 'DOMESTIC'
      ? parseDomesticQuotationWorkbook(file.data, file.filename || '内贸报价单.xlsx')
      : parseQuotationWorkbook(file.data, file.filename || '报价单.xlsx', { requireLatestTemplate: true })
    parsed.city = businessType === 'FOREIGN' ? boundedText(parsed.city, '城市 / City', 128) : ''
    if (businessType === 'DOMESTIC') {
      parsed.customerAddress = boundedText(parsed.customerAddress, '客户地址', 500)
      parsed.customerPhone = boundedText(parsed.customerPhone, '客户电话', 64)
      parsed.customerApplication = boundedText(parsed.customerApplication, '客户应用', 255)
      parsed.paymentTerm = boundedText(parsed.paymentTerm, '客户收款方式', 500) || '现金'
      parsed.customerStyle = domesticCustomerStyle(parsed.customerStyle)
      parsed.lines.forEach((line) => { line.customerStyle = parsed.customerStyle! })
    } else if (!isDraft) {
      if (!String(parsed.endUser || '').trim()) throw new Error('终端客户不能为空')
      parsed.lines.forEach((line, index) => {
        if (!String(line.application || '').trim()) throw new Error(`第${index + 1}行必须填写应用`)
      })
    }
  } catch (error) {
    return apiError(error instanceof Error ? error.message : '报价单解析失败')
  }

  const fingerprint = crypto.createHash('sha256').update(Buffer.from(file.data)).digest('hex')
  let businessResult: any = null
  let notifyTarget: QuotationNotifyTarget | null = null
  return withIdempotentWriteSession(
    event,
    `quotation:${businessType}:upload:${action}`,
    permissions.upload,
    requestKey,
    { businessType, filename: file.filename, size: file.data.length, fingerprint, action, customerStyle: parsed.customerStyle },
    async (session, connection) => {
      const saved = await saveSourceFile(file)
      try {
        if (targetId > 0) {
          const [currentRows] = await connection.query<RowDataPacket[]>(
            mysqlQueryOptions('SELECT id, quote_no, salesperson_id, status FROM tk_quotation WHERE id = ? AND business_type = ? FOR UPDATE'),
            [targetId, businessType],
          )
          const current = currentRows[0]
          const rejectReason = assertUploadOverwriteTarget(current, session.userId)
          if (rejectReason) {
            // 校验没过就不留这次上传的源文件
            await rm(saved.target, { force: true }).catch(() => undefined)
            return rejectReason
          }

          const number = String(current.quote_no)
          const firstLine = parsed.lines[0]
          const quoteDate = parsed.quoteDate || firstLine?.quoteDate || null
          const country = parsed.country || firstLine?.country || ''
          const customerStyle = parsed.customerStyle || firstLine?.customerStyle || ''
          const rate = parsed.rate ?? (firstLine?.rate != null ? Number(firstLine.rate) : null)

          await connection.execute(mysqlQueryOptions(`
            UPDATE tk_quotation
            SET input_mode = 'UPLOAD', original_name = ?, storage_path = ?, source_sheet_name = ?,
                quote_date = ?, customer_name = ?, end_user = ?, country = ?, customer_style = ?, rate = ?,
                delivery_terms = ?, validity = ?, payment_term = ?, contact_text = ?,
                status = ?, line_count = ?, customer_address = ?, customer_phone = ?, customer_application = ?${businessType === 'FOREIGN' ? ', city = ?' : ''}, update_time = NOW()
            WHERE id = ?
          `), [
            file.filename || '报价单.xlsx', saved.relativePath, parsed.sheetName,
            quoteDate, parsed.customerName, parsed.endUser, country, customerStyle, rate,
            parsed.deliveryTerms, parsed.validity, parsed.paymentTerm, parsed.contact || '',
            initialStatus, parsed.lines.length, parsed.customerAddress || '', parsed.customerPhone || '', parsed.customerApplication || '', ...(businessType === 'FOREIGN' ? [parsed.city || ''] : []), targetId,
          ])
          await connection.execute(mysqlQueryOptions('DELETE FROM tk_quotation_line WHERE quotation_id = ?'), [targetId])
          await insertQuotationLines(connection, targetId, parsed.lines, isDraft)
          await insertRevision(connection, targetId, 'SALES', isDraft ? 'DRAFT_SAVE' : 'SUBMIT_INITIAL', '上传模板覆盖内容', session, businessType)
          if (!isDraft) {
            notifyTarget = {
              businessType,
              quotationId: targetId,
              quoteNo: number,
              customerName: parsed.customerName,
              salespersonName: sessionName(session),
              lineCount: parsed.lines.length,
              operatorName: sessionName(session),
            }
          }
          businessResult = apiSuccess(
            { id: targetId, quoteNo: number, status: initialStatus, statusLabel: statusLabel(initialStatus) },
            isDraft ? '报价单草稿已保存' : '报价单已上传，等待初审',
          )
          return businessResult
        }

        const number = await allocateQuotationNumber(connection, businessType)
        const firstLine = parsed.lines[0]
        const quoteDate = parsed.quoteDate || firstLine?.quoteDate || null
        const country = parsed.country || firstLine?.country || ''
        const customerStyle = parsed.customerStyle || firstLine?.customerStyle || ''
        const rate = parsed.rate ?? (firstLine?.rate != null ? Number(firstLine.rate) : null)

        const result: any = await connection.execute(mysqlQueryOptions(`
          INSERT INTO tk_quotation
            (business_type, quote_no, input_mode, original_name, storage_path, source_sheet_name,
             quote_date, customer_name, end_user, country, customer_style, rate,
             delivery_terms, validity, payment_term, contact_text,
             salesperson_id, salesperson_name, status, line_count, customer_address, customer_phone, customer_application${businessType === 'FOREIGN' ? ', city' : ''}, create_time, update_time)
          VALUES (?, ?, 'UPLOAD', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${businessType === 'FOREIGN' ? ', ?' : ''}, NOW(), NOW())
        `), [
          businessType, number, file.filename || '报价单.xlsx', saved.relativePath, parsed.sheetName,
          quoteDate, parsed.customerName, parsed.endUser, country, customerStyle, rate,
          parsed.deliveryTerms, parsed.validity,
          parsed.paymentTerm, parsed.contact || '', session.userId, sessionName(session), initialStatus, parsed.lines.length, parsed.customerAddress || '', parsed.customerPhone || '', parsed.customerApplication || '', ...(businessType === 'FOREIGN' ? [parsed.city || ''] : []),
        ])
        const quotationId = Number(result[0]?.insertId)
        await insertQuotationLines(connection, quotationId, parsed.lines, isDraft)
        await insertRevision(connection, quotationId, 'SYSTEM', isDraft ? 'DRAFT_SAVE' : 'UPLOAD', '', session, businessType)
        if (!isDraft) {
          notifyTarget = {
            businessType,
            quotationId,
            quoteNo: number,
            customerName: parsed.customerName,
            salespersonName: sessionName(session),
            lineCount: parsed.lines.length,
            operatorName: sessionName(session),
          }
        }
        businessResult = apiSuccess({ id: quotationId, quoteNo: number, status: initialStatus, statusLabel: statusLabel(initialStatus) }, isDraft ? '报价单草稿已保存' : '报价单已上传，等待初审')
        return businessResult
      } catch (error) {
        await rm(saved.target, { force: true }).catch(() => undefined)
        throw error
      }
    },
    '报价单上传失败',
    async () => runQuotationNotify('initial', notifyTarget, businessResult),
  )
}

/**
 * 上传覆盖已有单据的前置校验（建单只走「下载模板 → 填好上传」后，改单也走上传）：
 * 必须存在、必须是本人的单、状态只能是草稿或已退回。
 */
export function assertUploadOverwriteTarget(current: Record<string, any> | undefined, userId: number) {
  if (!current) return apiError('报价单不存在', 404)
  if (Number(current.salesperson_id) !== Number(userId)) return apiError('只能修改本人创建的报价单', 403)
  if (current.status !== 'DRAFT' && current.status !== 'RETURNED') {
    return apiError(`当前状态为「${statusLabel(current.status as QuotationStatus)}」，不能通过上传修改`, 409)
  }
  return null
}

/** 行级报价日期：只接受 YYYY-MM-DD，空值原样返回 null */
function dateOnly(value: unknown, label: string): string | null {
  const raw = text(value)
  if (!raw) return null
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(raw)) writeFail(`${label}格式必须为YYYY-MM-DD`)
  return raw
}

function nullablePrice(value: unknown, label: string): number | null {
  if (value == null || text(value) === '') return null
  const amount = decimal(value, label, { required: true })
  if (amount == null) return null
  // 单价统一两位小数（人民币/美元同口径）：页面显示、入库、导出保持一致
  return Math.round((amount + Number.EPSILON) * 100) / 100
}

async function reviewQuotationHandler(event: H3Event, businessType: QuotationBusinessType = 'FOREIGN') {
  const permissions = quotationPermissions(businessType)
  const body = await bodyOf(event)
  const quotationId = Number(body.id)
  if (!Number.isSafeInteger(quotationId) || quotationId <= 0) writeFail('报价单ID不符合规范')
  const stage = text(body.stage) as QuotationReviewStage
  const action = text(body.action) as 'approve' | 'return' | 'undo'
  if (!['initial', 'second', 'final'].includes(stage)) writeFail('审核阶段不符合规范')
  if (!['approve', 'return', 'undo'].includes(action)) writeFail('审核动作不符合规范')
  // 初审 / 二审 / 终审任一可用环节都能「通过」或「退回」；不论在哪一级退回，都退回给业务员
  const comment = text(body.comment)
  if (action === 'return' && !comment) writeFail('退回时必须填写意见')
  if (comment.length > 2000) writeFail('审核意见不能超过2000个字符')
  if (body.priceChanges != null && !Array.isArray(body.priceChanges)) writeFail('改价明细格式不正确')
  const priceChanges = Array.isArray(body.priceChanges) ? body.priceChanges : []
  if (action === 'return' && priceChanges.length) writeFail('退回时不能保存改价')
  if (action === 'undo' && priceChanges.length) writeFail('撤销审核不能同时改价')
  const permission = {
    initial: permissions.initialReview,
    second: permissions.secondReview,
    final: permissions.finalReview,
  }[stage]
  const requestKey = requestId(event, body.requestId)
  let businessResult: any = null
  let notifyTarget: QuotationNotifyTarget | null = null
  let notifyStage: QuotationNotifyStage | null = null
  let approvedNotifyTarget: QuotationNotifyTarget | null = null
  let approvedApplicantId: number | null = null
  let returnTarget: QuotationReturnNotifyTarget | null = null
  let returnRecipients: string[] = []

  return withIdempotentWriteSession(
    event,
    `quotation:${businessType}:${stage}:${action}`,
    permission,
    requestKey,
    { id: quotationId, stage, action, comment, priceChanges },
    async (session, connection) => {
      const quotation = await fetchQuotation(connection, quotationId, true, businessType)
      if (!quotation) writeFail('报价单不存在', 404)
      if (action === 'undo') {
        const capabilities = reviewerCapabilities(session, quotation.header, businessType)
        if (!capabilities.canUndoReview || capabilities.undoReviewStage !== stage) writeFail('只能撤销自己最近一次通过，且下一级尚未处理的审核', 409)
        const [history] = await connection.query<RowDataPacket[]>(mysqlQueryOptions('SELECT id, action, operator_id, snapshot_json FROM tk_quotation_revision WHERE quotation_id = ? ORDER BY id DESC LIMIT 2'), [quotationId])
        // 初审通过的旧内贸单留痕为 APPROVE_INITIAL_TO_FINAL，撤销时同样接受
        const expectedActions = stage === 'initial' ? ['APPROVE_INITIAL', 'APPROVE_INITIAL_TO_FINAL'] : [`APPROVE_${stage.toUpperCase()}`]
        if (history.length !== 2 || !expectedActions.includes(history[0].action) || Number(history[0].operator_id) !== session.userId) writeFail('审批记录已变化，不能撤销', 409)
        const previous = JSON.parse(history[1].snapshot_json)
        const nextStatus = stage === 'initial' ? 'PENDING_INITIAL' : stage === 'second' ? 'PENDING_SECOND' : 'PENDING_FINAL'
        if (previous.header?.status !== nextStatus || !Array.isArray(previous.lines) || previous.lines.length !== quotation.lines.length || quotation.lines.some(line => !previous.lines.some(old => Number(old.id) === Number(line.id)))) writeFail('审核前快照不完整，不能撤销', 409)
        for (const line of previous.lines) {
          await connection.execute(mysqlQueryOptions('UPDATE tk_quotation_line SET initial_price_rmb = ?, initial_price_usd = ?, final_price_rmb = ?, final_price_usd = ? WHERE id = ? AND quotation_id = ?'), [line.initialPriceRmb ?? null, line.initialPriceUsd ?? null, line.finalPriceRmb ?? null, line.finalPriceUsd ?? null, line.id, quotationId])
        }
        await connection.execute(mysqlQueryOptions(`UPDATE tk_quotation SET status = ?, ${stage}_reviewer_id = NULL, ${stage}_reviewer_name = '', ${stage}_review_time = NULL, ${stage}_comment = '', update_time = NOW() WHERE id = ?`), [nextStatus, quotationId])
        await insertRevision(connection, quotationId, stage.toUpperCase(), `UNDO_${stage.toUpperCase()}`, comment || '撤销误点通过', session, businessType)
        return apiSuccess({ id: quotationId, status: nextStatus, statusLabel: statusLabel(nextStatus) }, '已撤销通过，恢复待审核')
      }
      const currentStatus = String(quotation.header.status)
      // 审核只在对应环节的「待审」状态可用；「已退回」状态待业务员重新提交（重新从初审开始）
      const allowed = stage === 'initial'
        ? currentStatus === 'PENDING_INITIAL'
        : stage === 'second'
          ? currentStatus === 'PENDING_SECOND'
          : currentStatus === 'PENDING_FINAL'
      if (!allowed) writeFail(`当前状态为“${statusLabel(currentStatus)}”，不能执行此审核动作`, 409)

      const linesById = new Map(quotation.lines.map((line) => [Number(line.id), line]))
      const changedIds = new Set<number>()
      for (const change of priceChanges) {
        const lineId = Number(change?.id)
        const line = linesById.get(lineId)
        if (!Number.isSafeInteger(lineId) || !line || changedIds.has(lineId)) writeFail('改价明细行无效或重复')
        changedIds.add(lineId)
        const rmb = nullablePrice(change.priceRmb, `第${line.line_no}行人民币单价`)
        if (rmb == null || rmb <= 0) writeFail(`第${line.line_no}行人民币单价必须大于0`)
        const rate = Number(line.rate)
        if (businessType === 'FOREIGN' && (!Number.isFinite(rate) || rate <= 0)) writeFail(`第${line.line_no}行汇率无效，不能改价`)
        const usd = businessType === 'FOREIGN' ? Math.round((rmb / rate + Number.EPSILON) * 100) / 100 : null
        const target = stage === 'initial' ? 'initial' : 'final'
        await connection.execute(mysqlQueryOptions(`
          UPDATE tk_quotation_line SET ${target}_price_rmb = ?, ${target}_price_usd = ?
          WHERE id = ? AND quotation_id = ?
        `), [rmb, usd, lineId, quotationId])
      }

      const reviewerFields: Record<QuotationReviewStage, { id: string; name: string; time: string; comment: string }> = {
        initial: { id: 'initial_reviewer_id', name: 'initial_reviewer_name', time: 'initial_review_time', comment: 'initial_comment' },
        second: { id: 'second_reviewer_id', name: 'second_reviewer_name', time: 'second_review_time', comment: 'second_comment' },
        final: { id: 'final_reviewer_id', name: 'final_reviewer_name', time: 'final_review_time', comment: 'final_comment' },
      }
      const fields = reviewerFields[stage]
      let nextStatus: QuotationStatus
      let actionCode: string
      if (action === 'return') {
        // 任何环节退回都落「已退回」：单据回到业务员手里，业务员重新提交时从初审重跑一遍
        nextStatus = 'RETURNED'
        actionCode = ({ initial: 'RETURN_BY_INITIAL', second: 'RETURN_BY_SECOND', final: 'RETURN_BY_FINAL' } as Record<QuotationReviewStage, string>)[stage]
      } else if (stage === 'initial') {
        nextStatus = 'PENDING_SECOND'
        actionCode = 'APPROVE_INITIAL'
      } else if (stage === 'second') {
        nextStatus = 'PENDING_FINAL'
        actionCode = 'APPROVE_SECOND'
      } else {
        nextStatus = 'APPROVED'
        actionCode = 'APPROVE_FINAL'
      }

      // 审核结果和本环节的改价在同一事务内保存。
      await connection.execute(mysqlQueryOptions(`
        UPDATE tk_quotation
        SET status = ?, ${fields.id} = ?, ${fields.name} = ?, ${fields.time} = NOW(), ${fields.comment} = ?, update_time = NOW()
        WHERE id = ?
      `), [nextStatus, session.userId, sessionName(session), comment, quotationId])

      if (stage === 'final' && action === 'approve') {
        // 终审通过即冻结成交价：审核人不改价，成交价 = 业务员最后一次提交的价格快照
        await connection.execute(mysqlQueryOptions(`
          UPDATE tk_quotation_line
          SET final_price_rmb = COALESCE(final_price_rmb, initial_price_rmb, original_price_rmb),
              final_price_usd = COALESCE(final_price_usd, initial_price_usd, original_price_usd)
          WHERE quotation_id = ?
        `), [quotationId])
      }

      await insertRevision(connection, quotationId, stage.toUpperCase(), actionCode, comment, session, businessType)

      if (action === 'return') {
        // 退回通知收件人 = 该单所有经手过的人（业务员 + 已审过的各级审核人），去重后排除本次操作人
        const [historyRows] = await connection.query<RowDataPacket[]>(mysqlQueryOptions(`
          SELECT DISTINCT operator_name FROM tk_quotation_revision
          WHERE quotation_id = ? AND TRIM(COALESCE(operator_name, '')) <> ''
        `), [quotationId])
        const operator = sessionName(session)
        returnRecipients = historyRows
          .map((row) => String(row.operator_name).trim())
          .filter((name) => name && name !== operator)
        returnTarget = {
          businessType,
          quotationId,
          quoteNo: quotation.header.quote_no,
          customerName: quotation.header.customer_name,
          salespersonName: quotation.header.salesperson_name,
          lineCount: quotation.lines.length,
          operatorName: operator,
          stageLabel: REVIEW_STAGE_LABELS[stage],
          comment,
        }
      } else if (stage !== 'final') {
        // 通过往前推进才提醒下一环节（终审通过是终态，不再提醒）
        notifyStage = stage === 'initial' ? 'second' : 'final'
        notifyTarget = {
          businessType,
          quotationId,
          quoteNo: quotation.header.quote_no,
          customerName: quotation.header.customer_name,
          salespersonName: quotation.header.salesperson_name,
          lineCount: quotation.lines.length,
          operatorName: sessionName(session),
          action: actionCode,
        }
      } else if (action === 'approve') {
        approvedApplicantId = Number(quotation.header.salesperson_id) || null
        approvedNotifyTarget = {
          businessType,
          quotationId,
          quoteNo: quotation.header.quote_no,
          customerName: quotation.header.customer_name,
          salespersonName: quotation.header.salesperson_name,
          lineCount: quotation.lines.length,
          operatorName: sessionName(session),
          action: actionCode,
        }
      }

      businessResult = apiSuccess(
        { id: quotationId, status: nextStatus, statusLabel: statusLabel(nextStatus) },
        action === 'return' ? `已退回业务员（${REVIEW_STAGE_LABELS[stage]}退回）` : '审核已保存',
      )
      return businessResult
    },
    '报价单审核失败',
    async () => {
      if (notifyStage) await runQuotationNotify(notifyStage, notifyTarget, businessResult)
      if (returnTarget) await runQuotationReturnNotify(returnTarget, returnRecipients, businessResult)
      if (approvedNotifyTarget) await runQuotationApprovedNotify(approvedNotifyTarget, approvedApplicantId, businessResult)
    },
  )
}

async function approvedQuotation(event: H3Event, id: number, permission: string, businessType: QuotationBusinessType = 'FOREIGN') {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return { error: apiError('登录状态已过期', 401) }
  if (!hasPermission(authenticated.session, permission)) return { error: apiError('没有权限访问报价单', 403) }
  const quotation = await fetchQuotation(getMysqlPool(), id, false, businessType)
  if (!quotation) return { error: apiError('报价单不存在', 404) }
  if (String(quotation.header.status) !== 'APPROVED') return { error: apiError('报价单尚未通过王总终审', 409) }
  const isOwner = Number(quotation.header.salesperson_id) === authenticated.session.userId
  const canAll = hasPermission(authenticated.session, quotationPermissions(businessType).finalReview)
  if (!isOwner && !canAll) return { error: apiError('只能下载自己创建的报价单', 403) }
  return { session: authenticated.session, quotation }
}

export function quotationTemplatePath(fileName = '外贸销售报价单模板.xlsx'): string | null {
  const candidates = [
    resolve(process.cwd(), 'server/templates', fileName),
    resolve(process.cwd(), '../server/templates', fileName),
  ]
  return candidates.find((candidate) => existsSync(candidate)) || null
}

export async function readQuotationTemplateBytes(fileName = '外贸销售报价单模板.xlsx'): Promise<Buffer | null> {
  const templatePath = quotationTemplatePath(fileName)
  if (templatePath) return readFile(templatePath)

  const bundledBytes = await useStorage('assets:quotation-templates').getItemRaw<Uint8Array>(fileName)
  return bundledBytes ? Buffer.from(bundledBytes) : null
}

function clearWorkbookCell(sheet: any, address: string, format?: string) {
  const current = sheet[address]
  if (!current && !format) return
  sheet[address] = {
    ...(current || {}),
    t: 'z',
    v: null,
    ...(format ? { z: format } : {}),
  }
  delete sheet[address].w
  delete sheet[address].h
  delete sheet[address].r
}

function setWorkbookValue(sheet: any, address: string, value: unknown, format?: string) {
  if (value == null || value === '') {
    clearWorkbookCell(sheet, address, format)
    return
  }
  const numeric = typeof value === 'number' ? value : Number(value)
  const isNumber = typeof value === 'number' && Number.isFinite(numeric)
  sheet[address] = {
    ...(sheet[address] || {}),
    t: isNumber ? 'n' : 's',
    v: isNumber ? numeric : String(value),
    ...(format ? { z: format } : {}),
  }
  delete sheet[address].w
  delete sheet[address].h
  delete sheet[address].r
}

function setWorkbookPrice(sheet: any, address: string, value: number | null, format: string) {
  setWorkbookValue(sheet, address, value, format)
}

const LEAD_TIME_MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

function excelDateSerial(value: unknown): number | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / 86400000 + 25569
  }
  const raw = String(value || '').trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})/u.exec(raw)
  let parts: [number, number, number] | null = null
  if (match) {
    parts = [Number(match[1]), Number(match[2]), Number(match[3])]
  } else {
    // 交期在页面/历史数据里可能是模板的显示格式（01-Dec-26）：两位年按 Excel 口径还原
    // \d{4} 必须在 \d{2} 前面，否则 '1-Dec-2026' 只会吃到 '20'
    const dMy = /^(\d{1,2})[\s\/-]([A-Za-z]{3})[\s\/-](\d{4}|\d{2})/u.exec(raw)
    const month = dMy ? LEAD_TIME_MONTHS[dMy[2].toLowerCase()] : undefined
    if (dMy && month) {
      const yy = Number(dMy[3])
      const year = String(dMy[3]).length === 4 ? yy : (yy < 30 ? 2000 + yy : 1900 + yy)
      parts = [year, month, Number(dMy[1])]
    }
  }
  if (!parts) return null
  const date = Date.UTC(parts[0], parts[1] - 1, parts[2])
  return Number.isFinite(date) ? date / 86400000 + 25569 : null
}

function cloneWorksheetRow(sheet: any, sourceRow: number, targetRow: number, maxColumn = 21) {
  const XLSX = getXlsxSync()
  for (let column = 0; column <= maxColumn; column += 1) {
    const sourceAddress = XLSX.utils.encode_cell({ r: sourceRow - 1, c: column })
    const targetAddress = XLSX.utils.encode_cell({ r: targetRow - 1, c: column })
    const source = sheet[sourceAddress]
    if (source) {
      sheet[targetAddress] = { ...source }
      if (sheet[targetAddress].t === 'n' || sheet[targetAddress].t === 's') sheet[targetAddress].v = null
      delete sheet[targetAddress].w
      delete sheet[targetAddress].h
      delete sheet[targetAddress].r
    } else {
      delete sheet[targetAddress]
    }
  }
  if (Array.isArray(sheet['!rows'])) {
    const sourceMeta = sheet['!rows'][sourceRow - 1]
    if (sourceMeta) sheet['!rows'][targetRow - 1] = { ...sourceMeta }
  }
}

function ensureWorksheetRow(sheet: any, row: number, detailStartRow = 6) {
  const XLSX = getXlsxSync()
  const range = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : { e: { r: detailStartRow - 1, c: 14 } }
  if (row <= range.e.r + 1) return
  const sourceRow = Math.min(detailStartRow, range.e.r + 1)
  for (let current = range.e.r + 2; current <= row; current += 1) cloneWorksheetRow(sheet, sourceRow, current)
  range.e.r = row - 1
  if (range.e.c < 14) range.e.c = 14
  sheet['!ref'] = XLSX.utils.encode_range(range)
}

/** 历史模板 A4：固定公司网址行（不再掺业务员联系方式） */
export const QUOTATION_TEMPLATE_WEB_LINE = '网址：https://example.com\nWebsite: https://example.com'
const QUOTATION_TEMPLATE_WEBSITE = 'https://example.com'

/** 空白模板中未填写的贸易条款默认值。 */
const QUOTATION_DEFAULT_DELIVERY_TERMS = 'EXW Dongguan'

/** 空白模板里待业务员填的位置，用下划线占位（业务给的样式） */
const QUOTATION_TERM_PLACEHOLDER = '________'

/** 业务员填的默认付款方式（模板预填，可自由改） */
export const QUOTATION_DEFAULT_PAYMENT_TERM = '30% deposit,and 70% before shipping'

function quotationHeaderValues(header: any, options: { blank?: boolean } = {}) {
  const blank = options.blank === true
  const trim = (value: unknown) => String(value ?? '').trim()
  // 业务员可能把值连同分隔符一起填进来（如 "EXW Dongguan ;"），清掉尾部分号
  const clean = (value: unknown) => trim(value).replace(/[;；]+\s*$/u, '').trim()

  // 有效期：统一归一到 <n>days（纯数字/周/月/中文「天」都折算），导出再上传读得回来；
  // 认不出的写法原样写进去 —— 以前是硬拼 " days"，会把「永久」写成「永久 days」
  const deliveryTerms = clean(header?.delivery_terms || header?.deliveryTerms)
    || (blank ? QUOTATION_DEFAULT_DELIVERY_TERMS : '')
  const validity = normalizeQuotationValidity(header?.validity)
    || (blank ? QUOTATION_TERM_PLACEHOLDER : '')
  const paymentTerm = clean(exportPaymentTerm(header?.payment_term || header?.paymentTerm))
    || (blank ? QUOTATION_DEFAULT_PAYMENT_TERM : '')

  const name = trim(header?.salesperson_name || header?.salespersonName)
  const enteredContact = clean(header?.contact_text || header?.contactText)
  const contact = (/^[\s_]+$/u.test(enteredContact) ? '' : enteredContact) || name || (blank ? QUOTATION_TERM_PLACEHOLDER : '')

  const email = trim(header?.salesperson_email || header?.salespersonEmail || header?.email)
  let phone = trim(header?.salesperson_phone || header?.salespersonPhone || header?.phonenumber)
  if (phone) phone = `+86${phone.replace(/^\+?86\s*/u, '').replace(/\s+/gu, '')}`

  return { deliveryTerms, validity, paymentTerm, contact, email, phone }
}

/** 历史 21 列模板继续使用原来的单句抬头；当前 16 列模板把三项条款放入独立下拉栏。 */
export function buildQuotationTermsLine(header: any, options: { blank?: boolean } = {}): string {
  const fields = quotationHeaderValues(header, options)
  return [
    `Trading Terms: ${fields.deliveryTerms}`,
    `Quotation Valid: ${fields.validity === QUOTATION_TERM_PLACEHOLDER ? `${QUOTATION_TERM_PLACEHOLDER} days` : fields.validity}`,
    `Payment terms:${fields.paymentTerm}`,
    `Contact: ${fields.contact}`,
    `Email:${fields.email}`,
    `Phone:${fields.phone}`,
    `Whatsapp:${fields.phone}`,
    `Wechat:${fields.phone}`,
  ].join('    ').trimEnd()
}

function buildQuotationContactLine(header: any, options: { blank?: boolean } = {}): string {
  const fields = quotationHeaderValues(header, options)
  return [
    `Contact: ${fields.contact}`,
    `Email:${fields.email}`,
    `Phone:${fields.phone}`,
    `Whatsapp:${fields.phone}`,
    `Wechat:${fields.phone}`,
  ].join('    ').trimEnd()
}

function buildQuotationTemplateTermFields(header: any, options: { blank?: boolean } = {}) {
  const fields = quotationHeaderValues(header, options)
  return {
    deliveryTerms: fields.deliveryTerms,
    validity: fields.validity,
    paymentTerm: fields.paymentTerm,
  }
}

export function populateQuotationWorkbook(workbook: any, header: any, rawLines: any[]) {
  const XLSX = getXlsxSync()
  const sheetName = String(header.source_sheet_name || workbook.SheetNames[0] || '')
  const sheet = workbook.Sheets[sheetName] || workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) throw new Error('报价单工作表不存在')

  const isCurrent16Col = Boolean(sheet['P6'] && !sheet['Q6'] && !sheet['U6'])
  const isCurrent15Col = Boolean(sheet['O6'] && !sheet['P6'] && !sheet['U6'])
  const isShortTemplate = isCurrent16Col || isCurrent15Col
    || Boolean((sheet['O8'] && !sheet['P8'] && !sheet['U8']) || (sheet['O9'] && !sheet['P9'] && !sheet['U9']))

  if (isShortTemplate) {
    // 新模板为 16 列；15 列历史模板仍按旧列位兼容。
    const detailStartRow = isCurrent16Col || isCurrent15Col
      ? 7
      : (sheet['A9']?.v === 1 || typeof sheet['A9']?.v === 'number')
          ? 9
          : (sheet['A10']?.v === 1 || typeof sheet['A10']?.v === 'number') ? 10 : 11
    const headerRow = detailStartRow === 7 ? 3 : detailStartRow === 9 ? 5 : 6
    const termsRow = headerRow + 1
    const contactRow = headerRow + 2
    setWorkbookValue(sheet, isCurrent16Col || isCurrent15Col ? 'I2' : 'A4', isCurrent16Col || isCurrent15Col ? QUOTATION_TEMPLATE_WEBSITE : QUOTATION_TEMPLATE_WEB_LINE)
    setWorkbookValue(sheet, `B${headerRow}`, header.customer_name || '')
    setWorkbookValue(sheet, `E${headerRow}`, header.end_user || '')
    setWorkbookValue(sheet, `H${headerRow}`, header.country || '中国')
    setWorkbookValue(sheet, `K${headerRow}`, header.customer_style || '终端')
    setWorkbookPrice(sheet, `M${headerRow}`, header.rate ?? 6.7000, '0.0000')
    setWorkbookValue(sheet, `O${headerRow}`, formatDate(header.quote_date) || '')

    const termFields = buildQuotationTemplateTermFields(header)
    setWorkbookValue(sheet, `C${termsRow}`, termFields.deliveryTerms)
    setWorkbookValue(sheet, `H${termsRow}`, termFields.validity)
    const hasCity = /city|城市/i.test(String(sheet[`I${termsRow}`]?.v || ''))
    if (hasCity) setWorkbookValue(sheet, `J${termsRow}`, header.city || '')
    setWorkbookValue(sheet, `${hasCity ? 'M' : 'K'}${termsRow}`, termFields.paymentTerm)

    const contactFields = quotationHeaderValues(header)
    if (sheet[`B${contactRow}`] !== undefined || sheet[`D${contactRow}`] !== undefined) {
      setWorkbookValue(sheet, `B${contactRow}`, contactFields.contact)
      setWorkbookValue(sheet, `E${contactRow}`, contactFields.email)
      setWorkbookValue(sheet, `H${contactRow}`, contactFields.phone)
      setWorkbookValue(sheet, `K${contactRow}`, contactFields.phone)
      setWorkbookValue(sheet, `N${contactRow}`, contactFields.phone)
    } else {
      setWorkbookValue(sheet, `A${contactRow}`, buildQuotationContactLine(header))
    }

    const lines = rawLines.map(mapLineRow)
    for (const line of lines) {
      const row = detailStartRow + line.lineNo - 1
      ensureWorksheetRow(sheet, row, detailStartRow)
      const rmb = line.finalPriceRmb ?? line.initialPriceRmb ?? line.originalPriceRmb
      const usd = line.finalPriceUsd ?? line.initialPriceUsd ?? line.originalPriceUsd
      const usdPc = computeUsdPricePc(usd)
      const legacyValues = [
        line.lineNo,                  // A 0 S/N
        line.application || '',       // B 1 应用
        line.manufacturer || '',      // C 2 友商
        line.manufacturerMpn || '',   // D 3 友商型号
        line.qty,                     // E 4 数量
        line.ctkMpn || '',            // F 5 CTK 型号
        line.packageName || '',       // G 6 封装
        line.dieSize || '',           // H 7 芯片大小
        line.spqReel || '',           // I 8 SPQ/Reel
        rmb,                          // J 9 单价（元）
        usd,                          // K 10 千只单价（美元）
        usdPc,                        // L 11 1只单价（美元）
        line.leadTime || '',          // M 12 交期
        line.datasheet || '',         // N 13 规格书
        line.remark || '',            // O 14 备注
      ]
      const values = isCurrent16Col
        ? [
            legacyValues[0], line.materialCode || '', legacyValues[5], legacyValues[6], legacyValues[9],
            legacyValues[1], legacyValues[2], legacyValues[3], legacyValues[4], legacyValues[7], legacyValues[8],
            legacyValues[10], legacyValues[11], legacyValues[12], legacyValues[13], legacyValues[14],
          ]
        : legacyValues
      values.forEach((value, index) => {
        const address = `${XLSX.utils.encode_col(index)}${row}`
        if (index === 0 || index === (isCurrent16Col ? 8 : 4)) setWorkbookValue(sheet, address, value)
        else if (index === (isCurrent16Col ? 4 : 9)) setWorkbookPrice(sheet, address, value, '"￥"#,##0.00')
        else if (index === (isCurrent16Col ? 11 : 10)) setWorkbookPrice(sheet, address, value, '"$"#,##0.00')
        else if (index === (isCurrent16Col ? 12 : 11)) setWorkbookPrice(sheet, address, value, '"$"#,##0.00000')
        else if (index === (isCurrent16Col ? 13 : 12)) {
          const leadSerial = excelDateSerial(value)
          if (leadSerial == null) setWorkbookValue(sheet, address, value)
          else setWorkbookPrice(sheet, address, leadSerial, '[$-409]dd-mmm-yy')
        } else setWorkbookValue(sheet, address, value)
      })
    }
    return workbook
  }

  // 存量 21 列旧模板回填
  setWorkbookValue(sheet, 'A4', QUOTATION_TEMPLATE_WEB_LINE)
  setWorkbookValue(sheet, 'A6', buildQuotationTermsLine(header))

  const detailStartRow = 9
  const lines = rawLines.map(mapLineRow)
  for (const line of lines) {
    const row = detailStartRow + line.lineNo - 1
    ensureWorksheetRow(sheet, row, detailStartRow)
    const rmb = line.finalPriceRmb ?? line.initialPriceRmb ?? line.originalPriceRmb
    const usd = line.finalPriceUsd ?? line.initialPriceUsd ?? line.originalPriceUsd
    const usdPc = computeUsdPricePc(usd)
    const quoteDateSerial = excelDateSerial(line.quoteDate)
    const values = [
      line.lineNo,
      quoteDateSerial,
      line.country || '',
      line.customerStyle || '',
      line.quoteTo || header.customer_name || '',
      line.endUser || '',
      line.application || '',
      line.manufacturer || '',
      line.manufacturerMpn || '',
      line.qty,
      line.ctkMpn || '',
      line.packageName || '',
      line.dieSize || '',
      line.spqReel || '',
      rmb,
      line.rate,
      usd,
      usdPc,
      line.leadTime || '',
      line.datasheet || '',
      line.remark || '',
    ]
    values.forEach((value, index) => {
      const address = `${XLSX.utils.encode_col(index)}${row}`
      if (index === 1) setWorkbookPrice(sheet, address, value, 'yyyy-mm-dd')
      else if (index === 0 || index === 9) setWorkbookValue(sheet, address, value)
      else if (index === 14) setWorkbookPrice(sheet, address, value, '"￥"#,##0.00')
      else if (index === 15) setWorkbookPrice(sheet, address, value, '0.0000')
      else if (index === 16) setWorkbookPrice(sheet, address, value, '"$"#,##0.00')
      else if (index === 17) setWorkbookPrice(sheet, address, value, '"$"#,##0.00000')
      else if (index === 18) {
        const leadSerial = excelDateSerial(value)
        if (leadSerial == null) setWorkbookValue(sheet, address, value)
        else setWorkbookPrice(sheet, address, leadSerial, '[$-409]dd-mmm-yy')
      } else setWorkbookValue(sheet, address, value)
    })
  }
  return workbook
}

function escapeXmlText(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/gu, '')
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&apos;')
}

const XML_TAG_PREFIX = '(?:[A-Za-z_][\\w.-]*:)?'

function templateCellPattern(address: string): RegExp {
  const escapedAddress = address.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  return new RegExp(`<${XML_TAG_PREFIX}c\\b(?=[^>]*\\br="${escapedAddress}"(?:\\s|/|>))[^>]*?(?:/>|>[\\s\\S]*?</${XML_TAG_PREFIX}c>)`, 'u')
}

function templateCellStyleAttributes(cellXml: string): string {
  const opening = cellXml.match(new RegExp(`^<${XML_TAG_PREFIX}c\\b([^>]*)>`, 'u'))?.[1]
    || cellXml.match(new RegExp(`^<${XML_TAG_PREFIX}c\\b([^>]*)\\/>`, 'u'))?.[1]
    || ''
  return opening
    .replace(/\s+r="[^"]*"/gu, '')
    .replace(/\s+t="[^"]*"/gu, '')
    .replace(/\s+(?:vm|cm)="[^"]*"/gu, '')
    .trim()
    .replace(/\/$/u, '')
}

function templateCellXml(cellXml: string, address: string, value: unknown, kind: 'string' | 'number' | 'blank', styleId?: number): string {
  const cellTag = cellXml.match(new RegExp(`^<(${XML_TAG_PREFIX}c)\\b`, 'u'))?.[1] || 'c'
  const namespace = cellTag.includes(':') ? `${cellTag.slice(0, cellTag.indexOf(':'))}:` : ''
  let styleAttributes = templateCellStyleAttributes(cellXml)
  if (styleId != null) {
    styleAttributes = /\bs="[^"]*"/u.test(styleAttributes)
      ? styleAttributes.replace(/\bs="[^"]*"/u, `s="${styleId}"`)
      : `${styleAttributes} s="${styleId}"`.trim()
  }
  const style = styleAttributes ? ` ${styleAttributes}` : ''
  if (kind === 'blank') return `<${cellTag} r="${address}"${style}/>`
  if (kind === 'number') return `<${cellTag} r="${address}"${style}><${namespace}v>${escapeXmlText(value)}</${namespace}v></${cellTag}>`
  const textValue = String(value ?? '')
  const xmlSpace = /^\s|\s$/u.test(textValue) ? ' xml:space="preserve"' : ''
  return `<${cellTag} r="${address}"${style} t="inlineStr"><${namespace}is><${namespace}t${xmlSpace}>${escapeXmlText(textValue)}</${namespace}t></${namespace}is></${cellTag}>`
}

function replaceTemplateCell(sheetXml: string, address: string, value: unknown, kind: 'string' | 'number' | 'blank', styleId?: number): string {
  const pattern = templateCellPattern(address)
  let replaced = false
  const next = sheetXml.replace(pattern, (cellXml) => {
    replaced = true
    return templateCellXml(cellXml, address, value, kind, styleId)
  })
  if (!replaced) {
    throw new Error(`报价单模板缺少单元格 ${address}`)
  }
  return next
}

// Edit each detail row once, instead of rescanning the entire worksheet for every cell.
function editTemplateDetailRows<T>(sheetXml: string, items: T[], rowFor: (item: T, index: number) => number, edit: (rowXml: string, item: T, row: number) => string): string {
  const byRow = new Map(items.map((item, index) => [rowFor(item, index), item]))
  return sheetXml.replace(new RegExp(`<${XML_TAG_PREFIX}row\\b[^>]*\\br="(\\d+)"[^>]*>[\\s\\S]*?<\\/${XML_TAG_PREFIX}row>`, 'gu'), (rowXml, number) => {
    const row = Number(number)
    const item = byRow.get(row)
    return item === undefined ? rowXml : edit(rowXml, item, row)
  })
}

function ensureTemplateDetailRows(sheetXml: string, lastRow: number, detailStartRow = 6, lastColumn = 'O'): string {
  if (lastRow > 1048576) throw new Error('明细超出 Excel 单个工作表可容纳的行数')
  const match = sheetXml.match(new RegExp(`<${XML_TAG_PREFIX}row\\b[^>]*\\br="${detailStartRow}"[^>]*>[\\s\\S]*?<\\/${XML_TAG_PREFIX}row>`, 'u'))
  if (!match) return sheetXml
  const templateRowXml = match[0]
  const currentLastRow = Number(new RegExp(`<${XML_TAG_PREFIX}dimension\\b[^>]*\\bref="[A-Z]+1:[A-Z]+(\\d+)"`, 'u').exec(sheetXml)?.[1] || 0)
  const finalRow = Math.max(lastRow, detailStartRow)
  if (finalRow < currentLastRow) {
    sheetXml = sheetXml.replace(new RegExp(`<${XML_TAG_PREFIX}row\\b[^>]*\\br="(\\d+)"[^>]*(?:/>|>[\\s\\S]*?</${XML_TAG_PREFIX}row>)`, 'gu'), (rowXml, number) => Number(number) > finalRow ? '' : rowXml)
  }
  const existingRows = new Set([...sheetXml.matchAll(new RegExp(`<${XML_TAG_PREFIX}row\\b[^>]*\\br="(\\d+)"`, 'gu'))].map((entry) => Number(entry[1])))
  const extraRows: string[] = []
  for (let row = detailStartRow + 1; row <= finalRow; row += 1) {
    if (existingRows.has(row)) continue
    let rowXml = templateRowXml.replace(new RegExp(`\\br="${detailStartRow}"`, 'gu'), `r="${row}"`)
    rowXml = rowXml.replace(new RegExp(`\\br="([A-Z]+)${detailStartRow}"`, 'gu'), `r="$1${row}"`)
    rowXml = rowXml.replace(new RegExp(`<${XML_TAG_PREFIX}v>[\\s\\S]*?<\\/${XML_TAG_PREFIX}v>`, 'gu'), '')
    rowXml = rowXml.replace(new RegExp(`<${XML_TAG_PREFIX}is>[\\s\\S]*?<\\/${XML_TAG_PREFIX}is>`, 'gu'), '')
    rowXml = rowXml.replace(/\st="[^"]*"/gu, '')
    extraRows.push(rowXml)
  }
  const sheetDataTag = sheetXml.match(new RegExp(`<(${XML_TAG_PREFIX}sheetData)\\b`, 'u'))?.[1] || 'sheetData'
  let next = sheetXml.replace(`</${sheetDataTag}>`, `${extraRows.join('')}</${sheetDataTag}>`)
  next = next.replace(new RegExp(`(<${XML_TAG_PREFIX}dimension\\b[^>]*\\bref=")[^"]+("[^>]*\\/>)`, 'u'), `$1A1:${lastColumn}${finalRow}$2`)
  return next
}

function templateStringValue(sheetXml: string, address: string, value: unknown): string {
  return replaceTemplateCell(sheetXml, address, value == null ? '' : value, value == null || value === '' ? 'blank' : 'string')
}

/** 写公式单元格（R=P/Q、S=R/1000）：带缓存值，Excel/WPS 打开即可见，重算后仍是同一结果 */
function templateFormulaValue(sheetXml: string, address: string, formula: string, cachedValue: unknown, styleId?: number): string {
  const pattern = templateCellPattern(address)
  let replaced = false
  const next = sheetXml.replace(pattern, (cellXml) => {
    replaced = true
    const cellTag = cellXml.match(new RegExp(`^<(${XML_TAG_PREFIX}c)\\b`, 'u'))?.[1] || 'c'
    const namespace = cellTag.includes(':') ? `${cellTag.slice(0, cellTag.indexOf(':'))}:` : ''
    let styleAttributes = templateCellStyleAttributes(cellXml)
    if (styleId != null) {
      styleAttributes = /\bs="[^"]*"/u.test(styleAttributes)
        ? styleAttributes.replace(/\bs="[^"]*"/u, `s="${styleId}"`)
        : `${styleAttributes} s="${styleId}"`.trim()
    }
    const style = styleAttributes ? ` ${styleAttributes}` : ''
    const cached = cachedValue == null || !Number.isFinite(Number(cachedValue))
      ? ''
      : `<${namespace}v>${Number(cachedValue)}</${namespace}v>`
    return `<${cellTag} r="${address}"${style}><${namespace}f>${escapeXmlText(formula)}</${namespace}f>${cached}</${cellTag}>`
  })
  if (!replaced) throw new Error(`报价单模板缺少单元格 ${address}`)
  return next
}

function templateNumberValue(sheetXml: string, address: string, value: unknown, styleId?: number): string {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return replaceTemplateCell(sheetXml, address, null, 'blank', styleId)
  return replaceTemplateCell(sheetXml, address, Number(value), 'number', styleId)
}

function removeLegacyQuotationTemplateParts(files: Record<string, Uint8Array>) {
  for (const path of Object.keys(files)) {
    if (path === 'xl/metadata.xml' || path.startsWith('xl/richData/')) {
      delete files[path]
    }
  }
  const decoder = new TextDecoder('utf-8')
  const encoder = new TextEncoder()
  const workbookRelsPath = 'xl/_rels/workbook.xml.rels'
  if (files[workbookRelsPath]) {
    const workbookRels = decoder.decode(files[workbookRelsPath]).replace(/<Relationship\b[^>]*(?:sheetMetadata|richValue)[^>]*\/>/gu, '')
    files[workbookRelsPath] = encoder.encode(workbookRels)
  }
  const contentTypesPath = '[Content_Types].xml'
  if (files[contentTypesPath]) {
    let contentTypes = decoder.decode(files[contentTypesPath])
    contentTypes = contentTypes.replace(/<Override\b[^>]*(?:metadata|richData\/)[^>]*\/>/gu, '')
    files[contentTypesPath] = encoder.encode(contentTypes)
  }
  const sheetPath = 'xl/worksheets/sheet1.xml'
  if (files[sheetPath]) {
    files[sheetPath] = encoder.encode(decoder.decode(files[sheetPath]).replace(/\s+(?:vm|cm)="[^"]*"/gu, ''))
  }
}

function quotationExportValues(header: any, rawLine: any) {
  const line = mapLineRow(rawLine)
  const rmb = line.finalPriceRmb ?? line.initialPriceRmb ?? line.originalPriceRmb
  // 美元价不手填：导出值必须与模板里的公式（=P/Q、=R/1000）算出的一致，
  // 否则 Excel 缓存值与重算结果不一致，用户一按 F9 数字就会跳。
  const usd = computeUsdPriceKpcs(rmb, line.rate)
  const usdPc = computeUsdPricePc(usd)
  return {
    line,
    rmb,
    usd,
    usdPc,
    // 列序与模板 A..U 一一对应（Q/R 两列导出时写公式）
    values: [
      line.lineNo,                                   // A 序列
      excelDateSerial(line.quoteDate),               // B 报价日期（日期序列号，空则 null）
      line.country || '',                            // C 国家
      line.customerStyle || '',                      // D 客户性质
      line.quoteTo || header.customer_name || '',    // E 客户
      line.endUser || '',                            // F 终端客户
      line.application || '',                        // G 应用
      line.manufacturer || '',                       // H 友商
      line.manufacturerMpn || '',                    // I 友商型号
      line.qty,                                      // J 数量
      // 模板已取消单位列：K 起全部左移一位
      line.ctkMpn || '',                             // K CTK 型号
      line.packageName || '',                        // L 封装
      line.dieSize || '',                            // M 芯片大小
      line.spqReel || '',                            // N SPQ/Reel
      rmb,                                           // O 单价（元）
      line.rate,                                     // P 汇率
      usd,                                           // Q 千只单价（美元）—— 公式 =O/P
      usdPc,                                         // R 1只单价（美元）—— 公式 =Q/1000
      line.leadTime || '',                           // S 交期
      line.datasheet || '',                          // T 规格书
      line.remark || '',                             // U 备注
    ],
  }
}


  function removeWorkbookCalcChain(files: Record<string, Uint8Array>) {
  delete files['xl/calcChain.xml']
  const decoder = new TextDecoder('utf-8')
  const encoder = new TextEncoder()
  const workbookRelsPath = 'xl/_rels/workbook.xml.rels'
  if (files[workbookRelsPath]) {
    const rels = decoder.decode(files[workbookRelsPath]).replace(/<Relationship\b[^>]*Target="[^"]*calcChain\.xml"[^>]*\/>/gu, '')
    files[workbookRelsPath] = encoder.encode(rels)
  }
  const contentTypesPath = '[Content_Types].xml'
  if (files[contentTypesPath]) {
    const ct = decoder.decode(files[contentTypesPath]).replace(/<Override\b[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/gu, '')
    files[contentTypesPath] = encoder.encode(ct)
  }
}

function quotationExportValues15Col(header: any, rawLine: any) {
  const line = mapLineRow(rawLine)
  const rmb = line.finalPriceRmb ?? line.initialPriceRmb ?? line.originalPriceRmb
  // 15 列模板的汇率只有单头一个字段；缓存值必须和工作表公式引用的汇率一致。
  // mysql2 默认把 DECIMAL 返回为字符串；统一转成 number 才能通过价格计算函数的有限值校验。
  const rate = Number(header.rate ?? line.rate ?? 6.7000)
  const usd = computeUsdPriceKpcs(rmb, rate)
  const usdPc = computeUsdPricePc(usd)
  return {
    line,
    rmb,
    usd,
    usdPc,
    values: [
      line.lineNo,                  // A 0 S/N
      line.application || '',       // B 1 应用
      line.manufacturer || '',      // C 2 友商
      line.manufacturerMpn || '',   // D 3 友商型号
      line.qty,                     // E 4 数量
      line.ctkMpn || '',            // F 5 CTK 型号
      line.packageName || '',       // G 6 封装
      line.dieSize || '',           // H 7 芯片大小
      line.spqReel || '',           // I 8 SPQ/Reel
      rmb,                          // J 9 单价（元）
      usd,                          // K 10 千只单价（美元）
      usdPc,                        // L 11 1只单价（美元）
      line.leadTime || '',          // M 12 交期
      line.datasheet || '',         // N 13 规格书
      line.remark || '',            // O 14 备注
    ],
  }
}

function quotationExportValues16Col(header: any, rawLine: any) {
  const line = mapLineRow(rawLine)
  const rmb = line.finalPriceRmb ?? line.initialPriceRmb ?? line.originalPriceRmb
  const rate = Number(header.rate ?? line.rate ?? 6.7000)
  const usd = computeUsdPriceKpcs(rmb, rate)
  const usdPc = computeUsdPricePc(usd)
  return {
    line,
    values: [
      line.lineNo,
      line.materialCode || '', line.ctkMpn || '', line.packageName || '', rmb,
      line.application || '', line.manufacturer || '', line.manufacturerMpn || '', line.qty,
      line.dieSize || '', line.spqReel || '', usd, usdPc, line.leadTime || '', line.datasheet || '', line.remark || '',
    ],
  }
}

export function buildQuotationTemplateWorkbook(templateBuffer: Uint8Array, header: any, rawLines: any[], options: { blank?: boolean } = {}): Buffer {
  const XLSX = getXlsxSync()
  const files = unzipSync(templateBuffer)
  removeLegacyQuotationTemplateParts(files)
  removeWorkbookCalcChain(files)
  const sheetPath = 'xl/worksheets/sheet1.xml'
  const sheetBytes = files[sheetPath]
  if (!sheetBytes) throw new Error('报价单模板工作表不存在')
  const decoder = new TextDecoder('utf-8')
  const encoder = new TextEncoder()
  let sheetXml = decoder.decode(sheetBytes)

  const isCurrent16Col = sheetXml.includes('r="P6"') && !sheetXml.includes('r="Q6"') && !sheetXml.includes('r="U6"')
  const isCurrent15Col = sheetXml.includes('r="O6"') && !sheetXml.includes('r="P6"') && !sheetXml.includes('r="U6"')
  const isShortTemplate = isCurrent16Col || isCurrent15Col
    || (sheetXml.includes('r="O8"') && !sheetXml.includes('r="P8"') && !sheetXml.includes('r="U8"'))
    || (sheetXml.includes('r="O9"') && !sheetXml.includes('r="P9"') && !sheetXml.includes('r="U9"'))

  if (isShortTemplate) {
    const mappedLines = rawLines.map((rawLine) => isCurrent16Col
      ? quotationExportValues16Col(header, rawLine)
      : quotationExportValues15Col(header, rawLine))
    const detailStartRow = isCurrent16Col || isCurrent15Col ? 7 : sheetXml.includes('IF(J9') ? 9 : sheetXml.includes('IF(J10') ? 10 : 11
    const headerRow = detailStartRow === 7 ? 3 : detailStartRow === 9 ? 5 : 6
    const termsRow = headerRow + 1
    const contactRow = headerRow + 2
    const lastDetailRow = options.blank ? detailStartRow + 4 : mappedLines.reduce((maxRow, item) => Math.max(maxRow, detailStartRow + item.line.lineNo - 1), detailStartRow - 1)
    sheetXml = ensureTemplateDetailRows(sheetXml, lastDetailRow, detailStartRow, isCurrent16Col ? 'P' : 'O')

    // 单头公共字段按模板布局写入；当前模板将客户信息、条款、联系人依次放在第 3–5 行。
    sheetXml = templateStringValue(sheetXml, isCurrent16Col || isCurrent15Col ? 'I2' : 'A4', isCurrent16Col || isCurrent15Col ? QUOTATION_TEMPLATE_WEBSITE : QUOTATION_TEMPLATE_WEB_LINE)
    sheetXml = templateStringValue(sheetXml, `B${headerRow}`, header.customer_name || '')
    sheetXml = templateStringValue(sheetXml, `E${headerRow}`, header.end_user || '')
    sheetXml = templateStringValue(
      sheetXml,
      `H${headerRow}`,
      isCurrent16Col || isCurrent15Col
        ? quotationOptionDisplayLabel('country', header.country || '中国')
        : header.country || '中国',
    )
    sheetXml = templateStringValue(sheetXml, `K${headerRow}`, header.customer_style || '终端')
    sheetXml = templateNumberValue(sheetXml, `M${headerRow}`, header.rate ?? 6.7000)
    sheetXml = templateStringValue(sheetXml, `O${headerRow}`, formatDate(header.quote_date) || '')

    // 商务条款写入三个可选字段，联系人行保留业务员姓名与完整联系方式。
    const termFields = buildQuotationTemplateTermFields(header, options)
    sheetXml = templateStringValue(sheetXml, `C${termsRow}`, termFields.deliveryTerms)
    sheetXml = templateStringValue(sheetXml, `H${termsRow}`, termFields.validity)
    const cityLabelCell = new RegExp(`<c\\b[^>]*\\br="I${termsRow}"[^>]*>[\\s\\S]*?</c>`).exec(sheetXml)?.[0] || ''
    const hasCity = /城市|City/.test(cityLabelCell)
    if (hasCity) sheetXml = templateStringValue(sheetXml, `J${termsRow}`, options.blank ? '' : header.city || '')
    sheetXml = templateStringValue(sheetXml, `${hasCity ? 'M' : 'K'}${termsRow}`, termFields.paymentTerm)

    const contactFields = quotationHeaderValues(header, options)
    if (sheetXml.includes(`r="B${contactRow}"`)) {
      sheetXml = templateStringValue(sheetXml, `B${contactRow}`, contactFields.contact)
      sheetXml = templateStringValue(sheetXml, `E${contactRow}`, contactFields.email)
      sheetXml = templateStringValue(sheetXml, `H${contactRow}`, contactFields.phone)
      sheetXml = templateStringValue(sheetXml, `K${contactRow}`, contactFields.phone)
      sheetXml = templateStringValue(sheetXml, `N${contactRow}`, contactFields.phone)
    } else {
      sheetXml = templateStringValue(sheetXml, `A${contactRow}`, buildQuotationContactLine(header, options))
    }

    sheetXml = editTemplateDetailRows(sheetXml, mappedLines, item => detailStartRow + item.line.lineNo - 1, (rowXml, item, row) => {
      item.values.forEach((value, index) => {
        const address = `${XLSX.utils.encode_col(index)}${row}`
        if (isCurrent16Col) {
          if (index === 0 || index === 4 || index === 8) {
            rowXml = templateNumberValue(rowXml, address, value)
          } else if (index === 11) {
            rowXml = item.values[4] == null
              ? templateNumberValue(rowXml, address, null)
              : templateFormulaValue(rowXml, address, `IF(E${row}="","",IFERROR(E${row}/$M$${headerRow},""))`, value)
          } else if (index === 12) {
            rowXml = item.values[11] == null
              ? templateNumberValue(rowXml, address, null)
              : templateFormulaValue(rowXml, address, `IF(L${row}="","",IFERROR(L${row}/1000,""))`, value)
          } else if (index === 13) {
            const leadSerial = excelDateSerial(value)
            rowXml = leadSerial == null
              ? templateStringValue(rowXml, address, value)
              : templateNumberValue(rowXml, address, leadSerial)
          } else {
            rowXml = templateStringValue(rowXml, address, value)
          }
          return
        }
        if (index === 0 || index === 4 || index === 9) {
          // A 序号 / E 数量 / J 单价（元）
          rowXml = templateNumberValue(rowXml, address, value)
        } else if (index === 10) {
          // K 千只美元价 = J / 当前模板汇率单元格
          rowXml = item.values[9] == null
            ? templateNumberValue(rowXml, address, null)
            : templateFormulaValue(rowXml, address, `IF(J${row}="","",IFERROR(J${row}/$M$${headerRow},""))`, value)
        } else if (index === 11) {
          // L 1只美元价 = K / 1000
          rowXml = item.values[10] == null
            ? templateNumberValue(rowXml, address, null)
            : templateFormulaValue(rowXml, address, `IF(K${row}="","",IFERROR(K${row}/1000,""))`, value)
        } else if (index === 12) {
          const leadSerial = excelDateSerial(value)
          rowXml = leadSerial == null
            ? templateStringValue(rowXml, address, value)
            : templateNumberValue(rowXml, address, leadSerial)
        } else {
          rowXml = templateStringValue(rowXml, address, value)
        }
      })
      return rowXml
    })
    syncQuotationPrintArea(files, sheetXml)
    files[sheetPath] = encoder.encode(sheetXml)
    return Buffer.from(zipSync(files))
  }

  // 存量 21 列模板导出
  const mappedLines = rawLines.map((rawLine) => quotationExportValues(header, rawLine))
  const detailStartRow = 9
  const lastDetailRow = mappedLines.reduce((maxRow, item) => Math.max(maxRow, detailStartRow + item.line.lineNo - 1), detailStartRow - 1)
  sheetXml = ensureTemplateDetailRows(sheetXml, lastDetailRow, detailStartRow, 'U')

  sheetXml = templateStringValue(sheetXml, 'A4', QUOTATION_TEMPLATE_WEB_LINE)
  sheetXml = templateStringValue(sheetXml, 'A6', buildQuotationTermsLine(header, options))

  sheetXml = editTemplateDetailRows(sheetXml, mappedLines, item => detailStartRow + item.line.lineNo - 1, (rowXml, item, row) => {
    item.values.forEach((value, index) => {
      const address = `${XLSX.utils.encode_col(index)}${row}`
      if (index === 0 || index === 9 || index === 14 || index === 15) {
        rowXml = templateNumberValue(rowXml, address, value)
      } else if (index === 1) {
        rowXml = templateNumberValue(rowXml, address, value)
      } else if (index === 16) {
        rowXml = item.values[14] == null || item.values[15] == null
          ? templateNumberValue(rowXml, address, null)
          : templateFormulaValue(rowXml, address, `IF(O${row}="","",IFERROR(O${row}/P${row},""))`, value)
      } else if (index === 17) {
        rowXml = item.values[16] == null
          ? templateNumberValue(rowXml, address, null)
          : templateFormulaValue(rowXml, address, `IF(Q${row}="","",IFERROR(Q${row}/1000,""))`, value)
      } else if (index === 18) {
        const leadSerial = excelDateSerial(value)
        rowXml = leadSerial == null
          ? templateStringValue(rowXml, address, value)
          : templateNumberValue(rowXml, address, leadSerial)
      } else {
        rowXml = templateStringValue(rowXml, address, value)
      }
    })
    return rowXml
  })
  syncQuotationPrintArea(files, sheetXml)
  files[sheetPath] = encoder.encode(sheetXml)
  return Buffer.from(zipSync(files))
}

/** Generate the distinct nine-column domestic template without exposing its sample quote. */
export function buildDomesticQuotationTemplateWorkbook(
  templateBuffer: Uint8Array,
  header: any,
  rawLines: any[],
  options: { blank?: boolean } = {},
): Buffer {
  const files = unzipSync(templateBuffer)
  const sheetPath = 'xl/worksheets/sheet1.xml'
  const sheetBytes = files[sheetPath]
  if (!sheetBytes) throw new Error('内贸报价单模板工作表不存在')
  const decoder = new TextDecoder('utf-8')
  const encoder = new TextEncoder()
  let sheetXml = decoder.decode(sheetBytes)
  const blank = options.blank === true
  const XLSX = getXlsxSync()
  const templateBook = XLSX.read(templateBuffer, { type: 'buffer' })
  const templateRows = XLSX.utils.sheet_to_json(templateBook.Sheets[templateBook.SheetNames[0]], { header: 1 }) as unknown[][]
  const approvedLayout = templateRows.some(row => row.some(cell => String(cell).includes('品号')))
  const onlineLayout = templateRows[10]?.some(cell => String(cell || '').includes('CTK物料名称')) && templateRows[10]?.some(cell => String(cell || '').includes('客户物料名称'))
  const outputPcs = templateRows[10]?.some(cell => /元[\/／]PCS/iu.test(String(cell || '')))
  const priceBeforePack = onlineLayout && String(templateRows[10]?.[6] || '').includes('含税单价')
  const modernLayout = approvedLayout || onlineLayout
  const noUnitColumn = approvedLayout && !templateRows[10]?.some(cell => String(cell || '').startsWith('单位'))
  const firstRow = modernLayout ? 12 : 10
  const footerIndex = templateRows.findIndex((row, index) => index >= firstRow - 1 && /^(?:以上|附注|制表)/u.test(String(row[0] || '').trim()))
  if (footerIndex < 0) throw new Error('内贸报价单模板缺少页脚边界')
  const footerRow = footerIndex + 1
  const clearIfPresent = (address: string) => {
    const pattern = templateCellPattern(address)
    sheetXml = sheetXml.replace(pattern, (cellXml) => templateCellXml(cellXml, address, null, 'blank'))
  }

  // Keep the workbook's original drawing, logos, styles and footer. Only remove
  // the filled sample's three header values and the preformatted line block.
  for (const address of modernLayout ? ['A6', 'A7', 'A8', 'A9', 'G9', 'H8', 'H6', 'H7'] : ['A6', 'A7', 'E7']) clearIfPresent(address)
  for (let row = firstRow; row < footerRow; row += 1) {
    for (const column of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']) clearIfPresent(`${column}${row}`)
    if (approvedLayout && !noUnitColumn && blank) sheetXml = templateStringValue(sheetXml, `F${row}`, 'KPCS')
  }

  {
    const customerName = blank ? '' : String(header?.customer_name || header?.customerName || '').trim()
    const contactText = String(header?.contact_text || header?.contactText || '').trim()
    const quoteDate = formatDate(header?.quote_date || header?.quoteDate) || ''
    sheetXml = templateStringValue(sheetXml, 'A6', `客户（To.）：${customerName}`)
    sheetXml = templateStringValue(sheetXml, modernLayout ? 'A9' : 'A7', `联系人（Attn.）：${contactText}`)
    sheetXml = templateStringValue(sheetXml, modernLayout ? 'G9' : 'E7', `日期（Date）：${quoteDate}`)
    if (modernLayout) {
      sheetXml = templateStringValue(sheetXml, 'A7', `地址（Add.）：${blank ? '' : header?.customer_address || header?.customerAddress || ''}`)
      sheetXml = templateStringValue(sheetXml, 'A8', `电话（TEL）：${blank ? '' : header?.customer_phone || header?.customerPhone || ''}`)
      sheetXml = templateStringValue(sheetXml, 'H6', header?.payment_term || header?.paymentTerm || '现金')
      sheetXml = templateStringValue(sheetXml, 'H7', blank ? '' : header?.customer_application || header?.customerApplication || '')
      sheetXml = templateStringValue(sheetXml, `A${footerRow + 3}`, `2.收款方式：${header?.payment_term || header?.paymentTerm || '现金'}。`)
      sheetXml = templateStringValue(sheetXml, 'H8', header?.customer_style || header?.customerStyle || '终端')
      sheetXml = templateStringValue(sheetXml, `A${footerRow + 8}`, `制表：${blank ? '' : header?.salesperson_name || header?.salespersonName || ''}                 审核：${blank ? '' : header?.final_reviewer_name || ''}                 客户回签：`)
      for (let row = footerRow + 10; row <= footerRow + 14; row += 1) {
        for (const column of 'ABCDEFGHI') clearIfPresent(`${column}${row}`)
      }
    }
  }

  const resized = resizeDomesticDetailRows(files, sheetXml, firstRow, footerRow, blank ? 5 : Math.max(1, rawLines.length))
  sheetXml = resized.sheetXml

  if (!blank) {
    sheetXml = editTemplateDetailRows(sheetXml, rawLines, (_line, index) => firstRow + index, (rowXml, rawLine, row) => {
      const line = mapLineRow(rawLine)
      const kind = domesticQuotationUnit(line.unit)
      const legacyPack = !!kind && String(line.unit).trim().toUpperCase() !== 'KPCS'
      const exportUnit = kind ? (outputPcs ? 'PCS' : 'KPCS') : String(line.unit || '').trim() || '未确认'
      const rawPrice = line.finalPriceRmb ?? line.initialPriceRmb ?? line.originalPriceRmb
      const price = outputPcs ? domesticPriceToPcs(rawPrice, line.unit) : domesticPriceToKpcs(rawPrice, line.unit)
      const pack = outputPcs ? domesticPackToPcs(line.minPackCount, line.unit) : legacyPack ? pcsToKpcs(line.minPackCount) : line.minPackCount
      const values = onlineLayout
        ? [line.lineNo, ...(String(templateRows[10]?.[1] || '').includes('客户物料名称')
            ? [line.customerMaterialName, null, line.ctkMpn, null]
            : [line.ctkMpn, null, line.customerMaterialName, null]), line.packageName, ...(priceBeforePack ? [price, pack] : [pack, price]), line.remark]
        : approvedLayout
        ? [line.lineNo, line.materialCode, line.application, line.ctkMpn, line.packageName, ...(!noUnitColumn ? [exportUnit] : []), price, pack, line.manufacturer]
        : [line.lineNo, line.application, line.customerMaterialName, line.ctkMpn, line.packageName, exportUnit, pack, price, line.remark]
      values.forEach((value, columnIndex) => {
        const address = `${XLSX.utils.encode_col(columnIndex)}${row}`
        if (columnIndex === 0 || columnIndex === (onlineLayout ? 6 : noUnitColumn ? 5 : 6) || columnIndex === (onlineLayout ? 7 : noUnitColumn ? 6 : 7)) rowXml = templateNumberValue(rowXml, address, value)
        else rowXml = templateStringValue(rowXml, address, value)
      })
      return rowXml
    })
  }

  if (!blank && rawLines.some(line => !domesticQuotationUnit(mapLineRow(line).unit))) {
    // Unknown historical units must remain explicit, including in exported headings.
    sheetXml = templateStringValue(sheetXml, onlineLayout ? (priceBeforePack ? 'G11' : 'H11') : approvedLayout ? (noUnitColumn ? 'F11' : 'G11') : 'H9', '含税单价（元/计价单位）')
    sheetXml = templateStringValue(sheetXml, onlineLayout ? (priceBeforePack ? 'H11' : 'G11') : approvedLayout ? (noUnitColumn ? 'G11' : 'H11') : 'G9', '最小包装数（按行单位）')
    sheetXml = templateStringValue(sheetXml, `A${footerRow + resized.offset + 1}`, `备注：${rawLines.filter(line => !domesticQuotationUnit(mapLineRow(line).unit)).map(line => mapLineRow(line).lineNo).join('、')}行单位未确认，价格和包装数保留原值，使用前请核对。`)
  }
  files[sheetPath] = encoder.encode(sheetXml)
  return Buffer.from(zipSync(files))
}

export function patchUploadedQuotationWorkbook(sourceBuffer: Uint8Array, header: any, rawLines: any[]): Buffer {
  const templatePath = quotationTemplatePath()
  if (templatePath && existsSync(templatePath)) {
    return buildQuotationTemplateWorkbook(readFileSync(templatePath), header, rawLines)
  }
  return buildQuotationTemplateWorkbook(sourceBuffer, header, rawLines)
}

export async function downloadQuotation(event: H3Event, businessType: QuotationBusinessType = 'FOREIGN') {
  const id = Number(queryText((getQuery(event) as Record<string, unknown>).id || getRouterParam(event, 'id')))
  if (!Number.isSafeInteger(id) || id <= 0) return apiError('报价单ID不符合规范')
  const result = await approvedQuotation(event, id, quotationPermissions(businessType).download, businessType)
  if (result.error) return result.error
  try {
    const templateBytes = await readQuotationTemplateBytes(businessType === 'DOMESTIC' ? '内贸销售报价单模板.xlsx' : undefined)
    if (!templateBytes) return apiError('系统报价单模板不存在', 500)

    let salespersonEmail = ''
    let salespersonPhone = ''
    if (result.quotation.header.salesperson_id) {
      const [userRows] = await getMysqlPool().query<RowDataPacket[]>(
        mysqlQueryOptions('SELECT email, phonenumber FROM sys_user WHERE user_id = ? LIMIT 1'),
        [result.quotation.header.salesperson_id],
      )
      if (userRows[0]) {
        salespersonEmail = userRows[0].email || ''
        salespersonPhone = userRows[0].phonenumber || ''
      }
    }
    const exportHeader = {
      ...result.quotation.header,
      salesperson_email: salespersonEmail,
      salesperson_phone: salespersonPhone,
    }

    const buffer = businessType === 'DOMESTIC'
      ? buildDomesticQuotationTemplateWorkbook(templateBytes, exportHeader, result.quotation.lines)
      : buildQuotationTemplateWorkbook(templateBytes, exportHeader, result.quotation.lines)

    const label = businessType === 'DOMESTIC' ? '内贸报价单' : '报价单'
    const filename = `${label}-${result.quotation.header.quote_no}-已审核.xlsx`
    setHeader(event, 'content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    setHeader(event, 'content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
    return buffer
  } catch (error) {
    console.error('[NitroQuotation] download failed:', error instanceof Error ? error.message : 'unknown error')
    return apiError('生成报价单下载文件失败', 500)
  }
}

function isAnalysisStatus(value: string) {
  return ['ALL', 'DRAFT', 'PENDING_INITIAL', 'PENDING_SECOND', 'PENDING_FINAL', 'RETURNED', 'RETURNED_TO_INITIAL', 'RETURNED_TO_SECOND', 'APPROVED'].includes(value)
}

interface AnalysisFilters {
  from: string
  to: string
  customer: string
  ctkMpn: string
  salesperson: string
  application: string
  manufacturer: string
  manufacturerMpn: string
  country: string
  status: string
  exact: boolean
  group?: { customer: string; mpn: string; unit: string }
}

function analysisFilters(query: Record<string, unknown>): AnalysisFilters {
  return {
    from: queryText(query.from),
    to: queryText(query.to),
    customer: queryText(query.customer),
    ctkMpn: queryText(query.ctkMpn),
    salesperson: queryText(query.salesperson),
    application: queryText(query.application),
    manufacturer: queryText(query.manufacturer),
    manufacturerMpn: queryText(query.manufacturerMpn),
    country: queryText(query.country),
    status: queryText(query.status) || 'APPROVED',
    exact: queryText(query.filterMatch) === 'exact',
    ...(['groupCustomer', 'groupMpn', 'groupUnit'].every(key => key in query) ? {
      group: { customer: queryText(query.groupCustomer), mpn: queryText(query.groupMpn), unit: queryText(query.groupUnit) },
    } : {}),
  }
}

function analysisWhere(filters: AnalysisFilters, session: AuthSession, businessType: QuotationBusinessType) {
  const conditions = ["q.status = 'APPROVED'", 'q.business_type = ?']
  const params: unknown[] = [businessType]
  if (filters.status !== 'APPROVED') {
    conditions.shift()
    if (filters.status !== 'ALL') {
      conditions.push('q.status = ?')
      params.push(filters.status)
    }
  }
  const canAll = hasPermission(session, quotationPermissions(businessType).analysis)
  if (!canAll) {
    conditions.push('q.salesperson_id = ?')
    params.push(session.userId)
  }
  if (/^\d{4}-\d{2}-\d{2}$/u.test(filters.from)) {
    conditions.push('DATE(q.create_time) >= ?')
    params.push(filters.from)
  }
  if (/^\d{4}-\d{2}-\d{2}$/u.test(filters.to)) {
    conditions.push('DATE(q.create_time) <= ?')
    params.push(filters.to)
  }
  if (filters.customer) {
    conditions.push(filters.exact ? 'q.customer_name = ?' : 'q.customer_name LIKE CONCAT(\'%\', ?, \'%\')')
    params.push(filters.customer)
  }
  if (filters.ctkMpn) {
    conditions.push(filters.exact ? 'l.ctk_mpn = ?' : 'l.ctk_mpn LIKE CONCAT(\'%\', ?, \'%\')')
    params.push(filters.ctkMpn)
  }
  if (filters.salesperson) {
    conditions.push('q.salesperson_name LIKE CONCAT(\'%\', ?, \'%\')')
    params.push(filters.salesperson)
  }
  for (const [field, value] of [
    ['l.application', filters.application],
    ['l.manufacturer', filters.manufacturer],
    ['l.manufacturer_mpn', filters.manufacturerMpn],
    ["COALESCE(NULLIF(q.country, ''), l.country)", filters.country],
  ]) {
    if (value) {
      conditions.push(filters.exact ? `${field} = ?` : `${field} LIKE CONCAT('%', ?, '%')`)
      params.push(value)
    }
  }
  if (filters.group) {
    conditions.push("q.customer_name = ?", 'l.ctk_mpn = ?', "COALESCE(l.unit, '') = ?")
    params.push(filters.group.customer, filters.group.mpn, filters.group.unit)
  }
  return { where: conditions.join(' AND '), params }
}

async function queryAnalysisRows(pool: Pool, filters: AnalysisFilters, session: AuthSession, businessType: QuotationBusinessType = 'FOREIGN', offset = 0, limit = 100) {
  const { where, params } = analysisWhere(filters, session, businessType)
  const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`
    SELECT q.quote_no, q.create_time, q.customer_name, q.salesperson_name, q.status,
           l.line_no, l.quote_to, COALESCE(NULLIF(q.end_user, ''), l.end_user) AS end_user, l.ctk_mpn, l.package_name, l.unit,
           COALESCE(NULLIF(q.country, ''), l.country) AS country, l.customer_style,
           l.application, l.manufacturer, l.manufacturer_mpn, l.qty,
           l.quote_date, l.lead_time, l.rate,
           l.original_price_rmb, l.original_price_usd, l.initial_price_rmb, l.initial_price_usd,
           l.final_price_rmb, l.final_price_usd
    FROM tk_quotation q
    JOIN tk_quotation_line l ON l.quotation_id = q.id
    WHERE ${where}
    ORDER BY q.create_time DESC, q.id DESC, l.line_no
    LIMIT ${limit} OFFSET ${offset}
  `), params)
  return rows.map((row) => ({
    quoteNo: row.quote_no,
    submitTime: formatDateTime(row.create_time),
    customerName: row.customer_name || '',
    salespersonName: row.salesperson_name || '',
    status: row.status || 'APPROVED',
    statusLabel: statusLabel(row.status || 'APPROVED'),
    lineNo: Number(row.line_no),
    quoteTo: row.quote_to || '',
    endUser: row.end_user || '',
    ctkMpn: row.ctk_mpn || '',
    packageName: row.package_name || '',
    unit: row.unit || '',
    country: row.country || '',
    application: row.application || '',
    manufacturer: row.manufacturer || '',
    manufacturerMpn: row.manufacturer_mpn || '',
    qty: row.qty == null ? null : Number(row.qty),
    customerStyle: row.customer_style || '',
    quoteDate: formatDate(row.quote_date),
    leadTime: row.lead_time || '',
    rate: row.rate == null ? null : Number(row.rate),
    originalPriceRmb: row.original_price_rmb == null ? null : Number(row.original_price_rmb),
    originalPriceUsd: row.original_price_usd == null ? null : Number(row.original_price_usd),
    initialPriceRmb: row.initial_price_rmb == null ? null : Number(row.initial_price_rmb),
    initialPriceUsd: row.initial_price_usd == null ? null : Number(row.initial_price_usd),
    finalPriceRmb: (row.status && row.status !== 'APPROVED') || row.final_price_rmb == null ? null : Number(row.final_price_rmb),
    finalPriceUsd: (row.status && row.status !== 'APPROVED') || row.final_price_usd == null ? null : Number(row.final_price_usd),
  }))
}

async function queryAnalysisSummary(pool: Pool, filters: AnalysisFilters, session: AuthSession, businessType: QuotationBusinessType, includeGroups = true) {
  const { where, params } = analysisWhere(filters, session, businessType)
  const domestic = businessType === 'DOMESTIC'
  const from = `FROM tk_quotation q JOIN tk_quotation_line l ON l.quotation_id = q.id WHERE ${where}`
  const metrics = `COUNT(*) AS lineCount,
    COUNT(l.final_price_rmb) AS finalRmbCount, COUNT(l.final_price_usd) AS finalUsdCount,
    COALESCE(SUM(l.original_price_rmb <> l.final_price_rmb), 0) AS changedRmbCount,
    COALESCE(SUM(l.original_price_usd <> l.final_price_usd), 0) AS changedUsdCount,
    SUM(${domestic ? 'l.final_price_rmb IS NULL' : '(l.final_price_rmb IS NULL AND l.final_price_usd IS NULL)'}) AS missingFinalCount`
  const totalMetrics = metrics
    .replaceAll('l.final_price_rmb', "(CASE WHEN q.status = 'APPROVED' THEN l.final_price_rmb END)")
    .replaceAll('l.final_price_usd', "(CASE WHEN q.status = 'APPROVED' THEN l.final_price_usd END)")
  const [totals] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`SELECT COUNT(DISTINCT q.id) AS quoteCount, ${totalMetrics} ${from}`), params)
  // 最新价取该组合最近一条明细；时间相同时以单据 ID、行号和明细 ID 确定顺序。
  const [groups] = includeGroups ? await pool.query<RowDataPacket[]>(mysqlQueryOptions(`SELECT l.customer_name AS customerName, l.ctk_mpn AS ctkMpn,
    COALESCE(l.unit, '') AS unit, COUNT(DISTINCT l.quotation_id) AS quoteCount, ${metrics},
    AVG(l.final_price_rmb) AS averageFinalRmb, AVG(l.final_price_usd) AS averageFinalUsd,
    MIN(l.final_price_rmb) AS minFinalRmb, MAX(l.final_price_rmb) AS maxFinalRmb,
    MIN(l.final_price_usd) AS minFinalUsd, MAX(l.final_price_usd) AS maxFinalUsd,
    MAX(CASE WHEN l.latest_rank = 1 THEN l.final_price_rmb END) AS latestFinalRmb,
    MAX(CASE WHEN l.latest_rank = 1 THEN l.final_price_usd END) AS latestFinalUsd,
    MAX(l.create_time) AS latestSubmitTime
    FROM (
      SELECT l.quotation_id, l.ctk_mpn, l.unit, l.original_price_rmb, l.original_price_usd,
        CASE WHEN q.status = 'APPROVED' THEN l.final_price_rmb END AS final_price_rmb,
        CASE WHEN q.status = 'APPROVED' THEN l.final_price_usd END AS final_price_usd,
        q.customer_name, q.create_time,
        ROW_NUMBER() OVER (PARTITION BY q.customer_name, l.ctk_mpn, COALESCE(l.unit, '')
          ORDER BY q.create_time DESC, q.id DESC, l.line_no DESC, l.id DESC) AS latest_rank
      ${from}
    ) l
    GROUP BY l.customer_name, l.ctk_mpn, COALESCE(l.unit, '')
    ORDER BY latestSubmitTime DESC, customerName, ctkMpn, unit`), params) : [[], []]
  const counts = (row: Record<string, any>) => Object.fromEntries(['quoteCount', 'lineCount', 'finalRmbCount', 'finalUsdCount', 'changedRmbCount', 'changedUsdCount', 'missingFinalCount'].map(key => [key, Number(row[key] || 0)]))
  return {
    ...counts(totals[0] || {}),
    rows: groups.map(row => ({ ...row, ...counts(row),
      key: `${row.customerName}\u0000${row.ctkMpn}\u0000${row.unit || ''}`,
      ...Object.fromEntries(['averageFinalRmb', 'averageFinalUsd', 'minFinalRmb', 'maxFinalRmb', 'minFinalUsd', 'maxFinalUsd', 'latestFinalRmb', 'latestFinalUsd'].map(key => [key, row[key] == null ? null : Number(row[key])])),
      latestSubmitTime: formatDateTime(row.latestSubmitTime),
    })),
  }
}


async function submitQuotationDraftHandler(event: H3Event, businessType: QuotationBusinessType = 'FOREIGN') {
  const permissions = quotationPermissions(businessType)
  const quotationId = Number(getRouterParam(event, 'id'))
  if (!Number.isSafeInteger(quotationId) || quotationId <= 0) writeFail('报价单ID不符合规范')
  const requestKey = requestId(event, '')
  let businessResult: any = null
  let notifyTarget: QuotationNotifyTarget | null = null

  return withIdempotentWriteSession(
    event,
    `quotation:${businessType}:submitDraft:${quotationId}`,
    permissions.upload,
    requestKey,
    { id: quotationId },
    async (session, connection) => {
      const quotation = await fetchQuotation(connection, quotationId, true, businessType)
      if (!quotation) writeFail('报价单不存在', 404)
      if (Number(quotation.header.salesperson_id) !== session.userId && session.userId !== 1) {
        writeFail('只能提交自己创建的报价单', 403)
      }
      const currentStatus = String(quotation.header.status)
      if (!['DRAFT', 'RETURNED'].includes(currentStatus)) {
        writeFail(`当前状态为“${statusLabel(currentStatus)}”，不能重复提交`, 409)
      }
      if (!quotation.lines.length) {
        writeFail('报价单没有物料明细，不能提交', 400)
      }

      for (const line of quotation.lines) {
        const initRmb = line.initial_price_rmb ?? line.original_price_rmb
        const initUsd = line.initial_price_usd ?? line.original_price_usd
        await connection.execute(
          mysqlQueryOptions('UPDATE tk_quotation_line SET initial_price_rmb = ?, initial_price_usd = ? WHERE id = ? AND quotation_id = ?'),
          [initRmb, initUsd, line.id, quotationId],
        )
      }

      await connection.execute(
        mysqlQueryOptions("UPDATE tk_quotation SET status = 'PENDING_INITIAL', update_time = NOW() WHERE id = ? AND status IN ('DRAFT', 'RETURNED')"),
        [quotationId],
      )
      await insertRevision(connection, quotationId, 'SALES', 'SUBMIT_INITIAL', currentStatus === 'RETURNED' ? '退回后重新提交初审' : '草稿提交初审', session, businessType)
      notifyTarget = {
        businessType,
        quotationId,
        quoteNo: quotation.header.quote_no,
        customerName: quotation.header.customer_name,
        salespersonName: quotation.header.salesperson_name,
        lineCount: quotation.lines.length,
        operatorName: sessionName(session),
      }
      businessResult = apiSuccess({ id: quotationId, quoteNo: quotation.header.quote_no, status: 'PENDING_INITIAL', statusLabel: statusLabel('PENDING_INITIAL') }, '报价单已提交初审')
      return businessResult
    },
    '提交初审失败',
    async () => runQuotationNotify('initial', notifyTarget, businessResult),
  )
}

async function withdrawQuotationHandler(event: H3Event, businessType: QuotationBusinessType = 'FOREIGN') {
  const permissions = quotationPermissions(businessType)
  const quotationId = Number(getRouterParam(event, 'id'))
  if (!Number.isSafeInteger(quotationId) || quotationId <= 0) writeFail('报价单ID不符合规范')
  const requestKey = requestId(event, '')

  return withIdempotentWriteSession(
    event,
    `quotation:${businessType}:withdraw:${quotationId}`,
    permissions.upload,
    requestKey,
    { id: quotationId },
    async (session, connection) => {
      const quotation = await fetchQuotation(connection, quotationId, true, businessType)
      if (!quotation) writeFail('报价单不存在', 404)
      if (Number(quotation.header.salesperson_id) !== session.userId && session.userId !== 1) {
        writeFail('只能撤回自己创建的报价单', 403)
      }
      if (String(quotation.header.status) !== 'PENDING_INITIAL') {
        writeFail('只有待初审状态的报价单可以撤回', 409)
      }

      await connection.execute(
        mysqlQueryOptions("UPDATE tk_quotation SET status = 'DRAFT', update_time = NOW() WHERE id = ? AND status = 'PENDING_INITIAL'"),
        [quotationId],
      )
      await insertRevision(connection, quotationId, 'SALES', 'WITHDRAW_TO_DRAFT', '业务员撤回初审', session, businessType)
      return apiSuccess({ id: quotationId, quoteNo: quotation.header.quote_no, status: 'DRAFT', statusLabel: statusLabel('DRAFT') }, '报价单已成功撤回为草稿')
    },
    '撤回报价单失败',
  )
}

async function deleteQuotationHandler(event: H3Event, businessType: QuotationBusinessType = 'FOREIGN') {
  const permissions = quotationPermissions(businessType)
  const quotationId = Number(getRouterParam(event, 'id'))
  if (!Number.isSafeInteger(quotationId) || quotationId <= 0) writeFail('报价单ID不符合规范')
  const requestKey = requestId(event, '')

  return withIdempotentWriteSession(
    event,
    `quotation:${businessType}:delete:${quotationId}`,
    permissions.upload,
    requestKey,
    { id: quotationId },
    async (session, connection) => {
      const quotation = await fetchQuotation(connection, quotationId, true, businessType)
      if (!quotation) writeFail('报价单不存在', 404)
      if (Number(quotation.header.salesperson_id) !== session.userId && session.userId !== 1) {
        writeFail('只能删除自己创建的报价单', 403)
      }
      if (String(quotation.header.status) !== 'DRAFT') {
        writeFail('只能删除草稿状态的报价单', 409)
      }

      await connection.execute(mysqlQueryOptions('DELETE FROM tk_quotation_revision WHERE quotation_id = ?'), [quotationId])
      await connection.execute(mysqlQueryOptions('DELETE FROM tk_quotation_line WHERE quotation_id = ?'), [quotationId])
      await connection.execute(mysqlQueryOptions('DELETE FROM tk_quotation WHERE id = ?'), [quotationId])

      if (quotation.header.storage_path) {
        let filePath = safeStoragePath(quotation.header.storage_path)
        if (!filePath || !existsSync(filePath)) {
          const fallback = resolve(process.cwd(), 'runtime/quotation-private', quotation.header.storage_path)
          if (existsSync(fallback)) filePath = fallback
        }
        if (filePath && existsSync(filePath)) {
          await rm(filePath, { force: true }).catch(() => undefined)
        }
      }

      return apiSuccess({ id: quotationId }, '报价单草稿已删除')
    },
    '删除报价单草稿失败',
  )
}

/** 外贸报价历史终审单价公开参考客户：供所有业务员做定价参考（VJ / BINARY） */
export const QUOTATION_REFERENCE_CUSTOMERS_SQL_PATTERN = '(^|[^A-Z0-9])(VJ|BINARY)([^A-Z0-9]|$)'

export function isQuotationReferenceCustomer(customerName: unknown): boolean {
  const name = String(customerName || '').trim()
  if (!name) return false
  return /(^|[^A-Z0-9])(VJ|BINARY)([^A-Z0-9]|$)/i.test(name)
}

export async function listQuotationHistoryPrices(event: H3Event) {
  return withReadSession(event, 'QuotationHistoryPrices', async (session, pool) => {
    if (!hasPermission(session, QUOTATION_PERMISSIONS.list) && !hasPermission(session, QUOTATION_PERMISSIONS.upload)) {
      return apiError('没有权限访问报价单', 403)
    }
    const query = getQuery(event) as Record<string, unknown>
    const ctkMpn = String(query.ctkMpn || '').trim()
    if (!ctkMpn) return apiSuccess([])

    const requestedLimit = Number(query.limit ?? 5)
    const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 5, 1), 5)
    // 普通销售员只能查看本人名下的历史报价；但 VJ 和 BINARY 作为价格参考客户对所有业务员公开。
    const ownerOnly = !canViewAllQuotations(session)

    const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`
      SELECT 
        l.id AS lineId,
        l.ctk_mpn AS ctkMpn,
        l.package_name AS packageName,
        l.die_size AS dieSize,
        COALESCE(l.final_price_rmb, l.initial_price_rmb, l.original_price_rmb) AS finalPriceRmb,
        l.qty,
        l.unit,
        q.id AS quotationId,
        q.quote_no AS quoteNo,
        q.customer_name AS customerName,
        COALESCE(NULLIF(q.customer_style, ''), l.customer_style) AS customerStyle,
        -- Read optional header columns without requiring the city migration for reads.
        q.*,
        COALESCE(q.quote_date, DATE(q.create_time)) AS quoteDate,
        q.salesperson_name AS salespersonName
      FROM tk_quotation_line l
      JOIN tk_quotation q ON q.id = l.quotation_id
      WHERE q.status = 'APPROVED'
        AND q.business_type = 'FOREIGN'
        AND UPPER(TRIM(l.ctk_mpn)) = UPPER(TRIM(?))
        ${ownerOnly ? `AND (q.salesperson_id = ? OR UPPER(TRIM(q.customer_name)) REGEXP '${QUOTATION_REFERENCE_CUSTOMERS_SQL_PATTERN}')` : ''}
        AND COALESCE(l.final_price_rmb, l.initial_price_rmb, l.original_price_rmb) > 0
      ORDER BY COALESCE(q.quote_date, q.create_time) DESC, l.id DESC
      LIMIT ?
    `), ownerOnly ? [ctkMpn, session.userId, limit] : [ctkMpn, limit])

    const list = (rows || []).map((row: any) => {
      const priceRmb = Number(row.finalPriceRmb)
      const qty = row.qty != null ? Number(row.qty) : null
      return {
        lineId: row.lineId,
        ctkMpn: String(row.ctkMpn || '').trim(),
        packageName: String(row.packageName || '').trim(),
        dieSize: String(row.dieSize || '').trim(),
        priceRmb: Number.isFinite(priceRmb) ? priceRmb : 0,
        qty: Number.isFinite(qty) ? qty : null,
        unit: String(row.unit || 'KPCS').trim(),
        quotationId: row.quotationId,
        quoteNo: String(row.quoteNo || '').trim(),
        customerName: String(row.customerName || '').trim(),
        customerStyle: String(row.customerStyle || '').trim(),
        city: String(row.city || '').trim(),
        quoteDate: formatDate(row.quoteDate),
        salespersonName: String(row.salespersonName || '').trim(),
        isReference: isQuotationReferenceCustomer(row.customerName),
      }
    })

    return apiSuccess(list)
  }, '获取历史单价失败')
}

export async function getQuotationAnalysis(event: H3Event, businessType: QuotationBusinessType = 'FOREIGN') {
  const permissions = quotationPermissions(businessType)
  const businessLabel = businessType === 'DOMESTIC' ? '内贸报价单' : '报价单'
  return withReadSession(event, `${businessLabel}Analysis`, async (session, pool) => {
    if (!hasPermission(session, permissions.list)) return apiError(`没有权限访问${businessLabel}`, 403)
    const query = getQuery(event) as Record<string, unknown>
    const requestedPage = Number(query.detailPage)
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
    const filters = analysisFilters(query)
    if (!isAnalysisStatus(filters.status)) return apiError('报价状态不符合规范', 400)
    if (query.optionsField != null) {
      const columns = {
        customer: 'q.customer_name', ctkMpn: 'l.ctk_mpn', application: 'l.application',
        manufacturer: 'l.manufacturer', manufacturerMpn: 'l.manufacturer_mpn',
        country: "COALESCE(NULLIF(q.country, ''), l.country)",
      }
      const field = queryText(query.optionsField)
      if (!Object.hasOwn(columns, field)) return apiError('筛选字段不符合规范', 400)
      const key = field as keyof typeof columns
      filters[key] = ''
      filters.exact = true
      const { where, params } = analysisWhere(filters, session, businessType)
      const column = columns[key]
      const search = queryText(query.optionsSearch).trim()
      const conditions = [where, `${column} IS NOT NULL`, `TRIM(${column}) <> ''`]
      if (search) { conditions.push(`${column} LIKE CONCAT('%', ?, '%')`); params.push(search) }
      const [options] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`
        SELECT DISTINCT ${column} AS value
        FROM tk_quotation q JOIN tk_quotation_line l ON l.quotation_id = q.id
        WHERE ${conditions.join(' AND ')} ORDER BY value LIMIT 51
      `), params)
      return apiSuccess({ items: options.slice(0, 50).map(row => String(row.value)), hasMore: options.length > 50 })
    }
    const summary = await queryAnalysisSummary(pool, filters, session, businessType, queryText(query.detailsOnly) !== '1')
    const detailPage = Math.min(page, Math.max(1, Math.ceil(summary.lineCount / 100)))
    const rows = await queryAnalysisRows(pool, filters, session, businessType, (detailPage - 1) * 100)
    return apiSuccess({ ...summary, detailPage, detailRows: rows }, '查询成功')
  }, `获取${businessLabel}分析失败`)
}

export async function exportQuotationAnalysis(event: H3Event, businessType: QuotationBusinessType = 'FOREIGN') {
  const permissions = quotationPermissions(businessType)
  const isDomestic = businessType === 'DOMESTIC'
  const businessLabel = isDomestic ? '内贸报价单' : '报价单'
  return withReadSession(event, `${businessLabel}AnalysisExport`, async (session, pool) => {
    if (!hasPermission(session, permissions.analysis)) return apiError(`没有${businessLabel}分析导出权限`, 403)
    const filters = analysisFilters(getQuery(event) as Record<string, unknown>)
    if (!isAnalysisStatus(filters.status)) return apiError('报价状态不符合规范', 400)
    const summary = await queryAnalysisSummary(pool, filters, session, businessType)
    if (summary.lineCount > 20000) return apiError('导出最多支持 20,000 条明细，请缩小创建时间范围后重试', 400)
    const rows = await queryAnalysisRows(pool, filters, session, businessType, 0, 20001)
    if (rows.length > 20000) return apiError('导出最多支持 20,000 条明细，请缩小创建时间范围后重试', 400)
    const delta = (original: number | null, final: number | null) => {
      const change = quotationPriceAdjustment(original, final)
      return [change?.delta ?? '—', change?.percent == null ? '—' : Number(change.percent.toFixed(2))]
    }
    const data = isDomestic
      ? [
          ['报价单号', '创建时间', '客户', '业务员', '行号', 'CTK型号', '封装', '单位', '业务员报价(含税人民币)', '最终报价(含税人民币)', '调价金额(人民币)', '调价幅度(%)'],
          ...rows.map((row) => [
            row.quoteNo, row.submitTime, row.customerName, row.salespersonName, row.lineNo,
            row.ctkMpn, row.packageName, row.unit, row.originalPriceRmb,
            row.finalPriceRmb ?? '—',
            ...delta(row.originalPriceRmb, row.finalPriceRmb),
          ]),
        ]
      : [
          ['国家', '城市', '客户名称', '产品应用', '友商', '友商型号', 'CTK型号', '封装', '数量', '单位', '人民币单价(最终审核)',
            '人民币单价(业务员原价)', '报价单号', '创建时间', '报价日期', '业务员', '行号', '终端客户', '客户性质', '交期',
            '汇率', '千只单价(美元)', '1只单价(美元)', '最终报价(美元)', '调价金额(人民币)', '调价幅度(人民币%)', '调价金额(美元)', '调价幅度(美元%)', '报价状态'],
          ...rows.map((row) => {
            const usdKpcs = computeUsdPriceKpcs(row.originalPriceRmb, row.rate)
            // 原报价没有城市字段，导出留空，不能从客户名称或地址推断。
            return [
              row.country, '', row.customerName, row.application, row.manufacturer, row.manufacturerMpn,
              row.ctkMpn, row.packageName, row.qty, row.unit,
              row.finalPriceRmb ?? '—',
              row.originalPriceRmb ?? '—', row.quoteNo, row.submitTime, row.quoteDate, row.salespersonName, row.lineNo, row.endUser, row.customerStyle, row.leadTime,
              row.rate, usdKpcs, computeUsdPricePc(usdKpcs),
              row.finalPriceUsd ?? '—',
              ...delta(row.originalPriceRmb, row.finalPriceRmb),
              ...delta(row.originalPriceUsd, row.finalPriceUsd),
              row.statusLabel,
            ]
          }),
        ]
    const XLSX = await loadXlsx()
    const workbook = XLSX.utils.book_new()
    const sheet = XLSX.utils.aoa_to_sheet(data)
    sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: data.length - 1, c: data[0].length - 1 } }) }
    sheet['!cols'] = data[0].map(header => ({ wch: Math.max(12, Math.min(32, String(header).length * 2 + 4)) }))
    const summaryData = [
      ['客户', '型号', '单位', '明细行', '已通过报价均价(人民币)', ...(isDomestic ? [] : ['已通过报价均价(美元)']), '缺失最终报价行', '最近创建时间', '报价单数', '最新报价(人民币)', '最低报价(人民币)', '最高报价(人民币)', ...(isDomestic ? [] : ['最新报价(美元)', '最低报价(美元)', '最高报价(美元)'])],
      ...summary.rows.map(row => [row.customerName, row.ctkMpn, row.unit || '', row.lineCount, row.averageFinalRmb ?? '—', ...(isDomestic ? [] : [row.averageFinalUsd ?? '—']), row.missingFinalCount, row.latestSubmitTime, row.quoteCount, row.latestFinalRmb ?? '—', row.minFinalRmb ?? '—', row.maxFinalRmb ?? '—', ...(isDomestic ? [] : [row.latestFinalUsd ?? '—', row.minFinalUsd ?? '—', row.maxFinalUsd ?? '—'])]),
    ]
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summaryData), '价格汇总')
    XLSX.utils.book_append_sheet(workbook, sheet, '报价明细')
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
    setHeader(event, 'content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    const filename = isDomestic ? '内贸报价价格分析.xlsx' : '报价价格分析.xlsx'
    setHeader(event, 'content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
    return buffer
  }, `导出${businessLabel}分析失败`)
}

// 写接口导出：统一经过 withQuotationWriteBody，把校验失败的 NitroWriteError
// 转成 { code, msg } 响应体（否则前端只会看到「网络连接异常」）。
export const createQuotation = withQuotationWriteBody(createQuotationHandler)
export const updateQuotationDraft = withQuotationWriteBody(updateQuotationDraftHandler)
export const uploadQuotation = withQuotationWriteBody(uploadQuotationHandler)
export const reviewQuotation = withQuotationWriteBody(reviewQuotationHandler)
export const submitQuotationDraft = withQuotationWriteBody(submitQuotationDraftHandler)
export const withdrawQuotation = withQuotationWriteBody(withdrawQuotationHandler)
export const deleteQuotation = withQuotationWriteBody(deleteQuotationHandler)

export const uploadDomesticQuotation = withQuotationWriteBody((event) => uploadQuotationHandler(event, 'DOMESTIC'))
export const createDomesticQuotation = withQuotationWriteBody((event) => createQuotationHandler(event, 'DOMESTIC'))
export const updateDomesticQuotationDraft = withQuotationWriteBody((event) => updateQuotationDraftHandler(event, 'DOMESTIC'))
export const reviewDomesticQuotation = withQuotationWriteBody((event) => reviewQuotationHandler(event, 'DOMESTIC'))
export const submitDomesticQuotationDraft = withQuotationWriteBody((event) => submitQuotationDraftHandler(event, 'DOMESTIC'))
export const withdrawDomesticQuotation = withQuotationWriteBody((event) => withdrawQuotationHandler(event, 'DOMESTIC'))
export const deleteDomesticQuotation = withQuotationWriteBody((event) => deleteQuotationHandler(event, 'DOMESTIC'))
