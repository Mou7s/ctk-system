import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  session: { userId: 1, userName: 'admin', ipaddr: '127.0.0.1' },
  allowed: true,
  body: { custCode: 'ctk000197', currencyCode: 'pre001', remark: '9,220.80元已转质保金，2027年4月份到期' },
  poolQuery: vi.fn(),
  txQuery: vi.fn(),
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
}))

vi.mock('h3', () => ({
  readBody: vi.fn(async () => state.body),
  getHeader: vi.fn(() => ''),
  getRequestURL: vi.fn(() => new URL('http://localhost/prod-api/tk_custom/customerOverdueAr/remark')),
}))

vi.mock('../../server/utils/auth', () => ({
  AUTH_SESSION_PREFIX: 'auth_sessions:',
  getAuthSession: vi.fn(async () => (state.session ? { session: state.session } : null)),
  hasPermission: vi.fn(() => state.allowed),
  saveAuthSession: vi.fn(),
}))

vi.mock('../../server/utils/mysql', () => ({
  mysqlQueryOptions: (sql) => ({ sql }),
  getMysqlPool: () => ({
    query: state.poolQuery,
    getConnection: async () => ({
      query: state.txQuery,
      beginTransaction: state.beginTransaction,
      commit: state.commit,
      rollback: state.rollback,
      release: state.release,
    }),
  }),
}))

import {
  OVERDUE_AR_REMARK_MAX_LENGTH,
  overdueArRemarkKey,
  overdueArRemarkSave,
  readOverdueArRemarkMap,
} from '../../server/utils/customer-overdue-ar-remark'

describe('客户逾期应收备注', () => {
  beforeEach(() => {
    state.session = { userId: 1, userName: 'admin', ipaddr: '127.0.0.1' }
    state.allowed = true
    state.body = { custCode: 'ctk000197', currencyCode: 'pre001', remark: '9,220.80元已转质保金，2027年4月份到期' }
    state.poolQuery.mockReset()
    state.txQuery.mockReset()
    state.beginTransaction.mockReset().mockResolvedValue(undefined)
    state.commit.mockReset().mockResolvedValue(undefined)
    state.rollback.mockReset().mockResolvedValue(undefined)
    state.release.mockReset()
  })

  it('键名生成会去除空白并统一转大写', () => {
    expect(overdueArRemarkKey(' ctk000197 ', ' pre001 ')).toBe('CTK000197::PRE001')
    expect(overdueArRemarkKey(null, undefined)).toBe('::')
  })

  it('读取备注表正常映射到 Map；缺表降级为空 Map，其它异常继续抛出', async () => {
    state.poolQuery.mockResolvedValueOnce([[
      {
        cust_code: 'ctk000197',
        currency_code: 'pre001',
        remark: '9,220.80元已转质保金，2027年4月份到期',
        updated_by: 'admin',
        updated_at: '2026-11-20 09:00:00',
      },
      {
        cust_code: 'CTK000198',
        currency_code: 'PRE001',
        remark: '   ',
        updated_by: 'admin',
        updated_at: '2026-11-20 09:00:00',
      },
    ]])
    const map = await readOverdueArRemarkMap()
    expect(map.size).toBe(1)
    expect(map.get('CTK000197::PRE001')).toEqual({
      custCode: 'CTK000197',
      currencyCode: 'PRE001',
      remark: '9,220.80元已转质保金，2027年4月份到期',
      updatedBy: 'admin',
      updatedAt: '2026-11-20 09:00:00',
    })

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    state.poolQuery.mockRejectedValueOnce(Object.assign(new Error("Table 'wfs.tk_overdue_ar_remark' doesn't exist"), { code: 'ER_NO_SUCH_TABLE' }))
    const fallbackMap = await readOverdueArRemarkMap()
    expect(fallbackMap.size).toBe(0)
    warnSpy.mockRestore()

    state.poolQuery.mockRejectedValueOnce(new Error('MySQL connection lost'))
    await expect(readOverdueArRemarkMap()).rejects.toThrow('MySQL connection lost')
  })

  it('未登录、无页面权限、非管理员返回对应错误且不写入数据库', async () => {
    state.session = null
    await expect(overdueArRemarkSave({ node: { req: { method: 'PUT', socket: {} } } })).resolves.toMatchObject({ code: 401 })

    state.session = { userId: 1, userName: 'admin', ipaddr: '127.0.0.1' }
    state.allowed = false
    await expect(overdueArRemarkSave({ node: { req: { method: 'PUT', socket: {} } } })).resolves.toMatchObject({ code: 403 })

    state.allowed = true
    state.session = { userId: 2, userName: 'zhangyi', ipaddr: '127.0.0.1' }
    await expect(overdueArRemarkSave({ node: { req: { method: 'PUT', socket: {} } } })).resolves.toMatchObject({
      code: 403,
      msg: '仅管理员可维护逾期备注',
    })
    expect(state.txQuery).not.toHaveBeenCalled()
    expect(state.rollback).toHaveBeenCalledTimes(1)
  })

  it('客户编码为空、币种超长或备注超过 500 字返回 400', async () => {
    state.body = { custCode: '   ', currencyCode: 'PRE001', remark: '备注' }
    await expect(overdueArRemarkSave({ node: { req: { method: 'PUT', socket: {} } } })).resolves.toMatchObject({ code: 400 })

    state.body = { custCode: 'CTK000197', currencyCode: 'A'.repeat(33), remark: '备注' }
    await expect(overdueArRemarkSave({ node: { req: { method: 'PUT', socket: {} } } })).resolves.toMatchObject({ code: 400 })

    state.body = { custCode: 'CTK000197', currencyCode: 'PRE001', remark: '字'.repeat(OVERDUE_AR_REMARK_MAX_LENGTH + 1) }
    await expect(overdueArRemarkSave({ node: { req: { method: 'PUT', socket: {} } } })).resolves.toMatchObject({
      code: 400,
      msg: '备注长度不能超过500个字符',
    })
    expect(state.txQuery).not.toHaveBeenCalled()
  })

  it('管理员保存备注执行 UPSERT 并写入操作日志', async () => {
    state.txQuery
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ updated_at: '2026-11-20 09:10:00' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])

    const res = await overdueArRemarkSave({ node: { req: { method: 'PUT', socket: {} } } })
    expect(res).toEqual({
      code: 200,
      msg: '备注已保存',
      data: {
        custCode: 'CTK000197',
        currencyCode: 'PRE001',
        remark: '9,220.80元已转质保金，2027年4月份到期',
        updatedBy: 'admin',
        updatedAt: '2026-11-20 09:10:00',
      },
    })
    expect(state.txQuery.mock.calls[0][0].sql).toContain('ON DUPLICATE KEY UPDATE')
    expect(state.txQuery.mock.calls[0][1]).toEqual([
      'CTK000197',
      'PRE001',
      '9,220.80元已转质保金，2027年4月份到期',
      'admin',
    ])
    expect(state.txQuery.mock.calls[2][0].sql).toContain('INSERT INTO sys_oper_log')
    expect(state.commit).toHaveBeenCalledTimes(1)
  })

  it('管理员提交空备注执行 DELETE 清空并写入操作日志', async () => {
    state.body = { custCode: 'ctk000197', currencyCode: 'pre001', remark: '   ' }
    state.txQuery.mockResolvedValue([{ affectedRows: 1 }])

    const res = await overdueArRemarkSave({ node: { req: { method: 'PUT', socket: {} } } })
    expect(res).toEqual({
      code: 200,
      msg: '备注已清空',
      data: {
        custCode: 'CTK000197',
        currencyCode: 'PRE001',
        remark: '',
        updatedBy: 'admin',
        updatedAt: null,
      },
    })
    expect(state.txQuery.mock.calls[0][0].sql).toContain('DELETE FROM tk_overdue_ar_remark')
    expect(state.txQuery.mock.calls[0][1]).toEqual(['CTK000197', 'PRE001'])
    expect(state.txQuery.mock.calls[1][0].sql).toContain('INSERT INTO sys_oper_log')
    expect(state.commit).toHaveBeenCalledTimes(1)
  })

  it('写入时若备注表尚未创建则返回 503', async () => {
    state.txQuery.mockRejectedValueOnce(Object.assign(new Error("Table 'wfs.tk_overdue_ar_remark' doesn't exist"), { errno: 1146 }))
    const res = await overdueArRemarkSave({ node: { req: { method: 'PUT', socket: {} } } })
    expect(res).toMatchObject({
      code: 503,
      msg: '备注表 tk_overdue_ar_remark 尚未创建，请先导入建表 SQL',
    })
    expect(state.rollback).toHaveBeenCalledTimes(1)
  })
})
