import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const state = vi.hoisted(() => ({
  session: { userId: 2 },
  permission: true,
  body: { startDate: '2026-08-31', endDate: '2026-09-06', eventType: '' },
  headers: {},
  pool: { query: vi.fn() },
}))

vi.mock('h3', () => ({
  readBody: vi.fn(() => state.body),
  setResponseHeader: vi.fn((_, name, value) => { state.headers[name] = value }),
}))

vi.mock('../../server/utils/auth.ts', () => ({
  getAuthSession: vi.fn(async () => (state.session ? { session: state.session } : null)),
  hasPermission: vi.fn(() => state.permission),
}))

vi.mock('../../server/utils/wecom-contacts.ts', () => ({
  loadWecomContactConfig: vi.fn(async () => ({})),
  fetchWecomDepartments: vi.fn(async () => []),
}))

vi.mock('../../server/utils/mysql.ts', () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}))

globalThis.defineEventHandler = (handler) => handler

const DEPARTMENTS = ['模压', '焊线部', '测试部', '品保部', '资材部']

function employmentEvent(id, userid, type, day, name, dept, reason) {
  return {
    event_id: id,
    userid,
    event_type: type,
    event_at: `2026-09-0${day} 10:00:00`,
    name,
    dept,
    position: '操作员',
    sync_batch_id: 1,
    leave_reason_code: reason,
    leave_reason_remark: null,
  }
}

describe('scratch chart export dump', () => {
  it('writes a realistic sample file to a temp directory and cleans up', async () => {
    const handler = (await import('../../server/routes/prod-api/tk_custom/wxuser/employmentSummary/export.post.ts')).default
    const events = []
    let id = 1
    DEPARTMENTS.forEach((dept, d) => {
      for (let i = 0; i < d + 1; i += 1) {
        events.push(employmentEvent(id, `hire-${id}`, 'hire', 1, `新员工${id}`, dept, null))
        id += 1
      }
      const reasons = ['R05', 'R02', null, 'R09', 'R03', 'R05']
      for (let i = 0; i < d + 2 && i < reasons.length; i += 1) {
        events.push(employmentEvent(id, `leave-${id}`, 'leave', 2 + (i % 4), `离职员工${id}`, dept, reasons[(d + i) % reasons.length]))
        id += 1
      }
    })
    state.pool.query
      .mockResolvedValueOnce([events, []])
      .mockResolvedValueOnce([[{ userid: 'u1', name: '在职', dept: '模压', leader_dept: null, status: 'active' }], []])
      .mockResolvedValueOnce([[], []])
    const result = await handler({})
    expect(result.length).toBeGreaterThan(0)

    const tempDir = mkdtempSync(join(tmpdir(), 'chart-dump-'))
    const tempFile = join(tempDir, 'employment-summary-chart.xlsx')
    try {
      writeFileSync(tempFile, Buffer.from(result))
      const written = readFileSync(tempFile)
      expect(written.length).toBe(result.length)
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
