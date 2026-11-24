import { beforeEach, describe, expect, it, vi } from 'vitest'
import XLSX from 'xlsx-js-style'

const state = vi.hoisted(() => ({ enabled: true, claimed: false, rows: [], members: [], queries: [], send: vi.fn(), upload: vi.fn() }))
vi.mock('../../server/utils/mysql', () => ({
  mysqlQueryOptions: sql => ({ sql }),
  getMysqlPool: () => ({ query: async (options, params) => {
    const sql = options.sql
    state.queries.push({ sql, params })
    if (sql.startsWith('SELECT config_key')) return [[{ config_key: 'tk.customerOverdueAr.weeklyEnabled', config_value: state.enabled ? '1' : '0' }, { config_key: 'tk.customerOverdueAr.totalReceiver', config_value: 'A' }]]
    if (sql.startsWith('INSERT IGNORE')) {
      const affectedRows = state.claimed ? 0 : 1
      state.claimed = true
      return [{ affectedRows }]
    }
    return [{ affectedRows: 1 }]
  } }),
}))
vi.mock('../../server/utils/customer-overdue-ar', () => ({ queryCustomerOverdueAr: async () => ({ rows: state.rows, asOfDate: '2026-10-16', summary: { customerCount: state.rows.length } }) }))
vi.mock('../../server/utils/sales-delivery-alert-read', () => ({ readAlertMembers: async () => state.members }))
vi.mock('../../server/utils/nitro-jobs/kucun-warning-send', () => ({
  readWecomConfig: async () => ({}), uploadWarningExcelMedia: state.upload, sendFileToUser: state.send,
}))
import { overdueAlertDue, overdueRecipientPlans, renderOverdueAlertExcel, runWeeklyOverdueAlert } from '../../server/utils/customer-overdue-ar-alert'

const row = (custCode, names = {}) => ({ custCode, custName: custCode, currencyCode: 'PRE007', currencyName: '美元', openAmt: 100, billCnt: 1, earliestDue: '2026-09-30', maxOverdueDays: 16, avgOverdueDays: 16, merchandiserName: '', merchandiser1Name: '', merchandiser2Name: '', sellerName: '', remark: '', ...names })

beforeEach(() => {
  state.enabled = true; state.claimed = false; state.queries = []
  state.rows = [row('C1', { merchandiserName: '甲', merchandiser1Name: '甲', sellerName: '乙' }), row('C2', { merchandiser2Name: '丙' })]
  state.members = [{ userid: 'A', name: '跟单甲' }, { userid: 'B', name: '乙' }, { userid: 'C', name: '丙' }]
  state.send.mockReset().mockResolvedValue(undefined)
  state.upload.mockReset().mockResolvedValue('media')
})

describe('客户逾期应收周提醒', () => {
  it('按北京时间周五08:00调度，其他日期及08:00前不发', () => {
    expect(overdueAlertDue(new Date('2026-10-16T00:00:00Z'))).toBe(true)
    expect(overdueAlertDue(new Date('2026-10-15T23:59:59Z'))).toBe(false)
    expect(overdueAlertDue(new Date('2026-10-17T00:00:00Z'))).toBe(false)
    expect(overdueAlertDue(new Date('2026-10-16T04:00:00Z'))).toBe(true)
  })
  it('四种角色都分发，跨角色去重且不包含无关客户', () => {
    const { plans } = overdueRecipientPlans(state.rows, state.members)
    expect(plans.map(p => [p.userid, p.rows.map(r => r.custCode)])).toEqual([['A', ['C1']], ['B', ['C1']], ['C', ['C2']]])
  })
  it('本人收到全部客户总表，个人表不扩权；兼任负责人时只发总表一份', () => {
    const members = [...state.members, { userid: 'ME', name: '本人' }]
    const { plans } = overdueRecipientPlans(state.rows, members, 'ME')
    expect(plans).toHaveLength(4)
    expect(plans.find(p => p.userid === 'ME')).toMatchObject({ total: true, rows: state.rows })
    expect(plans.find(p => p.userid === 'B').rows.map(r=>r.custCode)).toEqual(['C1'])
    const own = overdueRecipientPlans(state.rows, members, 'A').plans
    expect(own.filter(p=>p.userid==='A')).toHaveLength(1)
    expect(own.find(p=>p.userid==='A').rows).toHaveLength(2)
  })
  it('多个总表账号各得全部客户，兼任负责人或重复配置时只发一份', () => {
    const members = [...state.members, { userid: 'reviewer01', name: '审单员' }]
    const result = overdueRecipientPlans(state.rows, members, ' A, reviewer01,A ')
    expect(result.invalidTotal).toBe(false)
    expect(result.plans.filter(p => p.total).map(p => p.userid)).toEqual(['A', 'reviewer01'])
    for (const plan of result.plans.filter(p => p.total)) expect(plan.rows).toEqual(state.rows)
    expect(result.plans.filter(p => p.userid === 'A')).toHaveLength(1)
    expect(result.plans.find(p => p.userid === 'B').rows.map(r => r.custCode)).toEqual(['C1'])
    expect(overdueRecipientPlans(state.rows, members, 'A,missing').invalidTotal).toBe(true)
  })
  it('按环境变量跳过指定负责人姓名，其他漏配仍记录；未配置时不跳过', () => {
    const prev = process.env.NUXT_OVERDUE_AR_IGNORED_OWNERS
    try {
      delete process.env.NUXT_OVERDUE_AR_IGNORED_OWNERS
      const withoutEnv = overdueRecipientPlans([row('C1', { merchandiserName: '忽略人甲', merchandiser1Name: '新姓名' })], [])
      expect(withoutEnv.skipped).toEqual([])
      expect(withoutEnv.unmatched).toEqual([{ customer: 'C1', owner: '忽略人甲' }, { customer: 'C1', owner: '新姓名' }])

      process.env.NUXT_OVERDUE_AR_IGNORED_OWNERS = '忽略人甲, 忽略人乙'
      const { unmatched, skipped } = overdueRecipientPlans([row('C1', { merchandiserName: '忽略人甲', merchandiser1Name: '新姓名' })], [])
      expect(skipped).toEqual([{ customer: 'C1', owner: '忽略人甲' }])
      expect(unmatched).toEqual([{ customer: 'C1', owner: '新姓名' }])
    } finally {
      if (prev === undefined) delete process.env.NUXT_OVERDUE_AR_IGNORED_OWNERS
      else process.env.NUXT_OVERDUE_AR_IGNORED_OWNERS = prev
    }
  })
  it('同名工作号不猜发、不回退到个人号，空负责人不发', () => {
    const { plans, unmatched } = overdueRecipientPlans([row('C1', { merchandiserName: '甲' }), row('C2')], [
      { userid: 'A', name: '跟单甲' }, { userid: 'AA', name: '跟单甲' }, { userid: 'P', name: '甲' },
    ])
    expect(plans).toEqual([])
    expect(unmatched).toEqual([{ customer: 'C1', owner: '甲' }, { customer: 'C2', owner: '未维护负责人' }])
  })
  it('Excel只包含分配的客户、带第13列备注且按币种分别合计', () => {
    const buffer = renderOverdueAlertExcel([
      row('C1', { remark: '9,220.80元已转质保金，2027年4月份到期' }),
      row('C3', { currencyCode: 'PRE001', currencyName: '人民币', openAmt: 200 }),
    ], '甲', '2026-10-16')
    const book = XLSX.read(buffer, { type: 'array' })
    const sheet = book.Sheets['客户逾期应收']
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 })
    expect(data[1][12]).toBe('备注')
    expect(data[2][0]).toBe('C1')
    expect(data[2][3]).toBe(100)
    expect(data[2][12]).toBe('9,220.80元已转质保金，2027年4月份到期')
    expect(sheet['!merges']).toEqual([{ s: { r: 0, c: 0 }, e: { r: 0, c: 12 } }])
    expect(sheet['!autofilter']).toEqual({ ref: 'A2:M4' })
    expect(JSON.stringify(data)).not.toContain('C2')
    expect(XLSX.utils.sheet_to_json(book.Sheets['币种合计'], { header: 1 })).toEqual([['币种', '逾期未收合计'], ['美元', 100], ['人民币', 200]])
  })
  it('日期锁防止重复运行及重复附件，同一人只发一份', async () => {
    const now = new Date('2026-10-16T00:00:00Z')
    expect(await runWeeklyOverdueAlert(now)).toMatchObject({ skipped: false, sent: 3, failed: 0 })
    expect(await runWeeklyOverdueAlert(now)).toEqual({ skipped: true })
    expect(state.send).toHaveBeenCalledTimes(3)
    expect(state.queries.some(q => q.sql.includes("status='sending'"))).toBe(true)
  })
  it('关闭、非周五或无客户时不调用企微发送', async () => {
    state.enabled = false
    expect(await runWeeklyOverdueAlert(new Date('2026-10-16T00:00:00Z'))).toEqual({ skipped: true })
    state.enabled = true
    expect(await runWeeklyOverdueAlert(new Date('2026-10-17T00:00:00Z'))).toEqual({ skipped: true })
    state.rows = []
    expect(await runWeeklyOverdueAlert(new Date('2026-10-16T00:00:00Z'))).toMatchObject({ sent: 0 })
    expect(state.send).not.toHaveBeenCalled()
  })
  it('发送超时记录待核对，不自动重试', async () => {
    state.send.mockRejectedValue(new Error('发送超时'))
    const now = new Date('2026-10-16T00:00:00Z')
    expect(await runWeeklyOverdueAlert(now)).toMatchObject({ sent: 0, failed: 3 })
    await runWeeklyOverdueAlert(now)
    expect(state.send).toHaveBeenCalledTimes(3)
    expect(state.queries.filter(q => q.sql.includes("'uncertain'")).length).toBe(3)
  })
})
