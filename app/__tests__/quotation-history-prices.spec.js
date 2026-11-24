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
      permissions: ['tk_custom:quotation:list', 'tk_custom:quotation:upload'],
    },
  },
  permission: true,
  lastSql: '',
  lastParams: [],
  rows: [],
  pool: {
    query: vi.fn(async (opts, params) => {
      state.lastSql = typeof opts === 'string' ? opts : opts.sql
      state.lastParams = params
      return [state.rows]
    }),
  },
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
  hasPermission: vi.fn((_session, permission) => {
    if (!state.permission) return false
    return _session.permissions.includes(permission)
  }),
}))

vi.mock('../../server/utils/mysql.ts', () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}))

vi.mock('../../server/utils/redis.ts', () => ({
  getGarnet: vi.fn(() => ({ get: vi.fn(), set: vi.fn(), del: vi.fn() })),
}))

describe('报价单历史终审价格查询（listQuotationHistoryPrices）', () => {
  let listQuotationHistoryPrices

  beforeEach(async () => {
    ;({ listQuotationHistoryPrices } = await import('../../server/utils/quotation.ts'))
    state.query = {}
    state.authenticated.session.userId = 7
    state.authenticated.session.roles = []
    state.authenticated.session.permissions = ['tk_custom:quotation:list', 'tk_custom:quotation:upload']
    state.permission = true
    state.lastSql = ''
    state.lastParams = []
    state.rows = [
      {
        lineId: 101,
        ctkMpn: 'CTKMBRD10200CT',
        packageName: 'TO-252',
        dieSize: '0.23*0.23',
        finalPriceRmb: 280.00,
        qty: 50000,
        unit: 'KPCS',
        quotationId: 10,
        quoteNo: 'TK-BJ-20260901-001',
        customerName: '深圳市某某科技有限公司',
        customerStyle: '分销商',
        city: '深圳 / Shenzhen',
        quoteDate: '2026-09-01',
        salespersonName: '张三',
      },
    ]
  })

  it('没有提供 ctkMpn 时短路返回空数组，不执行数据库查询', async () => {
    state.query = { ctkMpn: '   ' }
    const res = await listQuotationHistoryPrices({})
    expect(res).toEqual({ code: 200, data: [], msg: '操作成功' })
    expect(state.lastSql).toBe('')
  })

  it('默认只查询最新 5 条历史价格', async () => {
    state.query = { ctkMpn: 'CTKMBRD10200CT' }
    await listQuotationHistoryPrices({})
    expect(state.lastParams).toEqual(['CTKMBRD10200CT', 7, 5])
  })

  it('请求超过 5 条时仍将历史价格上限限制为 5 条', async () => {
    state.query = { ctkMpn: 'CTKMBRD10200CT', limit: 20 }
    await listQuotationHistoryPrices({})
    expect(state.lastParams).toEqual(['CTKMBRD10200CT', 7, 5])
  })

  it('SQL 查询严格过滤 status = APPROVED（只查终审通过）且单价 > 0', async () => {
    state.query = { ctkMpn: 'CTKMBRD10200CT' }
    const res = await listQuotationHistoryPrices({})
    expect(res.code).toBe(200)
    expect(res.data).toHaveLength(1)
    expect(res.data[0].priceRmb).toBe(280.00)
    expect(res.data[0].customerName).toBe('深圳市某某科技有限公司')
    expect(res.data[0].customerStyle).toBe('分销商')
    expect(res.data[0].city).toBe('深圳 / Shenzhen')
    expect(res.data[0].dieSize).toBe('0.23*0.23')
    expect(res.data[0].packageName).toBe('TO-252')
    expect(state.lastSql).toContain('l.die_size AS dieSize')
    expect(state.lastSql).toContain("COALESCE(NULLIF(q.customer_style, ''), l.customer_style) AS customerStyle")
    expect(state.lastSql).toContain('q.*')
    expect(state.lastSql).not.toContain('q.city')

    // 验证 SQL 条件包含 APPROVED 终审状态过滤与单价大于 0
    expect(state.lastSql).toContain("q.status = 'APPROVED'")
    expect(state.lastSql).toContain('COALESCE(l.final_price_rmb, l.initial_price_rmb, l.original_price_rmb) > 0')
    expect(state.lastSql).toContain('UPPER(TRIM(l.ctk_mpn)) = UPPER(TRIM(?))')
    expect(state.lastParams[0]).toBe('CTKMBRD10200CT')
  })

  it('销售员无法通过请求参数改查其他人的历史价格，但可见 VJ 与 BINARY 参考客户', async () => {
    state.query = { ctkMpn: 'CTK123', salespersonId: 99, userId: 99 }
    await listQuotationHistoryPrices({})
    expect(state.lastSql).toContain('q.salesperson_id = ?')
    expect(state.lastSql).toContain('(VJ|BINARY)')
    expect(state.lastParams).toEqual(['CTK123', 7, 5])
  })

  it.each([
    ['VJ', true],
    ['VJ ELECTRO SALES PRIVATE LIMITED', true],
    ['VJ electro sales pvt ltd', true],
    ['BINARY', true],
    ['BINARY CO., LTD', true],
    ['深圳市某某科技有限公司', false],
  ])('客户 %s 的历史价格正确标记 isReference = %s', async (customerName, expectedReference) => {
    state.rows[0].customerName = customerName
    state.query = { ctkMpn: 'CTK123' }
    const res = await listQuotationHistoryPrices({})
    expect(res.data[0].isReference).toBe(expectedReference)
  })

  it('历史记录缺少城市或客户性质时返回空字符串，不猜测', async () => {
    state.query = { ctkMpn: 'CTK123' }
    state.rows[0].city = null
    state.rows[0].customerStyle = null
    state.rows[0].dieSize = null
    const res = await listQuotationHistoryPrices({})
    expect(res.data[0]).toMatchObject({ city: '', customerStyle: '', dieSize: '', priceRmb: 280 })
  })

  it('城市迁移尚未执行时仍可查询历史价', async () => {
    state.query = { ctkMpn: 'CTK123' }
    delete state.rows[0].city
    state.pool.query.mockImplementationOnce(async (options) => {
      if (/\bq\.city\b/.test(options.sql)) throw new Error("Unknown column 'q.city' in 'field list'")
      return [state.rows]
    })
    const res = await listQuotationHistoryPrices({})
    expect(res.code).toBe(200)
    expect(res.data[0]).toMatchObject({ city: '', customerStyle: '分销商', priceRmb: 280 })
  })

  it.each(['initialReview', 'secondReview', 'finalReview', '*'])('有外贸 %s 权限可以查询全部历史价格', async (permission) => {
    state.authenticated.session.permissions.push(`tk_custom:quotation:${permission}`)
    state.query = { ctkMpn: 'CTK123' }
    await listQuotationHistoryPrices({})
    expect(state.lastSql).not.toContain('q.salesperson_id = ?')
    expect(state.lastParams).toEqual(['CTK123', 5])
  })

  it('只有内贸审核权限不扩大外贸历史价格范围', async () => {
    state.authenticated.session.permissions.push('tk_custom:domesticQuotation:finalReview')
    state.query = { ctkMpn: 'CTK123' }
    await listQuotationHistoryPrices({})
    expect(state.lastSql).toContain('q.salesperson_id = ?')
    expect(state.lastSql).toContain('(VJ|BINARY)')
    expect(state.lastParams).toEqual(['CTK123', 7, 5])
  })

  it.each(['id', 'role', 'permission'])('管理员通过 %s 身份可查询全部历史价格', async (identity) => {
    if (identity === 'id') state.authenticated.session.userId = 1
    if (identity === 'role') state.authenticated.session.roles = ['admin']
    if (identity === 'permission') state.authenticated.session.permissions.push('*:*:*')
    state.query = { ctkMpn: 'CTK123' }
    await listQuotationHistoryPrices({})
    expect(state.lastSql).not.toContain('q.salesperson_id = ?')
    expect(state.lastParams).toEqual(['CTK123', 5])
  })

  it('没有报价单权限时拦截 403', async () => {
    state.permission = false
    const res = await listQuotationHistoryPrices({})
    expect(res).toEqual({ code: 403, msg: '没有权限访问报价单' })
  })
})

describe('前端网格与 API 模块同型号历史单价守护', () => {
  it('API 模块包含 getQuotationHistoryPrices 接口定义', async () => {
    const { createQuotationApi } = await import('../../app/packages/api/modules/quotation.js')
    const mockRequest = vi.fn()
    const api = createQuotationApi(mockRequest)
    expect(typeof api.getQuotationHistoryPrices).toBe('function')
    api.getQuotationHistoryPrices({ ctkMpn: 'CTK123' })
    expect(mockRequest).toHaveBeenCalledWith({
      url: '/tk_custom/quotation/history-prices',
      method: 'get',
      params: { ctkMpn: 'CTK123' },
    })
  })

  it('TkQuotationGrid 组件模板已接入同型号历史终审单价弹层与点选接线', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const gridFile = resolve(process.cwd(), 'app/packages/ui/TkQuotationGrid.vue')
    const content = readFileSync(gridFile, 'utf8')

    // 守卫：单价列具备独立分支与历史价 Popover
    expect(content).toContain("col.prop === 'originalPriceRmb'")
    expect(content).toContain('hasHistoryPrices(row.ctkMpn)')
    expect(content).toContain('isHistoryPopoverOpen(rowIndex)')
    expect(content).toContain('applyHistoryPrice(rowIndex, colIndex, item.priceRmb)')
    expect(content).toContain('同型号历史终审单价')
    expect(content).toContain("封装：{{ item.packageName || '—' }}")
    expect(content).toContain('终审价')
    expect(content).toContain('参考客户')
    expect(content).toContain('fetchHistoryPrices')
    expect(content).toContain('params: { ctkMpn: key, limit: 5 }')
  })

  it('审核历史价格弹层显示每条记录的封装，缺失时显示占位', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const content = readFileSync(resolve(process.cwd(), 'app/packages/ui/TkQuotationHistoryPrices.vue'), 'utf8')
    expect(content).toContain('参考客户')
    expect(content).toContain("封装：{{ item.packageName || '—' }}")
  })
})
