import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  authenticated: { session: { userId: 2, userName: 'sales', roles: [], permissions: [] } },
  allowed: true,
  query: { pageNum: '2', pageSize: '5', keyword: '印度', status: 'testing', overdue: '1' },
  id: '9',
  pool: { query: vi.fn() },
}))

vi.mock('h3', () => ({
  getQuery: vi.fn(() => state.query),
  getRouterParam: vi.fn(() => state.id),
}))
vi.mock('../../server/utils/auth.ts', () => ({
  getAuthSession: vi.fn(async () => state.authenticated),
  hasPermission: vi.fn(() => state.allowed),
}))
vi.mock('../../server/utils/mysql.ts', () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}))

globalThis.defineEventHandler = (handler) => handler

describe('Nitro sample progress read routes', () => {
  let listHandler
  let optionsHandler
  let detailHandler
  let summaryHandler
  let consoleError

  beforeAll(async () => {
    ({ default: listHandler } = await import('../../server/routes/prod-api/tk_custom/sample_progress/list.get.ts'));
    ({ default: optionsHandler } = await import('../../server/routes/prod-api/tk_custom/sample_progress/options.get.ts'));
    ({ default: detailHandler } = await import('../../server/routes/prod-api/tk_custom/sample_progress/[id].get.ts'));
    ({ default: summaryHandler } = await import('../../server/routes/prod-api/tk_custom/sample_progress/summary.get.ts'));
  })

  beforeEach(() => {
    state.authenticated = { session: { userId: 2, userName: 'sales', roles: [], permissions: [] } }
    state.allowed = true
    state.query = { pageNum: '2', pageSize: '5', keyword: '印度', status: 'testing', overdue: '1' }
    state.id = '9'
    state.pool.query.mockReset()
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => consoleError.mockRestore())

  it('maps the progress row and keeps keyword, status, overdue and pagination filters', async () => {
    state.pool.query
      .mockResolvedValueOnce([[{ total: 1 }], []])
      .mockResolvedValueOnce([[{
        id: 9,
        customer_received: '是', salesperson: '销售甲', country: '印度', city: '新德里', customer_name: 'Ins',
        part_no: 'SR5100', package_name: 'DO-27', quantity: '100', unit: 'PCS',
        sample_order_date: '2026-08-14', sample_required_date: '2026-08-20', actual_delivery_date: null,
        progress_status: 'testing', test_result: '通过测试', order_status: null,
      }], []])

    const result = await listHandler({})
    expect(result).toEqual(expect.objectContaining({ code: 200, total: 1 }))
    expect(result.rows[0]).toEqual(expect.objectContaining({
      id: 9, customerName: 'Ins', partNo: 'SR5100', progressStatus: 'testing', progressStatusLabel: '测试中',
      sampleRequiredDate: '2026-08-20', testResult: '通过测试',
    }))
    expect(state.pool.query.mock.calls[0][1]).toEqual(['印度', '印度', '印度', '印度', '印度', '印度', '印度', 'testing'])
    expect(state.pool.query.mock.calls[1][0].sql).toContain('sample_required_date < CURDATE()')
    expect(state.pool.query.mock.calls[1][1].slice(-2)).toEqual([5, 5])
  })

  it('rejects authenticated users without the sample progress query permission', async () => {
    state.allowed = false

    await expect(listHandler({})).resolves.toEqual({ code: 403, msg: '没有权限访问该接口' })
    expect(state.pool.query).not.toHaveBeenCalled()
  })

  it('returns distinct salesperson and country filter options', async () => {
    state.pool.query.mockResolvedValueOnce([[
      { field: 'country', value: '印度' },
      { field: 'salesperson', value: '销售甲' },
    ], []])

    await expect(optionsHandler({})).resolves.toEqual({
      code: 200,
      msg: '操作成功',
      data: { salesperson: ['销售甲'], country: ['印度'] },
    })
    expect(state.pool.query.mock.calls[0][0].sql).toContain('GROUP BY TRIM(salesperson)')
    expect(state.pool.query.mock.calls[0][0].sql).toContain('GROUP BY TRIM(country)')
  })

  it('maps details, summary counts, auth failures and database errors safely', async () => {
    state.pool.query.mockResolvedValueOnce([[{ id: 9, customer_name: 'Ins', part_no: 'SR5100', progress_status: 'received' }], []])
    await expect(detailHandler({})).resolves.toEqual(expect.objectContaining({ code: 200, data: expect.objectContaining({ customerName: 'Ins', partNo: 'SR5100', progressStatus: 'received' }) }))

    state.pool.query.mockResolvedValueOnce([[{ total: '10', registered: '2', waiting: '3', processing: '4', completed: '1', abnormal: '0', overdue: '2' }], []])
    await expect(summaryHandler({})).resolves.toEqual({ code: 200, msg: '操作成功', data: { total: 10, registered: 2, waiting: 3, processing: 4, completed: 1, abnormal: 0, overdue: 2 } })

    state.authenticated = null
    await expect(listHandler({})).resolves.toEqual({ code: 401, msg: '登录状态已过期' })
    state.authenticated = { session: { userId: 2, userName: 'sales', roles: [], permissions: [] } }
    state.pool.query.mockRejectedValueOnce(new Error('mysql://user:secret@example.test/wfs'))
    await expect(listHandler({})).resolves.toEqual({ code: 500, msg: '获取客户样品进度列表失败' })
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('secret')
  })
})
