import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  authenticated: { session: { userId: 1 } },
  query: { pageNum: '1', pageSize: '2', noSend: '0' },
  body: '',
  pool: { query: vi.fn() },
}))

vi.mock('h3', () => ({
  getQuery: vi.fn(() => state.query),
  getRouterParam: vi.fn(() => 'suggest-1'),
  readBody: vi.fn(async () => state.body),
  setResponseHeader: vi.fn(),
}))
vi.mock('../../server/utils/auth.ts', () => ({ getAuthSession: vi.fn(async () => state.authenticated) }))
vi.mock('../../server/utils/mysql.ts', () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}))

globalThis.defineEventHandler = (handler) => handler

describe('Nitro suggest read routes', () => {
  let listHandler
  let detailHandler
  let exportHandler
  let consoleError

  beforeAll(async () => {
    ({ default: listHandler } = await import('../../server/routes/prod-api/tk_custom/suggest/list.get.ts'));
    ({ default: detailHandler } = await import('../../server/routes/prod-api/tk_custom/suggest/[id].get.ts'));
    ({ default: exportHandler } = await import('../../server/routes/prod-api/tk_custom/suggest/export.post.ts'));
  })

  beforeEach(() => {
    state.authenticated = { session: { userId: 1 } }
    state.query = { pageNum: '1', pageSize: '2', noSend: '0' }
    state.body = ''
    state.pool.query.mockReset()
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => consoleError.mockRestore())

  it('keeps Java list filters, ordering, pagination, and row shape', async () => {
    state.pool.query
      .mockResolvedValueOnce([[{ total: 1 }], []])
      .mockResolvedValueOnce([[{
        create_by: null,
        create_time: null,
        update_by: null,
        update_time: null,
        remark: null,
        id: 'suggest-1',
        suggest_text: '请增加照明',
        suggest_time: '2026-08-11',
        ipAdress: '192.0.2.1',
        noSend: '0',
      }], []])

    const result = await listHandler({})
    expect(result).toEqual(expect.objectContaining({ code: 200, total: 1 }))
    expect(result.rows[0]).toEqual(expect.objectContaining({
      createBy: null,
      createTime: null,
      updateBy: null,
      updateTime: null,
      remark: null,
      id: 'suggest-1',
      suggestText: '请增加照明',
      ipAdress: '192.0.2.1',
      noSend: '0',
    }))
    expect(state.pool.query.mock.calls[0][1]).toEqual(['0'])
    expect(state.pool.query.mock.calls[1][0].sql).toContain('NULL AS create_by')
    expect(state.pool.query.mock.calls[1][0].sql).toContain('ORDER BY suggest_time DESC')
    expect(state.pool.query.mock.calls[1][1]).toEqual(['0', 0, 2])
  })

  it('exports fixed Java @Excel columns from URL-encoded body filters', async () => {
    state.query = { noSend: '0' }
    state.body = 'suggestText=%E8%AF%B7%E5%A2%9E%E5%8A%A0%E7%85%A7%E6%98%8E'
    state.pool.query.mockResolvedValueOnce([[{
      create_by: null,
      create_time: null,
      update_by: null,
      update_time: null,
      remark: null,
      id: 'suggest-1',
      suggest_text: '请增加照明',
      suggest_time: '2026-08-11',
      ipAdress: '192.0.2.1',
      noSend: '0',
    }], []])

    const result = await exportHandler({})
    expect(Buffer.isBuffer(result)).toBe(true)
    expect(result.subarray(0, 2).toString()).toBe('PK')
    expect(state.pool.query.mock.calls[0][1]).toEqual(['请增加照明', '0'])
    expect(state.pool.query.mock.calls[0][0].sql).toContain('ORDER BY suggest_time DESC')
  })

  it('keeps Java detail response shape for an existing row', async () => {
    state.pool.query.mockResolvedValueOnce([[{
      create_by: null,
      create_time: null,
      update_by: null,
      update_time: null,
      remark: null,
      id: 'suggest-1',
      suggest_text: '请增加照明',
      suggest_time: '2026-08-11',
      ipAdress: '192.0.2.1',
      noSend: '0',
    }], []])

    const result = await detailHandler({})
    expect(result).toEqual(expect.objectContaining({ code: 200 }))
    expect(result.data).toEqual(expect.objectContaining({
      createBy: null,
      id: 'suggest-1',
      suggestText: '请增加照明',
      noSend: '0',
    }))
  })

  it('protects both list and export with the auth boundary', async () => {
    state.authenticated = null
    await expect(listHandler({})).resolves.toEqual({ code: 401, msg: '登录状态已过期' })
    await expect(exportHandler({})).resolves.toEqual({ code: 401, msg: '登录状态已过期' })
  })

  it('maps database failures to safe responses', async () => {
    state.pool.query.mockRejectedValueOnce(new Error('mysql://user:secret@example.test/app'))
    await expect(listHandler({})).resolves.toEqual({ code: 500, msg: '获取意见/建议列表失败' })
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('secret')
  })
})
