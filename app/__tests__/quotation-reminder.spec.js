import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  userId: 7, authenticated: true, allowed: true, id: '10', enabled: true,
  row: null, current: null, recent: [], duplicate: false, notify: vi.fn(),
  query: vi.fn(), execute: vi.fn(), connection: null, pool: null,
}))
vi.mock('h3', () => ({ getRouterParam: () => state.id, getHeader: vi.fn(), getRequestURL: vi.fn(), readBody: vi.fn() }))
vi.mock('../../server/utils/auth', () => ({
  getAuthSession: async () => state.authenticated ? { session: { userId: state.userId } } : null,
  hasPermission: () => state.allowed,
  AUTH_SESSION_PREFIX: 'auth_sessions:', saveAuthSession: vi.fn(),
}))
vi.mock('../../server/utils/mysql', () => ({ getMysqlPool: () => state.pool, mysqlQueryOptions: sql => ({ sql }) }))
vi.mock('../../server/utils/quotation-notify', () => ({ notifyQuotationStage: (...args) => state.notify(...args) }))
import { quotationReminderClock, quotationReminderStage, remindQuotation, runQuotationMorningReminders } from '../../server/utils/quotation-reminder'

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-26T00:00:00Z'))
  state.userId = 7; state.authenticated = true; state.allowed = true; state.id = '10'; state.enabled = true
  state.row = { id: 10, salesperson_id: 7, business_type: 'FOREIGN', status: 'PENDING_SECOND', quote_no: 'Q10', line_count: 2 }
  state.current = { status: 'PENDING_SECOND', revisionId: 12 }
  state.recent = []; state.duplicate = false
  state.notify.mockReset().mockResolvedValue({ status: 'sent' })
  state.query.mockReset().mockImplementation(async ({ sql }) => {
    if (sql.includes('FOR UPDATE')) return [state.row ? [state.row] : []]
    if (sql.includes('MAX(id)')) return [[{ id: 12 }]]
    if (sql.includes('DATE_SUB')) return [state.recent]
    if (sql.includes('AS revisionId')) return [state.current ? [state.current] : []]
    if (sql.includes('sys_config')) return [[{ config_value: state.enabled ? '1' : '0' }]]
    if (sql.includes('SELECT id, business_type, status')) return [state.row ? [{ ...state.row }] : []]
    throw new Error('Unexpected query: ' + sql)
  })
  state.execute.mockReset().mockImplementation(async ({ sql }) => [{ affectedRows: sql.includes('INSERT IGNORE') && state.duplicate ? 0 : 1 }])
  state.connection = { query: state.query, execute: state.execute, beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() }
  state.pool = { query: state.query, execute: state.execute, getConnection: async () => state.connection }
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('quotation reminder schedule', () => {
  it('runs Monday through Saturday at Shanghai 08:00, with a bounded restart window', () => {
    for (const day of [26, 27, 28, 29, 30, 31]) {
      expect(quotationReminderClock(new Date(`2026-10-${day}T00:00:00Z`)).due).toBe(true)
    }
    expect(quotationReminderClock(new Date('2026-11-01T00:00:00Z')).due).toBe(false)
    expect(quotationReminderClock(new Date('2026-10-26T00:04:59Z')).due).toBe(true)
    expect(quotationReminderClock(new Date('2026-10-26T00:05:00Z')).due).toBe(false)
    expect(quotationReminderClock(new Date('2026-10-25T23:59:59Z')).due).toBe(false)
    expect(quotationReminderClock(new Date('2026-10-26T01:00:00Z')).due).toBe(false)
  })

  it.each(['DRAFT', 'RETURNED', 'APPROVED', 'constructor'])('does not remind %s documents', status => {
    expect(quotationReminderStage(status)).toBeUndefined()
  })

  it('does no database work outside the morning window and respects the enable switch', async () => {
    expect(await runQuotationMorningReminders(new Date('2026-10-26T02:00:00Z'))).toEqual({ skipped: true })
    expect(state.query).not.toHaveBeenCalled()
    state.enabled = false
    expect(await runQuotationMorningReminders()).toEqual({ skipped: true })
    expect(state.notify).not.toHaveBeenCalled()
  })

  it('claims a daily key, routes the current stage, and suppresses a repeated process run', async () => {
    expect(await runQuotationMorningReminders()).toEqual({ sent: 1, failed: 0 })
    expect(state.execute.mock.calls.find(([options]) => options.sql.includes('INSERT IGNORE'))[1]).toEqual(['morning:2026-10-26:FOREIGN:10', 10, 'FOREIGN', 'second', 12, 'morning', null])
    expect(state.notify).toHaveBeenCalledWith('second', expect.objectContaining({ quotationId: 10, reminder: 'morning', businessType: 'FOREIGN' }))
    state.duplicate = true
    expect(await runQuotationMorningReminders()).toEqual({ sent: 0, failed: 0 })
    expect(state.notify).toHaveBeenCalledTimes(1)
  })
})

describe('manual quotation reminder', () => {
  it('registers distinct foreign and domestic reminder endpoints in the shared API factory', async () => {
    const { createTkApi } = await import('../packages/api/createTkApi.js')
    const request = vi.fn()
    const api = createTkApi(request)
    api.remindQuotation(10)
    api.remindDomesticQuotation(11)
    expect(request.mock.calls).toEqual([
      [{ url: '/tk_custom/quotation/10/remind', method: 'post' }],
      [{ url: '/tk_custom/quotation/domestic/11/remind', method: 'post' }],
    ])
  })

  it('requires authentication and quotation list permission', async () => {
    state.authenticated = false
    expect((await remindQuotation({})).code).toBe(401)
    state.authenticated = true; state.allowed = false
    expect((await remindQuotation({})).code).toBe(403)
    expect(state.query).not.toHaveBeenCalled()
  })

  it.each([1, 8])('rejects non-applicant user %s, even an administrator', async userId => {
    state.userId = userId
    expect((await remindQuotation({})).code).toBe(403)
    expect(state.execute).not.toHaveBeenCalled()
    expect(state.notify).not.toHaveBeenCalled()
  })

  it.each(['DRAFT', 'RETURNED', 'APPROVED'])('rejects reminders for %s', async status => {
    state.row.status = status
    expect((await remindQuotation({})).code).toBe(409)
    expect(state.notify).not.toHaveBeenCalled()
  })

  it('rejects invalid ids and missing documents', async () => {
    state.id = '0'; expect((await remindQuotation({})).code).toBe(400)
    state.id = '10'; state.row = null; expect((await remindQuotation({})).code).toBe(404)
    expect(state.notify).not.toHaveBeenCalled()
  })

  it.each(['PENDING_INITIAL', 'PENDING_SECOND', 'PENDING_FINAL'])('only sends to the current reviewer for %s after commit', async status => {
    state.row.status = status; state.current.status = status
    state.notify.mockImplementation(async () => {
      expect(state.connection.commit).toHaveBeenCalledOnce()
      expect(state.connection.release).toHaveBeenCalledOnce()
      return { status: 'sent' }
    })
    const response = await remindQuotation({})
    expect(response.code).toBe(200)
    expect(response.msg).toBe('已提醒当前审批人')
    expect(state.notify).toHaveBeenCalledWith(quotationReminderStage(status), expect.objectContaining({ reminder: 'manual', quotationId: 10 }))
  })

  it('enforces a shared per-stage, per-revision cooldown and blocks rapid clicks', async () => {
    state.recent = [{ id: 1 }]
    expect((await remindQuotation({})).code).toBe(429)
    expect(state.notify).not.toHaveBeenCalled()
    expect(state.query.mock.calls.find(([options]) => options.sql.includes('DATE_SUB'))[1]).toEqual([10, 'second', 12])
  })

  it('does not deliver an uncommitted claim when commit fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    state.connection.commit.mockRejectedValueOnce(new Error('commit failed'))
    const response = await remindQuotation({})
    expect(response.code).toBe(500)
    expect(response.msg).toBe('催审批失败，请稍后重试')
    expect(state.connection.rollback).toHaveBeenCalledOnce()
    expect(state.connection.release).toHaveBeenCalledOnce()
    expect(state.notify).not.toHaveBeenCalled()
    expect(state.query.mock.calls.some(([options]) => options.sql.includes('AS revisionId'))).toBe(false)
  })

  it.each([{ status: 'APPROVED', revisionId: 13 }, { status: 'PENDING_SECOND', revisionId: 13 }, null])('cancels if state changed after reserving delivery', async current => {
    state.current = current
    expect((await remindQuotation({})).code).toBe(409)
    expect(state.notify).not.toHaveBeenCalled()
    expect(state.execute).toHaveBeenCalledWith(expect.objectContaining({ sql: expect.stringContaining("status = 'cancelled'") }), expect.any(Array))
  })

  it.each(['failed', 'skipped'])('reports %s delivery honestly rather than showing success', async status => {
    state.notify.mockResolvedValue({ status })
    expect((await remindQuotation({})).code).toBe(502)
    expect(state.execute).toHaveBeenLastCalledWith(expect.any(Object), [status, expect.any(String)])
  })

  it('keeps domestic routing isolated', async () => {
    state.row.business_type = 'DOMESTIC'
    expect((await remindQuotation({}, 'DOMESTIC')).code).toBe(200)
    expect(state.query.mock.calls[0][1]).toEqual([10, 'DOMESTIC'])
    expect(state.notify).toHaveBeenCalledWith('second', expect.objectContaining({ businessType: 'DOMESTIC' }))
  })
})
