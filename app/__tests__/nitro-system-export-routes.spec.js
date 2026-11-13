import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx/xlsx.mjs'

const state = vi.hoisted(() => ({
  authenticated: { session: { userId: 1, userName: 'admin', roles: [] } },
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
  dataScopeFragment: vi.fn(async () => ({ sql: '', params: [] })),
  queryNumber: (value, fallback = 0) => {
    const parsed = Number(Array.isArray(value) ? value[0] ?? '' : value ?? '')
    return Number.isFinite(parsed) ? parsed : fallback
  },
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

function queueRows(rows) {
  state.pool.query
    .mockResolvedValueOnce([[{ total: rows.length }], []])
    .mockResolvedValueOnce([rows, []])
}

describe('Nitro system Excel export routes', () => {
  let handlers

  beforeAll(async () => {
    handlers = {
      user: (await import('../../server/routes/prod-api/system/user/export.post.ts')).default,
      role: (await import('../../server/routes/prod-api/system/role/export.post.ts')).default,
      post: (await import('../../server/routes/prod-api/system/post/export.post.ts')).default,
      config: (await import('../../server/routes/prod-api/system/config/export.post.ts')).default,
      dictData: (await import('../../server/routes/prod-api/system/dict/data/export.post.ts')).default,
      dictType: (await import('../../server/routes/prod-api/system/dict/type/export.post.ts')).default,
    }
  })

  beforeEach(() => {
    state.authenticated = { session: { userId: 1, userName: 'admin', roles: [] } }
    state.query = {}
    state.body = {}
    state.pool.query.mockReset()
    state.setResponseHeader.mockReset()
  })

  it('exports user rows with Java column order, translations, and data-scope parameters', async () => {
    state.query = { userName: '张', status: '0' }
    queueRows([{
      user_id: 42,
      user_name: 'zhang',
      nick_name: '张三',
      email: 'zhang@example.test',
      phonenumber: '13000000000',
      sex: '0',
      status: '0',
      login_ip: '127.0.0.1',
      login_date: '2026-08-12 08:00:00',
      dept_name: '研发部',
      leader: '李四',
    }])

    const result = await handlers.user({})

    expect(decodeWorkbook(result)).toEqual([
      ['用户序号', '登录名称', '用户名称', '用户邮箱', '手机号码', '用户性别', '帐号状态', '最后登录IP', '最后登录时间', '部门名称', '部门负责人'],
      [42, 'zhang', '张三', 'zhang@example.test', '13000000000', '男', '正常', '127.0.0.1', '2026-08-12 08:00:00', '研发部', '李四'],
    ])
    expect(state.pool.query.mock.calls[1][0].sql).toContain('u.user_name LIKE')
    expect(state.setResponseHeader).toHaveBeenCalledWith(expect.anything(), 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  })

  it('supports the six system export handlers and parses nested date-range form fields', async () => {
    const cases = [
      ['role', { role_name: '仓库', role_key: 'warehouse', role_sort: 2, role_id: 7, data_scope: '3', status: '1' }, ['角色序号', '角色名称', '角色权限', '角色排序', '数据范围', '角色状态'], [7, '仓库', 'warehouse', 2, '本部门数据权限', '停用']],
      ['post', { post_id: 8, post_code: 'operator', post_name: '操作员', post_sort: 1, status: '0' }, ['岗位序号', '岗位编码', '岗位名称', '岗位排序', '状态'], [8, 'operator', '操作员', 1, '正常']],
      ['config', { config_id: 9, config_name: '站点', config_key: 'site.url', config_value: 'https://example.test', config_type: 'Y' }, ['参数主键', '参数名称', '参数键名', '参数键值', '系统内置'], [9, '站点', 'site.url', 'https://example.test', '是']],
      ['dictData', { dict_code: 10, dict_sort: 1, dict_label: '启用', dict_value: '0', dict_type: 'sys_status', is_default: 'Y', status: '0' }, ['字典编码', '字典排序', '字典标签', '字典键值', '字典类型', '是否默认', '状态'], [10, 1, '启用', '0', 'sys_status', '是', '正常']],
      ['dictType', { dict_id: 11, dict_name: '状态', dict_type: 'sys_status', status: '0' }, ['字典主键', '字典名称', '字典类型', '状态'], [11, '状态', 'sys_status', '正常']],
    ]

    for (const [kind, row, headers, values] of cases) {
      state.query = {}
      state.body = kind === 'config' ? 'params%5BbeginTime%5D=2026-08-01&params%5BendTime%5D=2026-08-12' : {}
      queueRows([row])
      const result = await handlers[kind]({})
      expect(decodeWorkbook(result)).toEqual([headers, values])
      if (kind === 'config') {
        expect(state.pool.query.mock.calls[4][1]).toEqual(['2026-08-01', '2026-08-12'])
      }
    }
  })

  it('requires authentication before reading any export data', async () => {
    state.authenticated = null
    await expect(handlers.config({})).resolves.toEqual({ code: 401, msg: '登录状态已过期' })
    expect(state.pool.query).not.toHaveBeenCalled()
  })
})
