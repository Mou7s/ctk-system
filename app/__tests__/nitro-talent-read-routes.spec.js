import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  authenticated: { session: { userId: 1 } },
  query: { pageNum: '1', pageSize: '2', name: '张', eduId: '本科', schoolName: '大学', position: '工程师' },
  pool: { query: vi.fn() },
}))

vi.mock('h3', () => ({
  getQuery: vi.fn(() => state.query),
  getRouterParam: vi.fn(() => '42'),
}))
vi.mock('../../server/utils/auth.ts', () => ({ getAuthSession: vi.fn(async () => state.authenticated) }))
vi.mock('../../server/utils/mysql.ts', () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}))

globalThis.defineEventHandler = (handler) => handler

describe('Nitro talent read routes', () => {
  let listHandler
  let detailHandler
  let consoleError

  beforeAll(async () => {
    ({ default: listHandler } = await import('../../server/routes/prod-api/tk_custom/talent/getTalentList.get.ts'));
    ({ default: detailHandler } = await import('../../server/routes/prod-api/tk_custom/talent/getTalentInfo.get.ts'))
  })

  beforeEach(() => {
    state.authenticated = { session: { userId: 1 } }
    state.query = { pageNum: '1', pageSize: '2', name: '张', eduId: '本科', schoolName: '大学', position: '工程师' }
    state.pool.query.mockReset()
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => consoleError.mockRestore())

  it('keeps Java filters, pagination, ordering, base fields, and row shape', async () => {
    state.pool.query
      .mockResolvedValueOnce([[{ total: 1 }], []])
      .mockResolvedValueOnce([[{
        create_by: null,
        update_by: null,
        id: 42,
        name: '张三',
        birthDate: '2000-01-01 00:00:00',
        gender: 1,
        schoolName: '大学',
        eduId: '本科',
        isMarriedId: '0',
        position: '工程师',
        phoneNumber: '13000000000',
        attachments: null,
        recordStatus: 0,
        isDel: 0,
        creator: '管理员',
        createTime: '2026-08-11 00:00:00',
        modifier: null,
        updateTime: null,
        remark: null,
        nativePlace: '上海',
        interviewTime: null,
      }], []])

    const result = await listHandler({})
    expect(result).toEqual(expect.objectContaining({ code: 200, total: 1 }))
    expect(result.rows[0]).toEqual(expect.objectContaining({
      createBy: null,
      updateBy: null,
      id: 42,
      name: '张三',
      attachments: null,
      nativePlace: '上海',
    }))
    expect(state.pool.query.mock.calls[0][1]).toEqual(['张', '本科', '大学', '工程师'])
    expect(state.pool.query.mock.calls[1][0].sql).toContain('ORDER BY interviewTime DESC, createTime DESC')
    expect(state.pool.query.mock.calls[1][1]).toEqual(['张', '本科', '大学', '工程师', 0, 2])
  })

  it('keeps Java detail fields and null semantics', async () => {
    state.pool.query.mockResolvedValueOnce([[{
      create_by: null,
      update_by: null,
      id: 42,
      name: '张三',
      attachments: null,
      isDel: 0,
    }], []])
    const result = await detailHandler({})
    expect(result).toEqual(expect.objectContaining({ code: 200 }))
    expect(result.data).toEqual(expect.objectContaining({ createBy: null, updateBy: null, id: 42, name: '张三' }))
  })

  it('protects reads and database errors', async () => {
    state.authenticated = null
    await expect(listHandler({})).resolves.toEqual({ code: 401, msg: '登录状态已过期' })
    await expect(detailHandler({})).resolves.toEqual({ code: 401, msg: '登录状态已过期' })
    state.authenticated = { session: { userId: 1 } }
    state.pool.query.mockRejectedValueOnce(new Error('mysql://user:secret@example.test/app'))
    await expect(listHandler({})).resolves.toEqual({ code: 500, msg: '获取人才列表失败' })
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('secret')
  })
})
