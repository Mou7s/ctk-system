import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  authenticated: { session: { userId: 1, roles: ['admin'] } },
  body: { FNAME: '', FNUMBER: '', FBillNo: 'MO-1', FMONumber: '', FMOEntrySeq: '', pageNum: 1, pageSize: 10 },
  queryMoData: vi.fn(),
}))

vi.mock('h3', () => ({ readBody: vi.fn(async () => state.body) }))
vi.mock('../../server/utils/auth.ts', () => ({ getAuthSession: vi.fn(async () => state.authenticated) }))
vi.mock('../../server/utils/mo-read.ts', () => ({ queryMoData: (...args) => state.queryMoData(...args) }))

globalThis.defineEventHandler = (handler) => handler

describe('Nitro getMOData route', () => {
  let handler
  let consoleError

  beforeAll(async () => {
    ({ default: handler } = await import('../../server/routes/prod-api/kingdee/getMOData.post.ts'))
  })

  beforeEach(() => {
    state.authenticated = { session: { userId: 1, roles: ['admin'] } }
    state.body = { FNAME: '', FNUMBER: '', FBillNo: 'MO-1', FMONumber: '', FMOEntrySeq: '', pageNum: 1, pageSize: 10 }
    state.queryMoData.mockReset()
    state.queryMoData.mockResolvedValue({
      rows: [{ FBillNo: 'MO-1', details: [] }],
      total: 1,
      pageNum: 1,
      pageSize: 10,
    })
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => consoleError.mockRestore())

  it('protects the read route with the shared session boundary', async () => {
    state.authenticated = null
    await expect(handler({})).resolves.toEqual({ code: 401, msg: '登录状态已过期' })
    expect(state.queryMoData).not.toHaveBeenCalled()
  })

  it('forwards the page filters and wraps rows in a paged contract', async () => {
    await expect(handler({})).resolves.toEqual({
      code: 200,
      msg: '操作成功',
      data: {
        rows: [{ FBillNo: 'MO-1', details: [] }],
        total: 1,
        pageNum: 1,
        pageSize: 10,
      },
    })
    expect(state.queryMoData).toHaveBeenCalledWith(state.body)
  })

  it('sanitizes SQL Server failures without leaking connection details', async () => {
    state.queryMoData.mockRejectedValueOnce(new Error('sqlserver password=secret'))
    await expect(handler({})).resolves.toEqual({ code: 502, msg: '查询生产进度失败，请检查 SQL Server 连接或稍后重试' })
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('secret')
  })
})
