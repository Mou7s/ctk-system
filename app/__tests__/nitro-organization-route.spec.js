import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  session: { userId: 2 },
  pool: { query: vi.fn() },
  departments: [
    { id: 1, parentId: 0, order: 1, name: '示例企业' },
    { id: 2, parentId: 1, order: 1, name: '生产部' },
    { id: 3, parentId: 2, order: 1, name: '固晶一部' },
  ],
}))

vi.mock('../../server/utils/auth.ts', () => ({
  getAuthSession: vi.fn(async () => state.session),
}))

vi.mock('../../server/utils/mysql.ts', () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}))

vi.mock('../../server/utils/wecom-contacts.ts', () => ({
  loadWecomContactConfig: vi.fn(async () => ({ corpId: 'corp', corpSecret: 'app', corpSecretContacts: 'contacts' })),
  fetchWecomDepartments: vi.fn(async () => state.departments),
}))

globalThis.defineEventHandler = (handler) => handler

describe('Nitro organization route', () => {
  let handler
  let consoleError

  beforeAll(async () => {
    handler = (await import('../../server/routes/prod-api/tk_custom/organization.get.ts')).default
  })

  beforeEach(() => {
    state.session = { userId: 2 }
    state.pool.query.mockReset()
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.pool.query
      .mockResolvedValueOnce([[
        { userid: 'u1', name: '张三', dept: '固晶一部', position: '操作员' },
        { userid: 'u2', name: '李四', dept: '生产部', position: '主管' },
        { userid: 'u3', name: '王五', dept: '不存在的部门', position: '文员' },
        { userid: 'old', name: '历史员工', dept: '生产部', position: '操作员' },
      ], []])
      .mockResolvedValueOnce([[{ batchId: 7, remoteCount: 307, finishedAt: '2026-08-24T08:28:38.000Z' }], []])
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('builds the WeCom department hierarchy and keeps unmatched active employees visible', async () => {
    const result = await handler({})
    const root = result.data.departments[0]
    const production = root.children[0]
    const packaging = production.children[0]

    expect(result).toMatchObject({ code: 200, msg: '组织架构加载成功' })
    expect(result.data.totalDepartments).toBe(3)
    expect(result.data.totalEmployees).toBe(4)
    expect(root.name).toBe('示例企业')
    expect(production.employeeCount).toBe(3)
    expect(packaging.employees).toEqual([
      { userid: 'u1', name: '张三', dept: '固晶一部', position: '操作员' },
    ])
    expect(result.data.unassignedEmployees.map((item) => item.userid)).toEqual(['u3'])
    expect(result.data.lastSync).toMatchObject({ batchId: 7, remoteCount: 307 })
  })

  it('rejects unauthenticated requests without touching MySQL', async () => {
    state.session = null
    await expect(handler({})).resolves.toEqual({ code: 401, msg: '登录状态已过期' })
    expect(state.pool.query).not.toHaveBeenCalled()
  })
})
