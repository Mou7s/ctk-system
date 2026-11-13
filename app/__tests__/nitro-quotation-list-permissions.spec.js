import { beforeEach, describe, expect, it, vi } from 'vitest'

// 列表接口必须按「服务端会话」判定撤回等行级权限：
// 前端 fallback 曾用不存在的 userStore.userId 导致列表撤回按钮永不显示。
const state = vi.hoisted(() => ({
  authenticated: {
    token: 'test-token',
    session: {
      userId: 224,
      deptId: 1,
      userName: 'sales10',
      user: { userId: 224, userName: 'sales10', nickName: '范伟国' },
      roles: [],
      permissions: ['tk_custom:quotation:list', 'tk_custom:quotation:upload'],
    },
  },
  rows: [],
  total: 0,
  pool: { query: vi.fn() },
}))

vi.mock('h3', () => ({
  getQuery: vi.fn(() => ({})),
  getRouterParam: vi.fn(() => undefined),
  getHeader: vi.fn(() => undefined),
  setHeader: vi.fn(),
  readBody: vi.fn(async () => ({})),
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
  getGarnet: vi.fn(() => ({ get: vi.fn(), set: vi.fn(), del: vi.fn() })),
}))

function quotationRow(overrides = {}) {
  return {
    id: 22,
    quote_no: 'BJ202609151125060170',
    quote_date: '2026-09-15',
    customer_name: 'AE',
    salesperson_id: 224,
    salesperson_name: '范伟国',
    status: 'PENDING_INITIAL',
    line_count: 19,
    create_time: '2026-09-15 11:25:06',
    update_time: '2026-09-15 11:25:06',
    ...overrides,
  }
}

describe('Nitro quotation list row permissions', () => {
  let listQuotations

  beforeEach(async () => {
    ;({ listQuotations } = await import('../../server/utils/quotation.ts'))
    state.authenticated.session = {
      ...state.authenticated.session,
      userId: 224,
      roles: [],
      permissions: ['tk_custom:quotation:list', 'tk_custom:quotation:upload'],
    }
    state.rows = [quotationRow(), quotationRow({ id: 6, salesperson_id: 218, salesperson_name: '销售甲' })]
    state.total = state.rows.length
    state.pool.query.mockReset()
    state.pool.query
      .mockResolvedValueOnce([[{ total: state.total }], []])
      .mockResolvedValueOnce([state.rows, []])
  })

  it('本人待初审的行带 canWithdraw=true，他人行带 false', async () => {
    const response = await listQuotations({})

    expect(response).toMatchObject({ code: 200, msg: '查询成功' })
    expect(response.rows).toHaveLength(2)
    expect(response.rows[0]).toMatchObject({ id: 22, salespersonId: 224, status: 'PENDING_INITIAL', canWithdraw: true })
    expect(response.rows[1]).toMatchObject({ id: 6, salespersonId: 218, canWithdraw: false })
    expect(response.rows[0].canRemind).toBe(true)
    expect(response.rows[1].canRemind).toBe(false)
  })

  it.each(['DOMESTIC', 'FOREIGN'])('迁移前的数据库仍可读取%s报价单', async (businessType) => {
    state.authenticated.session.permissions = ['*:*:*']
    state.pool.query.mockReset().mockImplementation(async (options) => {
      if (/customer_address|customer_phone/u.test(options.sql)) throw new Error('Unknown column customer_address')
      if (/COUNT\(\*\)/u.test(options.sql)) return [[{ total: 1 }], []]
      return [[quotationRow()], []]
    })
    const response = await listQuotations({}, businessType)
    expect(response.code).toBe(200)
    expect(response.rows[0]).toMatchObject({ customerAddress: '', customerPhone: '' })
  })

  it('非待初审状态不给撤回权限', async () => {
    state.rows = [quotationRow({ status: 'DRAFT' }), quotationRow({ id: 6, status: 'PENDING_FINAL' })]
    state.pool.query.mockReset()
    state.pool.query
      .mockResolvedValueOnce([[{ total: 2 }], []])
      .mockResolvedValueOnce([state.rows, []])

    const response = await listQuotations({})

    expect(response.rows.map((row) => row.canWithdraw)).toEqual([false, false])
  })

  it('没有 upload 权限的业务员行级撤回权限全部为 false', async () => {
    state.authenticated.session = {
      ...state.authenticated.session,
      permissions: ['tk_custom:quotation:list'],
    }

    const response = await listQuotations({})

    expect(response.rows.map((row) => row.canWithdraw)).toEqual([false, false])
    expect(response.rows.map((row) => row.canUpload)).toEqual([false, false])
  })

  it('groupBy=customer 时按客户分组统计分页并完整拉取当页客户的所有报价单', async () => {
    const h3 = await import('h3')
    h3.getQuery.mockReturnValueOnce({ groupBy: 'customer', pageNum: 1, pageSize: 2 })
    state.authenticated.session.permissions = ['tk_custom:domesticQuotation:list', 'tk_custom:domesticQuotation:upload']
    const q1 = quotationRow({ id: 31, quote_no: 'CTK2026110302', customer_name: '示例客户甲有限公司', update_time: '2026-11-03 06:19:49' })
    const q2 = quotationRow({ id: 25, quote_no: 'CTK2026110204', customer_name: '示例客户甲有限公司', update_time: '2026-11-02 13:53:34' })
    const q3 = quotationRow({ id: 30, quote_no: 'CTK2026110301', customer_name: '示例客户乙科技有限公司', update_time: '2026-11-03 11:55:29' })
    state.pool.query.mockReset()
    state.pool.query
      .mockResolvedValueOnce([[{ total: 2, quoteTotal: 3 }], []])
      .mockResolvedValueOnce([[
        { customer_key: '示例客户乙科技有限公司', latest_update_time: '2026-11-03 11:55:29', latest_id: 30 },
        { customer_key: '示例客户甲有限公司', latest_update_time: '2026-11-03 06:19:49', latest_id: 31 },
      ], []])
      .mockResolvedValueOnce([[q3, q1, q2], []])

    const response = await listQuotations({}, 'DOMESTIC')
    expect(response).toMatchObject({
      code: 200,
      total: 2,
      quoteTotal: 3,
    })
    expect(response.rows.map((r) => r.quoteNo)).toEqual(['CTK2026110301', 'CTK2026110302', 'CTK2026110204'])
  })
})
