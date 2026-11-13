import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  authenticated: { session: { userId: 1, roles: [] } },
  body: {},
  query: {},
  executeBillQuery: vi.fn(),
  K3CloudError: class K3CloudError extends Error {
    constructor(kind, message, statusCode) {
      super(message)
      this.kind = kind
      this.statusCode = statusCode
    }
  },
}))

vi.mock('h3', () => ({
  getQuery: vi.fn(() => state.query),
  readBody: vi.fn(async () => state.body),
  getRouterParam: vi.fn(() => undefined),
}))
vi.mock('../../server/utils/auth.ts', () => ({
  getAuthSession: vi.fn(async () => state.authenticated),
  hasRole: vi.fn((session, role) => session.userId === 1 || session.roles.includes(role)),
}))
vi.mock('../../server/utils/k3.ts', () => ({
  K3CloudError: state.K3CloudError,
  executeBillQuery: state.executeBillQuery,
}))
vi.mock('../../server/utils/sqlserver.ts', () => ({
  SqlServerError: class SqlServerError extends Error {
    constructor(kind, message, statusCode) {
      super(message)
      this.kind = kind
      this.statusCode = statusCode
    }
  },
  queryK3SqlServer: vi.fn(),
  sqlStringParameter: vi.fn(),
}))
vi.mock('../../server/utils/runtime.ts', () => ({
  getNitroServerConfig: vi.fn(() => ({ profilePath: 'C:/profile' })),
}))
globalThis.defineEventHandler = (handler) => handler

describe('Nitro 外发上锡预检接口', () => {
  let handler

  beforeAll(async () => {
    handler = (await import('../../server/routes/prod-api/kingdee/exportWFData/preview.post.ts')).default
  })

  beforeEach(() => {
    state.authenticated = { session: { userId: 1, roles: [] } }
    state.body = {}
    state.query = {}
    state.executeBillQuery.mockReset()
  })

  it('normalizes separators, uppercases and deduplicates direct send bills', async () => {
    state.body = { billNos: 'wwfc1001&WWFC1001\nwwfc1002,WWFC1002' }
    state.executeBillQuery.mockResolvedValueOnce([
      ['供应商', 'WWFC1001', '张三', '2026-08-13 08:00:00', '工序计划', '物料', '规格', 'PCS', 'A/B', 10, 1, 1, 7],
    ])

    const result = await handler({})

    expect(result.code).toBe(200)
    expect(result.data.inputBillnos).toEqual(['WWFC1001', 'WWFC1002'])
    expect(result.data.sendBillnos).toEqual(['WWFC1001', 'WWFC1002'])
    expect(result.data.rowCount).toBe(1)
    expect(state.executeBillQuery).toHaveBeenCalledWith(expect.objectContaining({
      formId: 'SFC_OperOutGroupSend',
      limit: 10000,
      maxLimit: 10000,
    }))
    expect(state.executeBillQuery.mock.calls[0][0].filterString.at(-1)).toMatchObject({
      FieldName: 'FLineType',
      Compare: '29',
      Value: 'A',
    })
  })

  it('resolves WWJS receive bills before querying send bills', async () => {
    state.body = { billNos: 'wwjs2001 WWFC2002' }
    state.executeBillQuery
      .mockResolvedValueOnce([['WWFC3001'], ['WWFC3001']])
      .mockResolvedValueOnce([
        ['供应商', 'WWFC3001', '张三', '2026-08-13 08:00:00', '计划', '物料', '规格', 'PCS', 'A/B', 10, 1, 1, 7],
      ])

    const result = await handler({})

    expect(result.code).toBe(200)
    expect(result.data.mappings).toEqual([
      { inputBill: 'WWJS2001', type: 'RECEIVE', resolvedBills: ['WWFC3001'] },
      { inputBill: 'WWFC2002', type: 'SEND', resolvedBills: ['WWFC2002'] },
    ])
    expect(result.data.sendBillnos).toEqual(['WWFC3001', 'WWFC2002'])
    expect(state.executeBillQuery.mock.calls[0][0]).toMatchObject({
      formId: 'SFC_OperOutGroupReceive',
      fieldKeys: 'FGroupSendInfo',
      limit: 1000,
    })
  })

  it('rejects invalid bill numbers before calling K3Cloud', async () => {
    state.body = { billNos: 'WW1,中文单号' }

    await expect(handler({})).resolves.toEqual({
      code: 400,
      msg: '以下单号格式不正确：WW1、中文单号',
    })
    expect(state.executeBillQuery).not.toHaveBeenCalled()
  })

  it('returns 401 for unauthenticated and 403 for users without plating_clerk', async () => {
    state.authenticated = null
    await expect(handler({})).resolves.toEqual({ code: 401, msg: '登录状态已过期' })

    state.authenticated = { session: { userId: 9, roles: ['user'] } }
    await expect(handler({})).resolves.toEqual({ code: 403, msg: '缺少 plating_clerk 角色权限' })
  })

  it('exposes K3Cloud timeout as a clear dependency error', async () => {
    state.body = { billNos: 'WWFC1001' }
    state.executeBillQuery.mockRejectedValueOnce(new state.K3CloudError('timeout', 'K3Cloud 请求超时', 504))

    await expect(handler({})).resolves.toMatchObject({
      code: 504,
      msg: 'K3Cloud 请求超时',
    })
  })
})
