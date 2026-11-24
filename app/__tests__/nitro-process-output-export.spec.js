import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  authenticated: { session: { userId: 1 } },
  summary: vi.fn(),
  headers: {},
}))

vi.mock('h3', () => ({
  getQuery: vi.fn((event) => event.query || {}),
  readBody: vi.fn(async (event) => event.body || {}),
  setResponseHeader: vi.fn((event, key, value) => { state.headers[key] = value }),
}))
vi.mock('../../server/utils/auth.ts', () => ({ getAuthSession: vi.fn(async () => state.authenticated) }))
vi.mock('../../server/utils/process-output-read.ts', () => ({ queryProcessOutputSummary: state.summary }))
vi.mock('../../server/utils/sqlserver.ts', () => ({ SqlServerError: class SqlServerError extends Error { kind = 'query'; statusCode = 502 } }))
vi.mock('../../server/utils/response.ts', () => ({ errorMessage: (error) => error?.message || 'unknown error' }))

describe('Nitro process output export route', () => {
  let handler

  beforeAll(async () => {
    globalThis.defineEventHandler = (eventHandler) => eventHandler
    handler = (await import('../../server/routes/prod-api/tk_custom/processOutputReport/export.post.ts')).default
  })

  beforeEach(() => {
    state.authenticated = { session: { userId: 1 }
    }
    state.headers = {}
    state.summary.mockReset().mockResolvedValue({
      reportDate: '2026-08-01',
      showStaffRows: true,
      tables: [{
        tableName: '塑封小信号产品',
        processes: [{ processName: '固晶' }],
        rows: [{ packageName: 'SOD-123', cells: { 固晶: { outputQty: 10, targetCapacity: 30, achievementRate: 0.3333 } } }],
        totalRow: { packageName: '合计', cells: { 固晶: { outputQty: 10, targetCapacity: 30, achievementRate: 0.3333 } } },
        staffCounts: { 固晶: 2 },
        averageValues: { 固晶: 5 },
      }],
    })
  })

  it('requires authentication without querying the report', async () => {
    state.authenticated = null
    await expect(handler({ query: {} })).resolves.toEqual({ code: 401, msg: '登录状态已过期' })
    expect(state.summary).not.toHaveBeenCalled()
  })

  it('returns an XLSX with the Java-compatible sheet structure', async () => {
    const result = await handler({ query: { periodType: 'day', tableName: '塑封小信号产品' } })
    expect(Buffer.from(result).subarray(0, 2).toString()).toBe('PK')
    expect(state.summary).toHaveBeenCalledWith({ periodType: 'day', tableName: '塑封小信号产品' })
    expect(state.headers['Content-Type']).toContain('spreadsheetml.sheet')
    expect(state.headers['Content-Disposition']).toContain('%E5%B7%A5%E5%BA%8F%E4%BA%A7%E9%87%8F')
  })
})
