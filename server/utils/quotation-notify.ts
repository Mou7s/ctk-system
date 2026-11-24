import { getMysqlPool, mysqlQueryOptions } from './mysql'
import { errorMessage } from './response'

/**
 * 销售报价单审核提醒（企业微信）。
 *
 * 触发点（都由 `quotation.ts` 在事务提交后调用，见各 handler 的 afterCommit）：
 * - initial：业务员提交 / 上传报价单进入「待初审」→ 提醒初审人
 * - second：初审通过进入「待二审」（内外贸）→ 提醒二审人
 * - final：二审通过进入「待终审」（内外贸）→ 提醒终审人
 * - approved：终审通过 → 按申请人的系统账号精确匹配企业微信工作号并提醒申请人
 * - return：初审 / 二审 / 终审任一环节退回 → 提醒该单所有经手过的人
 *   （业务员 + 已审过的各级审核人，由调用方按留痕动态给出，不走 sys_config 固定收件人）
 *
 * 规则：
 * - 发送失败只记日志并在返回体 data.notify 里带原因，绝不回滚已提交的业务单据；
 * - 提醒不在幂等重放的路径上执行（写完 Garnet 后才发），同一次提交重复请求不会重复提醒；
 * - `enable_duplicate_check = 0`：撤回重提 / 退回重提的内容可能完全相同，必须每次都发。
 *
 * 配置（sys_config）：
 * - wx.work.corpId / wx.work.corpSecret / wx.work.agentId  企微应用凭证（与库存预警共用）
 * - tk.quotation.notify.initialReviewer  初审提醒接收人，逗号分隔，可写企微 userid 或姓名
 * - tk.quotation.notify.secondReviewer   外贸二审提醒接收人
 * - tk.quotation.notify.finalReviewer    终审提醒接收人
 * - tk.quotation.domestic.notify.*       内贸初审 / 二审 / 终审提醒接收人（不回落到外贸配置）
 * 收件人只能解析为有效 wxuser 工作账号；无法匹配时跳过，不将姓名、手机号等原值发给企业微信。
 * 外贸未配置时回落到下面的默认接收人。
 */

export type QuotationNotifyStage = 'initial' | 'second' | 'final'

export type QuotationNotifyTarget = {
  businessType?: 'FOREIGN' | 'DOMESTIC'
  quotationId: number
  quoteNo?: string | null
  customerName?: string | null
  salespersonName?: string | null
  lineCount?: number | null
  /** 触发本环节的人（提交人 / 初审人） */
  operatorName?: string | null
  /** 环节动作，用于留痕与提示语 */
  action?: string | null
  /** Applicant-triggered or scheduled pending-approval reminder. */
  reminder?: 'manual' | 'morning'
}

export type QuotationNotifyResult = {
  status: 'sent' | 'failed' | 'skipped'
  stage: QuotationNotifyStage | 'return' | 'approved'
  recipients: string[]
  message?: string
}

/** 退回通知的载荷：退回环节、退回人、退回意见等 */
export type QuotationReturnNotifyTarget = {
  businessType?: 'FOREIGN' | 'DOMESTIC'
  quotationId: number
  quoteNo?: string | null
  customerName?: string | null
  salespersonName?: string | null
  lineCount?: number | null
  /** 本次退回的操作人 */
  operatorName?: string | null
  /** 退回环节中文名：初审 / 二审 / 终审 */
  stageLabel: string
  comment?: string | null
}

type WecomAppCredentials = {
  corpId: string
  corpSecret: string
  agentId: number
}

type WecomConfig = WecomAppCredentials & {
  recipients: string[]
}

type TokenState = { token: string; expiresAt: number }

const CONFIG_KEYS = [
  'wx.work.corpId',
  'wx.work.corpSecret',
  'wx.work.agentId',
  'tk.quotation.notify.initialReviewer',
  'tk.quotation.notify.secondReviewer',
  'tk.quotation.notify.finalReviewer',
  'tk.quotation.domestic.notify.initialReviewer',
  'tk.quotation.domestic.notify.secondReviewer',
  'tk.quotation.domestic.notify.finalReviewer',
  'tk.quotation.notify.identityAliases',
] as const

const RECIPIENT_KEYS: Record<QuotationNotifyStage, string> = {
  initial: 'tk.quotation.notify.initialReviewer',
  second: 'tk.quotation.notify.secondReviewer',
  final: 'tk.quotation.notify.finalReviewer',
}

const RECIPIENT_ENV_KEYS: Record<QuotationNotifyStage, string> = {
  initial: 'NUXT_QUOTATION_NOTIFY_INITIAL',
  second: 'NUXT_QUOTATION_NOTIFY_SECOND',
  final: 'NUXT_QUOTATION_NOTIFY_FINAL',
}

const DOMESTIC_RECIPIENT_KEYS: Record<QuotationNotifyStage, string> = {
  initial: 'tk.quotation.domestic.notify.initialReviewer',
  second: 'tk.quotation.domestic.notify.secondReviewer',
  final: 'tk.quotation.domestic.notify.finalReviewer',
}

const STAGE_LABELS: Record<QuotationNotifyStage, string> = {
  initial: '初审',
  second: '二审',
  final: '终审',
}

/** 默认接收人（需通过 sys_config 或环境变量配置，默认留空）。 */
const DEFAULT_RECIPIENTS: Record<QuotationNotifyStage, string> = {
  initial: '',
  second: '',
  final: '',
}

const globalState = globalThis as typeof globalThis & {
  __quotationNotifyWecomToken?: TokenState
}

const SEND_TIMEOUT_MS = 10_000
const QUOTATION_PAGE_PATHS = {
  FOREIGN: '/tk_custom/quotation',
  DOMESTIC: '/tk_custom/domesticQuotation',
}
const DEFAULT_QUOTATION_APP_URLS = {
  internal: '',
  external: '',
}

function envValue(...names: string[]): string {
  for (const name of names) {
    const value = String(process.env[name] || '').trim()
    if (value) return value
  }
  return ''
}

function nowText(): string {
  const now = new Date()
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
}

function quotationPageLinkLines(businessType: 'FOREIGN' | 'DOMESTIC' = 'FOREIGN'): string[] {
  const entries: Array<[string, string, string]> = [
    ['内网', envValue('NUXT_QUOTATION_APP_INTERNAL_URL'), DEFAULT_QUOTATION_APP_URLS.internal],
    ['外网', envValue('NUXT_QUOTATION_APP_EXTERNAL_URL'), DEFAULT_QUOTATION_APP_URLS.external],
  ]

    return entries.flatMap(([label, configuredUrl, defaultUrl]) => {
    const toPageUrl = (value: string): string => {
      if (!value) return ''
      try {
        const base = new URL(value)
        if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) return ''
        return `${base.origin}${QUOTATION_PAGE_PATHS[businessType]}`
      } catch {
        return ''
      }
    }
    const href = toPageUrl(configuredUrl) || toPageUrl(defaultUrl)
    const pageLabel = businessType === 'DOMESTIC' ? '打开内贸销售报价单' : '打开外贸销售报价单'
    return href ? [`${label}：[${pageLabel}](${href})`] : []
  })
}

async function readConfigValues(): Promise<Map<string, string>> {
  const [rows] = await getMysqlPool().query<{ config_key: string; config_value: string }[]>(
    mysqlQueryOptions(`SELECT config_key, config_value FROM sys_config WHERE config_key IN (${CONFIG_KEYS.map(() => '?').join(', ')})`),
    [...CONFIG_KEYS],
  )
  return new Map(rows.map((row) => [String(row.config_key), String(row.config_value || '').trim()]))
}

/**
 * 配置里允许写企微 userid 或姓名，这里统一解析成 userid；
 * 解析不到的原样透传（让企微把「无此用户」报出来，而不是静默丢人）。
 */
async function resolveUserIds(tokens: string[]): Promise<string[]> {
  if (!tokens.length) return []
  const config = await readConfigValues()
  const rawAliases = config.get('tk.quotation.notify.identityAliases')
  const aliases: Record<string, unknown> = rawAliases ? JSON.parse(rawAliases) : {}
  if (!aliases || typeof aliases !== 'object' || Array.isArray(aliases)) throw new Error('报价通知身份映射配置格式无效')
  const mapped = tokens.map(token => {
    if (!Object.prototype.hasOwnProperty.call(aliases, token)) return token
    const target = aliases[token]
    if (typeof target !== 'string' || !target.trim()) throw new Error('报价通知身份映射目标不能为空')
    return target.trim()
  })
  const [rows] = await getMysqlPool().query<{ userid: string; name: string }[]>(
    mysqlQueryOptions(`
      SELECT userid, name FROM wxuser
      WHERE status = 'active'
        AND (userid IN (${mapped.map(() => '?').join(', ')}) OR name IN (${mapped.map(() => '?').join(', ')}))
    `),
    [...mapped, ...mapped],
  )
  const byUserId = new Map(rows.map((row) => [String(row.userid), String(row.userid)]))
  const byName = new Map(rows.map((row) => [String(row.name), String(row.userid)]))
  return [...new Set(mapped.flatMap((token, index) => {
    const isExplicitAlias = Object.prototype.hasOwnProperty.call(aliases, tokens[index])
    const workUserId = isExplicitAlias ? byUserId.get(token) : byUserId.get(token) || byName.get(token)
    return workUserId ? [workUserId] : []
  }))]
}

/** Resolve an applicant only through their active enterprise-WeChat work account. */
async function resolveApplicantWorkUserId(userId: number): Promise<string | null> {
  const [rows] = await getMysqlPool().query<{ userid: string }[]>(
    mysqlQueryOptions(`
      SELECT w.userid
      FROM sys_user u
      JOIN wxuser w ON w.userid = u.user_name AND w.status = 'active'
      WHERE u.user_id = ? AND u.status = '0' AND u.del_flag = '0'
      LIMIT 1
    `),
    [userId],
  )
  return rows.length ? String(rows[0].userid) : null
}

/** 只取企微应用凭证（退回通知的收件人由业务侧动态给出，不读 sys_config 的收件人键） */
async function readWecomAppCredentials(): Promise<WecomAppCredentials> {
  const values = await readConfigValues()
  return {
    corpId: values.get('wx.work.corpId') || envValue('NUXT_WECOM_CORP_ID', 'WX_WORK_CORP_ID'),
    corpSecret: values.get('wx.work.corpSecret') || envValue('NUXT_WECOM_CORP_SECRET', 'WX_WORK_CORP_SECRET'),
    agentId: Number(values.get('wx.work.agentId') || envValue('NUXT_WECOM_AGENT_ID', 'WX_WORK_AGENT_ID') || 0),
  }
}

async function readWecomConfig(stage: QuotationNotifyStage, businessType: 'FOREIGN' | 'DOMESTIC' = 'FOREIGN'): Promise<WecomConfig> {
  const values = await readConfigValues()
  const recipientKey = businessType === 'DOMESTIC' ? DOMESTIC_RECIPIENT_KEYS[stage] : RECIPIENT_KEYS[stage]
  const rawRecipients = recipientKey
    ? values.get(recipientKey) || (businessType === 'FOREIGN' ? envValue(RECIPIENT_ENV_KEYS[stage]) || DEFAULT_RECIPIENTS[stage] : '')
    : ''
  const tokens = rawRecipients.split(/[,|;]/).map((item) => item.trim()).filter(Boolean)
  return {
    ...(await readWecomAppCredentials()),
    recipients: await resolveUserIds(tokens),
  }
}

async function fetchJson(url: string, init: RequestInit, timeoutMs = SEND_TIMEOUT_MS): Promise<any> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    const body = await response.json().catch(() => null)
    if (!response.ok) throw new Error(`企业微信 HTTP ${response.status}`)
    return body
  } finally {
    clearTimeout(timer)
  }
}

async function getAccessToken(config: WecomConfig): Promise<string> {
  const current = globalState.__quotationNotifyWecomToken
  if (current && current.expiresAt > Date.now() + 60_000) return current.token
  const body = await fetchJson(
    `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(config.corpId)}&corpsecret=${encodeURIComponent(config.corpSecret)}`,
    { method: 'GET' },
  )
  if (Number(body?.errcode || 0) !== 0 || !body?.access_token) {
    throw new Error(`企业微信获取令牌失败(${body?.errcode || '-'}): ${body?.errmsg || '无返回'}`)
  }
  const expiresIn = Math.max(60, Number(body.expires_in || 7200))
  globalState.__quotationNotifyWecomToken = { token: String(body.access_token), expiresAt: Date.now() + expiresIn * 1000 }
  return String(body.access_token)
}

async function sendTextToUser(config: WecomAppCredentials, userId: string, content: string): Promise<void> {
  const token = await getAccessToken(config)
  const body = await fetchJson(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      touser: userId,
      toparty: '',
      totag: '',
      msgtype: 'markdown',
      agentid: config.agentId,
      markdown: { content },
      enable_id_trans: 0,
      // 撤回重提 / 退回重提的内容可能一字不差，必须每次都送达
      enable_duplicate_check: 0,
    }),
  })
  if (Number(body?.errcode || 0) !== 0) {
    throw new Error(`发送给 ${userId} 失败(${body?.errcode || '-'}): ${body?.errmsg || '无返回'}`)
  }
}

const STAGE_TITLES: Record<QuotationNotifyStage, string> = {
  initial: '【报价单待初审】',
  second: '【报价单待二审】',
  final: '【报价单待终审】',
}

const STAGE_HINTS: Record<QuotationNotifyStage, string> = {
  initial: '请登录 ctk-system → 销售管理 → 报价单 处理初审。',
  second: '请登录 ctk-system → 销售管理 → 报价单 处理二审。',
  final: '请登录 ctk-system → 销售管理 → 报价单 处理终审。',
}

export function buildQuotationNotifyMessage(stage: QuotationNotifyStage, target: QuotationNotifyTarget): string {
  const businessType = target.businessType || 'FOREIGN'
  const title = businessType === 'DOMESTIC'
    ? `【内贸报价单待${STAGE_LABELS[stage]}】`
    : STAGE_TITLES[stage]
  const lines = [
    target.reminder ? `${title.replace('】', '')} · ${target.reminder === 'manual' ? '申请人催审批' : '上班待审提醒'}】` : title,
    `单号：${target.quoteNo || '-'}`,
    `客户：${target.customerName || '-'}`,
    `业务员：${target.salespersonName || '-'}`,
    `明细：${target.lineCount == null ? '-' : `${target.lineCount} 行`}`,
  ]
  if (stage === 'second' && !target.reminder) {
    lines.push(`初审：${target.operatorName || '-'}（初审通过）`)
  }
  if (stage === 'final' && !target.reminder) {
    const previousStageLabel = target.action === 'APPROVE_INITIAL_TO_FINAL' ? '初审' : '二审'
    lines.push(`${previousStageLabel}：${target.operatorName || '-'}（${previousStageLabel}通过）`)
  }
  lines.push(`时间：${nowText()}`)
  lines.push(businessType === 'DOMESTIC'
    ? `请登录 ctk-system → 销售管理 → 内贸销售报价单 处理${STAGE_LABELS[stage]}。`
    : STAGE_HINTS[stage])
  lines.push(...quotationPageLinkLines(businessType))
  return lines.join('\n')
}

/** 发送提醒。任何失败都只返回 failed 状态，不抛出（业务单据已提交，不能被通知拖失败）。 */
export async function notifyQuotationStage(stage: QuotationNotifyStage, target: QuotationNotifyTarget): Promise<QuotationNotifyResult> {
  let recipients: string[] = []
  try {
    const config = await readWecomConfig(stage, target.businessType || 'FOREIGN')
    recipients = config.recipients
    if (!config.corpId || !config.corpSecret || !config.agentId) {
      return { status: 'skipped', stage, recipients, message: '企业微信应用配置不完整（sys_config wx.work.*）' }
    }
    if (!recipients.length) {
      return { status: 'skipped', stage, recipients, message: `未配置${STAGE_LABELS[stage]}提醒接收人` }
    }

    const content = buildQuotationNotifyMessage(stage, target)
    const failed: string[] = []
    for (const userId of recipients) {
      try {
        await sendTextToUser(config, userId, content)
      } catch (error) {
        failed.push(errorMessage(error, '发送失败'))
      }
    }
    if (failed.length) {
      console.error(`[NitroQuotation:notify:${stage}]`, failed.join('；'))
      return { status: 'failed', stage, recipients, message: failed.join('；') }
    }
    return { status: 'sent', stage, recipients }
  } catch (error) {
    const message = errorMessage(error, '企业微信提醒发送失败')
    console.error(`[NitroQuotation:notify:${stage}]`, message)
    return { status: 'failed', stage, recipients, message }
  }
}

export function buildQuotationReturnMessage(target: QuotationReturnNotifyTarget): string {
  const businessType = target.businessType || 'FOREIGN'
  const lines = [
    businessType === 'DOMESTIC' ? '【内贸报价单已退回】' : '【外贸报价单已退回】',
    `单号：${target.quoteNo || '-'}`,
    `客户：${target.customerName || '-'}`,
    `业务员：${target.salespersonName || '-'}`,
    `明细：${target.lineCount == null ? '-' : `${target.lineCount} 行`}`,
    `退回环节：${target.stageLabel || '-'}`,
    `退回人：${target.operatorName || '-'}`,
    `退回意见：${String(target.comment || '').trim() || '-'}`,
    `时间：${nowText()}`,
    '',
    '该单已退回业务员修改；业务员重新提交后会从初审重新走一遍审批。',
    ...quotationPageLinkLines(businessType),
  ]
  return lines.join('\n')
}

export function buildQuotationApprovedMessage(target: QuotationNotifyTarget): string {
  const businessType = target.businessType || 'FOREIGN'
  return [
    businessType === 'DOMESTIC' ? '【内贸报价单已终审通过】' : '【外贸报价单已终审通过】',
    `单号：${target.quoteNo || '-'}`,
    `客户：${target.customerName || '-'}`,
    `明细：${target.lineCount == null ? '-' : `${target.lineCount} 行`}`,
    `时间：${nowText()}`,
    '',
    '该报价单已完成审批，可登录系统查看或下载。',
    ...quotationPageLinkLines(businessType),
  ].join('\n')
}

/** Notify only the applicant's active work account; never fall back to a name or phone number. */
export async function notifyQuotationApproved(target: QuotationNotifyTarget, applicantId: number): Promise<QuotationNotifyResult> {
  let recipients: string[] = []
  try {
    const userId = await resolveApplicantWorkUserId(applicantId)
    if (!userId) return { status: 'skipped', stage: 'approved', recipients, message: '申请人没有匹配到有效的企业微信工作号' }
    recipients = [userId]
    const config = await readWecomAppCredentials()
    if (!config.corpId || !config.corpSecret || !config.agentId) {
      return { status: 'skipped', stage: 'approved', recipients, message: '企业微信应用配置不完整（sys_config wx.work.*）' }
    }
    await sendTextToUser(config, userId, buildQuotationApprovedMessage(target))
    return { status: 'sent', stage: 'approved', recipients }
  } catch (error) {
    const message = errorMessage(error, '企业微信终审通过通知发送失败')
    console.error('[NitroQuotation:notify:approved]', message)
    return { status: 'failed', stage: 'approved', recipients, message }
  }
}

/**
 * 退回提醒：收件人由调用方（quotation.ts）按该单历史经手人动态给出。
 * 与其它环节一致：任何失败都只返回 failed/skipped，不影响已提交的业务结果。
 */
export async function notifyQuotationReturn(target: QuotationReturnNotifyTarget, recipients: string[]): Promise<QuotationNotifyResult> {
  const stage = 'return' as const
  let resolved: string[] = []
  try {
    resolved = await resolveUserIds(recipients)
    const config = await readWecomAppCredentials()
    if (!config.corpId || !config.corpSecret || !config.agentId) {
      return { status: 'skipped', stage, recipients: resolved, message: '企业微信应用配置不完整（sys_config wx.work.*）' }
    }
    if (!resolved.length) {
      return { status: 'skipped', stage, recipients: resolved, message: '该报价单没有可通知的历史经手人' }
    }
    const content = buildQuotationReturnMessage(target)
    const failed: string[] = []
    for (const userId of resolved) {
      try {
        await sendTextToUser(config, userId, content)
      } catch (error) {
        failed.push(errorMessage(error, '发送失败'))
      }
    }
    if (failed.length) {
      console.error('[NitroQuotation:notify:return]', failed.join('；'))
      return { status: 'failed', stage, recipients: resolved, message: failed.join('；') }
    }
    return { status: 'sent', stage, recipients: resolved }
  } catch (error) {
    const message = errorMessage(error, '企业微信退回提醒发送失败')
    console.error('[NitroQuotation:notify:return]', message)
    return { status: 'failed', stage, recipients: resolved, message }
  }
}

/**
 * 事务提交后发送提醒，并把结果挂到返回体 `data.notify`（前端据此提示，接口 code 不变）。
 * 注意：Nitro 的幂等重放不会走到这里，所以同一次提交不会重复提醒。
 */
export async function attachQuotationNotify(
  response: unknown,
  stage: QuotationNotifyStage,
  target: QuotationNotifyTarget,
): Promise<void> {
  const result = await notifyQuotationStage(stage, target)
  attachNotifyResult(response, result)
}

export async function attachQuotationApprovedNotify(response: unknown, target: QuotationNotifyTarget, applicantId: number): Promise<void> {
  attachNotifyResult(response, await notifyQuotationApproved(target, applicantId))
}

/** 退回通知同样把结果挂在 `data.notify`，前端复用同一套提示逻辑 */
export async function attachQuotationReturnNotify(
  response: unknown,
  target: QuotationReturnNotifyTarget,
  recipients: string[],
): Promise<void> {
  attachNotifyResult(response, await notifyQuotationReturn(target, recipients))
}

function attachNotifyResult(response: unknown, result: QuotationNotifyResult): void {
  const body = response as { data?: Record<string, unknown> } | null
  if (body && typeof body === 'object' && body.data && typeof body.data === 'object') {
    body.data.notify = result
  }
}
