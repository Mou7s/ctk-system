import { randomUUID } from 'node:crypto'
import { getRouterParam, type H3Event } from 'h3'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { getMysqlPool, mysqlQueryOptions } from './mysql'
import { withWriteSession, writeFail } from './write'
import { apiError, apiSuccess } from './response'
import { notifyQuotationStage, type QuotationNotifyStage, type QuotationNotifyTarget } from './quotation-notify'

type BusinessType = 'FOREIGN' | 'DOMESTIC'
type Source = 'manual' | 'morning'
const STAGES: Record<string, QuotationNotifyStage> = {
  PENDING_INITIAL: 'initial', PENDING_SECOND: 'second', PENDING_FINAL: 'final',
}
export const REMINDER_ENABLED_KEY = 'tk.quotation.reminder.enabled'

export function quotationReminderStage(status: string): QuotationNotifyStage | undefined {
  return Object.hasOwn(STAGES, status) ? STAGES[status] : undefined
}

export function quotationReminderClock(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(part => [part.type, part.value]))
  // Five-minute recovery window for a restart at 08:00; never catch up later in the day.
  return { day: `${parts.year}-${parts.month}-${parts.day}`, due: parts.weekday !== 'Sun' && parts.hour === '08' && Number(parts.minute) < 5 }
}

type Claim = { key: string; revisionId: number; stage: QuotationNotifyStage; target: QuotationNotifyTarget }

/** Caller holds the quotation row lock; this is shared by all processes and both reminder paths. */
async function claimReminder(connection: any, row: any, source: Source, operatorId: number | null, day = ''): Promise<Claim | null> {
  const stage = quotationReminderStage(String(row.status))
  if (!stage) return null
  const [revisions] = await connection.query(mysqlQueryOptions('SELECT COALESCE(MAX(id), 0) AS id FROM tk_quotation_revision WHERE quotation_id = ?'), [row.id])
  const revisionId = Number(revisions[0].id)
  const [recent] = await connection.query(mysqlQueryOptions(`
    SELECT id FROM tk_quotation_reminder
    WHERE quotation_id = ? AND stage = ? AND revision_id = ?
      AND create_time > DATE_SUB(NOW(), INTERVAL 1 HOUR)
      AND status IN ('sending', 'sent', 'failed') LIMIT 1
  `), [row.id, stage, revisionId])
  // Failed/uncertain sends retain the cooldown: a network timeout may have delivered the message.
  if (recent.length) return null
  const key = source === 'morning' ? `morning:${day}:${row.business_type}:${row.id}` : `manual:${randomUUID()}`
  const [inserted] = await connection.execute(mysqlQueryOptions(`
    INSERT IGNORE INTO tk_quotation_reminder
      (dedupe_key, quotation_id, business_type, stage, revision_id, source, operator_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `), [key, row.id, row.business_type, stage, revisionId, source, operatorId])
  if (!inserted.affectedRows) return null
  return { key, revisionId, stage, target: {
    businessType: row.business_type, quotationId: Number(row.id), quoteNo: row.quote_no,
    customerName: row.customer_name, salespersonName: row.salesperson_name, lineCount: Number(row.line_count),
    reminder: source,
  } }
}

async function deliverReminder(pool: Pool, claim: Claim) {
  // Re-read after the claim commits. Do not send the previous reviewer a stale reminder.
  const [current] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`
    SELECT q.status, (SELECT COALESCE(MAX(r.id), 0) FROM tk_quotation_revision r WHERE r.quotation_id = q.id) AS revisionId
    FROM tk_quotation q WHERE q.id = ? AND q.business_type = ?
  `), [claim.target.quotationId, claim.target.businessType])
  if (!current[0] || quotationReminderStage(String(current[0].status)) !== claim.stage || Number(current[0].revisionId) !== claim.revisionId) {
    await pool.execute(mysqlQueryOptions("UPDATE tk_quotation_reminder SET status = 'cancelled', finish_time = NOW() WHERE dedupe_key = ?"), [claim.key])
    return { status: 'cancelled' as const }
  }
  const result = await notifyQuotationStage(claim.stage, claim.target)
  await pool.execute(mysqlQueryOptions('UPDATE tk_quotation_reminder SET status = ?, finish_time = NOW() WHERE dedupe_key = ?'), [result.status, claim.key])
  return { status: result.status }
}

export async function remindQuotation(event: H3Event, businessType: BusinessType = 'FOREIGN') {
  const permission = businessType === 'DOMESTIC' ? 'tk_custom:domesticQuotation:list' : 'tk_custom:quotation:list'
  let claim: Claim | null = null
  const response = await withWriteSession(event, 'QuotationReminder', permission, async (session, connection) => {
    const id = Number(getRouterParam(event, 'id'))
    if (!Number.isSafeInteger(id) || id <= 0) writeFail('报价单ID不符合规范', 400)
    const [rows] = await connection.query<RowDataPacket[]>(mysqlQueryOptions('SELECT * FROM tk_quotation WHERE id = ? AND business_type = ? FOR UPDATE'), [id, businessType])
    const row = rows[0]
    if (!row) writeFail('报价单不存在', 404)
    // No administrator/reviewer exception: only the applicant may click this action.
    if (Number(row.salesperson_id) !== session.userId) writeFail('只有申请人可以催审批', 403)
    if (!quotationReminderStage(String(row.status))) writeFail('该报价单当前无需审批', 409)
    claim = await claimReminder(connection, row, 'manual', session.userId)
    if (!claim) writeFail('该环节一小时内已催审，请稍后再试', 429)
    return apiSuccess({ status: 'sending' }, '正在发送催审批提醒')
  }, '催审批失败，请稍后重试')
  // The wrapper releases its connection before delivery acquires one from the pool.
  if (response.code === 200 && claim) {
    try {
      const result = await deliverReminder(getMysqlPool(), claim)
      if (result.status === 'sent') Object.assign(response, apiSuccess({ status: 'sent' }, '已提醒当前审批人'))
      else if (result.status === 'cancelled') Object.assign(response, apiError('审批状态已变化，无需催审，请刷新列表', 409, { status: result.status }))
      else Object.assign(response, apiError('催审批消息未确认送达，请联系管理员核查；一小时内请勿重复催审', 502, { status: result.status }))
    } catch {
      Object.assign(response, apiError('催审批发送结果待核查，请勿重复点击', 502, { status: 'uncertain' }))
    }
  }
  return response
}

export async function runQuotationMorningReminders(now = new Date()) {
  const clock = quotationReminderClock(now)
  if (!clock.due) return { skipped: true }
  const pool = getMysqlPool()
  const [settings] = await pool.query<RowDataPacket[]>(mysqlQueryOptions('SELECT config_value FROM sys_config WHERE config_key = ? LIMIT 1'), [REMINDER_ENABLED_KEY])
  if (String(settings[0]?.config_value) !== '1') return { skipped: true }
  const [pending] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`
    SELECT id, business_type, status FROM tk_quotation
    WHERE status IN ('PENDING_INITIAL', 'PENDING_SECOND', 'PENDING_FINAL') AND business_type IN ('FOREIGN', 'DOMESTIC')
  `))
  let sent = 0
  let failed = 0
  for (const candidate of pending) {
    // Do not turn a long backlog into daytime notifications.
    if (!quotationReminderClock(new Date()).due) break
    const connection = await pool.getConnection()
    let claim: Claim | null = null
    try {
      await connection.beginTransaction()
      const [rows] = await connection.query<RowDataPacket[]>(mysqlQueryOptions('SELECT * FROM tk_quotation WHERE id = ? AND business_type = ? FOR UPDATE'), [candidate.id, candidate.business_type])
      if (rows[0] && rows[0].status === candidate.status) claim = await claimReminder(connection, rows[0], 'morning', null, clock.day)
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally { connection.release() }
    if (claim) {
      try {
        const result = await deliverReminder(pool, claim)
        if (result.status === 'sent') sent++
        else if (result.status !== 'cancelled') failed++
      } catch { failed++ }
    }
  }
  return { sent, failed }
}
