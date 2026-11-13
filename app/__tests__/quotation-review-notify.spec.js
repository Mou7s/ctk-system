import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 销售报价单审核企微提醒：
 * - 提交/上传进入「待初审」→ 提醒初审人
 * - 初审通过进入「待二审」→ 提醒二审人（内外贸相同）；二审通过进入「待终审」→ 提醒终审人
 * - 二审通过进入「待终审」→ 提醒终审人
 * - 初审/二审/终审任一环节退回 → 单据落「已退回」并提醒所有经手过的人
 *   （业务员 + 已审过的各级审核人，排除本次退回人自己）
 * - 退回后业务员重新提交时从初审重跑；企微发送失败不能影响已提交的业务结果。
 */

const state = vi.hoisted(() => ({
  body: {},
  params: {},
  header: {},
  lines: [],
  configRows: [],
  wxRows: [],
  applicantWorkUserId: 'saler-work-account',
  historyRows: [],
  authenticated: {
    token: 'test-token',
    session: {
      userId: 7,
      deptId: 11,
      userName: 'saler',
      user: { userId: 7, userName: 'saler', nickName: '张三' },
      roles: [],
      permissions: ['*:*:*'],
    },
  },
  connection: {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi.fn(),
    execute: vi.fn(),
  },
  pool: { getConnection: vi.fn(), query: vi.fn() },
  garnet: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
}))

vi.mock('h3', () => ({
  readBody: vi.fn(async () => state.body),
  getRouterParam: vi.fn((_event, name) => state.params[name]),
  getHeader: vi.fn(() => undefined),
  getQuery: vi.fn(() => ({})),
  setHeader: vi.fn(),
  readMultipartFormData: vi.fn(async () => []),
}))

vi.mock('../../server/utils/auth.ts', () => ({
  getAuthSession: vi.fn(async () => state.authenticated),
  hasPermission: vi.fn((session, permission) => session.permissions.includes(permission) || session.permissions.includes('*:*:*')),
}))

vi.mock('../../server/utils/mysql.ts', () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}))

vi.mock('../../server/utils/redis.ts', () => ({
  getGarnet: vi.fn(() => state.garnet),
}))

const fetchMock = vi.fn()

function messageSends() {
  return fetchMock.mock.calls
    .filter(([url]) => String(url).includes('message/send'))
    .map(([, init]) => JSON.parse(String(init?.body || '{}')))
}

async function loadModule() {
  return import('../../server/utils/quotation.ts')
}

describe('Nitro quotation review notifications (WeCom)', () => {
  let submitQuotationDraft
  let reviewQuotation
  let notifyQuotationStage
  let consoleError

  beforeEach(async () => {
    ;({ submitQuotationDraft, reviewQuotation } = await loadModule())
    ;({ notifyQuotationStage } = await import('../../server/utils/quotation-notify.ts'))
    delete globalThis.__quotationNotifyWecomToken

    state.body = {}
    state.params = {}
    state.authenticated.session.permissions = ['*:*:*']
    state.header = {
      id: 10,
      quote_no: 'Q20260915-001',
      customer_name: '客户A',
      salesperson_id: 7,
      salesperson_name: '张三',
      status: 'DRAFT',
    }
    state.lines = [{ id: 1, quotation_id: 10, line_no: 1, original_price_rmb: 54, original_price_usd: 12 }]
    state.configRows = [
      { config_key: 'wx.work.corpId', config_value: 'corp-test' },
      { config_key: 'wx.work.corpSecret', config_value: 'secret-test' },
      { config_key: 'wx.work.agentId', config_value: '1000025' },
      { config_key: 'tk.quotation.notify.initialReviewer', config_value: 'reviewer_init' },
      { config_key: 'tk.quotation.notify.secondReviewer', config_value: 'reviewer_second' },
      { config_key: 'tk.quotation.notify.finalReviewer', config_value: 'reviewer_final' },
    ]
    state.wxRows = [
      { userid: 'reviewer_second', name: '二审人A' },
      { userid: 'reviewer_final', name: '终审人A' },
      { userid: 'reviewer_init', name: '初审人A' },
      { userid: 'reviewer_domestic_second', name: '内贸二审人' },
    ]
    // 该单历史经手人（留痕表 operator_name）：业务员张三（本次操作人）+ 初审别名 + 二审人A
    state.historyRows = [
      { operator_name: '张三' },
      { operator_name: '初审别名' },
      { operator_name: '二审人A' },
    ]

    state.pool.getConnection.mockReset().mockResolvedValue(state.connection)
    state.pool.query.mockReset().mockImplementation(async (options) => {
      const sql = String(options?.sql || '')
      if (sql.includes('FROM sys_config')) return [state.configRows, []]
      if (sql.includes('FROM sys_user u')) return [state.applicantWorkUserId ? [{ userid: state.applicantWorkUserId }] : [], []]
      if (sql.includes('FROM wxuser')) return [state.wxRows, []]
      return [[], []]
    })
    state.connection.execute.mockReset().mockResolvedValue([{ insertId: 1 }])
    state.connection.query.mockReset().mockImplementation(async (options) => {
      const sql = String(options?.sql || '')
      if (sql.includes('FROM tk_quotation_line')) return [state.lines, []]
      // 必须排在 FROM tk_quotation 之前：退回通知按留痕表取经手人
      if (sql.includes('FROM tk_quotation_revision')) return [state.historyRows, []]
      if (sql.includes('FROM tk_quotation')) return [[state.header], []]
      return [[], []]
    })
    state.garnet.get.mockReset().mockResolvedValue(null)
    state.garnet.set.mockReset().mockResolvedValue('OK')
    state.garnet.del.mockReset().mockResolvedValue(1)

    fetchMock.mockReset().mockImplementation(async (url) => {
      const target = String(url)
      if (target.includes('gettoken')) {
        return { ok: true, json: async () => ({ errcode: 0, errmsg: 'ok', access_token: 'token-a', expires_in: 7200 }) }
      }
      if (target.includes('message/send')) {
        return { ok: true, json: async () => ({ errcode: 0, errmsg: 'ok' }) }
      }
      return { ok: true, json: async () => ({}) }
    })
    globalThis.fetch = fetchMock
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleError.mockRestore()
    vi.unstubAllEnvs()
  })

  it('退回提醒使用明确身份映射，不把别名直接当作企微账号', async () => {
    state.configRows.push({ config_key: 'tk.quotation.notify.identityAliases', config_value: JSON.stringify({ 初审别名: 'reviewer_init' }) })
    state.wxRows = [{ userid: 'reviewer_init', name: '初审人A' }]
    const { notifyQuotationReturn } = await import('../../server/utils/quotation-notify.ts')
    const result = await notifyQuotationReturn({ quoteNo: 'TEST', stageLabel: '二审' }, ['初审别名', '初审人A', 'reviewer_init'])
    expect(result.status).toBe('sent')
    expect(messageSends()).toHaveLength(1)
    expect(messageSends()[0].touser).toBe('reviewer_init')
    const lookup = state.pool.query.mock.calls.find(([options]) => options.sql.includes('FROM wxuser'))
    expect(lookup[1]).not.toContain('初审别名')
  })

  it('显式映射目标必须是通讯录里的工作号，不会回退为未核验账号', async () => {
    state.configRows.push({ config_key: 'tk.quotation.notify.identityAliases', config_value: JSON.stringify({ 初审别名: 'reviewer_init' }) })
    state.wxRows = [{ userid: 'another-member', name: 'reviewer_init' }]
    const { notifyQuotationReturn } = await import('../../server/utils/quotation-notify.ts')
    const result = await notifyQuotationReturn({ quoteNo: 'TEST', stageLabel: '二审' }, ['初审别名'])
    expect(result).toMatchObject({ status: 'skipped', recipients: [] })
    expect(messageSends()).toHaveLength(0)
  })

  it('错误身份映射配置不会发送给错误的人，也不抛出破坏业务结果', async () => {
    state.configRows.push({ config_key: 'tk.quotation.notify.identityAliases', config_value: '[]' })
    const { notifyQuotationReturn } = await import('../../server/utils/quotation-notify.ts')
    const result = await notifyQuotationReturn({ quoteNo: 'TEST' }, ['初审别名'])
    expect(result.status).toBe('failed')
    expect(messageSends()).toHaveLength(0)
  })

  it('notifies the initial reviewer when a draft is submitted for initial review', async () => {
    state.params = { id: '10' }
    const response = await submitQuotationDraft({})

    expect(response).toMatchObject({ code: 200, msg: '报价单已提交初审' })
    const sends = messageSends()
    expect(sends).toHaveLength(1)
    expect(sends[0].touser).toBe('reviewer_init')
    expect(sends[0].msgtype).toBe('markdown')
    expect(sends[0].markdown.content).toContain('【报价单待初审】')
    expect(sends[0].markdown.content).toContain('单号：Q20260915-001')
    expect(sends[0].markdown.content).toContain('客户：客户A')
    expect(sends[0].markdown.content).toContain('明细：1 行')
    expect(response.data.notify).toMatchObject({ status: 'sent', stage: 'initial' })
  })

  it('notifies the second reviewer after the initial review passes', async () => {
    state.header.status = 'PENDING_INITIAL'
    state.body = { id: 10, stage: 'initial', action: 'approve', comment: '价格已核' }
    const response = await reviewQuotation({})

    expect(response).toMatchObject({ code: 200, data: { status: 'PENDING_SECOND', statusLabel: '待二审' } })
    const sends = messageSends()
    expect(sends).toHaveLength(1)
    expect(sends[0].touser).toBe('reviewer_second')
    expect(sends[0].markdown.content).toContain('【报价单待二审】')
    expect(sends[0].markdown.content).toContain('初审：张三（初审通过）')
    expect(response.data.notify).toMatchObject({ status: 'sent', stage: 'second' })
  })

  it('初审通过后外贸二审配置多个接收人时同时向两人发送提醒', async () => {
    state.header.status = 'PENDING_INITIAL'
    state.body = { id: 10, stage: 'initial', action: 'approve', comment: '价格已核' }
    state.configRows = state.configRows
      .filter((row) => row.config_key !== 'tk.quotation.notify.secondReviewer')
      .concat({
        config_key: 'tk.quotation.notify.secondReviewer',
        config_value: 'reviewer_second,reviewer_second_b',
      })
    state.wxRows.push({ userid: 'reviewer_second_b', name: '二审人B' })

    const response = await reviewQuotation({})

    expect(response).toMatchObject({ code: 200, data: { status: 'PENDING_SECOND', statusLabel: '待二审' } })
    const sends = messageSends()
    expect(sends).toHaveLength(2)
    expect(sends.map((s) => s.touser)).toEqual(['reviewer_second', 'reviewer_second_b'])
    expect(response.data.notify).toMatchObject({ status: 'sent', stage: 'second', recipients: ['reviewer_second', 'reviewer_second_b'] })
  })

  it('sends a domestic quotation from initial review to second review, then to final review', async () => {
    const { reviewDomesticQuotation } = await loadModule()
    state.header.status = 'PENDING_INITIAL'
    state.body = { id: 10, stage: 'initial', action: 'approve', comment: '内贸初审通过' }
    state.configRows = [
      ...state.configRows,
      { config_key: 'tk.quotation.domestic.notify.secondReviewer', config_value: 'reviewer_domestic_second' },
      { config_key: 'tk.quotation.domestic.notify.finalReviewer', config_value: 'reviewer_final' },
    ]

    const response = await reviewDomesticQuotation({})

    expect(response).toMatchObject({
      code: 200,
      data: { status: 'PENDING_SECOND', statusLabel: '待二审', notify: { status: 'sent', stage: 'second' } },
    })
    expect(messageSends()).toHaveLength(1)
    expect(messageSends()[0].touser).toBe('reviewer_domestic_second')
    expect(messageSends()[0].markdown.content).toContain('【内贸报价单待二审】')
    expect(messageSends()[0].markdown.content).toContain('初审：张三（初审通过）')

    state.header.status = 'PENDING_SECOND'
    state.body = { id: 10, stage: 'second', action: 'approve', comment: '内贸二审通过' }
    const secondResponse = await reviewDomesticQuotation({})

    expect(secondResponse).toMatchObject({
      code: 200,
      data: { status: 'PENDING_FINAL', statusLabel: '待终审', notify: { status: 'sent', stage: 'final' } },
    })
    expect(messageSends()).toHaveLength(2)
    expect(messageSends()[1].touser).toBe('reviewer_final')
    expect(messageSends()[1].markdown.content).toContain('【内贸报价单待终审】')
    expect(messageSends()[1].markdown.content).toContain('二审：张三（二审通过）')

    state.header.status = 'PENDING_FINAL'
    state.body = { id: 10, stage: 'final', action: 'approve', comment: '内贸终审通过' }
    const finalResponse = await reviewDomesticQuotation({})

    expect(finalResponse).toMatchObject({ code: 200, data: { status: 'APPROVED', statusLabel: '已通过', notify: { status: 'sent', stage: 'approved' } } })
    expect(messageSends()).toHaveLength(3)
    expect(messageSends()[2].touser).toBe('saler-work-account')
    expect(messageSends()[2].markdown.content).toContain('【内贸报价单已终审通过】')
  })

  it('requires the domestic second-review permission, not the foreign one', async () => {
    const { reviewDomesticQuotation } = await loadModule()
    state.header.status = 'PENDING_SECOND'
    state.body = { id: 10, stage: 'second', action: 'approve', comment: '内贸二审确认' }

    state.authenticated.session.permissions = ['tk_custom:quotation:secondReview']
    expect(await reviewDomesticQuotation({})).toMatchObject({ code: 403 })
    expect(state.connection.execute).not.toHaveBeenCalled()

    state.authenticated.session.permissions = ['tk_custom:domesticQuotation:secondReview']
    expect(await reviewDomesticQuotation({})).toMatchObject({ code: 200, data: { status: 'PENDING_FINAL' } })
  })

  it('notifies the final reviewer after the second review passes', async () => {
    state.header.status = 'PENDING_SECOND'
    state.body = { id: 10, stage: 'second', action: 'approve', comment: '二审确认' }
    const response = await reviewQuotation({})

    expect(response).toMatchObject({ code: 200, data: { status: 'PENDING_FINAL', statusLabel: '待终审' } })
    const sends = messageSends()
    expect(sends).toHaveLength(1)
    expect(sends[0].touser).toBe('reviewer_final')
    expect(sends[0].markdown.content).toContain('【报价单待终审】')
    expect(sends[0].markdown.content).toContain('二审：张三（二审通过）')
    expect(response.data.notify).toMatchObject({ status: 'sent', stage: 'final' })
  })

  it('adds separate intranet and external links to quotation page notices without selecting a specific quote', async () => {
    vi.stubEnv('NUXT_QUOTATION_APP_INTERNAL_URL', 'http://internal.example.test/')
    vi.stubEnv('NUXT_QUOTATION_APP_EXTERNAL_URL', 'https://external.example.test')
    const { buildQuotationNotifyMessage, buildQuotationReturnMessage } = await import('../../server/utils/quotation-notify.ts')

    const stageMessage = buildQuotationNotifyMessage('final', { quotationId: 10, quoteNo: 'Q1' })
    const returnMessage = buildQuotationReturnMessage({ quotationId: 10, quoteNo: 'Q1', stageLabel: '初审' })

    for (const message of [stageMessage, returnMessage]) {
      expect(message).toContain('内网：[打开外贸销售报价单](http://internal.example.test/tk_custom/quotation)')
      expect(message).toContain('外网：[打开外贸销售报价单](https://external.example.test/tk_custom/quotation)')
      expect(message).not.toContain('quotationId=')
    }
  })

  it.each(['manual', 'morning'])('labels a %s reminder without pretending an approval just happened', async reminder => {
    vi.stubEnv('NUXT_QUOTATION_APP_INTERNAL_URL', 'http://internal.example.test')
    const { buildQuotationNotifyMessage } = await import('../../server/utils/quotation-notify.ts')
    const message = buildQuotationNotifyMessage('second', { quotationId: 10, quoteNo: 'Q1', reminder })
    expect(message).toContain(reminder === 'manual' ? '申请人催审批' : '上班待审提醒')
    expect(message).toContain('待二审')
    expect(message).not.toContain('初审通过')
    expect(message).toContain('/tk_custom/quotation')
  })

  it('skips invalid intranet and external page addresses when no defaults are configured', async () => {
    vi.stubEnv('NUXT_QUOTATION_APP_INTERNAL_URL', 'javascript:alert(1)')
    vi.stubEnv('NUXT_QUOTATION_APP_EXTERNAL_URL', 'not a URL')
    const { buildQuotationNotifyMessage } = await import('../../server/utils/quotation-notify.ts')

    const message = buildQuotationNotifyMessage('initial', { quotationId: 10, quoteNo: 'Q1' })

    expect(message).not.toContain('javascript:')
    expect(message).not.toContain('http://')
    expect(message).not.toContain('https://')
  })

  it('允许初审退回：单据落「已退回」并通知经手人', async () => {
    state.header.status = 'PENDING_INITIAL'
    state.body = { id: 10, stage: 'initial', action: 'return', comment: '客户名称写错了' }
    const response = await reviewQuotation({})

    expect(response).toMatchObject({ code: 200, msg: '已退回业务员（初审退回）', data: { status: 'RETURNED', statusLabel: '已退回' } })
    const sends = messageSends()
    expect(sends.map((item) => item.touser)).toEqual(['reviewer_second'])
    expect(sends[0].markdown.content).toContain('【外贸报价单已退回】')
    expect(sends[0].markdown.content).toContain('退回环节：初审')
    expect(sends[0].markdown.content).toContain('退回人：张三')
    expect(sends[0].markdown.content).toContain('客户名称写错了')
    expect(response.data.notify).toMatchObject({ status: 'sent', stage: 'return' })
    // 状态写入「已退回」，留痕落在初审人字段
    const update = state.connection.execute.mock.calls
      .find(([options]) => String(options?.sql || '').includes('initial_reviewer_id = ?'))
    expect(update?.[1][0]).toBe('RETURNED')
  })

  it('允许二审退回，且不会改动价格（审核人只填意见）', async () => {
    state.header.status = 'PENDING_SECOND'
    state.body = { id: 10, stage: 'second', action: 'return', comment: '价格偏高，请业务员重报', lines: [{ id: 1, priceRmb: 1, priceUsd: 1 }] }
    const response = await reviewQuotation({})

    expect(response).toMatchObject({ code: 200, msg: '已退回业务员（二审退回）', data: { status: 'RETURNED', statusLabel: '已退回' } })
    const priceUpdate = state.connection.execute.mock.calls
      .find(([options]) => String(options?.sql || '').includes('tk_quotation_line SET'))
    expect(priceUpdate).toBeFalsy()
    expect(messageSends().map((item) => item.touser)).toEqual(['reviewer_second'])
  })

  it('终审退回也通知所有经手人（含初审与二审）', async () => {
    state.header.status = 'PENDING_FINAL'
    state.body = { id: 10, stage: 'final', action: 'return', comment: '价格偏高' }
    const response = await reviewQuotation({})

    expect(response).toMatchObject({ code: 200, msg: '已退回业务员（终审退回）', data: { status: 'RETURNED', statusLabel: '已退回' } })
    expect(messageSends().map((item) => item.touser)).toEqual(['reviewer_second'])
    const update = state.connection.execute.mock.calls
      .find(([options]) => String(options?.sql || '').includes('final_reviewer_id = ?'))
    expect(update).toBeTruthy()
  })

  it('「已退回」状态不能直接审核，必须等业务员重新提交', async () => {
    state.header.status = 'RETURNED'
    state.body = { id: 10, stage: 'initial', action: 'approve' }
    const response = await reviewQuotation({})

    expect(response).toMatchObject({ code: 409, msg: '当前状态为“已退回”，不能执行此审核动作' })
    expect(messageSends()).toHaveLength(0)
  })

  it('退回后业务员重新提交：状态回到待初审，从初审重跑', async () => {
    state.params = { id: '10' }
    state.header.status = 'RETURNED'
    const response = await submitQuotationDraft({})

    expect(response).toMatchObject({ code: 200, msg: '报价单已提交初审', data: { status: 'PENDING_INITIAL', statusLabel: '待初审' } })
    const statusUpdate = state.connection.execute.mock.calls
      .filter(([options]) => String(options?.sql || '').includes("SET status = 'PENDING_INITIAL'"))
    expect(statusUpdate).toHaveLength(1)
    const revision = state.connection.execute.mock.calls
      .find(([options]) => String(options?.sql || '').includes('INSERT INTO tk_quotation_revision'))
    expect(revision?.[1][3]).toBe('退回后重新提交初审')
  })

  it('终审通过后通知申请人工作号并冻结成交价', async () => {
    state.header.status = 'PENDING_FINAL'
    state.body = { id: 10, stage: 'final', action: 'approve', comment: '同意' }
    const response = await reviewQuotation({})

    expect(response).toMatchObject({ code: 200, data: { status: 'APPROVED', statusLabel: '已通过' } })
    const freeze = state.connection.execute.mock.calls
      .find(([options]) => String(options?.sql || '').includes('final_price_rmb = COALESCE'))
    expect(freeze).toBeTruthy()
    expect(messageSends()).toHaveLength(1)
    expect(messageSends()[0].touser).toBe('saler-work-account')
    expect(messageSends()[0].markdown.content).toContain('【外贸报价单已终审通过】')
    expect(response.data.notify).toMatchObject({ status: 'sent', stage: 'approved' })
  })

  it('申请人没有有效工作号时跳过通知，不使用私人号码兜底', async () => {
    state.header.status = 'PENDING_FINAL'
    state.body = { id: 10, stage: 'final', action: 'approve', comment: '同意' }
    state.applicantWorkUserId = null
    const response = await reviewQuotation({})

    expect(response).toMatchObject({ code: 200, data: { status: 'APPROVED', notify: { status: 'skipped', stage: 'approved' } } })
    expect(messageSends()).toHaveLength(0)
  })

  it('keeps the quotation submitted and reports the reason when WeCom fails', async () => {
    state.params = { id: '10' }
    fetchMock.mockImplementation(async (url) => {
      const target = String(url)
      if (target.includes('gettoken')) {
        return { ok: true, json: async () => ({ errcode: 0, errmsg: 'ok', access_token: 'token-a', expires_in: 7200 }) }
      }
      return { ok: true, json: async () => ({ errcode: 81013, errmsg: 'no permission' }) }
    })

    const response = await submitQuotationDraft({})

    expect(response).toMatchObject({ code: 200, msg: '报价单已提交初审' })
    expect(response.data.notify).toMatchObject({ status: 'failed' })
    expect(response.data.notify.message).toContain('81013')
    // 事务仍已提交：单据状态更新语句执行过
    const statusUpdate = state.connection.execute.mock.calls
      .find(([options]) => String(options?.sql || '').includes("SET status = 'PENDING_INITIAL'"))
    expect(statusUpdate).toBeTruthy()
  })

  it('resolves a configured recipient name to its WeCom userid', async () => {
    state.configRows = state.configRows
      .filter((row) => row.config_key !== 'tk.quotation.notify.initialReviewer')
      .concat({ config_key: 'tk.quotation.notify.initialReviewer', config_value: '二审人A' })

    const result = await notifyQuotationStage('initial', { quotationId: 1, quoteNo: 'Q1' })

    expect(result).toMatchObject({ status: 'sent', recipients: ['reviewer_second'] })
    expect(messageSends()[0].touser).toBe('reviewer_second')
  })

  it('reads the second-stage recipient from tk.quotation.notify.secondReviewer', async () => {
    state.configRows = state.configRows
      .filter((row) => row.config_key !== 'tk.quotation.notify.secondReviewer')
      .concat({ config_key: 'tk.quotation.notify.secondReviewer', config_value: '终审人A' })

    const result = await notifyQuotationStage('second', { quotationId: 1, quoteNo: 'Q1' })

    expect(result).toMatchObject({ status: 'sent', stage: 'second', recipients: ['reviewer_final'] })
    expect(messageSends()[0].touser).toBe('reviewer_final')
    expect(messageSends()[0].markdown.content).toContain('【报价单待二审】')
  })

  it('skips sending when the WeCom app credentials are missing', async () => {
    state.configRows = []
    const result = await notifyQuotationStage('final', { quotationId: 1, quoteNo: 'Q1' })

    expect(result).toMatchObject({ status: 'skipped', stage: 'final' })
    expect(messageSends()).toHaveLength(0)
  })
})
