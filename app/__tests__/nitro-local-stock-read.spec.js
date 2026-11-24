import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  authenticated: { session: { userId: 1 } },
  query: { materialCode: 'MAT-1', packageName: 'SOT-23' },
  pool: { query: vi.fn() },
  k3Inventory: { rows: [] },
  k3Error: null,
}))

vi.mock('h3', () => ({ getQuery: vi.fn(() => state.query) }))
vi.mock('../../server/utils/auth.ts', () => ({ getAuthSession: vi.fn(async () => state.authenticated) }))
vi.mock('../../server/utils/mysql.ts', () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}))
vi.mock('../../server/utils/stock-document.ts', () => ({
  queryK3Inventory: vi.fn(async () => {
    if (state.k3Error) throw state.k3Error
    return state.k3Inventory
  }),
}))

globalThis.defineEventHandler = (handler) => handler

describe('Nitro local stock read routes', () => {
  let suggest
  let consoleError

  beforeAll(async () => {
    suggest = (await import('../../server/routes/prod-api/tk_custom/localStock/suggest.get.ts')).default
  })

  beforeEach(() => {
    state.authenticated = { session: { userId: 1 } }
    state.query = { materialCode: 'MAT-1', packageName: 'SOT-23' }
    state.pool.query.mockReset()
    state.k3Inventory = { rows: [] }
    state.k3Error = null
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => consoleError.mockRestore())

  it('prefers an enabled K3 location for the same material', async () => {
    state.k3Inventory = { rows: [{
      materialNumber: 'MAT-1', stockNumber: 'CTK10', stockLocationNumber: 'A-01', availableQty: 4,
    }] }
    state.pool.query
      .mockResolvedValueOnce([[{ location_code: 'A-01' }], []])
    await expect(suggest({})).resolves.toEqual({
      code: 200,
      msg: '操作成功',
      data: {
        zone: 'A1-A9',
        candidates: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9'],
        locationCode: 'A-01',
        reason: 'SAME_MATERIAL_KINGDEE',
        reasonText: '金蝶库存显示同物料已在 A-01，建议继续上架',
        existingQty: 4,
      },
    })
    expect(state.pool.query.mock.calls.flat().join(' ')).not.toContain('tk_local_stock')
  })

  it('uses the exact package rule and recommended-location fallback', async () => {
    state.query = { materialCode: '', packageName: 'SOT-23' }
    state.k3Inventory = { rows: [{
      materialNumber: 'MAT-2', stockNumber: 'CTK10', stockLocationNumber: 'A-01', availableQty: 4,
    }] }
    state.pool.query.mockResolvedValueOnce([[
      { location_code: 'A-01' }, { location_code: 'A-02' }, { location_code: 'A-03' },
      { location_code: 'A-04' }, { location_code: 'A-05' }, { location_code: 'A-06' },
      { location_code: 'A-07' }, { location_code: 'A-08' }, { location_code: 'A-09' },
    ], []])
    await expect(suggest({})).resolves.toEqual(expect.objectContaining({
      code: 200,
      data: expect.objectContaining({
        zone: 'A1-A9',
        candidates: ['A-02', 'A-03', 'A-04', 'A-05', 'A-06', 'A-07', 'A-08', 'A-09'],
        locationCode: 'A-02',
        reason: 'EMPTY_SHELF',
        existingQty: 0,
      }),
    }))
    expect(state.pool.query.mock.calls[0][1]).toEqual(['A-01', 'A-02', 'A-03', 'A-04', 'A-05', 'A-06', 'A-07', 'A-08', 'A-09'])
    expect(state.pool.query.mock.calls.flat().join(' ')).not.toContain('tk_local_stock')
  })

  it('reports no package rule instead of no available shelf for ruleless packages', async () => {
    state.query = { materialCode: 'N104020001', packageName: '0.8MIL(20um)' }
    state.k3Inventory = { rows: [] }

    await expect(suggest({})).resolves.toEqual({
      code: 200,
      msg: '操作成功',
      data: {
        zone: '',
        candidates: ['0.8MIL(20UM)'],
        locationCode: '',
        reason: 'NO_RULE',
        reasonText: '未匹配封装分区规则，请手动扫库位',
      },
    })
  })

  it('keeps auth and database error boundaries', async () => {
    state.authenticated = null
    await expect(suggest({})).resolves.toEqual({ code: 401, msg: '登录状态已过期' })

    state.authenticated = { session: { userId: 1 } }
    state.k3Error = new Error('mysql://user:***@example.test/app')
    await expect(suggest({})).resolves.toEqual({ code: 500, msg: '获取推荐库位失败' })
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('secret')
  })
})
