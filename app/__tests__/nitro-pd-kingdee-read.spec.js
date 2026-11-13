import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  authenticated: { session: { userId: 1, roles: ['admin'] } },
  id: 'TX064138',
  pool: { query: vi.fn() },
  executeBillQuery: vi.fn(),
}))

vi.mock('h3', () => ({ getRouterParam: vi.fn(() => state.id) }))
vi.mock('../../server/utils/auth.ts', () => ({ getAuthSession: vi.fn(async () => state.authenticated) }))
vi.mock('../../server/utils/mysql.ts', () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}))
vi.mock('../../server/utils/k3.ts', async () => {
  const actual = await vi.importActual('../../server/utils/k3.ts')
  return { ...actual, executeBillQuery: (...args) => state.executeBillQuery(...args) }
})

globalThis.defineEventHandler = (handler) => handler

describe('Nitro pd Kingdee read route', () => {
  let handler
  let consoleError

  beforeAll(async () => {
    ({ default: handler } = await import('../../server/routes/prod-api/tk_custom/pd/kingdee/[id].get.ts'))
  })

  beforeEach(() => {
    state.authenticated = { session: { userId: 1, roles: ['admin'] } }
    state.id = 'TX064138'
    state.pool.query.mockReset()
    state.executeBillQuery.mockReset()
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => consoleError.mockRestore())

  it('uses a recent local pd record before querying Kingdee', async () => {
    state.pool.query.mockResolvedValueOnce([[{
      id: 'pd-1',
      pdDate: new Date().toISOString().slice(0, 10),
      process: '固晶',
      flowNo: 'TX064138',
      productId: 'NAD0030011',
      productName: '测试物料',
      specification: 'SOD-123',
      lot: '1',
      number: '10.000',
      pd_number: '9.500',
      remark: null,
      process_status: '0',
    }], []])

    const result = await handler({})
    expect(result).toEqual(expect.objectContaining({ code: 200 }))
    expect(result.data).toEqual(expect.objectContaining({ id: 'pd-1', number: 10, pdNumber: 9.5, isUpdatePdData: '1' }))
    expect(state.executeBillQuery).not.toHaveBeenCalled()
  })

  it('keeps the Java operation-planning quantity calculation and K3 filter', async () => {
    state.pool.query.mockResolvedValueOnce([[], []])
    state.executeBillQuery.mockResolvedValueOnce([
      ['1', 'TX064138', 'MO1', 'NAD0030011', '测试物料', 'SOD-123', 100, 0, 0, 100],
      ['2', 'TX064138', 'MO1', 'NAD0030011', '测试物料', 'SOD-123', 30, 0, 0, 30],
    ])

    const result = await handler({})
    expect(result.data).toEqual(expect.objectContaining({
      flowNo: 'TX064138',
      productId: 'NAD0030011',
      number: 70,
      isUpdatePdData: null,
    }))
    expect(state.executeBillQuery).toHaveBeenCalledWith(expect.objectContaining({
      formId: 'SFC_OperationPlanning',
      filterString: [{ Left: '(', FieldName: 'FBillNo', Compare: '67', Value: 'TX064138', Right: ')', Logic: '0' }],
    }))
  })

  it('falls back to K3 inventory (preferring positive FBaseQty) when no operation planning row exists', async () => {
    state.pool.query.mockResolvedValueOnce([[], []])
    state.executeBillQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([['NAD0030011', '测试物料', 'SOD-123', '1', 25, 26.607, '1', '']])

    const result = await handler({})
    expect(result.data).toEqual(expect.objectContaining({
      flowNo: '1',
      productId: 'NAD0030011',
      lot: '1',
      number: 26.607,
    }))
    expect(state.executeBillQuery).toHaveBeenCalledTimes(2)
    expect(state.executeBillQuery.mock.calls[1][0]).toEqual(expect.objectContaining({
      formId: 'STK_Inventory',
      filterString: "FLot.FNumber = 'TX064138' AND FBaseQty > 0",
    }))
  })

  it('falls back to zero-quantity K3 inventory row only when no positive inventory row exists', async () => {
    state.pool.query.mockResolvedValueOnce([[], []])
    state.executeBillQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([['BCP-DCS000001', '历史零库存物料', 'DFN1006-2L', 'TX064138', 0, 0, '1', '']])

    const result = await handler({})
    expect(result.data).toEqual(expect.objectContaining({
      flowNo: 'TX064138',
      productId: 'BCP-DCS000001',
      lot: 'TX064138',
      number: 0,
    }))
    expect(state.executeBillQuery).toHaveBeenCalledTimes(3)
  })

  it('protects authentication and dependency failure boundaries', async () => {
    state.authenticated = null
    await expect(handler({})).resolves.toEqual({ code: 401, msg: '登录状态已过期' })

    state.authenticated = { session: { userId: 1, roles: ['admin'] } }
    state.pool.query.mockRejectedValueOnce(new Error('mysql://user:secret@example.test/app'))
    await expect(handler({})).resolves.toEqual({ code: 500, msg: '获取金蝶盘点详情失败' })
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('secret')
  })
})
