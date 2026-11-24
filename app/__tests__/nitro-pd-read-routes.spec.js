import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx/xlsx.mjs'

const state = vi.hoisted(() => ({
  authenticated: { session: { userId: 1, roles: [] } },
  query: { pageNum: '1', pageSize: '2', flowNo: 'TW', productId: 'DM' },
  routerParam: 'pd-1',
  body: '',
  pool: { query: vi.fn() },
}))

vi.mock('h3', () => ({
  getQuery: vi.fn(() => state.query),
  getRouterParam: vi.fn(() => state.routerParam),
  readBody: vi.fn(async () => state.body),
  setResponseHeader: vi.fn(),
}))
vi.mock('../../server/utils/auth.ts', () => ({ getAuthSession: vi.fn(async () => state.authenticated) }))
vi.mock('../../server/utils/mysql.ts', () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}))

globalThis.defineEventHandler = (handler) => handler

describe('Nitro pd and pd_ck read routes', () => {
  let handlers
  let consoleError

  beforeAll(async () => {
    handlers = {
      pdList: (await import('../../server/routes/prod-api/tk_custom/pd/list.get.ts')).default,
      pdDetail: (await import('../../server/routes/prod-api/tk_custom/pd/[id].get.ts')).default,
      pdExport: (await import('../../server/routes/prod-api/tk_custom/pd/export.post.ts')).default,
      pdCkList: (await import('../../server/routes/prod-api/tk_custom/pd_ck/list.get.ts')).default,
      pdCkDetail: (await import('../../server/routes/prod-api/tk_custom/pd_ck/[id].get.ts')).default,
      pdCkExport: (await import('../../server/routes/prod-api/tk_custom/pd_ck/export.post.ts')).default,
    }
  })

  beforeEach(() => {
    state.authenticated = { session: { userId: 1, roles: [] } }
    state.query = { pageNum: '1', pageSize: '2', flowNo: 'TW', productId: 'DM' }
    state.routerParam = 'pd-1'
    state.body = ''
    state.pool.query.mockReset()
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => consoleError.mockRestore())

  it('keeps pd filters, pagination, decimal values, and Java base fields', async () => {
    state.pool.query
      .mockResolvedValueOnce([[{ total: 1 }], []])
      .mockResolvedValueOnce([[{
        id: 'pd-1', pdDate: '2026-08-11', process: '固晶', flowNo: 'TW020378',
        productId: 'DM001', productName: '芯片', specification: 'SOT-23', lot: 'L1',
        number: '12.500', pd_number: '10.500', remark: '备注', process_status: '0',
      }], []])

    const result = await handlers.pdList({})
    expect(result).toEqual(expect.objectContaining({ code: 200, total: 1 }))
    expect(result.rows[0]).toEqual(expect.objectContaining({
      id: 'pd-1', flowNo: 'TW020378', number: 12.5, pdNumber: 10.5,
      processStatus: '0', isUpdatePdData: null, createBy: null, remark: '备注',
    }))
    expect(state.pool.query.mock.calls[0][1]).toEqual(['TW', 'DM'])
    expect(state.pool.query.mock.calls[1][0].sql).toContain('ORDER BY pdDate DESC')
    expect(state.pool.query.mock.calls[1][1]).toEqual(['TW', 'DM', 0, 2])
  })

  it('keeps pd_ck fields and detail null semantics', async () => {
    state.query = { pageNum: '1', pageSize: '1', mertiralname: '二极管', pddate: '2026-08' }
    state.pool.query
      .mockResolvedValueOnce([[{ total: 1 }], []])
      .mockResolvedValueOnce([[{
        id: 'ck-1', mertiralid: 'DM001', mertiralname: '二极管', fengzhuang: 'SOT-23',
        yinzi: 'A1', kuwei: 'A-01', number: '3.000', pddate: '2026-08-11', creator: 'admin', remark: null,
      }], []])
    const list = await handlers.pdCkList({})
    expect(list.rows[0]).toEqual(expect.objectContaining({ id: 'ck-1', number: 3, mertiralid: 'DM001', creator: 'admin' }))
    expect(state.pool.query.mock.calls[0][1]).toEqual(['二极管', '2026-08'])

    state.routerParam = 'missing'
    state.pool.query.mockResolvedValueOnce([[], []])
    await expect(handlers.pdCkDetail({})).resolves.toEqual({ code: 200, msg: '操作成功', data: null })
  })

  it('exports fixed Java headers and converts pd process status labels', async () => {
    state.pool.query.mockResolvedValueOnce([[{
      id: 'pd-1', pdDate: '2026-08-11', process: '固晶', flowNo: 'TW020378', productId: 'DM001',
      productName: '芯片', specification: 'SOT-23', lot: 'L1', number: '12.500', pd_number: '10.500',
      process_status: '1', remark: null,
    }], []])
    const pdBuffer = await handlers.pdExport({})
    const pdWorkbook = XLSX.read(pdBuffer, { type: 'buffer' })
    const pdRows = XLSX.utils.sheet_to_json(pdWorkbook.Sheets[pdWorkbook.SheetNames[0]], { header: 1 })
    expect(pdRows[0]).toEqual(['盘点时间', '盘点工序', '流程单号', '产品编码', '产品名称', '规格型号', '批号', '库存数量', '盘点数量', '工序状态'])
    expect(pdRows[1][9]).toBe('已完成')

    state.pool.query.mockResolvedValueOnce([[{
      id: 'ck-1', mertiralid: 'DM001', mertiralname: '二极管', fengzhuang: 'SOT-23', yinzi: 'A1',
      kuwei: 'A-01', number: '3.000', pddate: '2026-08-11', creator: 'admin', remark: '备注',
    }], []])
    const ckBuffer = await handlers.pdCkExport({})
    const ckWorkbook = XLSX.read(ckBuffer, { type: 'buffer' })
    const ckRows = XLSX.utils.sheet_to_json(ckWorkbook.Sheets[ckWorkbook.SheetNames[0]], { header: 1 })
    expect(ckRows[0]).toEqual(['物料编码', '物料名称', '封装', '印字', '库位', '数量', '盘点日期', '盘点人', '备注'])
    expect(ckRows[1][5]).toBe(3)
  })

  it('protects reads and exports with auth and safe database errors', async () => {
    state.authenticated = null
    await expect(handlers.pdList({})).resolves.toEqual({ code: 401, msg: '登录状态已过期' })
    await expect(handlers.pdCkExport({})).resolves.toEqual({ code: 401, msg: '登录状态已过期' })

    state.authenticated = { session: { userId: 1, roles: [] } }
    state.pool.query.mockRejectedValueOnce(new Error('mysql://user:secret@example.test/app'))
    await expect(handlers.pdList({})).resolves.toEqual({ code: 500, msg: '获取盘点列表失败' })
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('secret')
  })
})
