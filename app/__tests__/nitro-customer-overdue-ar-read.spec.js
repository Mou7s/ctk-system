import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  query: {},
  authenticated: { session: { userId: 2 } },
  allowed: true,
  list: vi.fn(async () => ({
    rows: [],
    total: 0,
    source: 'K3 SQL / T_AR_RECEIVABLE',
    asOfDate: '2026-08-21',
    summary: { customerCount: 0, billCount: 0, openAmt: 0, maxOverdueDays: 0 },
  })),
  bills: vi.fn(async () => ({
    rows: [],
    total: 0,
    custCode: 'C001',
    source: 'K3 SQL / T_AR_RECEIVABLE',
  })),
  CustomerOverdueArInputError: class CustomerOverdueArInputError extends Error {
    statusCode = 400
  },
}));

vi.mock('h3', () => ({
  getQuery: vi.fn(() => state.query),
}));

vi.mock('../../server/utils/auth.ts', () => ({
  getAuthSession: vi.fn(async () => state.authenticated),
  hasPermission: vi.fn(() => state.allowed),
}));

vi.mock('../../server/utils/customer-overdue-ar.ts', () => ({
  CustomerOverdueArInputError: state.CustomerOverdueArInputError,
  queryCustomerOverdueAr: state.list,
  queryCustomerOverdueArBills: state.bills,
}));

vi.mock('../../server/utils/sqlserver.ts', () => ({
  SqlServerError: class SqlServerError extends Error {
    kind = 'timeout';
    statusCode = 504;
  },
}));

vi.mock('../../server/utils/response.ts', () => ({
  apiSuccess: (data, msg = '操作成功') => ({ code: 200, msg, data }),
  apiError: (msg, code = 500) => ({ code, msg }),
  errorMessage: (error) => error?.message || 'unknown error',
}));

describe('Nitro customer overdue AR read routes', () => {
  let listHandler;
  let billsHandler;

  beforeAll(async () => {
    globalThis.defineEventHandler = (handler) => handler
    listHandler = (await import('../../server/routes/prod-api/tk_custom/customerOverdueAr/list.get.ts')).default
    billsHandler = (await import('../../server/routes/prod-api/tk_custom/customerOverdueAr/bills.get.ts')).default
  })

  beforeEach(() => {
    state.query = { keyword: '客户', excludeInternal: 'true', custCode: 'C001' }
    state.authenticated = { session: { userId: 2 } }
    state.allowed = true
    state.list.mockReset().mockResolvedValue({
      rows: [],
      total: 0,
      source: 'K3 SQL / T_AR_RECEIVABLE',
      asOfDate: '2026-08-21',
      summary: { customerCount: 0, billCount: 0, openAmt: 0, maxOverdueDays: 0 },
    })
    state.bills.mockReset().mockResolvedValue({
      rows: [],
      total: 0,
      custCode: 'C001',
      source: 'K3 SQL / T_AR_RECEIVABLE',
    })
  })

  it('keeps authentication and permission checks on both read routes', async () => {
    state.authenticated = null
    await expect(listHandler({})).resolves.toEqual({ code: 401, msg: '登录状态已过期' })
    await expect(billsHandler({})).resolves.toEqual({ code: 401, msg: '登录状态已过期' })

    state.authenticated = { session: { userId: 2 } }
    state.allowed = false
    await expect(listHandler({})).resolves.toEqual({ code: 403, msg: '没有权限访问该接口' })
    await expect(billsHandler({})).resolves.toEqual({ code: 403, msg: '没有权限访问该接口' })
  })

  it('returns the legacy AjaxResult data shape for the summary and bills reads', async () => {
    await expect(listHandler({})).resolves.toEqual({
      code: 200,
      msg: '操作成功',
      data: expect.objectContaining({ source: 'K3 SQL / T_AR_RECEIVABLE' }),
    })
    expect(state.list).toHaveBeenCalledWith(state.query)

    await expect(billsHandler({})).resolves.toEqual({
      code: 200,
      msg: '操作成功',
      data: expect.objectContaining({ custCode: 'C001' }),
    })
    expect(state.bills).toHaveBeenCalledWith('C001', state.query)
  })

  it('maps an invalid customer code to a client error', async () => {
    state.bills.mockRejectedValueOnce(new state.CustomerOverdueArInputError('客户编码不能为空'))

    await expect(billsHandler({})).resolves.toEqual({
      code: 400,
      msg: '客户编码不能为空',
    })
  })

  it('maps SQL Server failures without exposing connection details', async () => {
    const error = new (class extends Error {
      kind = 'timeout';
      statusCode = 504;
    })('K3 SQL Server 查询超时')
    state.list.mockRejectedValueOnce(error)

    await expect(listHandler({})).resolves.toEqual({
      code: 502,
      msg: '查询客户逾期应收失败，请检查 SQL Server 连接或稍后重试',
    })
  })
})
