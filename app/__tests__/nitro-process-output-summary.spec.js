import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  authenticated: { session: { userId: 1 } },
  outputRows: [],
  lastSql: '',
  sqlParams: {},
  pool: { query: vi.fn() },
}))

vi.mock('h3', () => ({ getQuery: vi.fn((event) => event.query || {}) }))
vi.mock('../../server/utils/auth.ts', () => ({
  getAuthSession: vi.fn(async () => state.authenticated),
}))
vi.mock('../../server/utils/mysql.ts', () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}))
vi.mock('../../server/utils/sqlserver.ts', () => ({
  queryK3SqlServer: vi.fn(async (execute) => {
    state.lastSql = ''
    state.sqlParams = {}
    await execute({
      query: async (sql) => {
        state.lastSql = sql
        return { recordset: state.outputRows }
      },
    })
    return state.outputRows
  }),
  sqlStringParameter: vi.fn((_req, name, value) => {
    state.sqlParams[name] = value
  }),
  SqlServerError: class SqlServerError extends Error { kind = 'query'; statusCode = 502 },
}))
vi.mock('../../server/utils/response.ts', () => ({
  apiSuccess: (data, msg = '操作成功') => ({ code: 200, msg, data }),
  apiError: (msg, code = 500) => ({ code, msg }),
  errorMessage: (error) => error?.message || 'unknown error',
}))

describe('Nitro process output summary route', () => {
  let handler
  let normalizePackageName
  let normalizeProcessName

  beforeAll(async () => {
    globalThis.defineEventHandler = (eventHandler) => eventHandler
    handler = (await import('../../server/routes/prod-api/tk_custom/processOutputReport/summary.get.ts')).default
    const readMod = await import('../../server/utils/process-output-read.ts')
    normalizePackageName = readMod.normalizePackageName
    normalizeProcessName = readMod.normalizeProcessName
  })

  beforeEach(() => {
    state.authenticated = { session: { userId: 1 } }
    state.outputRows = [{ specification: 'SOD-123', materialName: 'SOD-123', materialNumber: 'MAT001', processName: '固晶', operNumber: 10, totalQty: 10 }]
    state.pool.query.mockReset()
    state.pool.query.mockImplementation(async (query) => {
      const sql = query.sql || ''
      if (sql.includes('tk_process_output_target')) return [[{
        id: 'target-1', package_name: 'SOD-123', process_name: '固晶', target_capacity: 30, sort_no: 10, status: '0', remark: null,
        create_by: 'admin', create_time: '2026-08-01 00:00:00', update_by: null, update_time: null,
      }], []]
      return [[], []]
    })
  })

  it('requires authentication without touching dependencies', async () => {
    state.authenticated = null
    await expect(handler({ query: { reportDate: '2026-08-01' } })).resolves.toEqual({ code: 401, msg: '登录状态已过期' })
    expect(state.pool.query).not.toHaveBeenCalled()
  })

  it('builds the Java-compatible tables, targets and rates from read-only sources', async () => {
    await expect(handler({ query: { reportDate: '2026-08-01', periodType: 'day' } })).resolves.toMatchObject({
      code: 200,
      data: {
        reportDate: '2026-08-01',
        processes: [
          { processName: '固晶', sortNo: 10 },
          { processName: '焊线', sortNo: 20 },
          { processName: '模压', sortNo: 30 },
          { processName: '测试分选', sortNo: 60 },
          { processName: '包装入库', sortNo: 9990 },
        ],
        rows: [{ packageName: 'SOD-123', cells: { 固晶: { outputQty: 10, targetCapacity: 1, achievementRate: 10 } } }],
        targets: [{ id: 'target-1', packageName: 'SOD-123', targetCapacity: 30, createTime: '2026-08-01 00:00:00' }],
        showStaffRows: true,
      },
    })
    expect(state.pool.query).toHaveBeenCalledTimes(2)
    expect(state.lastSql).toContain("rpt.FDOCUMENTSTATUS = 'C'")
    expect(state.lastSql).toContain("rpt.FCANCELSTATUS = 'A'")
    expect(state.lastSql).toContain('mat_l.FLOCALEID = 2052')
    expect(state.lastSql).toContain('proc_l.FLOCALEID = 2052')
  })

  it('maps all K3 PDFN3X3 and PDFN5X6 specification variants into their canonical buckets', () => {
    for (const spec of [
      'PDFN3X3/5K盘',
      'PDFN3*3/5K盘',
      'PDFN3-3/5K盘',
      'PDFN3.3*3.3-8 /5K盘/无',
      'PDFN3*3-8L/5K盘',
      'PDFN3030/5K盘/无',
      'PDFN3333/5K盘/无',
    ]) {
      expect(normalizePackageName(spec, '测试物料', 'NBM0750001')).toBe('PDFN3X3')
    }

    for (const spec of [
      'PDFN5X6/5K盘',
      'PDFN5*6/5K盘',
      'PDFN5-6/5K盘',
      'PDFN5×6/5K盘',
      'PDFN5*6-8 /4K盘/无',
      'PDFN5X6-8/白板',
      'PDFN5060/5K盘/无',
      'PDFN5X6 Clip/5K盘/无',
      'PDFN5*6-8 Clip/5K盘/无',
    ]) {
      expect(normalizePackageName(spec, '测试物料', 'NBM0760001')).toBe('PDFN5X6')
    }
  })

  it('preserves 玻封上锡 in the glass product table instead of dropping it', async () => {
    expect(normalizeProcessName('玻封上锡')).toBe('玻封上锡')
    state.outputRows = [
      { specification: 'LL-34  HL/2.5K盘', materialName: '1N4148', materialNumber: 'NAE001', processName: '玻封上锡', operNumber: 30, totalQty: 43629.824 },
    ]
    const res = await handler({
      query: {
        periodType: 'shiftRange',
        reportDate: '2026-10-01 00:00:00,2026-11-01 00:00:00',
      },
    })
    expect(res.code).toBe(200)
    expect(res.data.reportDate).toBe('2026-10-01 至 2026-10-31')
    expect(res.data.showStaffRows).toBe(false)
    const glassTable = res.data.tables.find((t) => t.tableName === '玻封产品')
    expect(glassTable.totalRow.cells['玻封上锡'].outputQty).toBe(43629.824)
  })

  it('exposes both 班次日 and 自然日 modes on the page and aligns multi-day selection to 自然日', () => {
    const pageSource = readFileSync(resolve(process.cwd(), 'app/pages/tk_custom/processOutputReport/index.vue'), 'utf8')
    expect(pageSource).toContain('SHIFT_CALENDAR_DAY = "calendarDay"')
    expect(pageSource).toContain('label: "自然日"')
    expect(pageSource).toContain('label: "班次日"')
    expect(pageSource).toContain('"玻封上锡"')
  })
})
