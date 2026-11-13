import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  connection: { query: vi.fn() },
}))

vi.mock('../../server/utils/mysql.ts', () => ({
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}))

describe('WeCom employee sync persistence', () => {
  let applyWecomContactSync

  beforeEach(async () => {
    ({ applyWecomContactSync } = await import('../../server/utils/wecom-sync.ts'))
    state.connection.query.mockReset().mockImplementation(async (options) => {
      if (options.sql.includes('INSERT INTO wxuser_sync_batch')) return [{ insertId: 42, affectedRows: 1 }, []]
      if (options.sql.includes('SELECT userid')) return [[], []]
      return [{ affectedRows: 1 }, []]
    })
  })

  it('records a snapshot, upserts current members, and marks missing members inactive', async () => {
    const result = await applyWecomContactSync(
      state.connection,
      {
        added: [{ userid: 'new-1', name: '新员工', dept: '固晶部', position: '操作员' }],
        updated: [],
        unchanged: [],
        missing: [{ userid: 'old-1', name: '老员工', dept: '焊线部', position: '操作员', status: 'active' }],
      },
      [
        { userid: 'new-1', name: '新员工', dept: '固晶部', position: '操作员' },
      ],
      { userId: 7, userName: 'tester' },
    )

    expect(result).toEqual({
      batchId: 42,
      addedCount: 1,
      updatedCount: 0,
      unchangedCount: 0,
      missingCount: 1,
      remoteCount: 1,
      hireCount: 1,
      leaveCount: 1,
    })
    const sql = state.connection.query.mock.calls.map(([options]) => options.sql).join('\n')
    expect(sql).toContain('INSERT INTO wxuser_sync_batch')
    expect(sql).toContain('INSERT INTO wxuser_sync_member_snapshot')
    expect(sql).toContain('SELECT userid')
    expect(sql).toContain('ON DUPLICATE KEY UPDATE')
    expect(sql).toContain('INSERT INTO wxuser_employment_event')
    expect(sql).toContain("status = 'inactive'")
    expect(sql).toContain("status = 'completed'")
  })
})
