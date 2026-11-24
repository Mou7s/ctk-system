import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  session: { userId: 2, userName: 'hr-admin' },
  permission: true,
  body: { eventId: 9, reasonCode: 'R05', reasonRemark: '工资太低' },
  pool: { query: vi.fn() },
}))

vi.mock('h3', () => ({
  readBody: vi.fn(() => state.body),
}))

vi.mock('../../server/utils/auth.ts', () => ({
  getAuthSession: vi.fn(async () => (state.session ? { session: state.session } : null)),
  hasPermission: vi.fn(() => state.permission),
}))

vi.mock('../../server/utils/mysql.ts', () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}))

globalThis.defineEventHandler = (handler) => handler

describe('Nitro WeCom employment leave reason route', () => {
  let handler
  let consoleError

  beforeAll(async () => {
    handler = (await import('../../server/routes/prod-api/tk_custom/wxuser/employmentSummary/reason.put.ts')).default
  })

  beforeEach(() => {
    state.session = { userId: 2, userName: 'hr-admin' }
    state.permission = true
    state.body = { eventId: 9, reasonCode: 'R05', reasonRemark: '工资太低' }
    state.pool.query.mockReset()
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('saves the leave reason for a leave event', async () => {
    state.pool.query
      .mockResolvedValueOnce([[{ event_id: 9, event_type: 'leave' }], []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])

    await expect(handler({})).resolves.toEqual({
      code: 200,
      msg: '保存离职原因成功',
      eventId: 9,
      reasonCode: 'R05',
      reasonRemark: '工资太低',
    })
    expect(state.pool.query).toHaveBeenCalledTimes(2)
    const updateArgs = state.pool.query.mock.calls[1]
    expect(updateArgs[1]).toEqual(['R05', '工资太低', 'hr-admin', 9])
  })

  it('clears the reason when the code is empty', async () => {
    state.body = { eventId: 9, reasonCode: '', reasonRemark: '' }
    state.pool.query
      .mockResolvedValueOnce([[{ event_id: 9, event_type: 'leave' }], []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])

    await expect(handler({})).resolves.toEqual({
      code: 200,
      msg: '保存离职原因成功',
      eventId: 9,
      reasonCode: null,
      reasonRemark: null,
    })
    expect(state.pool.query.mock.calls[1][1]).toEqual([null, null, 'hr-admin', 9])
  })

  it('rejects unknown reason codes, hire events, and missing events', async () => {
    state.body = { eventId: 9, reasonCode: 'R99', reasonRemark: '' }
    await expect(handler({})).resolves.toEqual({ code: 400, msg: '离职原因编码不符合规范' })
    expect(state.pool.query).not.toHaveBeenCalled()

    state.body = { eventId: 8, reasonCode: 'R05', reasonRemark: '' }
    state.pool.query.mockResolvedValueOnce([[{ event_id: 8, event_type: 'hire' }], []])
    await expect(handler({})).resolves.toEqual({ code: 400, msg: '只有离职事件可以填写离职原因' })

    state.body = { eventId: 404, reasonCode: 'R05', reasonRemark: '' }
    state.pool.query.mockResolvedValueOnce([[], []])
    await expect(handler({})).resolves.toEqual({ code: 404, msg: '离职事件不存在' })

    state.body = { eventId: 9, reasonCode: 'R05', reasonRemark: 'x'.repeat(501) }
    await expect(handler({})).resolves.toEqual({ code: 400, msg: '备注最多 500 字' })
  })

  it('rejects unauthenticated users and users without the page permission', async () => {
    state.session = null
    await expect(handler({})).resolves.toEqual({ code: 401, msg: '登录状态已过期' })
    expect(state.pool.query).not.toHaveBeenCalled()

    state.session = { userId: 2, userName: 'hr-admin' }
    state.permission = false
    await expect(handler({})).resolves.toEqual({ code: 403, msg: '没有权限访问该接口' })
    expect(state.pool.query).not.toHaveBeenCalled()
  })
})
