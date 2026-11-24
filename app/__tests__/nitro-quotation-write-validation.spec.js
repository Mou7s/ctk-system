import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../server/utils/quotation-number', () => ({
  allocateQuotationNumber: vi.fn(async () => 'CTK202610220001'),
}))

const state = vi.hoisted(() => ({
  body: {},
  params: {},
  authenticated: {
    token: 'test-token',
    session: {
      userId: 1,
      deptId: 1,
      userName: 'admin',
      user: { userId: 1, userName: 'admin', nickName: '管理员' },
      roles: [],
      permissions: [],
    },
  },
  connection: {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi.fn(),
    execute: vi.fn(),
  },
  pool: { getConnection: vi.fn() },
  garnet: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
}))

vi.mock('h3', () => ({
  readBody: vi.fn(async () => state.body),
  getRouterParam: vi.fn((_event, name) => state.params[name]),
  getHeader: vi.fn(() => undefined),
  getQuery: vi.fn(() => ({})),
  setHeader: vi.fn(),
  readMultipartFormData: vi.fn(async () => []),
}))

vi.mock('../../server/utils/auth.ts', () => ({
  getAuthSession: vi.fn(async () => state.authenticated),
  hasPermission: vi.fn(() => true),
}))

vi.mock('../../server/utils/mysql.ts', () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}))

vi.mock('../../server/utils/redis.ts', () => ({
  getGarnet: vi.fn(() => state.garnet),
}))

// 报价单写接口的入参校验跑在写事务包装之外。若 NitroWriteError 直接逃出 handler，
// Nitro 会渲染成 HTTP 500 的 h3 错误页（{"error":true,...}），前端拿不到 msg，只能显示
// 「网络连接异常」/「报价单保存失败」——用户就看不到「客户不能为空」这类真实原因。
describe('Nitro quotation write validation responses', () => {
  let createQuotation
  let reviewQuotation
  let deleteQuotation
  let updateQuotationDraft
  let withdrawQuotation
  let createDomesticQuotation
  let updateDomesticQuotationDraft
  let consoleError

  beforeEach(async () => {
    ;({ createQuotation, reviewQuotation, deleteQuotation, updateQuotationDraft, withdrawQuotation, createDomesticQuotation, updateDomesticQuotationDraft } = await import('../../server/utils/quotation.ts'))
    state.body = {}
    state.params = {}
    state.pool.getConnection.mockReset().mockResolvedValue(state.connection)
    state.connection.execute.mockReset().mockResolvedValue([{ insertId: 1 }])
    state.connection.query.mockReset().mockResolvedValue([[], []])
    state.garnet.get.mockReset().mockResolvedValue(null)
    state.garnet.set.mockReset().mockResolvedValue('OK')
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => consoleError.mockRestore())

  it('returns the validation reason as a body instead of throwing an h3 error', async () => {
    state.body = []
    const response = await createQuotation({})

    expect(response).toMatchObject({ code: 500, msg: '请求参数不符合规范' })
  })

  it('explains the missing customer when submitting an empty quotation', async () => {
    state.body = { action: 'submit', quoteDate: '2026-09-14' }
    const response = await createQuotation({})

    expect(response).toMatchObject({ code: 500, msg: '客户不能为空' })
  })

  it('explains a malformed action', async () => {
    state.body = { action: 'publish' }
    const response = await createQuotation({})

    expect(response).toMatchObject({ code: 500, msg: '报价单保存动作不符合规范' })
  })

  it.each([' Mumbai ', '', undefined])('persists optional header city %s with matching SQL parameters', async (city) => {
    state.body = { action: 'save', city, lines: [{ ctkMpn: 'CTK-1' }] }
    const response = await createQuotation({})
    expect(response.code).toBe(200)
    const [options, params] = state.connection.execute.mock.calls.find(([options]) => options.sql.includes('INSERT INTO tk_quotation\n'))
    expect(options.sql).toContain('city')
    expect(params.at(-1)).toBe(city?.trim() || '')
    expect(options.sql.match(/\?/g)).toHaveLength(params.length)
  })

  it('rejects an overlong city before opening a database transaction', async () => {
    state.body = { action: 'save', city: 'a'.repeat(129), lines: [{ ctkMpn: 'CTK-1' }] }
    const response = await createQuotation({})
    expect(response.code).not.toBe(200)
    expect(response.msg).toContain('城市')
    expect(state.pool.getConnection).not.toHaveBeenCalled()
  })

  it('updates and clears a draft city without losing SQL parameter alignment', async () => {
    state.params = { id: '10' }
    state.connection.query.mockResolvedValue([[{ id: 10, salesperson_id: 1, status: 'DRAFT', city: 'Mumbai' }], []])
    state.body = { action: 'save', city: '', lines: [{ ctkMpn: 'CTK-1' }] }
    expect((await updateQuotationDraft({})).code).toBe(200)
    const [options, params] = state.connection.execute.mock.calls.find(([options]) => options.sql.includes("SET input_mode = 'FORM'"))
    expect(options.sql).toContain('city = ?')
    expect(params.at(-3)).toBe('')
    expect(options.sql.match(/\?/g)).toHaveLength(params.length)
  })

  it.each(['create', 'update'])('内贸%s在city迁移前仍可保存PCS价格', async (mode) => {
    state.params = { id: '129' }
    state.body = { action: 'save', customerName: 'test', customerStyle: '终端', lines: [{ ctkMpn: '1N4448WT', unit: 'PCS', minPackCount: 8000, originalPriceRmb: 0.001 }] }
    state.connection.query.mockResolvedValue([[{ id: 129, salesperson_id: 1, status: 'RETURNED' }], []])
    state.connection.execute.mockImplementation(async (options) => {
      if (/\bcity\b/iu.test(options.sql)) throw new Error("Unknown column 'city' in 'field list'")
      return [{ insertId: 129 }]
    })
    const res = await (mode === 'create' ? createDomesticQuotation({}) : updateDomesticQuotationDraft({}))
    expect(res.code).toBe(200)
    const header = state.connection.execute.mock.calls.find(([options]) => options.sql.includes(mode === 'create' ? 'INSERT INTO tk_quotation\n' : "SET input_mode = 'FORM'"))
    expect(header[0].sql).not.toMatch(/\bcity\b/u)
    expect(header[0].sql.match(/\?/gu)).toHaveLength(header[1].length)
    const line = state.connection.execute.mock.calls.find(([options]) => options.sql.includes('INSERT INTO tk_quotation_line'))
    expect(line[1][11]).toBe('KPCS')
    expect(line[1][17]).toBe(1)
    expect(line[1][28]).toBe(8)
  })

  it('explains an invalid review stage', async () => {
    state.body = { id: 5, stage: 'middle', action: 'approve' }
    const response = await reviewQuotation({})

    expect(response).toMatchObject({ code: 500, msg: '审核阶段不符合规范' })
  })

  it('explains an invalid draft id before touching the database', async () => {
    state.body = { action: 'save' }
    state.params = { id: 'abc' }
    const response = await updateQuotationDraft({})

    expect(response).toMatchObject({ code: 500, msg: '报价单ID不符合规范' })
    expect(state.connection.beginTransaction).not.toHaveBeenCalled()
  })

  it('keeps the id guard for delete as a body response too', async () => {
    state.params = { id: '0' }
    const response = await deleteQuotation({})

    expect(response).toMatchObject({ code: 500, msg: '报价单ID不符合规范' })
  })

  it('keeps the id guard for withdraw as a body response too', async () => {
    state.params = { id: '0' }
    const response = await withdrawQuotation({})

    expect(response).toMatchObject({ code: 500, msg: '报价单ID不符合规范' })
  })

  it.each([
    ['FOREIGN', 'initial', 'PENDING_SECOND', 'PENDING_INITIAL', 'APPROVE_INITIAL'],
    ['FOREIGN', 'second', 'PENDING_FINAL', 'PENDING_SECOND', 'APPROVE_SECOND'],
    ['FOREIGN', 'final', 'APPROVED', 'PENDING_FINAL', 'APPROVE_FINAL'],
    ['DOMESTIC', 'initial', 'PENDING_SECOND', 'PENDING_INITIAL', 'APPROVE_INITIAL'],
    ['DOMESTIC', 'second', 'PENDING_FINAL', 'PENDING_SECOND', 'APPROVE_SECOND'],
    ['DOMESTIC', 'final', 'APPROVED', 'PENDING_FINAL', 'APPROVE_FINAL'],
    ['DOMESTIC', 'initial', 'PENDING_FINAL', 'PENDING_INITIAL', 'APPROVE_INITIAL_TO_FINAL'],
  ])('undo restores prices and records audit for %s %s', async (business, stage, status, previousStatus, action) => {
    state.body = { id: 10, stage, action: 'undo' }
    const header = { id: 10, status, [`${stage}_reviewer_id`]: 1 }
    const previous = { header: { status: previousStatus }, lines: [{ id: 20, initialPriceRmb: 10, initialPriceUsd: 2, finalPriceRmb: 12, finalPriceUsd: 3 }] }
    state.connection.query
      .mockResolvedValueOnce([[header]])
      .mockResolvedValueOnce([[{ id: 20 }]])
      .mockResolvedValueOnce([[{ action, operator_id: 1 }, { snapshot_json: JSON.stringify(previous) }]])
    const handler = business === 'DOMESTIC' ? (await import('../../server/utils/quotation.ts')).reviewDomesticQuotation : reviewQuotation
    const response = await handler({})
    expect(response).toMatchObject({ code: 200, data: { status: previousStatus } })
    const updates = state.connection.execute.mock.calls
    expect(updates.find(([sql]) => sql.sql.includes('UPDATE tk_quotation_line'))[1]).toEqual([10, 2, 12, 3, 20, 10])
    expect(updates.find(([sql]) => sql.sql.includes('INSERT INTO tk_quotation_revision'))[1][2]).toBe(`UNDO_${stage.toUpperCase()}`)
  })

  it.each([
    ['APPROVED', 'second', 1, 'APPROVE_FINAL'],
    ['PENDING_FINAL', 'second', 2, 'APPROVE_SECOND'],
    ['PENDING_FINAL', 'second', 1, 'UNDO_SECOND'],
  ])('blocks stale, other reviewer or repeated undo %s %s %s %s', async (status, stage, reviewer, action) => {
    state.body = { id: 10, stage, action: 'undo' }
    state.connection.query
      .mockResolvedValueOnce([[{ id: 10, status, [`${stage}_reviewer_id`]: reviewer }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ action, operator_id: 1 }, { snapshot_json: '{}' }]])
    expect((await reviewQuotation({})).code).toBe(409)
    expect(state.connection.execute).not.toHaveBeenCalled()
  })

  it('rejects withdraw if status is not PENDING_INITIAL', async () => {
    state.params = { id: '10' }
    state.connection.query.mockResolvedValueOnce([[{ id: 10, salesperson_id: 1, status: 'DRAFT', quote_no: 'Q123' }], []])
    const response = await withdrawQuotation({})

    expect(response).toMatchObject({ code: 409, msg: '只有待初审状态的报价单可以撤回' })
  })

  it('withdraws PENDING_INITIAL quotation to DRAFT successfully', async () => {
    state.params = { id: '10' }
    state.connection.query.mockResolvedValueOnce([[{ id: 10, salesperson_id: 1, status: 'PENDING_INITIAL', quote_no: 'Q123' }], []])
    const response = await withdrawQuotation({})

    expect(response).toMatchObject({ code: 200, msg: '报价单已成功撤回为草稿', data: { id: 10, status: 'DRAFT' } })
  })

  // 用户口径：单价入库前统一两位小数（人民币/美元同口径）
  // 新口径（2026-09-16）：人民币单价 + 汇率入库，千只美元价由「人民币 ÷ 汇率」算出，不接受手填。
  it('derives the USD price from the RMB price and the rate before inserting lines', async () => {
    state.body = {
      action: 'save',
      customerName: '客户A',
      lines: [{
        ctkMpn: 'SMF36CA',
        country: '印度',
        customerStyle: '分销商',
        qty: 500,
        unit: 'kpcs',
        originalPriceRmb: 54,
        rate: 7.2,
      }],
    }

    const response = await createQuotation({})
    expect(response).toMatchObject({ code: 200 })

    const lineInsert = state.connection.execute.mock.calls
      .find(([options]) => String(options?.sql || '').includes('INSERT INTO tk_quotation_line'))
    expect(lineInsert).toBeTruthy()
    const params = lineInsert[1]
    // 列顺序：... 17=人民币单价, 18=汇率, 19=千只美元价
    expect(params[17]).toBe(54)
    expect(params[18]).toBe(7.2)
    expect(params[19]).toBe(7.5)
    // 手填的美元价被忽略（不采信）
    expect(params).not.toContain(12.4444)
  })

  // 反向对照：说明这个包装确实是把异常转成了 body（而不是把断言写成永远成立）
  it('converts NitroWriteError to a code/msg body and still rethrows real crashes', async () => {
    const { withQuotationWriteBody } = await import('../../server/utils/quotation.ts')
    const { NitroWriteError } = await import('../../server/utils/write.ts')

    const wrapped = withQuotationWriteBody(async () => { throw new NitroWriteError('测试原因', 409) })
    await expect(wrapped({})).resolves.toEqual({ code: 409, msg: '测试原因' })

    const passthrough = withQuotationWriteBody(async () => { throw new Error('真实崩溃') })
    await expect(passthrough({})).rejects.toThrow('真实崩溃')
  })

  it('rejects option columns that are not in the dropdown lists', async () => {

    state.body = {

      action: 'submit',

      customerName: '客户A',

      endUser: 'VVDN',

      lines: [{ application: '照明', ctkMpn: 'CTK-1', qty: 100, unit: 'kpos', originalPriceRmb: 54, rate: 7.2, country: '印度X', customerStyle: '未知性质' }],

    }

    const response = await createQuotation({})

    expect(response.code).toBe(500)

    expect(response.msg).toContain('第1行国家「印度X」')

    expect(response.msg).toContain('不在下拉选项内')
    // 选项校验在写事务里先失败：不该走到 INSERT
    expect(state.connection.execute).not.toHaveBeenCalled()
  })

  it('accepts option columns that match the dropdown lists', async () => {

    state.body = {

      action: 'submit',

      customerName: '客户A',

      endUser: 'VVDN',

      lines: [{ application: '照明', ctkMpn: 'CTK-1', qty: 100, unit: 'kpcs', originalPriceRmb: 54, rate: 7.2, country: '印度', customerStyle: '分销商' }],

    }

    const response = await createQuotation({})

    expect(response.msg).not.toContain('不在下拉选项内')

  })

  it('requires endUser and application on foreign submit, while allowing missing ctkMpn, qty, or originalPriceRmb', async () => {
    state.body = {
      action: 'submit',
      customerName: '客户A',
      endUser: '',
      lines: [{ application: '照明', rate: 6.7 }],
    }
    expect(await createQuotation({})).toMatchObject({ code: 500, msg: '终端客户不能为空' })

    state.body = {
      action: 'submit',
      customerName: '客户A',
      endUser: 'VVDN',
      lines: [{ ctkMpn: 'CTK-1', rate: 6.7 }],
    }
    expect(await createQuotation({})).toMatchObject({ code: 500, msg: '第1行必须填写应用' })

    state.body = {
      action: 'submit',
      customerName: '客户A',
      endUser: 'VVDN',
      lines: [{ application: '工业控制', rate: 6.7 }],
    }
    expect(await createQuotation({})).toMatchObject({ code: 200 })
  })

  it('creates a domestic online quotation with the template fields and no foreign quantity or exchange rate', async () => {
    state.body = {
      action: 'submit',
      customerName: '内贸客户',
      contactText: '王先生',
      quoteDate: '2026-09-27',
      lines: [{
        application: '电源产品',
        customerMaterialName: '客户产品名',
        minPackCount: 3000,
        ctkMpn: 'CTK-DOM-1',
        packageName: 'SOT-23',
        unit: '只',
        originalPriceRmb: '1.25',
        remark: '内贸备注',
      }],
    }

    const response = await createDomesticQuotation({})

    expect(response).toMatchObject({ code: 200, data: { status: 'PENDING_INITIAL' } })
    const headerInsert = state.connection.execute.mock.calls.find(([options]) => String(options?.sql || '').includes('INSERT INTO tk_quotation\n'))
    expect(headerInsert[1][0]).toBe('DOMESTIC')
    const lineInsert = state.connection.execute.mock.calls.find(([options]) => String(options?.sql || '').includes('INSERT INTO tk_quotation_line'))
    const params = lineInsert[1]
    expect(params[2]).toBe('2026-09-27')
    expect(params[3]).toBe('中国')
    expect(params[7]).toBe('电源产品')
    expect(params[10]).toBeNull()
    expect(params[11]).toBe('KPCS')
    expect(params[12]).toBe('CTK-DOM-1')
    expect(params[13]).toBe('')
    expect(params[14]).toBe('SOT-23')
    expect(params[17]).toBe(1250)
    expect(params[18]).toBeNull()
    expect(params[19]).toBeNull()
    expect(params[21]).toBe('内贸备注')
    expect(params[23]).toBe(1250)
    expect(params[27]).toBe('客户产品名')
    expect(params[28]).toBe(3)
    expect(params).toHaveLength(29)
  })

  it.each(['分销商', '代理商', '终端', 'EMS', '品牌商', '其他'])('persists domestic header and line customer style %s', async (customerStyle) => {
    state.body = { action: 'save', customerName: '内贸客户', customerStyle, customerAddress: '客户地址', customerPhone: '010-12345678', lines: [{ ctkMpn: 'CTK-1', originalPriceRmb: 1.25, customerStyle: '终端' }] }
    const response = await createDomesticQuotation({})
    expect(response.code).toBe(200)
    const header = state.connection.execute.mock.calls.find(([options]) => String(options?.sql || '').includes('INSERT INTO tk_quotation\n'))
    const line = state.connection.execute.mock.calls.find(([options]) => String(options?.sql || '').includes('INSERT INTO tk_quotation_line'))
    expect(header[1][6]).toBe(customerStyle)
    expect(header[1].slice(-3)).toEqual(['客户地址', '010-12345678', ''])
    expect(header[1][10]).toBe('现金')
    expect(header[0].sql.match(/\?/gu)).toHaveLength(header[1].length)
    expect(line[1][4]).toBe(customerStyle)
  })

  it('rejects an unknown domestic customer style before opening a transaction', async () => {
    state.body = { action: 'save', customerName: '内贸客户', customerStyle: '未知性质', lines: [{ ctkMpn: 'CTK-1', originalPriceRmb: 1.25 }] }
    const response = await createDomesticQuotation({})
    expect(response.code).not.toBe(200)
    expect(response.msg).toContain('客户性质')
    expect(state.pool.getConnection).not.toHaveBeenCalled()
  })

  it('updates the customer style on a domestic draft and its replacement lines', async () => {
    state.params = { id: '17' }
    state.body = { action: 'save', customerName: '内贸客户', customerStyle: 'EMS', paymentTerm: '银行转账', customerApplication: '汽车电子', lines: [{ ctkMpn: 'CTK-1', originalPriceRmb: 1.25 }] }
    state.connection.query.mockResolvedValueOnce([[{ id: 17, salesperson_id: 1, status: 'DRAFT' }], []])
    const response = await updateDomesticQuotationDraft({})
    expect(response.code).toBe(200)
    const header = state.connection.execute.mock.calls.find(([options]) => String(options?.sql || '').includes("SET input_mode = 'FORM'"))
    const line = state.connection.execute.mock.calls.find(([options]) => String(options?.sql || '').includes('INSERT INTO tk_quotation_line'))
    expect(header[1][4]).toBe('EMS')
    expect(header[1][8]).toBe('银行转账')
    expect(header[1][14]).toBe('汽车电子')
    expect(header[0].sql.match(/\?/gu)).toHaveLength(header[1].length)
    expect(line[1][4]).toBe('EMS')
  })

  it('validates customer style read from the domestic workbook', async () => {
    const h3 = await import('h3')
    const parser = await import('../../server/utils/quotation-parser.ts')
    const parseWorkbook = vi.spyOn(parser, 'parseDomesticQuotationWorkbook').mockReturnValue({ customerStyle: '未知性质', lines: [] })
    h3.readMultipartFormData.mockResolvedValueOnce([
      { name: 'file', filename: '报价.xlsx', data: Buffer.from('workbook') },
      { name: 'customerStyle', data: Buffer.from('未知性质') },
    ])
    try {
      const { uploadDomesticQuotation } = await import('../../server/utils/quotation.ts')
      const response = await uploadDomesticQuotation({})
      expect(response.code).not.toBe(200)
      expect(response.msg).toContain('客户性质')
      expect(state.pool.getConnection).not.toHaveBeenCalled()
    } finally {
      parseWorkbook.mockRestore()
    }
  })

  it('validates domestic online rows with the workbook rules before writing', async () => {
    state.body = {
      action: 'save',
      customerName: '内贸客户',
      lines: [{ application: '电源产品', originalPriceRmb: 1.25 }],
    }

    const response = await createDomesticQuotation({})

    expect(response).toMatchObject({ code: 500, msg: '第1行必须填写型号' })
    expect(state.connection.execute).not.toHaveBeenCalled()
  })

  it('uses the domestic draft rules for JSON updates and rejects missing customer before opening a transaction', async () => {
    state.params = { id: '17' }
    state.body = { action: 'save' }

    const response = await updateDomesticQuotationDraft({})

    expect(response).toMatchObject({ code: 500, msg: '客户不能为空' })
    expect(state.pool.getConnection).not.toHaveBeenCalled()
  })

  it.each(['DOMESTIC', 'FOREIGN'])('saves more than 500 %s detail rows without truncation', async (businessType) => {
    state.body = {
      action: 'save',
      customerName: '内贸客户',
      lines: Array.from({ length: 501 }, (_, index) => ({
        ctkMpn: `CTK-DOM-${index + 1}`,
        originalPriceRmb: 1,
      })),
    }

    const response = await (businessType === 'DOMESTIC' ? createDomesticQuotation : createQuotation)({})

    expect(response.code).toBe(200)
    expect(state.connection.execute.mock.calls.filter(([sql]) => String(sql.sql).includes('INSERT INTO tk_quotation_line'))).toHaveLength(501)
  })

  it('rejects malformed PCS packing quantity instead of silently clearing it', async () => {
    state.body = { action: 'save', customerName: '客户', lines: [{ ctkMpn: 'CTK-1', unit: 'PCS', originalPriceRmb: 1, minPackCount: 'abc' }] }
    expect(await createDomesticQuotation({})).toMatchObject({ code: 500, msg: '第1行最小包装数必须为正数，KPCS最多6位小数' })
    expect(state.connection.execute).not.toHaveBeenCalled()
  })

  it.each([0, -1, 0.0000001, 'abc'])('rejects invalid domestic minimum packing count %s before writing', async (minPackCount) => {
    state.body = { action: 'save', customerName: '客户', lines: [{ ctkMpn: 'CTK-1', originalPriceRmb: 1, minPackCount }] }
    expect(await createDomesticQuotation({})).toMatchObject({ code: 500, msg: '第1行最小包装数必须为正数，KPCS最多6位小数' })
    expect(state.connection.execute).not.toHaveBeenCalled()
  })

})
