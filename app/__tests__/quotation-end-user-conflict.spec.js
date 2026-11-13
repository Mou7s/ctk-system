import { beforeEach, describe, expect, it, vi } from 'vitest'
import { extractEndUserMatchProfile, isQuotationEndUserConflict } from '@ctk-system/shared'

const state = vi.hoisted(() => ({
  query: {},
  authenticated: {
    token: 'test-token',
    session: {
      userId: 7,
      deptId: 1,
      userName: 'salesA',
      user: { userId: 7, userName: 'salesA', nickName: '业务员甲' },
      roles: [],
      permissions: ['tk_custom:quotation:upload'],
    },
  },
  permission: true,
  rows: [],
  pool: { query: vi.fn() },
}))

vi.mock('h3', () => ({
  getQuery: vi.fn(() => state.query),
  getRouterParam: vi.fn(() => '100'),
  getHeader: vi.fn(() => undefined),
  setHeader: vi.fn(),
  readBody: vi.fn(async () => ({})),
  readMultipartFormData: vi.fn(async () => []),
}))

vi.mock('../../server/utils/auth.ts', () => ({
  getAuthSession: vi.fn(async () => state.authenticated),
  hasPermission: vi.fn((session, permission) => {
    if (!state.permission) return false
    return Array.isArray(session?.permissions) && session.permissions.includes(permission)
  }),
}))

vi.mock('../../server/utils/mysql.ts', () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}))

vi.mock('../../server/utils/redis.ts', () => ({
  getGarnet: vi.fn(() => ({ get: vi.fn(), set: vi.fn(), del: vi.fn() })),
}))

describe('外贸报价单终端客户冲突匹配规则与接口', () => {
  it('忽略备货、库存、EMS、品牌商等通用词，不产生误报', () => {
    const noiseList = [
      '',
      '备货',
      '库存备货',
      '常备库存，系统价格，给大家做历史价格参考',
      '客户备库存',
      'EMS',
      '品牌商',
      '终端',
      '政府',
      '出自己品牌',
      '用于价格审核',
      'N/A',
      'TBD',
    ]
    for (const item of noiseList) {
      expect(extractEndUserMatchProfile(item).valid, `「${item}」应当被识别为无效/噪音词`).toBe(false)
    }
    expect(isQuotationEndUserConflict('备货', '库存备货')).toBe(false)
    expect(isQuotationEndUserConflict('EMS', 'EMS')).toBe(false)
    expect(isQuotationEndUserConflict('ABC Electronics India Pvt Ltd', 'XYZ Electronics India Pvt Ltd')).toBe(false)
  })

  it('不需要输入全称即可识别同一终端客户（真实业务样本对拍）', () => {
    const positivePairs = [
      ['VVDN', 'Vvdn Technologies Private Limited'],
      ['TYRI', 'TYRI INTELLIGENT  LIGHTING SOLUTIONS'],
      ['ACCORD', 'Accord Power Conversion Pvt Ltd.'],
      ['IFB', 'IFB Industries'],
      ['Axiom', 'Axiom Energy Conversion Private Limited'],
      ['HERO', 'Hero MotoCorp'],
      ['Eternity', 'Ergen ， Eternity Green'],
      ['electrowynk industries', 'Eagle Electric/ ELECTROWYNK'],
      ['ILJIN ELECTRONICS (I) Pvt. Ltd.', 'ILJIN ELECTRONICS INDIA PVT LTD'],
      ['Ei EMS India Pvt. Ltd', 'Ei EMS India Pvt. Ltd.,'],
      ['INTERCODE', 'INTERCODE-未告知'],
      ['INTERCODE', 'INTERCODE（无终端客户）'],
      ['Binary', 'BINARY-备货'],
      ['SINGOD', 'SINGODIA ELECTRONICS (P) LTD.'],
      ['汉胜', '汉胜未来科技'],
    ]

    for (const [a, b] of positivePairs) {
      expect(isQuotationEndUserConflict(a, b), `「${a}」与「${b}」应当判定为冲突`).toBe(true)
      expect(isQuotationEndUserConflict(b, a), `「${b}」与「${a}」应当判定为冲突`).toBe(true)
    }
  })

  describe('checkQuotationEndUserConflict 接口权限与脱敏控制', () => {
    let checkQuotationEndUserConflict
    let findQuotationEndUserConflicts

    beforeEach(async () => {
      ;({ checkQuotationEndUserConflict, findQuotationEndUserConflicts } = await import(
        '../../server/utils/quotation-end-user-conflict.ts'
      ))
      state.permission = true
      state.query = { endUser: 'VVDN' }
      state.rows = [
        {
          id: 88,
          quoteNo: 'BJ20261015001',
          headerEndUser: 'Vvdn Technologies Private Limited',
          lineEndUser: '',
          salespersonId: 9,
          salespersonName: '业务员乙',
          quoteDate: '2026-10-15',
          status: 'APPROVED',
        },
        {
          id: 89,
          quoteNo: 'BJ20261016002',
          headerEndUser: 'Halonix',
          lineEndUser: '',
          salespersonId: 10,
          salespersonName: '业务员丙',
          quoteDate: '2026-10-16',
          status: 'PENDING_SECOND',
        },
      ]
      state.pool.query.mockReset().mockResolvedValue([state.rows, []])
    })

    it('普通业务员调用时只返回冲突标志与匹配名，不暴露其他业务员姓名和单号', async () => {
      state.authenticated.session = {
        userId: 7,
        deptId: 1,
        userName: 'salesA',
        user: { userId: 7, userName: 'salesA', nickName: '业务员甲' },
        roles: [],
        permissions: ['tk_custom:quotation:upload'],
      }

      const res = await checkQuotationEndUserConflict({})
      expect(res.code).toBe(200)
      expect(res.data).toEqual({
        hasConflict: true,
        conflictCount: 1,
        matchedEndUsers: ['Vvdn Technologies Private Limited'],
        conflicts: [],
      })
    })

    it('二审/终审审核人调用时返回完整冲突单据详情（含业务员姓名、单号、状态）', async () => {
      state.authenticated.session = {
        userId: 2,
        deptId: 1,
        userName: 'reviewer',
        user: { userId: 2, userName: 'reviewer', nickName: '审核人' },
        roles: [],
        permissions: ['tk_custom:quotation:list', 'tk_custom:quotation:secondReview'],
      }

      const res = await checkQuotationEndUserConflict({})
      expect(res.code).toBe(200)
      expect(res.data.hasConflict).toBe(true)
      expect(res.data.conflictCount).toBe(1)
      expect(res.data.conflicts).toEqual([
        {
          id: 88,
          quoteNo: 'BJ20261015001',
          endUser: 'Vvdn Technologies Private Limited',
          salespersonId: 9,
          salespersonName: '业务员乙',
          quoteDate: '2026-10-15',
          status: 'APPROVED',
          statusLabel: '已通过',
        },
      ])
    })

    it('findQuotationEndUserConflicts 查询条件排除本人单据、当前编辑单据、草稿与已删除单据', async () => {
      const list = await findQuotationEndUserConflicts(state.pool, 'VVDN', 7, 100)
      expect(list).toHaveLength(1)
      const [options, params] = state.pool.query.mock.calls[0]
      expect(options.sql).toContain("q.business_type = 'FOREIGN'")
      expect(options.sql).toContain("q.status NOT IN ('DELETED', 'DRAFT')")
      expect(options.sql).toContain('q.salesperson_id <> ?')
      expect(options.sql).toContain('q.id <> ?')
      expect(params).toEqual([7, 100])
    })
  })
})
