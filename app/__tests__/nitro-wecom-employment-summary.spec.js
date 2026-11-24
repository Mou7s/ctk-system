import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  session: { userId: 2 },
  permission: true,
  query: {},
  pool: { query: vi.fn() },
}))

vi.mock('h3', () => ({
  getQuery: vi.fn(() => state.query),
}))

vi.mock('../../server/utils/auth.ts', () => ({
  getAuthSession: vi.fn(async () => state.session),
  hasPermission: vi.fn(() => state.permission),
}))

vi.mock('../../server/utils/wecom-contacts.ts', () => ({
  loadWecomContactConfig: vi.fn(async () => ({ corpId: 'corp', corpSecret: 'app', corpSecretContacts: 'contacts' })),
  fetchWecomDepartments: vi.fn(async () => []),
}))

vi.mock('../../server/utils/mysql.ts', () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}))

globalThis.defineEventHandler = (handler) => handler

describe('Nitro WeCom employment summary route', () => {
  let handler
  let consoleError

  beforeAll(async () => {
    handler = (await import('../../server/routes/prod-api/tk_custom/wxuser/employmentSummary.get.ts')).default
  })

  beforeEach(() => {
    state.session = { userId: 2 }
    state.permission = true
    state.query = { startDate: '2026-08-20', endDate: '2026-08-21' }
    state.pool.query.mockReset()
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('returns department statistics, current status counts, and event rows', async () => {
    state.pool.query
      .mockResolvedValueOnce([[{
        event_id: 8,
        userid: 'new-1',
        event_type: 'hire',
        event_at: '2026-08-20 10:00:00',
        name: '新员工',
        dept: '生产部',
        position: '操作员',
        sync_batch_id: 3,
      }, {
        event_id: 9,
        userid: 'old-1',
        event_type: 'leave',
        event_at: '2026-08-20 10:00:00',
        name: '离职员工',
        dept: '生产部',
        position: '操作员',
        sync_batch_id: 3,
      }], []])
      .mockResolvedValueOnce([[{
        userid: 'active-1',
        name: '在职员工',
        dept: '生产部',
        leader_dept: '生产部',
        status: 'active',
      }, {
        userid: 'inactive-1',
        name: '历史员工',
        dept: '生产部',
        leader_dept: null,
        status: 'inactive',
      }], []])
      .mockResolvedValueOnce([[{
        batch_id: 101,
        snapshot_date: '2026-08-20',
      }, {
        batch_id: 102,
        snapshot_date: '2026-08-21',
      }], []])
      .mockResolvedValueOnce([[{
        batch_id: 101,
        userid: 'active-1',
        name: '在职员工',
        dept: '生产部',
        position: '操作员',
      }, {
        batch_id: 101,
        userid: 'active-2',
        name: '第二员工',
        dept: '生产部',
        position: '操作员',
      }, {
        batch_id: 102,
        userid: 'active-1',
        name: '在职员工',
        dept: '生产部',
        position: '操作员',
      }], []])

    await expect(handler({})).resolves.toEqual({
      code: 200,
      msg: '查询入离职汇总成功',
      summary: {
        hireCount: 1,
        leaveCount: 1,
        departmentRows: [{
          department: '生产部',
          hireCount: 1,
          hireNames: ['新员工'],
          leaveCount: 1,
          leaveNames: ['离职员工'],
          leaveRate: 66.67,
        }],
        leaveRate: 66.67,
        leaveRateAvailable: true,
        leaveRateMessage: null,
        reasonStats: [
          ...['R01', 'R02', 'R03', 'R04', 'R05', 'R06', 'R07', 'R08', 'R09', 'R10'].map((code) => ({
            code,
            label: expect.any(String),
            fullText: expect.any(String),
            count: 0,
            rate: 0,
          })),
          { code: '', label: '未填写', fullText: expect.any(String), count: 1, rate: 100 },
        ],
        reasonLeaveTotal: 1,
      },
      rows: [{
        eventId: 8,
        userid: 'new-1',
        eventType: 'hire',
        eventAt: '2026-08-20 10:00:00',
        name: '新员工',
        dept: '生产部',
        position: '操作员',
        batchId: 3,
        reasonCode: null,
        reasonRemark: null,
      }, {
        eventId: 9,
        userid: 'old-1',
        eventType: 'leave',
        eventAt: '2026-08-20 10:00:00',
        name: '离职员工',
        dept: '生产部',
        position: '操作员',
        batchId: 3,
        reasonCode: null,
        reasonRemark: null,
      }],
    })
    expect(state.pool.query).toHaveBeenCalledTimes(4)
    expect(state.pool.query.mock.calls[0][1]).toEqual(['2026-08-20', '2026-08-21'])
  })

  it('rejects unauthenticated and invalid date requests', async () => {
    state.session = null
    await expect(handler({})).resolves.toEqual({ code: 401, msg: '登录状态已过期' })
    expect(state.pool.query).not.toHaveBeenCalled()

    state.session = { userId: 2 }
    state.query = { startDate: '2026/08/01' }
    await expect(handler({})).resolves.toEqual({ code: 500, msg: '开始日期格式应为 YYYY-MM-DD' })
    expect(state.pool.query).not.toHaveBeenCalled()
  })

  it('rejects authenticated users without the page permission', async () => {
    state.permission = false
    await expect(handler({})).resolves.toEqual({ code: 403, msg: '没有权限访问该接口' })
    expect(state.pool.query).not.toHaveBeenCalled()
  })
})
