import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  query: {},
  authenticated: {
    token: 'test-token',
    session: {
      userId: 7,
      deptId: 1,
      userName: 'sales',
      user: { userId: 7, userName: 'sales', nickName: '业务员' },
      roles: [],
      permissions: ['tk_custom:quotation:upload'],
    },
  },
  permission: true,
  rows: [],
  pool: { query: vi.fn() },
}))

vi.mock('h3', () => ({
  getQuery: vi.fn(() => state.query),
  getRouterParam: vi.fn(() => undefined),
  getHeader: vi.fn(() => undefined),
  setHeader: vi.fn(),
  readBody: vi.fn(async () => ({})),
  readMultipartFormData: vi.fn(async () => []),
}))

vi.mock('../../server/utils/auth.ts', () => ({
  getAuthSession: vi.fn(async () => state.authenticated),
  // 只授 upload：审核类权限为假，才能验证「普通业务员」与「可看全部」两条分支
  hasPermission: vi.fn((_session, permission) => state.permission && permission === 'tk_custom:quotation:upload'),
}))

vi.mock('../../server/utils/mysql.ts', () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}))

vi.mock('../../server/utils/redis.ts', () => ({
  getGarnet: vi.fn(() => ({ get: vi.fn(), set: vi.fn(), del: vi.fn() })),
}))

// 客户下拉的候选来源：只取历史报价单客户（本地 MySQL），不再查金蝶客户主档。
describe('Nitro quotation customer options (local quotation history)', () => {
  let listQuotationCustomerOptions

  beforeEach(async () => {
    ;({ listQuotationCustomerOptions } = await import('../../server/utils/quotation.ts'))
    state.query = {}
    state.permission = true
    state.rows = [
      { name: 'VVDN TECHNOLOGIES PVT LTD', quoteCount: 3, lastQuoteDate: '2026-09-14' },
      { name: 'ACME', quoteCount: 1, lastQuoteDate: '2026-08-01' },
    ]
    state.authenticated.session = {
      ...state.authenticated.session,
      userId: 7,
      roles: [],
      permissions: ['tk_custom:quotation:upload'],
    }
    state.pool.query.mockReset().mockResolvedValue([state.rows, []])
  })

  it('读 tk_quotation 历史客户，不查金蝶；普通业务员按本人单据收窄', async () => {
    const response = await listQuotationCustomerOptions({})

    const [options, params] = state.pool.query.mock.calls[0]
    expect(options.sql).toContain('FROM tk_quotation q')
    expect(options.sql).toContain('GROUP BY TRIM(q.customer_name)')
    expect(options.sql).not.toContain('T_BD_CUSTOMER')
    expect(options.sql).toContain('q.salesperson_id = ?')
    expect(params).toEqual([7, 200])
    expect(response).toMatchObject({ code: 200 })
    expect(response.data).toEqual([
      { name: 'VVDN TECHNOLOGIES PVT LTD', quoteCount: 3, lastQuoteDate: '2026-09-14' },
      { name: 'ACME', quoteCount: 1, lastQuoteDate: '2026-08-01' },
    ])
  })

  it('可看全部的角色不加业务员条件，关键字走 LIKE', async () => {
    state.authenticated.session = {
      ...state.authenticated.session,
      userId: 1,
      roles: ['admin'],
    }
    state.query = { type: 'customer', keyword: 'vvdn', limit: 20 }

    await listQuotationCustomerOptions({})

    const [options, params] = state.pool.query.mock.calls[0]
    expect(options.sql).not.toContain('q.salesperson_id = ?')
    expect(options.sql).toContain("q.customer_name LIKE CONCAT('%', ?, '%')")
    expect(params).toEqual(['vvdn', 20])
  })

  it('limit 上限收紧到 200，0/负数/非法值回落默认', async () => {
    const cases = [[0, 200], [-5, 200], ['abc', 200], [30, 30], [9999, 200]]
    for (const [limit, expected] of cases) {
      state.pool.query.mockClear()
      state.query = { type: 'customer', limit }
      await listQuotationCustomerOptions({})
      const [, params] = state.pool.query.mock.calls[0]
      expect(params[params.length - 1]).toBe(expected)
    }
  })

  it('没有基础资料查询权限时返回 403 且不查库', async () => {
    state.permission = false

    const response = await listQuotationCustomerOptions({})

    expect(response).toMatchObject({ code: 403 })
    expect(state.pool.query).not.toHaveBeenCalled()
  })
})
