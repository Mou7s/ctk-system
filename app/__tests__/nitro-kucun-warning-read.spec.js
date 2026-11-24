import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  authenticated: { session: { userId: 1 } },
  pool: { query: vi.fn() },
  k3Rows: [],
  k3Error: null,
  lastK3Sql: '',
  lastK3Params: {},
  queryParams: {},
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual('h3')
  return {
    ...actual,
    getQuery: vi.fn(() => state.queryParams),
  }
})
vi.mock('../../server/utils/auth.ts', () => ({
  getAuthSession: vi.fn(async () => state.authenticated),
  hasPermission: vi.fn(() => true),
}))
vi.mock('../../server/utils/mysql.ts', () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}))
vi.mock('../../server/utils/sqlserver.ts', () => ({
  queryK3SqlServer: vi.fn(async (runner) => {
    if (state.k3Error) throw state.k3Error
    const params = {}
    const request = {
      input: vi.fn((name, _type, value) => {
        params[name] = value
      }),
      query: vi.fn(async (sql) => {
        state.lastK3Sql = sql
        state.lastK3Params = params
        return state.k3Rows
      }),
    }
    return runner(request)
  }),
  sqlStringParameter: vi.fn((request, name, value) => {
    request.input(name, 'nvarchar', value)
  }),
}))

describe('Nitro kucun warning read routes', () => {
  let syncTimeHandler
  let warningJobHandler
  let wecomUsersHandler
  let materialsHandler

  beforeAll(async () => {
    globalThis.defineEventHandler = (handler) => handler
    syncTimeHandler = (await import('../../server/routes/prod-api/tk_custom/kucun/warnings/syncTime.get.ts')).default
    warningJobHandler = (await import('../../server/routes/prod-api/tk_custom/kucun/warningJob.get.ts')).default
    wecomUsersHandler = (await import('../../server/routes/prod-api/tk_custom/kucun/wecomUsers.get.ts')).default
    materialsHandler = (await import('../../server/routes/prod-api/tk_custom/kucun/warnings/materials.get.ts')).default
  })

  beforeEach(() => {
    state.authenticated = { session: { userId: 1 } }
    state.pool.query.mockReset()
    state.k3Rows = []
    state.k3Error = null
    state.lastK3Sql = ''
    state.lastK3Params = {}
    state.queryParams = {}
  })

  it('requires authentication without touching MySQL', async () => {
    state.authenticated = null
    await expect(syncTimeHandler({})).resolves.toEqual({ code: 401, msg: '登录状态已过期' })
    await expect(warningJobHandler({})).resolves.toEqual({ code: 401, msg: '登录状态已过期' })
    await expect(wecomUsersHandler({})).resolves.toEqual({ code: 401, msg: '登录状态已过期' })
    expect(state.pool.query).not.toHaveBeenCalled()
  })

  it('returns the latest warning snapshot timestamp as data', async () => {
    const syncTime = new Date('2026-08-11T08:20:00.000Z')
    state.pool.query.mockResolvedValueOnce([[{ sync_time: syncTime }], []])
    await expect(syncTimeHandler({})).resolves.toEqual({
      code: 200,
      msg: '操作成功',
      data: '2026-08-11T16:20:00.000+08:00',
    })
    expect(state.pool.query.mock.calls[0][0].sql).toContain('ORDER BY sync_time DESC')
  })

  it('maps enabled flag, push time and receivers from sys_config', async () => {
    state.pool.query
      .mockResolvedValueOnce([[{ config_value: '1' }], []])   // isNitroJobEnabled
      .mockResolvedValueOnce([[{ config_key: 'tk.kucun.warning.pushHour', config_value: '7' }, { config_key: 'tk.kucun.warning.pushMinute', config_value: '30' }], []])
      .mockResolvedValueOnce([[{ config_value: 'alice,bob' }], []])

    await expect(warningJobHandler({})).resolves.toEqual({
      code: 200,
      msg: '操作成功',
      data: {
        enabled: true,
        hour: 7,
        minute: 30,
        receivers: 'alice,bob',
      },
    })
  })

  it('uses paused/default values when the switch is missing and config lookup fails', async () => {
    state.pool.query
      .mockResolvedValueOnce([[{ config_value: '0' }], []])   // isNitroJobEnabled -> false
      .mockResolvedValueOnce([[], []])                        // push time: no rows -> defaults 8:00
      .mockRejectedValueOnce(new Error('config lookup unavailable')) // receivers lookup failure

    await expect(warningJobHandler({})).resolves.toEqual({
      code: 200,
      msg: '操作成功',
      data: {
        enabled: false,
        hour: 8,
        minute: 0,
        receivers: '',
      },
    })
  })

  it('returns the active WeCom members with the Java-compatible shape', async () => {
    state.pool.query.mockResolvedValueOnce([[{
      userid: 'alice', name: 'Alice', dept: '生产', position: '操作员',
    }, {
      userid: 'bob', name: null, dept: null, position: '主管',
    }], []])

    await expect(wecomUsersHandler({})).resolves.toEqual({
      code: 200,
      msg: '操作成功',
      data: [
        {
          createBy: null,
          createTime: null,
          userid: 'alice',
          name: 'Alice',
          dept: '生产',
          position: '操作员',
          sysUsername: null,
          updateBy: null,
          updateTime: null,
          remark: null,
        },
        {
          createBy: null,
          createTime: null,
          userid: 'bob',
          name: null,
          dept: null,
          position: '主管',
          sysUsername: null,
          updateBy: null,
          updateTime: null,
          remark: null,
        },
      ],
    })
    expect(state.pool.query.mock.calls[0][0].sql).toContain('FROM wxuser')
  })

  it('requires authentication for warning material search', async () => {
    state.authenticated = null
    await expect(materialsHandler({})).resolves.toEqual({ code: 401, msg: '登录状态已过期' })
  })

  it('searches all approved unforbidden materials in org 100 without finished-group restriction', async () => {
    state.queryParams = { keyword: '黑胶', limit: '20' }
    state.k3Rows = [
      {
        id: 10001,
        number: 'N103010004',
        name: '黑胶 SOD-123/523',
        spec: 'EMG-400SV',
        unitName: '千克',
        safeStock: 1350,
        enableSafeStock: '1',
      },
      {
        id: 10002,
        number: 'N103030099',
        name: '黑胶 新型号',
        spec: 'EMG-900',
        unitName: '千克',
        safeStock: 0,
        enableSafeStock: '0',
      },
    ]

    const res = await materialsHandler({})
    expect(res).toEqual({
      code: 200,
      msg: '操作成功',
      data: [
        {
          id: 10001,
          number: 'N103010004',
          value: 'N103010004',
          name: '黑胶 SOD-123/523',
          spec: 'EMG-400SV',
          unitName: '千克',
          safeStock: 1350,
          enableSafeStock: true,
          label: 'N103010004 黑胶 SOD-123/523',
        },
        {
          id: 10002,
          number: 'N103030099',
          value: 'N103030099',
          name: '黑胶 新型号',
          spec: 'EMG-900',
          unitName: '千克',
          safeStock: 0,
          enableSafeStock: false,
          label: 'N103030099 黑胶 新型号',
        },
      ],
    })
    expect(state.lastK3Sql).toContain('JOIN T_BD_MATERIALSTOCK ms')
    expect(state.lastK3Sql).not.toContain('FinishedGroups')
    expect(state.lastK3Params).toMatchObject({ stockOrg: '100', kw: '黑胶', kwLike: '%黑胶%', limit: 20 })
  })

  it('returns 502 when SQL Server material search fails', async () => {
    state.queryParams = { keyword: 'N105' }
    state.k3Error = Object.assign(new Error('timeout'), { kind: 'timeout' })
    const res = await materialsHandler({})
    expect(res.code).toBe(502)
  })
})
