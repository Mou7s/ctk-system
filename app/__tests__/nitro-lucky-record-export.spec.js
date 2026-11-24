import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx/xlsx.mjs'

const state = vi.hoisted(() => ({
  authenticated: { session: { userId: 1 } },
  query: {},
  body: '',
  pool: { query: vi.fn() },
  setResponseHeader: vi.fn(),
}))

vi.mock('h3', () => ({
  getQuery: vi.fn(() => state.query),
  readBody: vi.fn(async () => state.body),
  setResponseHeader: state.setResponseHeader,
}))
vi.mock('../../server/utils/mysql.ts', () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}))
vi.mock('../../server/utils/read.ts', () => ({
  queryText: (value) => String(Array.isArray(value) ? value[0] ?? '' : value ?? ''),
  withReadSession: vi.fn(async (_event, _label, work, failureMessage) => {
    if (!state.authenticated) return { code: 401, msg: '登录状态已过期' }
    try {
      return await work(state.authenticated.session, state.pool)
    } catch {
      return { code: 500, msg: failureMessage }
    }
  }),
}))

globalThis.defineEventHandler = (handler) => handler

function decodeWorkbook(result) {
  const workbook = XLSX.read(Buffer.from(result), { type: 'buffer' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' })
}

describe('Nitro lucky record Excel export route', () => {
  let handler

  beforeAll(async () => {
    handler = (await import('../../server/routes/prod-api/tk_custom/lucky/admin/record/export.post.ts')).default
  })

  beforeEach(() => {
    state.authenticated = { session: { userId: 1 } }
    state.query = {}
    state.body = 'activityId=1&userPhone=138123&winStatus=2'
    state.pool.query.mockReset()
    state.setResponseHeader.mockReset()
  })

  it('keeps Java filters, columns, date format, and win-status conversion', async () => {
    state.pool.query.mockResolvedValueOnce([[
      {
        activity_id: 1, user_phone: '13812345678', user_name: '张三', user_company: '示例企业', user_job: '工程师',
        openid: 'openid-test', prize_id: 10, prize_name: '一等奖', win_status: '2', redeem_code: 'CODE-1',
        draw_time: new Date('2026-08-11T02:03:04.000Z'), redeem_time: '2026-08-11 11:00:00',
      },
    ], []])

    const result = await handler({})
    expect(decodeWorkbook(result)).toEqual([
      ['活动ID', '手机号', '姓名', '公司名', '职务', '微信OpenID', '奖品ID', '奖品名称', '中奖状态', '兑奖码', '抽奖时间', '兑奖时间'],
      [1, '13812345678', '张三', '示例企业', '工程师', 'openid-test', 10, '一等奖', '已核销兑换', 'CODE-1', '2026-08-11 10:03:04', '2026-08-11 11:00:00'],
    ])
    expect(state.pool.query.mock.calls[0][1]).toEqual(['1', '138123', '2'])
    expect(state.pool.query.mock.calls[0][0].sql).toContain('activity_id = ?')
    expect(state.pool.query.mock.calls[0][0].sql).toContain('ORDER BY id DESC')
    expect(state.setResponseHeader.mock.calls[1][1]).toBe('Content-Disposition')
    expect(state.setResponseHeader.mock.calls[1][2]).toContain('.xlsx')
  })

  it('enforces authentication and hides database failures', async () => {
    state.authenticated = null
    await expect(handler({})).resolves.toEqual({ code: 401, msg: '登录状态已过期' })
    expect(state.pool.query).not.toHaveBeenCalled()

    state.authenticated = { session: { userId: 1 } }
    state.pool.query.mockRejectedValueOnce(new Error('mysql://user:secret@example.test/app'))
    await expect(handler({})).resolves.toEqual({ code: 500, msg: '导出中奖核销记录失败' })
  })
})
