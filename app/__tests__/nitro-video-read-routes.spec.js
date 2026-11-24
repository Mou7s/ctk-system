import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  authenticated: { session: { userId: 2, userName: 'u2', roles: [], permissions: [] } },
  query: { pageNum: '1', pageSize: '2', title: '培训', category: '培训' },
  id: '7',
  pool: { query: vi.fn() },
}))

vi.mock('h3', () => ({
  getQuery: vi.fn(() => state.query),
  getRouterParam: vi.fn(() => state.id),
}))
vi.mock('../../server/utils/auth.ts', () => ({ getAuthSession: vi.fn(async () => state.authenticated) }))
vi.mock('../../server/utils/mysql.ts', () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}))
vi.mock('../../server/utils/redis.ts', () => ({ getGarnet: vi.fn(() => ({ set: vi.fn() })) }))

globalThis.defineEventHandler = (handler) => handler

describe('Nitro video library read routes', () => {
  let listHandler
  let detailHandler
  let consoleError

  beforeAll(async () => {
    ({ default: listHandler } = await import('../../server/routes/prod-api/tk_custom/videoLibrary/list.get.ts'));
    ({ default: detailHandler } = await import('../../server/routes/prod-api/tk_custom/videoLibrary/[id].get.ts'))
  })

  beforeEach(() => {
    state.authenticated = { session: { userId: 2, userName: 'u2', roles: [], permissions: [] } }
    state.query = { pageNum: '1', pageSize: '2', title: '培训', category: '培训' }
    state.id = '7'
    state.pool.query.mockReset()
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => consoleError.mockRestore())

  const row = (overrides = {}) => ({
    id: 7,
    title: '安全培训',
    category: '培训',
    description: '新员工培训视频',
    original_name: 'safety.mp4',
    storage_path: null,
    cover_path: null,
    content_type: 'video/mp4',
    size_bytes: 1024,
    duration_seconds: 90,
    uploader_id: 2,
    uploader_name: 'u2',
    status: '0',
    create_time: '2026-08-11 10:20:30',
    update_time: '2026-08-11 10:20:30',
    ...overrides,
  })

  it('keeps Java filters, pagination, fields, and ownership flags', async () => {
    state.pool.query
      .mockResolvedValueOnce([[{ total: 1 }], []])
      .mockResolvedValueOnce([[row()], []])

    const result = await listHandler({})
    expect(result).toEqual(expect.objectContaining({ code: 200, msg: '查询成功', total: 1 }))
    expect(result.rows[0]).toEqual(expect.objectContaining({
      id: 7,
      title: '安全培训',
      originalName: 'safety.mp4',
      hasCover: false,
      canEdit: true,
      coverUrl: null,
      createTime: '2026-08-11 10:20:30',
    }))
    expect(state.pool.query.mock.calls[0][1]).toEqual(['培训', '培训', '培训'])
    expect(state.pool.query.mock.calls[1][0].sql).toContain('ORDER BY create_time DESC, id DESC')
    expect(state.pool.query.mock.calls[1][1]).toEqual(['培训', '培训', '培训', 0, 2])
  })

  it('returns active detail and preserves Java canEdit semantics', async () => {
    state.authenticated = { session: { userId: 3, userName: 'u3', roles: [], permissions: [] } }
    state.pool.query.mockResolvedValueOnce([[row({ uploader_id: 2, cover_path: '2026/08/11/cover.jpg' })], []])

    const result = await detailHandler({})
    expect(result).toEqual(expect.objectContaining({ code: 200 }))
    expect(result.data).toEqual(expect.objectContaining({
      id: 7,
      hasCover: true,
      canEdit: false,
      coverUrl: null,
    }))
    expect(result.data).not.toHaveProperty('storagePath')
    expect(state.pool.query.mock.calls[0][1]).toEqual([7])
  })

  it('protects unauthenticated and deleted records', async () => {
    state.authenticated = null
    await expect(listHandler({})).resolves.toEqual({ code: 401, msg: '登录状态已过期' })

    state.authenticated = { session: { userId: 1, roles: ['admin'] } }
    state.pool.query.mockResolvedValueOnce([[row({ status: '1' })], []])
    await expect(detailHandler({})).resolves.toEqual({ code: 500, msg: '视频不存在或已删除' })
  })

  it('maps database failures without exposing connection details', async () => {
    state.pool.query.mockRejectedValueOnce(new Error('mysql://user:secret@example.test/app'))
    await expect(listHandler({})).resolves.toEqual({ code: 500, msg: '获取视频列表失败' })
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('secret')
  })
})
