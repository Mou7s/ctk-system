import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx/xlsx.mjs'

const state = vi.hoisted(() => ({
  authenticated: { session: { userId: 1 } },
  query: {},
  body: {},
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

describe('Nitro monitor Excel export routes', () => {
  let logininforHandler
  let operlogHandler
  let jobHandler
  let jobLogHandler

  beforeAll(async () => {
    logininforHandler = (await import('../../server/routes/prod-api/monitor/logininfor/export.post.ts')).default
    operlogHandler = (await import('../../server/routes/prod-api/monitor/operlog/export.post.ts')).default
    jobHandler = (await import('../../server/routes/prod-api/monitor/job/export.post.ts')).default
    jobLogHandler = (await import('../../server/routes/prod-api/monitor/jobLog/export.post.ts')).default
  })

  beforeEach(() => {
    state.authenticated = { session: { userId: 1 } }
    state.query = {}
    state.body = {}
    state.pool.query.mockReset()
    state.setResponseHeader.mockReset()
  })

  it('keeps login-log filters, columns, and status conversion', async () => {
    state.body = 'userName=admin&params%5BbeginTime%5D=2026-08-01'
    state.pool.query
      .mockResolvedValueOnce([[{ total: 1 }], []])
      .mockResolvedValueOnce([[{ info_id: 7, user_name: 'admin', status: '0', ipaddr: '127.0.0.1', login_location: '内网', browser: 'Chrome', os: 'Windows', msg: '登录成功', login_time: new Date('2026-08-12T00:00:00+08:00') }], []])

    const result = await logininforHandler({})

    expect(decodeWorkbook(result)).toEqual([
      ['序号', '用户账号', '登录状态', '登录地址', '登录地点', '浏览器', '操作系统', '提示消息', '访问时间'],
      [7, 'admin', '成功', '127.0.0.1', '内网', 'Chrome', 'Windows', '登录成功', '2026-08-12 00:00:00'],
    ])
    expect(state.pool.query.mock.calls[0][1]).toEqual(['admin', '2026-08-01'])
  })

  it('keeps oper-log array filters, columns, suffix, and auth boundary', async () => {
    state.body = 'businessTypes%5B0%5D=5&businessTypes%5B1%5D=6'
    state.pool.query
      .mockResolvedValueOnce([[{ total: 1 }], []])
      .mockResolvedValueOnce([[{
        oper_id: 8, title: '用户管理', business_type: 5, method: 'export', request_method: 'POST', operator_type: 1,
        oper_name: 'admin', dept_name: '管理部', oper_url: '/system/user/export', oper_ip: '127.0.0.1', oper_location: '内网',
        oper_param: '{}', json_result: '{}', status: 0, error_msg: null, oper_time: new Date('2026-08-12T00:00:00+08:00'), cost_time: 12,
      }], []])

    const result = await operlogHandler({})
    expect(decodeWorkbook(result)[1]).toEqual([
      8, '用户管理', '导出', 'export', 'POST', '后台用户', 'admin', '管理部', '/system/user/export', '127.0.0.1', '内网', '{}', '{}', '正常', '', '2026-08-12 00:00:00', '12毫秒',
    ])
    expect(state.pool.query.mock.calls[0][1]).toEqual(['5', '6'])

    state.authenticated = null
    await expect(logininforHandler({})).resolves.toEqual({ code: 401, msg: '登录状态已过期' })
    expect(state.pool.query).toHaveBeenCalledTimes(2)
  })

  it('keeps Quartz job and job-log Excel columns, conversions, and date-only filtering', async () => {
    state.query = { jobName: '库存', status: '0' }
    state.pool.query
      .mockResolvedValueOnce([[{ total: 1 }], []])
      .mockResolvedValueOnce([[{
        job_id: 3, job_name: '库存同步', job_group: 'SYSTEM', invoke_target: 'tkTask.sync', cron_expression: '0 0/5 * * * ?',
        misfire_policy: '1', concurrent: '0', status: '0',
      }], []])

    const jobResult = await jobHandler({})
    expect(decodeWorkbook(jobResult)).toEqual([
      ['任务序号', '任务名称', '任务组名', '调用目标字符串', '执行表达式 ', '计划策略 ', '并发执行', '任务状态'],
      [3, '库存同步', 'SYSTEM', 'tkTask.sync', '0 0/5 * * * ?', '立即触发执行', '允许', '正常'],
    ])
    expect(state.pool.query.mock.calls[1][0].sql).toContain('job_name LIKE')

    state.query = {}
    state.body = 'params%5BbeginTime%5D=2026-08-01&params%5BendTime%5D=2026-08-12'
    state.pool.query.mockReset()
      .mockResolvedValueOnce([[{ total: 1 }], []])
      .mockResolvedValueOnce([[{
        job_log_id: 4, job_name: '库存同步', job_group: 'SYSTEM', invoke_target: 'tkTask.sync', job_message: '执行成功', status: '0', exception_info: null,
      }], []])

    const jobLogResult = await jobLogHandler({})
    expect(decodeWorkbook(jobLogResult)).toEqual([
      ['日志序号', '任务名称', '任务组名', '调用目标字符串', '日志信息', '执行状态', '异常信息'],
      [4, '库存同步', 'SYSTEM', 'tkTask.sync', '执行成功', '正常', ''],
    ])
    expect(state.pool.query.mock.calls[0][0].sql).toContain('create_time < DATE_ADD(DATE(?), INTERVAL 1 DAY)')
    expect(state.pool.query.mock.calls[0][1]).toEqual(['2026-08-01', '2026-08-12'])
    expect(state.pool.query.mock.calls[1][0].sql).not.toContain('LIMIT ?, ?')
  })
})
