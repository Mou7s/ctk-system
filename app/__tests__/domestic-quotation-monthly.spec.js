import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx/xlsx.mjs'

const state = vi.hoisted(() => ({ query: vi.fn(), send: vi.fn(), upload: vi.fn(), claimed: false, rows: [], settings: true, members: [{ userid: 'finance-test', name: '财务蔡主管' }], permissions: ['tk_custom:domesticQuotation:analysis'] }))
vi.mock('../../server/utils/mysql.ts', () => ({ getMysqlPool: () => ({ query: state.query }), mysqlQueryOptions: sql => ({ sql }) }))
vi.mock('../../server/utils/nitro-jobs/kucun-warning-send.ts', () => ({ readWecomConfig: vi.fn(async () => ({})), uploadWarningExcelMedia: state.upload, sendFileToUser: state.send }))
vi.mock('../../server/utils/auth.ts', () => ({ getAuthSession: async () => ({ session: { userId: 9, permissions: state.permissions } }), hasPermission: (session, permission) => session.permissions.includes(permission) }))
vi.mock('h3', () => ({ getQuery: () => ({}), setHeader: vi.fn() }))

import { monthlyQuotationDue, monthlyQuotationPeriod, queryMonthlyQuotations, renderMonthlyQuotationExcel, runMonthlyQuotationReport, MONTHLY_ENABLED_KEY, MONTHLY_RECEIVER_KEY } from '../../server/utils/domestic-quotation-monthly.ts'
import { domesticMonthlyQuotationRead } from '../../server/utils/domestic-quotation-monthly-http.ts'

const due = new Date('2026-11-20T00:00:00Z')
const quote = { id: 1, quote_no: 'BJ-1', customer_name: '测试客户', payment_term: '月结30天', customer_application: '电源', final_review_time: '2026-11-19 23:59:59', line_count: 2, report_line_no: 1, report_model: 'CTK-1', report_price: '1.25', report_unit: 'KPCS' }

beforeEach(() => {
  state.claimed = false
  state.rows = [quote]
  state.settings = true
  state.members = [{ userid: 'finance-test', name: '财务蔡主管' }]
  state.permissions = ['tk_custom:domesticQuotation:analysis']
  state.send.mockReset().mockResolvedValue(undefined)
  state.upload.mockReset().mockResolvedValue('media-test')
  state.query.mockReset().mockImplementation(async (options) => {
    const sql = options.sql
    if (sql.includes('FROM sys_config')) return [[{ config_key: MONTHLY_ENABLED_KEY, config_value: state.settings ? '1' : '0' }, { config_key: MONTHLY_RECEIVER_KEY, config_value: '财务蔡主管' }], []]
    if (sql.includes('FROM wxuser')) return [state.members, []]
    if (sql.includes('INSERT IGNORE')) {
      const affectedRows = state.claimed ? 0 : 1
      state.claimed = true
      return [{ affectedRows }]
    }
    if (sql.includes('FROM tk_quotation q')) return [state.rows, []]
    return [[], []]
  })
})

describe('内贸月结报价财务月报', () => {
  it('按北京时间20日08点触发，仅当日补发', () => {
    expect(monthlyQuotationDue(new Date('2026-11-19T23:59:59Z'))).toBe(false)
    expect(monthlyQuotationDue(due)).toBe(true)
    expect(monthlyQuotationDue(new Date('2026-11-20T15:59:59Z'))).toBe(true)
    expect(monthlyQuotationDue(new Date('2026-11-20T16:00:00Z'))).toBe(false)
  })
  it('跨年和闰月仍为上月20日至本月19日', () => {
    expect(monthlyQuotationPeriod(due)).toMatchObject({ from: '2026-10-20', to: '2026-11-19', endExclusive: '2026-11-20' })
    expect(monthlyQuotationPeriod(due, '2027-01').from).toBe('2026-12-20')
    expect(monthlyQuotationPeriod(due, '2028-03').from).toBe('2028-02-20')
    expect(() => monthlyQuotationPeriod(due, '2026-13')).toThrow()
  })
  it('在数据库分页前限定内贸、终审通过、月结和半开终审时间区间', async () => {
    await queryMonthlyQuotations(monthlyQuotationPeriod(due))
    const [options, params] = state.query.mock.calls[0]
    expect(options.sql).toContain("q.business_type = 'DOMESTIC' AND q.status = 'APPROVED'")
    expect(options.sql).toContain("TRIM(COALESCE(q.payment_term, '')) LIKE '月结%'")
    expect(options.sql).toContain('q.final_review_time >= ? AND q.final_review_time < ?')
    expect(params).toEqual(['2026-10-20 00:00:00', '2026-11-20 00:00:00', 20001])
    state.rows = Array.from({ length: 20001 }, () => quote)
    await expect(queryMonthlyQuotations(monthlyQuotationPeriod(due))).rejects.toThrow('超过20000行')
  })
  it('报价按单汇总、明细完整且单价保持数值，缺终审价不取原价', () => {
    const buffer = renderMonthlyQuotationExcel([quote, { ...quote, report_line_no: 2, report_price: null, original_price_rmb: 99 }], monthlyQuotationPeriod(due))
    const book = XLSX.read(buffer, { type: 'buffer' })
    expect(book.SheetNames).toEqual(['报价汇总', '报价明细'])
    const headers = XLSX.utils.sheet_to_json(book.Sheets['报价汇总'], { header: 1 })
    expect(headers).toHaveLength(4)
    expect(headers[3][4]).toBe('电源')
    expect(book.Sheets['报价明细'].N4).toMatchObject({ t: 'n', v: 0.00125 })
    expect(book.Sheets['报价明细'].N5?.v || '').toBe('')
    expect(headers[1][0]).toContain('不是实际应收或收款')
  })
  it('同一期重复执行或重启重放只发送一次', async () => {
    expect(await runMonthlyQuotationReport(due)).toMatchObject({ sent: true })
    expect(await runMonthlyQuotationReport(due)).toEqual({ skipped: true })
    expect(state.send).toHaveBeenCalledTimes(1)
    expect(state.send).toHaveBeenCalledWith({}, 'finance-test', 'media-test')
  })
  it('关闭或不到时间不领用发送任务', async () => {
    expect(await runMonthlyQuotationReport(new Date('2026-11-19T23:00:00Z'))).toEqual({ skipped: true })
    expect(state.query).not.toHaveBeenCalled()
    state.settings = false
    expect(await runMonthlyQuotationReport(due)).toEqual({ skipped: true })
    expect(state.claimed).toBe(false)
  })
  it('多人同名拒发，准备失败保留本期记录，不盲目重试', async () => {
    state.members.push({ userid: 'other', name: '财务蔡主管' })
    expect(await runMonthlyQuotationReport(due)).toMatchObject({ sent: false, uncertain: false })
    expect(state.send).not.toHaveBeenCalled()
    expect(await runMonthlyQuotationReport(due)).toEqual({ skipped: true })
  })
  it('发送超时标记待核对，不自动重复发送', async () => {
    state.send.mockRejectedValueOnce(new Error('timeout'))
    expect(await runMonthlyQuotationReport(due)).toMatchObject({ sent: false, uncertain: true })
    expect(await runMonthlyQuotationReport(due)).toEqual({ skipped: true })
    expect(state.query.mock.calls.some(([o, p]) => o.sql.includes('error_message=?') && p[0] === 'uncertain')).toBe(true)
    expect(state.send).toHaveBeenCalledTimes(1)
  })
  it('上传附件期间关闭开关时取消发送', async () => {
    state.upload.mockImplementationOnce(async () => { state.settings = false; return 'media-test' })
    expect(await runMonthlyQuotationReport(due)).toMatchObject({ sent: false, uncertain: false })
    expect(state.send).not.toHaveBeenCalled()
  })
  it('未导入配置前，状态接口返回关闭，不读取尚不存在的发送记录表', async () => {
    state.query.mockResolvedValueOnce([[], []])
    expect(await domesticMonthlyQuotationRead({}, 'status')).toMatchObject({ code: 200, data: { enabled: false, recipientName: '', lastRun: null } })
    expect(state.query).toHaveBeenCalledTimes(1)
  })
  it('零月结单也发送空汇总，明确本期无报价', async () => {
    state.rows = []
    expect(await runMonthlyQuotationReport(due)).toMatchObject({ sent: true, rowCount: 0 })
    expect(state.send).toHaveBeenCalledTimes(1)
  })
  it('普通业务员及外贸汇总权限不能导出内贸全量月报', async () => {
    for (const permissions of [['tk_custom:domesticQuotation:list'], ['tk_custom:quotation:analysis']]) {
      state.permissions = permissions
      expect(await domesticMonthlyQuotationRead({}, 'export')).toMatchObject({ code: 403 })
    }
    expect(state.query).not.toHaveBeenCalled()
  })
})
