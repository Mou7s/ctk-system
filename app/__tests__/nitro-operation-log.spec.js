import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  headers: {},
  url: 'https://erp.example.com/prod-api/tk_custom/quotation',
  connection: { query: vi.fn() },
}))

vi.mock('h3', () => ({
  getHeader: vi.fn((_event, name) => state.headers[String(name).toLowerCase()]),
  getRequestURL: vi.fn(() => new URL(state.url)),
  readBody: vi.fn(),
}))

vi.mock('../../server/utils/mysql.ts', () => ({
  getMysqlPool: vi.fn(),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}))

import { extractClientIp, insertOperationLog } from '../../server/utils/write.ts'

describe('Nitro operation log IP & column bounds', () => {
  beforeEach(() => {
    state.headers = {}
    state.url = 'https://erp.example.com/prod-api/tk_custom/quotation'
    state.connection.query.mockReset().mockResolvedValue([{ affectedRows: 1 }, []])
  })

  it('stores client IP instead of long User-Agent in sys_oper_log.oper_ip', async () => {
    state.headers = {
      'user-agent': `Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 wxwork/4.1.20 ${'X'.repeat(220)}`,
      'x-forwarded-for': '::ffff:39.144.124.20, 198.51.100.2',
    }
    const event = { node: { req: { method: 'POST', socket: { remoteAddress: '198.51.100.2' } } } }
    const session = { userName: 'admin', ipaddr: '192.0.2.1' }

    await insertOperationLog(event, state.connection, session, '报价单', 1, { id: 1 })

    expect(state.connection.query).toHaveBeenCalledTimes(1)
    const params = state.connection.query.mock.calls[0][1]
    expect(params[6]).toBe('39.144.124.20')
    expect(params[6].length).toBeLessThanOrEqual(128)
    expect(params[3]).toBe('POST')
  })

  it('falls back to x-real-ip, socket remoteAddress, session.ipaddr, and 0.0.0.0 cleanly', () => {
    state.headers = { 'x-real-ip': '192.0.2.55' }
    expect(extractClientIp({}, '203.0.113.1')).toBe('192.0.2.55')

    state.headers = {}
    expect(extractClientIp({ node: { req: { socket: { remoteAddress: '::ffff:192.0.2.66' } } } }, '203.0.113.1')).toBe('192.0.2.66')
    expect(extractClientIp({}, '203.0.113.9')).toBe('203.0.113.9')
    expect(extractClientIp({})).toBe('0.0.0.0')
  })

  it('truncates oversized header IP and column values safely within MySQL column limits', async () => {
    state.headers = { 'x-forwarded-for': 'a'.repeat(200) }
    await insertOperationLog(
      { node: { req: { method: 'ABCDEFGHIJKLMNOP' } } },
      state.connection,
      { userName: 'u'.repeat(80) },
      'T'.repeat(80),
      2,
      { ok: true },
    )
    const params = state.connection.query.mock.calls[0][1]
    expect(params[0].length).toBe(50)
    expect(params[3].length).toBe(10)
    expect(params[4].length).toBe(50)
    expect(params[6].length).toBe(128)
  })
})
