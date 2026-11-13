import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc'
import * as XLSX from 'xlsx/xlsx.mjs'
import { createDomesticQuotationApi } from '../packages/api/modules/domesticQuotation.js'

const backend = vi.hoisted(() => ({
  query: {},
  session: { userId: 42, permissions: ['tk_custom:domesticQuotation:list'] },
  pool: { query: vi.fn() },
  headers: {},
}))

vi.mock('h3', () => ({
  getQuery: vi.fn(() => backend.query),
  setHeader: vi.fn((_event, name, value) => { backend.headers[name] = value }),
  getHeader: vi.fn(),
  getRouterParam: vi.fn(),
  readMultipartFormData: vi.fn(),
}))
vi.mock('../../server/utils/auth.ts', () => ({
  getAuthSession: vi.fn(async () => ({ session: backend.session })),
  hasPermission: vi.fn((session, permission) => session.permissions.includes(permission) || session.permissions.includes('*:*:*')),
}))
vi.mock('../../server/utils/mysql.ts', () => ({
  getMysqlPool: vi.fn(() => backend.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}))
vi.mock('../../server/utils/read.ts', () => ({
  withReadSession: vi.fn(async (_event, _label, work) => work(backend.session, backend.pool)),
  queryText: (value) => String(Array.isArray(value) ? value[0] ?? '' : value ?? ''),
  pageRequest: vi.fn(),
  queryPage: vi.fn(),
}))

const PAGE = resolve(process.cwd(), 'app/pages/tk_custom/domesticQuotation/index.vue')
const ANALYSIS = resolve(process.cwd(), 'app/packages/ui/TkDomesticQuotationAnalysis.vue')
const API_ROUTE = resolve(process.cwd(), 'server/routes/prod-api/tk_custom/quotation/domestic/analysis.get.ts')
const EXPORT_ROUTE = resolve(process.cwd(), 'server/routes/prod-api/tk_custom/quotation/domestic/analysis-export.get.ts')
const SERVICE = resolve(process.cwd(), 'server/utils/quotation.ts')

const pageSource = readFileSync(PAGE, 'utf8')
const analysisSource = readFileSync(ANALYSIS, 'utf8')
const sharedAnalysisPath = resolve(process.cwd(), 'app/packages/ui/TkQuotationAnalysis.vue')
const sharedAnalysisSource = readFileSync(sharedAnalysisPath, 'utf8')
let getQuotationAnalysis
let exportQuotationAnalysis

beforeAll(async () => {
  ({ getQuotationAnalysis, exportQuotationAnalysis } = await import('../../server/utils/quotation.ts'))
})

beforeEach(() => {
  backend.query = {}
  backend.session = { userId: 42, permissions: ['tk_custom:domesticQuotation:list'] }
  backend.pool.query.mockReset()
  backend.headers = {}
})

function materialRow(overrides = {}) {
  return {
    quote_no: 'NJ20260901001',
    create_time: '2026-09-01 10:00:00',
    customer_name: '示例客户',
    salesperson_name: '业务员甲',
    line_no: 1,
    quote_to: '',
    end_user: '',
    ctk_mpn: 'CTK-01',
    package_name: 'QFN32',
    unit: 'pcs',
    country: '中国',
    customer_style: '终端',
    quote_date: '2026-09-01',
    lead_time: '',
    rate: null,
    original_price_rmb: 10,
    original_price_usd: null,
    initial_price_rmb: 9,
    initial_price_usd: null,
    final_price_rmb: 9,
    final_price_usd: null,
    ...overrides,
  }
}

function expectSfcCompiles(filename, source, id) {
  const { descriptor, errors } = parse(source, { filename })
  expect(errors).toEqual([])
  const script = compileScript(descriptor, { id })
  const template = compileTemplate({
    source: descriptor.template.content,
    filename,
    id,
    compilerOptions: { bindingMetadata: script.bindings },
  })
  expect(template.errors).toEqual([])
}

describe('内贸销售汇总分析', () => {
  it('搜索选项保留数据权限和其他条件，排除当前字段并限制返回数量', async () => {
    backend.query = { optionsField: 'manufacturerMpn', optionsSearch: 'LM', manufacturer: 'TI', manufacturerMpn: '旧选择' }
    backend.pool.query.mockResolvedValueOnce([[{ value: 'LM358' }], []])
    const response = await getQuotationAnalysis({}, 'DOMESTIC')
    const [config, params] = backend.pool.query.mock.calls[0]
    expect(config.sql).toContain('SELECT DISTINCT l.manufacturer_mpn AS value')
    expect(config.sql).toContain('l.manufacturer = ?')
    expect(config.sql).toContain('q.salesperson_id = ?')
    expect(config.sql).toContain('LIMIT 51')
    expect(params).toEqual(['DOMESTIC', 42, 'TI', 'LM'])
    expect(response.data).toEqual({ items: ['LM358'], hasMore: false })
  })
  it('选项字段使用白名单并提示还有更多匹配，选择值精确匹配', async () => {
    backend.query = { optionsField: 'city;DROP TABLE' }
    expect((await getQuotationAnalysis({}, 'DOMESTIC')).code).toBe(400)
    expect(backend.pool.query).not.toHaveBeenCalled()
    backend.query = { optionsField: 'customer' }
    backend.pool.query.mockResolvedValueOnce([Array.from({ length: 51 }, (_, index) => ({ value: `客户${index}` })), []])
    const result = await getQuotationAnalysis({}, 'DOMESTIC')
    expect(result.data.items).toHaveLength(50)
    expect(result.data.hasMore).toBe(true)
    backend.query = { customer: 'TI', filterMatch: 'exact', detailsOnly: '1' }
    backend.pool.query.mockResolvedValueOnce([[{ lineCount: 0 }], []])
    backend.pool.query.mockResolvedValueOnce([[], []])
    await getQuotationAnalysis({}, 'DOMESTIC')
    expect(backend.pool.query.mock.calls[1][0].sql).toContain('q.customer_name = ?')
  })
  it('外贸应用、友商、友商型号和国家筛选用于汇总、明细和完整导出', async () => {
    backend.session.permissions = ['tk_custom:quotation:list', 'tk_custom:quotation:analysis']
    backend.query = { customer: '客户甲', ctkMpn: 'CTK-LM358', application: '电源', manufacturer: 'TI', manufacturerMpn: 'LM358', country: '中国' }
    const line = materialRow({ application: '电源', manufacturer: 'TI', manufacturer_mpn: 'LM358', qty: '1000.5', status: 'APPROVED' })
    backend.pool.query.mockResolvedValueOnce([[{ lineCount: 1 }], []])
    backend.pool.query.mockResolvedValueOnce([[], []])
    backend.pool.query.mockResolvedValueOnce([[line], []])
    const workbook = XLSX.read(Buffer.from(await exportQuotationAnalysis({})), { type: 'buffer' })
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets['报价明细'], { header: 1, raw: true, defval: '' })
    expect(rows[0].slice(0, 12)).toEqual(['国家', '城市', '客户名称', '产品应用', '友商', '友商型号', 'CTK型号', '封装', '数量', '单位', '人民币单价(最终审核)', '人民币单价(业务员原价)'])
    expect(rows[1].slice(0, 12)).toEqual(['中国', '', '示例客户', '电源', 'TI', 'LM358', 'CTK-01', 'QFN32', 1000.5, 'pcs', 9, 10])
    for (const [config, params] of backend.pool.query.mock.calls) {
      expect(params).toEqual(['FOREIGN', '客户甲', 'CTK-LM358', '电源', 'TI', 'LM358', '中国'])
      expect(config.sql).toContain("l.application LIKE CONCAT('%', ?, '%')")
      expect(config.sql).toContain("l.manufacturer_mpn LIKE CONCAT('%', ?, '%')")
      expect(config.sql).toContain("COALESCE(NULLIF(q.country, ''), l.country) LIKE")
    }
    expect(workbook.Sheets['报价明细']['!autofilter']).toBeTruthy()
  })

  it('全部状态保留本人权限，待审核行不把中间审核价当最终价', async () => {
    backend.query = { status: 'ALL', detailsOnly: '1' }
    backend.pool.query.mockResolvedValueOnce([[{ lineCount: 1 }], []])
    backend.pool.query.mockResolvedValueOnce([[materialRow({ status: 'PENDING_FINAL', final_price_rmb: 9 })], []])
    const result = await getQuotationAnalysis({}, 'DOMESTIC')
    expect(backend.pool.query.mock.calls[0][1]).toEqual(['DOMESTIC', 42])
    expect(backend.pool.query.mock.calls[0][0].sql.split('WHERE')[1]).not.toContain("q.status = 'APPROVED'")
    expect(result.data.detailRows[0]).toMatchObject({ status: 'PENDING_FINAL', statusLabel: '待终审', originalPriceRmb: 10, finalPriceRmb: null })
  })

  it('非法状态在查询前拒绝，指定状态使用参数化筛选', async () => {
    backend.query = { status: "APPROVED' OR 1=1" }
    expect((await getQuotationAnalysis({}, 'DOMESTIC')).code).toBe(400)
    expect(backend.pool.query).not.toHaveBeenCalled()
    backend.query = { status: 'PENDING_INITIAL', detailsOnly: '1' }
    backend.pool.query.mockResolvedValueOnce([[{ lineCount: 0 }], []])
    backend.pool.query.mockResolvedValueOnce([[], []])
    await getQuotationAnalysis({}, 'DOMESTIC')
    expect(backend.pool.query.mock.calls[0][1]).toEqual(['DOMESTIC', 'PENDING_INITIAL', 42])
  })
  it('外贸也按单位拆分，返回最新、最低、最高价格与单据次数', async () => {
    backend.session.permissions = ['tk_custom:quotation:list']
    backend.pool.query.mockResolvedValueOnce([[{ lineCount: 2, quoteCount: 2 }], []])
    backend.pool.query.mockResolvedValueOnce([[{ customerName: '客户', ctkMpn: '型号', unit: 'KPCS', quoteCount: '2', latestFinalRmb: '12', minFinalRmb: '9', maxFinalRmb: '12', latestFinalUsd: null }], []])
    backend.pool.query.mockResolvedValueOnce([[], []])
    const response = await getQuotationAnalysis({})
    const sql = backend.pool.query.mock.calls[1][0].sql
    expect(sql).toContain("PARTITION BY q.customer_name, l.ctk_mpn, COALESCE(l.unit, '')")
    expect(sql).toContain('ORDER BY q.create_time DESC, q.id DESC, l.line_no DESC, l.id DESC')
    expect(response.data.rows[0]).toMatchObject({ unit: 'KPCS', quoteCount: 2, latestFinalRmb: 12, minFinalRmb: 9, maxFinalRmb: 12, latestFinalUsd: null })
  })

  it('历史查询精确匹配三项并保持本人权限，明细模式不重查全量分组', async () => {
    backend.query = { detailsOnly: '1', groupCustomer: '客户%甲', groupMpn: 'CTK_01', groupUnit: '', detailPage: 99 }
    backend.pool.query.mockResolvedValueOnce([[{ lineCount: 1 }], []])
    backend.pool.query.mockResolvedValueOnce([[materialRow()], []])
    const response = await getQuotationAnalysis({}, 'DOMESTIC')
    expect(backend.pool.query).toHaveBeenCalledTimes(2)
    expect(backend.pool.query.mock.calls[0][0].sql).toContain('q.customer_name = ?')
    expect(backend.pool.query.mock.calls[0][0].sql).toContain('l.ctk_mpn = ?')
    expect(backend.pool.query.mock.calls[0][1]).toEqual(['DOMESTIC', 42, '客户%甲', 'CTK_01', ''])
    expect(response.data.detailPage).toBe(1)
    expect(response.data.rows).toEqual([])
  })
  it('汇总超过旧上限仍完整，明细只查询指定页', async () => {
    backend.query = { detailPage: 2 }
    backend.pool.query.mockResolvedValueOnce([[{ quoteCount: 1000, lineCount: 25000, missingFinalCount: 3 }], []])
    backend.pool.query.mockResolvedValueOnce([[{ customerName: '示例客户', ctkMpn: 'CTK-01', unit: 'pcs', lineCount: 25000, averageFinalRmb: '9.50' }], []])
    backend.pool.query.mockResolvedValueOnce([[materialRow()], []])
    const response = await getQuotationAnalysis({}, 'DOMESTIC')
    expect(response.data.lineCount).toBe(25000)
    expect(response.data.missingFinalCount).toBe(3)
    expect(response.data.rows[0].averageFinalRmb).toBe(9.5)
    expect(backend.pool.query.mock.calls[0][0].sql).not.toContain('LIMIT')
    expect(backend.pool.query.mock.calls[1][0].sql).toContain('AVG(l.final_price_rmb)')
    expect(backend.pool.query.mock.calls[2][0].sql).toContain('LIMIT 100 OFFSET 100')
  })

  it('超过导出上限返回明确错误，不下载部分数据', async () => {
    backend.session.permissions.push('tk_custom:domesticQuotation:analysis')
    backend.pool.query.mockResolvedValueOnce([[{ lineCount: 20001 }], []])
    backend.pool.query.mockResolvedValueOnce([[], []])
    const response = await exportQuotationAnalysis({}, 'DOMESTIC')
    expect(response.code).toBe(400)
    expect(response.msg).toContain('20,000')
    expect(backend.pool.query).toHaveBeenCalledTimes(2)
  })

  it('导出缺失最终价格时保留缺失，不回退到原价', async () => {
    backend.session.permissions.push('tk_custom:domesticQuotation:analysis')
    backend.pool.query.mockResolvedValueOnce([[{ lineCount: 1, missingFinalCount: 1 }], []])
    backend.pool.query.mockResolvedValueOnce([[{ customerName: '示例客户', ctkMpn: 'CTK-01', unit: 'pcs', lineCount: 1, missingFinalCount: 1, averageFinalRmb: null }], []])
    backend.pool.query.mockResolvedValueOnce([[materialRow({ final_price_rmb: null })], []])
    const workbook = XLSX.read(Buffer.from(await exportQuotationAnalysis({}, 'DOMESTIC')), { type: 'buffer' })
    const detail = XLSX.utils.sheet_to_json(workbook.Sheets['报价明细'], { header: 1 })
    const summary = XLSX.utils.sheet_to_json(workbook.Sheets['价格汇总'], { header: 1 })
    expect(detail[1][9]).toBe('—')
    expect(summary[1][4]).toBe('—')
    expect(summary[1][5]).toBe(1)
  })
  it('页面和分析组件可以编译，且列表与分析页签接通', () => {
    expectSfcCompiles(PAGE, pageSource, 'domestic-quotation-page')
    expectSfcCompiles(ANALYSIS, analysisSource, 'domestic-quotation-analysis')
    expect(pageSource).toContain("activeTab = ref('list')")
    expect(pageSource).toContain('<TkDomesticQuotationAnalysis')
    expectSfcCompiles(sharedAnalysisPath, sharedAnalysisSource, 'quotation-analysis')
    expect(analysisSource).toContain('business-type="DOMESTIC"')
    expect(sharedAnalysisSource).toContain('getDomesticQuotationAnalysis(filters)')
    expect(sharedAnalysisSource).toContain('最终审核价')
  })

  it('内贸分析与导出 API 使用独立路由和筛选参数', async () => {
    const request = vi.fn(async () => ({ code: 200 }))
    const api = createDomesticQuotationApi(request)
    const query = { customer: '示例客户', ctkMpn: 'CTK-01', from: '2026-09-01', to: '2026-09-30' }

    await api.getDomesticQuotationAnalysis(query)

    expect(request).toHaveBeenCalledWith({
      url: '/tk_custom/quotation/domestic/analysis',
      method: 'get',
      params: query,
    })
    expect(api.getDomesticQuotationAnalysisExportUrl(query)).toBe(
      '/prod-api/tk_custom/quotation/domestic/analysis-export?customer=%E7%A4%BA%E4%BE%8B%E5%AE%A2%E6%88%B7&ctkMpn=CTK-01&from=2026-09-01&to=2026-09-30',
    )
    expect(readFileSync(API_ROUTE, 'utf8')).toContain("getQuotationAnalysis(event, 'DOMESTIC')")
    expect(readFileSync(EXPORT_ROUTE, 'utf8')).toContain("exportQuotationAnalysis(event, 'DOMESTIC')")
  })

  it('服务端固定筛选内贸已通过单据，并按内贸分析权限限制全量数据和导出', () => {
    const service = readFileSync(SERVICE, 'utf8')

    expect(service).toContain("const conditions = [\"q.status = 'APPROVED'\", 'q.business_type = ?']")
    expect(service).toContain('queryAnalysisSummary(pool, filters, session, businessType)')
    expect(service).toContain("const isDomestic = businessType === 'DOMESTIC'")
    expect(service).toContain("analysis: 'tk_custom:domesticQuotation:analysis'")
    expect(service).toContain('hasPermission(session, quotationPermissions(businessType).analysis)')
  })

  it('内贸查询只取当前业务员已通过的单据，并按单位拆分均价组合', async () => {
    backend.pool.query.mockResolvedValueOnce([[{ quoteCount: 2, lineCount: 2, changedRmbCount: 2 }], []])
    backend.pool.query.mockResolvedValueOnce([[{ customerName: '示例客户', ctkMpn: 'CTK-01', unit: 'pcs', averageFinalRmb: 9 }, { customerName: '示例客户', ctkMpn: 'CTK-01', unit: 'KPCS', averageFinalRmb: 90 }], []])
    backend.pool.query.mockResolvedValueOnce([[
      materialRow(),
      materialRow({ quote_no: 'NJ20260901002', line_no: 1, unit: 'KPCS', original_price_rmb: 100, final_price_rmb: 90 }),
    ], []])

    const response = await getQuotationAnalysis({}, 'DOMESTIC')
    const [queryConfig, params] = backend.pool.query.mock.calls[0]

    expect(response).toMatchObject({ code: 200, data: { quoteCount: 2, lineCount: 2 } })
    expect(response.data.rows).toHaveLength(2)
    expect(response.data.rows.map((row) => row.unit)).toEqual(['pcs', 'KPCS'])
    expect(response.data.changedRmbCount).toBe(2)
    expect(queryConfig.sql).toContain("q.status = 'APPROVED'")
    expect(queryConfig.sql).toContain('q.business_type = ?')
    expect(params).toEqual(['DOMESTIC', 42])
  })

  it('分析权限可以查看全量内贸结果并导出人民币明细', async () => {
    backend.session = { userId: 7, permissions: ['tk_custom:domesticQuotation:list', 'tk_custom:domesticQuotation:analysis'] }
    backend.pool.query.mockResolvedValueOnce([[{ quoteCount: 1, lineCount: 1 }], []])
    backend.pool.query.mockResolvedValueOnce([[{ customerName: '示例客户', ctkMpn: 'CTK-01', unit: 'pcs', lineCount: 1, averageFinalRmb: 9 }], []])
    backend.pool.query.mockResolvedValueOnce([[materialRow()], []])

    const result = await exportQuotationAnalysis({}, 'DOMESTIC')
    const workbook = XLSX.read(Buffer.from(result), { type: 'buffer' })
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets['报价明细'], { header: 1, raw: true, defval: '' })
    const [queryConfig, params] = backend.pool.query.mock.calls[0]

    expect(workbook.SheetNames).toEqual(['价格汇总', '报价明细'])
    expect(rows).toEqual([
      ['报价单号', '创建时间', '客户', '业务员', '行号', 'CTK型号', '封装', '单位', '业务员报价(含税人民币)', '最终报价(含税人民币)', '调价金额(人民币)', '调价幅度(%)'],
      ['NJ20260901001', '2026-09-01 10:00:00', '示例客户', '业务员甲', 1, 'CTK-01', 'QFN32', 'pcs', 10, 9, -1, -10],
    ])
    expect(params).toEqual(['DOMESTIC'])
    expect(queryConfig.sql).not.toContain('q.salesperson_id = ?')
    expect(backend.headers['content-disposition']).toContain(encodeURIComponent('内贸报价价格分析.xlsx'))
  })
})
