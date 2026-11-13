import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx/xlsx.mjs'

const state = vi.hoisted(() => ({
  authenticated: { session: { userId: 1 } },
  query: {},
  body: '',
  pool: { query: vi.fn() },
}))

vi.mock('h3', () => ({
  getQuery: vi.fn(() => state.query),
  readBody: vi.fn(async () => state.body),
  setResponseHeader: vi.fn(),
}))
vi.mock('../../server/utils/auth.ts', () => ({ getAuthSession: vi.fn(async () => state.authenticated) }))
vi.mock('../../server/utils/mysql.ts', () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}))

globalThis.defineEventHandler = (handler) => handler

describe('Nitro custom MySQL export routes', () => {
  let handlers
  let consoleError

  beforeAll(async () => {
    handlers = {
      wxuser: (await import('../../server/routes/prod-api/tk_custom/wxuser/export.post.ts')).default,
      msgtowx: (await import('../../server/routes/prod-api/tk_custom/msgtowx/export.post.ts')).default,
      dummy: (await import('../../server/routes/prod-api/tk_custom/dummyPiece/monthly/export.post.ts')).default,
      wxApprove: (await import('../../server/routes/prod-api/tk_custom/WXApprove/export.post.ts')).default,
    }
  })

  beforeEach(() => {
    state.authenticated = { session: { userId: 1 } }
    state.query = {}
    state.body = ''
    state.pool.query.mockReset()
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => consoleError.mockRestore())

  it('exports Java @Excel headers for all pure-MySQL modules', async () => {
    const cases = [
      ['wxuser', [['姓名', '部门', '职位']], { name: '张', dept: '生产部' }, 'name LIKE'],
      ['msgtowx', [['类型', '是否已发送', '接收人ID集合', '源单id', '消息内容', '创建时间']], { isSend: '0' }, 'isSend ='],
      ['dummy', [['月份', '封装', '空片-铜(g)', '空片-铁(g)', '有黑胶-铜(g)', '有黑胶-铁(g)', '小计(g)', '条数']], { packageName: 'SOT' }, 'package_name LIKE'],
      ['wxApprove', [['审批申请类型名称', '申请单状态：1-审批中；2-已通过；3-已驳回；4-已撤销；6-通过后撤销；7-已删除；10-已支付', '审批模板id', '审批申请提交时间', '申请人id', '申请人所在部门id', '审批申请详情', '出厂时间', '返厂时间', '审批人id']], { spStatus: '2' }, 'sp_name ='],
    ]

    for (const [kind, expectedRows, query, sqlPart] of cases) {
      state.query = query
      if (kind === 'dummy') {
        // 宽表导出：先查单重基础资料，再查当月录入
        state.pool.query.mockResolvedValueOnce([[{ package_name: 'SOT-23', piece_type: '空片', material: '铜', unit_weight: '2.5' }], []])
      }
      state.pool.query.mockResolvedValueOnce([[{}], []])
      const before = state.pool.query.mock.calls.length
      const result = await handlers[kind === 'dummy' ? 'dummy' : kind]({})
      expect(Buffer.isBuffer(result)).toBe(true)
      expect(result.subarray(0, 2).toString()).toBe('PK')
      const workbook = XLSX.read(result, { type: 'buffer' })
      const header = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 })[0]
      expect(header).toEqual(expectedRows[0])
      const calls = state.pool.query.mock.calls
      // 宽表导出查两次：dummy 断言本轮第一次（单重查询），别的断言唯一查询
      expect(calls.at(kind === 'dummy' ? before : -1)[0].sql).toContain(sqlPart)
    }
  })

  it('merges URL-encoded export filters and keeps auth boundary', async () => {
    state.query = { recordMonth: '2026-08' }
    state.body = 'packageName=SOT-23&pieceType=%E9%93%B6%E8%83%B6'
    state.pool.query.mockResolvedValueOnce([[], []]).mockResolvedValueOnce([[], []])
    const result = await handlers.dummy({})
    expect(Buffer.isBuffer(result)).toBe(true)
    // 第一查单重（包名过滤），第二查当月录入（月份过滤）
    expect(state.pool.query.mock.calls[0][1]).toEqual(['SOT-23'])
    expect(state.pool.query.mock.calls[1][1]).toEqual(['2026-08'])

    state.authenticated = null
    await expect(handlers.wxuser({})).resolves.toEqual({ code: 401, msg: '登录状态已过期' })
  })

  it('maps database errors without exposing connection details', async () => {
    state.pool.query.mockRejectedValueOnce(new Error('mysql://user:secret@example.test/app'))
    await expect(handlers.wxuser({})).resolves.toEqual({ code: 500, msg: '导出企业微信成员表数据失败' })
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('secret')
  })

  it('keeps WXApprove export fixed scope, filters and date columns', async () => {
    state.query = { spName: '放行', spStatus: '2', applyTime: '2026-08-11 08:00:00' }
    state.pool.query.mockResolvedValueOnce([[{
      spName: '',
      spStatus: '2',
      templateId: 'template-1',
      applyTime: '2026-08-11 08:00:00',
      applyerUserid: 'user-1',
      applyerPartyid: 'party-1',
      applyDataContents: '{"携带人":"员工"}',
      outtime: '',
      backtime: '',
      auditerid: 'auditor-1',
    }], []])

    const result = await handlers.wxApprove({})
    const workbook = XLSX.read(result, { type: 'buffer' })
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 })
    expect(rows[0]).toEqual(['审批申请类型名称', '申请单状态：1-审批中；2-已通过；3-已驳回；4-已撤销；6-通过后撤销；7-已删除；10-已支付', '审批模板id', '审批申请提交时间', '申请人id', '申请人所在部门id', '审批申请详情', '出厂时间', '返厂时间', '审批人id'])
    expect(rows[1][0]).toBe('')
    expect(state.pool.query.mock.calls[0][0].sql).toContain("sp_name = '外出放行条'")
    expect(state.pool.query.mock.calls[0][0].sql).toContain('(outtime IS NULL OR backtime IS NULL)')
    expect(state.pool.query.mock.calls[0][1]).toEqual(['放行', '2', '2026-08-11 08:00:00'])
  })
})
