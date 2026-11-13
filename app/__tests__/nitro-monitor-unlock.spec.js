import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, createRouter, defineEventHandler, toNodeListener } from 'h3'
import http from 'node:http'

const state = vi.hoisted(() => ({
  authenticated: {
    token: 'test-token',
    session: {
      userId: 1,
      deptId: 1,
      userName: 'admin',
      user: { userId: 1, userName: 'admin', nickName: '管理员' },
      roles: ['admin'],
      permissions: ['*:*:*'],
    },
  },
  connection: {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi.fn(),
  },
  pool: { getConnection: vi.fn() },
  garnet: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    keys: vi.fn(),
    scan: vi.fn(),
  },
}))

vi.mock('../../server/utils/auth.ts', () => ({
  getAuthSession: vi.fn(async () => state.authenticated),
  hasPermission: vi.fn(() => true),
  deleteAuthSession: vi.fn(async () => true),
  SESSION_KEY_PREFIXES: ['auth_sessions:', 'login_tokens:'],
  AUTH_SESSION_PREFIX: 'auth_sessions:',
  saveAuthSession: vi.fn(),
}))

vi.mock('../../server/utils/mysql.ts', () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}))

vi.mock('../../server/utils/redis.ts', () => ({
  getGarnet: vi.fn(() => state.garnet),
  getCache: vi.fn(() => state.garnet),
}))

vi.mock('../../server/utils/read.ts', () => ({
  dataScopeFragment: vi.fn(async () => ({ sql: '', params: [] })),
}))

describe('Nitro monitor login-unlock and Chinese cache key routes (real h3)', () => {
  let server
  let baseUrl
  let consoleError

  beforeEach(async () => {
    state.connection.beginTransaction.mockReset()
    state.connection.commit.mockReset()
    state.connection.rollback.mockReset()
    state.connection.release.mockReset()
    state.connection.query.mockReset().mockResolvedValue([{ affectedRows: 1 }, []])
    state.pool.getConnection.mockReset().mockResolvedValue(state.connection)
    state.garnet.get.mockReset().mockResolvedValue(null)
    state.garnet.set.mockReset().mockResolvedValue('OK')
    state.garnet.del.mockReset().mockResolvedValue(1)
    state.garnet.keys.mockReset().mockResolvedValue(['pwd_err_cnt:蔡美娜'])
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { createMonitorAdminWriteHandler } = await import('../../server/utils/monitor-admin-write.ts')
    const { createMonitorWriteHandler } = await import('../../server/utils/monitor-write.ts')
    const { queryMonitorCacheKeys, queryMonitorCacheValue } = await import('../../server/utils/monitor-cache-read.ts')
    const { createSystemWriteHandler } = await import('../../server/utils/system-write.ts')

    const app = createApp()
    const router = createRouter()
    router.get('/prod-api/monitor/logininfor/unlock/:userName', defineEventHandler(createMonitorAdminWriteHandler('login-unlock')))
    router.get('/prod-api/monitor/cache/getKeys/:cacheName', defineEventHandler(queryMonitorCacheKeys))
    router.get('/prod-api/monitor/cache/getValue/:cacheName/:cacheKey', defineEventHandler(queryMonitorCacheValue))
    router.delete('/prod-api/monitor/cache/clearCacheKey/:cacheKey', defineEventHandler(createMonitorWriteHandler('cache-key')))
    router.put('/prod-api/system/user/resetPwd', defineEventHandler(createSystemWriteHandler('user-reset-password')))
    app.use(router)

    server = http.createServer(toNodeListener(app))
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    baseUrl = `http://127.0.0.1:${server.address().port}`
  })

  afterEach(async () => {
    consoleError.mockRestore()
    if (server) {
      await new Promise((resolve) => server.close(resolve))
    }
  })

  it('unlocks a Chinese username over GET without throwing 405 and decodes the router param', async () => {
    const res = await fetch(`${baseUrl}/prod-api/monitor/logininfor/unlock/${encodeURIComponent('蔡美娜')}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ code: 200, msg: '操作成功' })
    expect(state.garnet.del).toHaveBeenCalledWith('pwd_err_cnt:蔡美娜')
  })

  it('reads and deletes encoded Chinese sys_cache keys in cache monitor routes', async () => {
    const keysRes = await fetch(`${baseUrl}/prod-api/monitor/cache/getKeys/${encodeURIComponent('pwd_err_cnt:')}`)
    expect(await keysRes.json()).toEqual({ code: 200, msg: '操作成功', data: ['pwd_err_cnt:蔡美娜'] })

    state.garnet.get.mockResolvedValueOnce('5')
    const valRes = await fetch(
      `${baseUrl}/prod-api/monitor/cache/getValue/${encodeURIComponent('pwd_err_cnt:')}/${encodeURIComponent('pwd_err_cnt:蔡美娜')}`,
    )
    expect(await valRes.json()).toEqual({
      code: 200,
      msg: '操作成功',
      data: { cacheName: 'pwd_err_cnt:', cacheKey: 'pwd_err_cnt:蔡美娜', cacheValue: '5' },
    })

    state.garnet.get.mockResolvedValueOnce(null)
    const delRes = await fetch(`${baseUrl}/prod-api/monitor/cache/clearCacheKey/${encodeURIComponent('pwd_err_cnt:蔡美娜')}`, {
      method: 'DELETE',
    })
    expect(await delRes.json()).toEqual({ code: 200, msg: '操作成功', data: { deleted: 1 } })
    expect(state.garnet.del).toHaveBeenCalledWith('pwd_err_cnt:蔡美娜')
  })

  it('clears pwd_err_cnt lock key in the same transaction when resetting a user password', async () => {
    state.connection.query
      .mockReset()
      .mockResolvedValueOnce([[{ user_name: '蔡美娜' }], []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])

    const res = await fetch(`${baseUrl}/prod-api/system/user/resetPwd`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 141, password: 'NewValidPassword1' }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ code: 200, msg: '操作成功' })
    expect(state.connection.query).toHaveBeenCalledWith(
      expect.objectContaining({ sql: 'DELETE FROM sys_cache WHERE cache_key = ?' }),
      ['pwd_err_cnt:蔡美娜'],
    )
  })
})
