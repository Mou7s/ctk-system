import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ rows: [], sql: '', inputs: {}, remarks: new Map() }))
vi.mock('../../server/utils/sqlserver', () => ({
  queryK3SqlServer: async execute => (await execute({
    input: (name, value) => { state.inputs[name] = value },
    query: async sql => { state.sql = sql; return { recordset: state.rows } },
  })).recordset,
  sqlStringParameter: vi.fn(),
}))
vi.mock('../../server/utils/customer-overdue-ar-remark', () => ({
  overdueArRemarkKey: (custCode, currencyCode) => `${String(custCode ?? '').trim().toUpperCase()}::${String(currencyCode ?? '').trim().toUpperCase()}`,
  readOverdueArRemarkMap: async () => state.remarks,
}))
import { queryCustomerOverdueAr, queryCustomerOverdueArBills } from '../../server/utils/customer-overdue-ar'

describe('逾期应收原币金额', () => {
  beforeEach(() => { state.rows = []; state.sql = ''; state.inputs = {}; state.remarks = new Map() })

  it('跟单员、跟单员1、跟单员2各自映射，三个姓名均可搜索', async () => {
    state.rows = [{ custCode: 'C1', merchandiserName: '甲', merchandiser1Name: '乙', merchandiser2Name: '丙', merchandiser1No: 'E1', merchandiser2No: 'E2' }]
    for (const keyword of ['甲', '乙', '丙']) {
      const result = await queryCustomerOverdueAr({ keyword })
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0]).toMatchObject({ merchandiserName: '甲', merchandiser1Name: '乙', merchandiser2Name: '丙', merchandiser1No: 'E1', merchandiser2No: 'E2' })
    }
    expect(state.sql).toContain('m1.FID = c.F_UNW_BASE_KYB_W5C')
    expect(state.sql).toContain('m2.FID = c.F_ADKB_BASE_83G')
    expect(state.sql).toContain('m1l.FNAME AS merchandiser1Name')
    expect(state.sql).toContain('m2l.FNAME AS merchandiser2Name')
  })

  it('列表与明细排除暂估应收单（FSETACCOUNTTYPE=2）', async () => {
    await queryCustomerOverdueAr()
    expect(state.sql).toContain("AND ISNULL(r.FSETACCOUNTTYPE, '') <> '2'")
    await queryCustomerOverdueArBills('C1')
    expect(state.sql).toContain("AND ISNULL(r.FSETACCOUNTTYPE, '') <> '2'")
  })

  it('按收款核销状态筛选，不能用开票状态排除已开票未收款单', async () => {
    for (const run of [() => queryCustomerOverdueAr(), () => queryCustomerOverdueArBills('C1')]) {
      await run()
      expect(state.sql).toContain("r.FWRITTENOFFSTATUS IN ('A', 'B')")
      expect(state.sql).not.toContain('FOPENSTATUS')
    }
  })

  it('汇总与明细均在聚合前排除期初单，普通单继续按收款核销筛选', async () => {
    for (const run of [() => queryCustomerOverdueAr(), () => queryCustomerOverdueArBills('C1')]) {
      await run()
      expect(state.sql).toContain("AND ISNULL(r.FISINIT, '0') <> '1'")
      expect(state.sql.indexOf("AND ISNULL(r.FISINIT, '0') <> '1'")).toBeLessThan(state.sql.indexOf('GROUP BY r.FID'))
      expect(state.sql).toContain("r.FWRITTENOFFSTATUS IN ('A', 'B')")
    }
  })

  it('逾期天数条件在客户汇总之前作用于每张单据，明细沿用相同条件', async () => {
    await queryCustomerOverdueAr({ minOverdueDays: 90 })
    expect(state.inputs.minOverdueDays).toBe(90)
    expect(state.sql.indexOf('DATEDIFF(day, o.FENDDATE, CAST(GETDATE() AS date)) >= @minOverdueDays')).toBeLessThan(state.sql.indexOf('GROUP BY c.FNUMBER'))
    expect(state.sql).toContain('DATEDIFF(day, o.FENDDATE, CAST(GETDATE() AS date)) >= @minOverdueDays')
    await queryCustomerOverdueArBills('C1', { minOverdueDays: 90, currencyCode: 'PRE007' })
    expect(state.inputs.minOverdueDays).toBe(90)
    expect(state.sql).toContain('DATEDIFF(day, FENDDATE, CAST(GETDATE() AS date)) >= @minOverdueDays')
    expect(state.sql).toContain("(@currencyCode = '' OR cu.FNUMBER = @currencyCode)")
  })

  it('留空时查询全部逾期单据', async () => {
    await queryCustomerOverdueAr()
    expect(state.inputs.minOverdueDays).toBe(0)
    await queryCustomerOverdueArBills('C1')
    expect(state.inputs.minOverdueDays).toBe(0)
  })

  it('同一客户不同币种分别合计，客户数去重且不生成跨币种总金额', async () => {
    state.rows = [
      { custCode: 'C1', currencyCode: 'PRE007', currencyName: '美元', openAmt: 502.75, billCnt: 3 },
      { custCode: 'C2', currencyCode: 'PRE007', currencyName: '美元', openAmt: 346.15, billCnt: 2 },
      { custCode: 'C1', currencyCode: 'PRE001', currencyName: '人民币', openAmt: 100, billCnt: 1 },
    ]
    const result = await queryCustomerOverdueAr()
    expect(result.summary).toMatchObject({ customerCount: 2, billCount: 6, openAmt: null })
    expect(result.summary.amountsByCurrency).toEqual([
      { currencyCode: 'PRE007', currencyName: '美元', openAmt: 848.9 },
      { currencyCode: 'PRE001', currencyName: '人民币', openAmt: 100 },
    ])
    expect(state.sql).toContain('r.FCURRENCYID')
    expect(state.sql).toContain('GROUP BY c.FNUMBER,\n         cu.FNUMBER,')
  })

  it('单币种汇总保留数值并携带真实币种，筛选仍然生效', async () => {
    state.rows = [
      { custCode: 'C1', currencyCode: 'PRE007', currencyName: '美元', openAmt: 502.75, billCnt: 3 },
      { custCode: 'C2', currencyCode: 'PRE007', currencyName: '美元', openAmt: 346.15, billCnt: 2 },
    ]
    const result = await queryCustomerOverdueAr({ keyword: 'C2' })
    expect(result.summary.openAmt).toBe(346.15)
    expect(result.summary.amountsByCurrency).toEqual([{ currencyCode: 'PRE007', currencyName: '美元', openAmt: 346.15 }])
  })

  it('明细保留每张单据币种及原币金额', async () => {
    state.rows = [{ billNo: 'AR1', currencyCode: 'PRE007', currencyName: '美元', billAmt: 296.7, openAmt: 296.7, writtenAmt: 0 }]
    const result = await queryCustomerOverdueArBills('C2')
    expect(result.rows[0]).toMatchObject(state.rows[0])
    expect(state.sql).toContain('cu.FCURRENCYID = bill.FCURRENCYID')
  })

  it('按客户+币种合并备注不串号，且关键字搜索可命中备注内容', async () => {
    state.rows = [
      { custCode: 'CTK000197', custName: '示例客户A', currencyCode: 'PRE001', currencyName: '人民币', openAmt: 9220.8, billCnt: 5 },
      { custCode: 'CTK000197', custName: '示例客户A', currencyCode: 'PRE007', currencyName: '美元', openAmt: 120, billCnt: 1 },
    ]
    state.remarks = new Map([
      ['CTK000197::PRE001', {
        custCode: 'CTK000197',
        currencyCode: 'PRE001',
        remark: '9,220.80元已转质保金，2027年4月份到期',
        updatedBy: 'admin',
        updatedAt: '2026-11-20 09:00:00',
      }],
    ])

    const allResult = await queryCustomerOverdueAr()
    expect(allResult.rows[0]).toMatchObject({
      currencyCode: 'PRE001',
      remark: '9,220.80元已转质保金，2027年4月份到期',
      remarkUpdatedBy: 'admin',
      remarkUpdatedAt: '2026-11-20 09:00:00',
    })
    expect(allResult.rows[1]).toMatchObject({
      currencyCode: 'PRE007',
      remark: '',
      remarkUpdatedBy: '',
      remarkUpdatedAt: null,
    })

    const matched = await queryCustomerOverdueAr({ keyword: '2027年4月份到期' })
    expect(matched.rows).toHaveLength(1)
    expect(matched.rows[0].currencyCode).toBe('PRE001')
  })
})
