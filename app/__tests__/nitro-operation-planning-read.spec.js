import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  authenticated: { session: { userId: 1, roles: ['admin'] } },
  billNo: 'OP011464',
  flowNo: 'TX064138',
  executeBillQuery: vi.fn(),
}))

vi.mock('h3', () => ({
  getRouterParam: vi.fn((event, key) => key === 'billno' ? state.billNo : state.flowNo),
}))
vi.mock('../../server/utils/auth.ts', () => ({ getAuthSession: vi.fn(async () => state.authenticated) }))
vi.mock('../../server/utils/k3.ts', async () => {
  const actual = await vi.importActual('../../server/utils/k3.ts')
  return { ...actual, executeBillQuery: (...args) => state.executeBillQuery(...args) }
})

globalThis.defineEventHandler = (handler) => handler

describe('Nitro operation planning read routes', () => {
  let gxjhHandler
  let gxjhPreviewHandler
  let flowInfoHandler
  let consoleError

  beforeAll(async () => {
    ({ default: gxjhHandler } = await import('../../server/routes/prod-api/kingdee/gxjh/[billno].get.ts'))
    ;({ default: gxjhPreviewHandler } = await import('../../server/routes/prod-api/kingdee/gxjh/preview/[billno].get.ts'))
    ;({ default: flowInfoHandler } = await import('../../server/routes/prod-api/tk_custom/pic/getFlowBillInfo/[flowno].get.ts'))
  })

  beforeEach(() => {
    state.authenticated = { session: { userId: 1, roles: ['admin'] } }
    state.executeBillQuery.mockReset()
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => consoleError.mockRestore())

  it('keeps the raw gxjh field names and K3 filter', async () => {
    state.executeBillQuery.mockResolvedValueOnce([
      [1, 2, 3, 'OP011464', 'MO1', 100, 80, 'NAD0030011', '测试物料', 'SOD-123', '固晶', 'XP-1', 'LOT-1'],
    ])
    const result = await gxjhHandler({})
    expect(result).toEqual(expect.objectContaining({ FBillNo: 'OP011464', FProductId: 'NAD0030011', FProductName: '测试物料' }))
    expect(state.executeBillQuery).toHaveBeenCalledWith(expect.objectContaining({
      formId: 'SFC_OperationPlanning',
      limit: 1000,
      filterString: [{ Left: '(', FieldName: 'FBillNo', Compare: '67', Value: 'OP011464', Right: ')', Logic: '0' }],
    }))
  })

  it('maps the pic flow completion fields without changing the raw response shape', async () => {
    state.executeBillQuery.mockResolvedValueOnce([
      [1, 'TX064138', 'NAD0030011', '测试物料', 'SOD-123', 'LOT-1', '0.3x0.3', '客户A', '型号A'],
    ])
    await expect(flowInfoHandler({})).resolves.toEqual({
      FBillNo: 'TX064138', productId: 'NAD0030011', productName: '测试物料', specification: 'SOD-123',
      xpph: 'LOT-1', xpcc: '0.3x0.3', khdm: '客户A', xpxh: '型号A',
    })
  })

  it('builds a process reporting preview without writing to Kingdee', async () => {
    state.executeBillQuery.mockResolvedValueOnce([
      [1, 2, 3, 'OP011464', 'MO1', '10', 100, 80, 'NAD0030011', '测试物料', 'SOD-123', '固晶'],
      [4, 5, 6, 'OP011464', 'MO1', '20', 100, 100, 'NAD0030011', '测试物料', 'SOD-123', '测试'],
    ])

    const result = await gxjhPreviewHandler({})

    expect(result.code).toBe(200)
    expect(result.data).toMatchObject({
      flowNo: 'OP011464',
      moNumber: 'MO1',
      productId: 'NAD0030011',
      operations: [
        expect.objectContaining({
          operationId: '3',
          processNumber: '10',
          processName: '固晶',
          plannedQty: 100,
          reportedQty: 80,
          remainingQty: 20,
          status: '可汇报',
          canReport: true,
        }),
        expect.objectContaining({
          operationId: '6',
          processNumber: '20',
          remainingQty: 0,
          status: '已完成',
          canReport: false,
        }),
      ],
    })
    expect(state.executeBillQuery).toHaveBeenCalledWith(expect.objectContaining({
      formId: 'SFC_OperationPlanning',
      fieldKeys: expect.arrayContaining(['FOperNumber', 'FQualifiedQty']),
      orderString: 'FOperNumber ASC',
      limit: 1000,
    }))
  })

  it('returns explicit errors for missing process reporting previews', async () => {
    state.executeBillQuery.mockResolvedValueOnce([])
    await expect(gxjhPreviewHandler({})).resolves.toEqual({ code: 404, msg: '未找到对应流程单' })

    state.authenticated = null
    await expect(gxjhPreviewHandler({})).resolves.toEqual({ code: 401, msg: '登录状态已过期' })
  })

  it('returns an empty object for no K3 row like Java queryOne', async () => {
    state.executeBillQuery.mockResolvedValueOnce([])
    await expect(gxjhHandler({})).resolves.toEqual({})
  })

  it('protects authentication and K3 failure details', async () => {
    state.authenticated = null
    await expect(flowInfoHandler({})).resolves.toEqual({ code: 401, msg: '登录状态已过期' })

    state.authenticated = { session: { userId: 1, roles: ['admin'] } }
    state.executeBillQuery.mockRejectedValueOnce(new Error('K3 appSecret=realvalue'))
    await expect(gxjhHandler({})).resolves.toEqual({ code: 502, msg: '查询金蝶工序计划失败' })
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('realvalue')
  })
})
