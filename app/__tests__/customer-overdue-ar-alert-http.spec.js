import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ session: { userId: 1, userName: 'admin' }, allowed: true, body: { enabled: true, totalReceiver: 'A' }, query: {}, writes: vi.fn(), preview: vi.fn() }))
vi.mock('h3', () => ({ getQuery: () => state.query, setResponseHeader: vi.fn() }))
vi.mock('../../server/utils/auth', () => ({ getAuthSession: async () => state.session ? { session: state.session } : null, hasPermission: () => state.allowed }))
vi.mock('../../server/utils/mysql', () => ({ mysqlQueryOptions: sql => ({ sql }), getMysqlPool: () => ({ query: state.writes }) }))
vi.mock('../../server/utils/write', () => ({
  bodyOf: async () => state.body,
  writeFail: (message, statusCode) => { throw Object.assign(new Error(message), { statusCode }) },
  withWriteSession: async (_event, _label, _permission, fn) => {
    if (!state.session) return { code: 401 }
    if (!state.allowed) return { code: 403 }
    try { return await fn(state.session, { query: state.writes }) }
    catch (e) { return { code: e.statusCode || 500, msg: e.message } }
  },
}))
vi.mock('../../server/utils/customer-overdue-ar-alert', () => ({
  OVERDUE_ALERT_ENABLED_KEY: 'tk.customerOverdueAr.weeklyEnabled', OVERDUE_ALERT_TOTAL_KEY: 'tk.customerOverdueAr.totalReceiver', readOverdueAlertSettings: async () => ({ enabled: false, totalReceiver: 'A' }),
  previewOverdueAlert: state.preview, renderOverdueAlertExcel: () => new Uint8Array([1]),
}))
vi.mock('../../server/utils/nitro-jobs/kucun-warning-send', () => ({ readWecomConfig: async () => ({}) }))
vi.mock('../../server/utils/sales-delivery-alert-read', () => ({ readAlertMembers: async () => [{ userid: 'A', name: '甲' }] }))
import { overdueAlertRead, overdueAlertSave } from '../../server/utils/customer-overdue-ar-alert-http'

beforeEach(() => {
  state.session = { userId: 1, userName: 'admin' }; state.allowed = true; state.body = { enabled: true, totalReceiver: 'A' }; state.query = {}
  state.writes.mockReset().mockResolvedValue([[]])
  state.preview.mockReset().mockResolvedValue({ plans: [{ userid: 'A', name: '甲', rows: [{ custCode: 'C1' }] }], unmatched: [], asOfDate: '2026-10-16', customerCount: 1 })
})
describe('周提醒管理边界', () => {
  it('未登录、无页面权限、普通用户不能看收件预览或改设置', async () => {
    state.session = null
    expect(await overdueAlertRead({}, 'preview')).toMatchObject({ code: 401 })
    state.session = { userId: 1 }
    state.allowed = false
    expect(await overdueAlertRead({}, 'preview')).toMatchObject({ code: 403 })
    state.allowed = true; state.session = { userId: 2 }
    expect(await overdueAlertRead({}, 'preview')).toMatchObject({ code: 403 })
    expect(await overdueAlertSave({})).toMatchObject({ code: 403 })
    expect(state.preview).not.toHaveBeenCalled()
    expect(state.writes).not.toHaveBeenCalled()
  })
  it('未匹配的负责人阻止启用，且不写配置', async () => {
    state.preview.mockResolvedValue({ unmatched: [{ owner: '甲' }] })
    expect(await overdueAlertSave({})).toMatchObject({ code: 400 })
    expect(state.writes).not.toHaveBeenCalled()
  })
  it('有效配置检查状态表后保存，关闭时不依赖金蝶和通讯录', async () => {
    expect(await overdueAlertSave({})).toMatchObject({ code: 200, data: { enabled: true } })
    expect(state.writes.mock.calls[0][0].sql).toContain('tk_overdue_ar_alert_run')
    state.preview.mockReset().mockRejectedValue(new Error('外部断线'))
    state.body = { enabled: false, totalReceiver: 'A' }
    expect(await overdueAlertSave({})).toMatchObject({ code: 200, data: { enabled: false } })
    expect(state.preview).not.toHaveBeenCalled()
  })
  it('多个总表账号去重保存，任意失效账号拒绝写入', async () => {
    state.body = { enabled: true, totalReceiver: ' A, A ' }
    expect(await overdueAlertSave({})).toMatchObject({ code: 200, data: { totalReceiver: 'A' } })
    state.writes.mockClear()
    state.body.totalReceiver = 'A,missing'
    expect(await overdueAlertSave({})).toMatchObject({ code: 400 })
    expect(state.writes).not.toHaveBeenCalled()
  })
  it('仅导出预览中存在的接收人分表', async () => {
    state.query = { recipient: 'other' }
    expect(await overdueAlertRead({}, 'export')).toMatchObject({ code: 400 })
    state.query = { recipient: 'A' }
    expect(await overdueAlertRead({}, 'export')).toBeInstanceOf(Uint8Array)
  })
})
