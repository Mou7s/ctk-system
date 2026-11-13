import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  authenticated: { session: { userId: 1 } },
  query: {},
  routeId: '7',
  pool: { query: vi.fn() },
}))

vi.mock('h3', () => ({
  getQuery: vi.fn(() => state.query),
  getRouterParam: vi.fn(() => state.routeId),
}))
vi.mock('../../server/utils/auth.ts', () => ({ getAuthSession: vi.fn(async () => state.authenticated) }))
vi.mock('../../server/utils/mysql.ts', () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}))

globalThis.defineEventHandler = (handler) => handler

const row = {
  id: 7,
  flowno: 'GX001',
  materialno: 'MAT-1',
  materialname: 'SOT-23',
  specification: 'SOT-23',
  remark: 'remark',
  imgPaths: '/profile/dkPic_zip/a.jpg',
  mechineName: 'WB-1',
  createdate: '2026-08-11 10:00:00',
  modifydate: '2026-08-11 10:01:00',
  xpdm: 'D1',
  xpph: 'LOT-1',
  khdm: 'C001',
  handler: '张三',
  creator: 'admin',
  updater: 'admin',
  result: 'OK',
  testNumber: '10',
  testCharge: '来料',
}

describe('Nitro pic read routes', () => {
  let handlers
  let consoleError

  beforeAll(async () => {
    handlers = {
      list: (await import('../../server/routes/prod-api/tk_custom/pic/list.get.ts')).default,
      detail: (await import('../../server/routes/prod-api/tk_custom/pic/[id].get.ts')).default,
      handlers: (await import('../../server/routes/prod-api/tk_custom/pic/getHandlerList.get.ts')).default,
      machines: (await import('../../server/routes/prod-api/tk_custom/pic/getMechineList.get.ts')).default,
    }
  })

  beforeEach(() => {
    state.authenticated = { session: { userId: 1 } }
    state.query = {
      flowno: 'GX',
      materialno: 'MAT-1',
      pageNum: 1,
      pageSize: 10,
      'params[beginCreatedate]': '2026-08-01 00:00:00',
      'params[endCreatedate]': '2026-08-11 23:59:59',
    }
    state.routeId = '7'
    state.pool.query.mockReset()
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => consoleError.mockRestore())

  it('keeps Java list filters, pagination, image source path and detail shape', async () => {
    state.pool.query
      .mockResolvedValueOnce([[{ total: 1 }], []])
      .mockResolvedValueOnce([[row], []])
    const result = await handlers.list({})
    expect(result.code).toBe(200)
    expect(result.total).toBe(1)
    expect(result.rows[0].imgPaths).toBe('/profile/dkPic_zip/a.jpg')
    expect(result.rows[0].imgSrcPaths).toBe('/profile/dkPic/a.jpg')
    expect(state.pool.query.mock.calls[1][0].sql).toContain('LIMIT ?, ?')
    expect(state.pool.query.mock.calls[1][1]).toEqual(['GX', 'MAT-1', '2026-08-01 00:00:00', '2026-08-11 23:59:59', 0, 10])

    state.query = {}
    state.pool.query.mockResolvedValueOnce([[row], []])
    const detail = await handlers.detail({})
    expect(detail).toEqual(expect.objectContaining({ code: 200, data: expect.objectContaining({ id: 7, imgSrcPaths: null }) }))
    expect(state.pool.query.mock.calls.at(-1)[1]).toEqual(['7'])
  })

  it('normalizes date-only range to full day bounds', async () => {
    state.query = {
      pageNum: 1,
      pageSize: 10,
      'params[beginCreatedate]': '2026-08-11',
      'params[endCreatedate]': '2026-08-11',
    }
    state.pool.query
      .mockResolvedValueOnce([[{ total: 0 }], []])
      .mockResolvedValueOnce([[], []])
    await handlers.list({})
    expect(state.pool.query.mock.calls[1][1]).toEqual(['2026-08-11 00:00:00', '2026-08-11 23:59:59', 0, 10])
  })

  it('keeps operator and machine list contracts, auth and error boundaries', async () => {
    state.pool.query.mockResolvedValueOnce([[{ handler: '张三' }, { handler: '李四' }], []])
    await expect(handlers.handlers({})).resolves.toEqual(['张三', '李四'])
    state.pool.query.mockResolvedValueOnce([[{ mechineName: 'WB-1' }], []])
    await expect(handlers.machines({})).resolves.toEqual(['WB-1'])

    state.authenticated = null
    await expect(handlers.list({})).resolves.toEqual({ code: 401, msg: '登录状态已过期' })

    state.authenticated = { session: { userId: 1 } }
    state.pool.query.mockRejectedValueOnce(new Error('mysql://user:secret@example.test/app'))
    await expect(handlers.detail({})).resolves.toEqual({ code: 500, msg: '获取弹坑图片详情失败' })
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('secret')
  })
})
