import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  body: {},
  session: null,
  pool: {
    query: vi.fn(),
    getConnection: vi.fn(),
  },
  connection: {
    query: vi.fn(),
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
  },
}))

vi.mock('h3', () => ({
  readBody: vi.fn(async () => state.body),
}))

vi.mock('../../server/utils/auth.ts', () => ({
  getAuthSession: vi.fn(async () => (state.session ? { session: state.session } : null)),
}))

vi.mock('../../server/utils/mysql.ts', () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}))

globalThis.defineEventHandler = (handler) => handler

describe('Nitro wire bond card routes', () => {
  let listHandler
  let generateHandler
  let updateHandler
  let consoleError

  beforeEach(async () => {
    state.body = {}
    state.session = { userId: 1, userName: 'admin' }
    state.pool.query.mockReset()
    state.pool.getConnection.mockReset().mockResolvedValue(state.connection)
    state.connection.query.mockReset()
    state.connection.beginTransaction.mockReset()
    state.connection.commit.mockReset()
    state.connection.rollback.mockReset()
    state.connection.release.mockReset()

    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    listHandler = (await import('../../server/routes/prod-api/tk_custom/wire-bond-card/users.get.ts')).default
    generateHandler = (await import('../../server/routes/prod-api/tk_custom/wire-bond-card/passwords/generate.post.ts')).default
    updateHandler = (await import('../../server/routes/prod-api/tk_custom/wire-bond-card/passwords/update.put.ts')).default
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('rejects unauthenticated requests with 401', async () => {
    state.session = null
    const res = await listHandler({})
    expect(res).toEqual({ code: 401, msg: '登录状态已过期' })
  })

  it('rejects non-admin users with 403', async () => {
    state.session = { userId: 100, userName: 'normalUser' }
    const res = await listHandler({})
    expect(res).toEqual({ code: 403, msg: '无权访问此功能，仅限管理员操作' })
  })

  it('lists wire bond users for admin successfully', async () => {
    state.pool.query.mockResolvedValueOnce([[
      {
        userid: 'LiangHuaJi',
        name: '梁华吉',
        dept: '焊线部',
        position: '操作技工',
        password: '123456',
        credential_status: 'active',
        credential_updated_at: '2026-11-04 10:00:00',
      },
    ]])

    const res = await listHandler({})
    expect(res.code).toBe(200)
    expect(res.rows).toEqual([
      {
        userid: 'lianghuaji',
        name: '梁华吉',
        dept: '焊线部',
        position: '操作技工',
        password: '123456',
        hasPassword: true,
        updatedAt: '2026-11-04 10:00:00',
      },
    ])
    expect(res.total).toBe(1)
  })

  it('generates random 6-digit password for target users', async () => {
    state.body = { userids: ['lianqinwu'] }
    state.pool.query.mockResolvedValueOnce([[{ userid: 'lianqinwu', name: '连钦武' }]])
    state.connection.query.mockResolvedValueOnce([{ affectedRows: 1 }])

    const res = await generateHandler({})
    expect(res.code).toBe(200)
    expect(res.data.count).toBe(1)
    expect(res.data.generated[0].userid).toBe('lianqinwu')
    expect(res.data.generated[0].password).toMatch(/^[1-9]\d{5}$/)
    expect(state.connection.commit).toHaveBeenCalled()
  })

  it('updates password for an allowed user correctly (normalized to lowercase)', async () => {
    state.body = { userid: 'LiangHuaJi', password: '998877' }
    state.pool.query.mockResolvedValueOnce([{ affectedRows: 1 }])

    const res = await updateHandler({})
    expect(res.code).toBe(200)
    expect(res.data).toEqual({ userid: 'lianghuaji', password: '998877' })
  })

  it('rejects password update for user outside the 7 allowed users', async () => {
    state.body = { userid: 'OtherUser', password: '998877' }
    const res = await updateHandler({})
    expect(res).toEqual({ code: 400, msg: '该账号不在当前焊线机工卡打印名单内' })
  })

  it('validates required fields on password update', async () => {
    state.body = { userid: '', password: '123' }
    const res = await updateHandler({})
    expect(res).toEqual({ code: 400, msg: '员工UserID不能为空' })
  })
})
