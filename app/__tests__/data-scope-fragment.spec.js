import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  pool: { query: vi.fn() },
}))

vi.mock('../../server/utils/mysql.ts', () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}))

import { dataScopeFragment } from '../../server/utils/read.ts'

describe('dataScopeFragment permission and scope resolution', () => {
  beforeEach(() => {
    state.pool.query.mockReset()
  })

  it('bypasses scope restrictions for admin user (userId === 1)', async () => {
    const session = { userId: 1, deptId: 100, user: { roles: [] } }
    const result = await dataScopeFragment(state.pool, session, 'system:dept:list', 'd')
    expect(result).toEqual({ sql: '', params: [] })
    expect(state.pool.query).not.toHaveBeenCalled()
  })

  it('matches roles having :query permission when queried with :list permission', async () => {
    const session = {
      userId: 146,
      deptId: 103,
      user: {
        roles: [
          { roleId: 129, roleName: '副总经理', roleKey: 'deputy_general_manager', dataScope: '1', status: '0' },
        ],
      },
    }

    // Mock query finding role 129 matching system:dept:query
    state.pool.query.mockResolvedValueOnce([
      [{ role_id: 129 }],
      [],
    ])

    const result = await dataScopeFragment(state.pool, session, 'system:dept:list', 'd')

    expect(state.pool.query).toHaveBeenCalledTimes(1)
    const sql = state.pool.query.mock.calls[0][0].sql
    const params = state.pool.query.mock.calls[0][1]

    expect(sql).toContain('m.perms IN (?, ?)')
    expect(params).toEqual([129, 'system:dept:list', 'system:dept:query'])
    // role 129 has dataScope '1', so returns unrestricted
    expect(result).toEqual({ sql: '', params: [] })
  })

  it('returns dept_id = 0 fallback when user roles have no matching permissions', async () => {
    const session = {
      userId: 99,
      deptId: 103,
      user: {
        roles: [
          { roleId: 108, roleName: '普通用户', roleKey: 'common', dataScope: '5', status: '0' },
        ],
      },
    }

    state.pool.query.mockResolvedValueOnce([
      [], // no permitted roles
      [],
    ])

    const result = await dataScopeFragment(state.pool, session, 'system:dept:list', 'd')
    expect(result).toEqual({ sql: ' AND d.dept_id = 0', params: [] })
  })

  it('applies department scope (dataScope = 3) correctly when matched via query permission', async () => {
    const session = {
      userId: 88,
      deptId: 105,
      user: {
        roles: [
          { roleId: 120, roleName: '部门经理', roleKey: 'dept_manager', dataScope: '3', status: '0' },
        ],
      },
    }

    state.pool.query.mockResolvedValueOnce([
      [{ role_id: 120 }],
      [],
    ])

    const result = await dataScopeFragment(state.pool, session, 'system:dept:list', 'd')
    expect(result).toEqual({ sql: ' AND (d.dept_id = ?)', params: [105] })
  })
})
