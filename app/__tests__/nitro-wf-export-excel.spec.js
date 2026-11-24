import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx/xlsx.mjs'
import { unzipSync, zipSync } from 'fflate'

const state = vi.hoisted(() => ({
  authenticated: { session: { userId: 1, roles: [] } },
  body: {},
  routeBill: undefined,
  template: null,
  frameRows: [{ frameId: '7', frameName: '框架A' }],
  sendRows: [[
    '供应商A', 'WWFC1001', '张三', '2026-08-13 08:00:00', '计划001', '物料A', 'SOT-23/其他', 'PCS', 'A/B', 10, 1, 1, 7,
  ]],
  generateWfExcel: vi.fn(),
  executeBillQuery: vi.fn(),
  queryK3SqlServer: vi.fn(),
  setResponseHeader: vi.fn(),
  K3CloudError: class K3CloudError extends Error {
    constructor(kind, message, statusCode) {
      super(message)
      this.kind = kind
      this.statusCode = statusCode
    }
  },
  SqlServerError: class SqlServerError extends Error {
    constructor(kind, message, statusCode) {
      super(message)
      this.kind = kind
      this.statusCode = statusCode
    }
  },
  WfTemplateError: class WfTemplateError extends Error {
    constructor(message) {
      super(message)
      this.statusCode = 503
    }
  },
}))

vi.mock('h3', () => ({
  getQuery: vi.fn(() => ({})),
  readBody: vi.fn(async () => state.body),
  getRouterParam: vi.fn(() => state.routeBill),
  setResponseHeader: state.setResponseHeader,
}))
vi.mock('../../server/utils/auth.ts', () => ({
  getAuthSession: vi.fn(async () => state.authenticated),
  hasRole: vi.fn((session, role) => session.userId === 1 || session.roles.includes(role)),
}))
vi.mock('../../server/utils/k3.ts', () => ({
  K3CloudError: state.K3CloudError,
  executeBillQuery: state.executeBillQuery,
}))
vi.mock('../../server/utils/sqlserver.ts', () => ({
  SqlServerError: state.SqlServerError,
  queryK3SqlServer: state.queryK3SqlServer,
  sqlStringParameter: vi.fn((request, name, value) => request.input?.(name, value)),
}))
vi.mock('../../server/utils/runtime.ts', () => ({
  getNitroServerConfig: vi.fn(() => ({ profilePath: 'C:/profile' })),
}))
vi.mock('../../server/utils/wf-export-excel.ts', () => ({
  generateWfExcel: state.generateWfExcel,
  WfTemplateError: state.WfTemplateError,
}))

globalThis.defineEventHandler = (handler) => handler

function createTemplate() {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['供应商：{head_1}', '单号：{head_2}'],
    ['创建人：{head_3}', '日期：{head_4}'],
    ['明细', '物料', '规格', '包装', '单位', '数量', '条数', '文本', '框架'],
    ['{list1.col1}', '{list1.col2}', '{list1.col3}', '{list1.col4}', '{list1.col5}', '{list1.col6}', '{list1.col7}', '{list1.col8}', '{list1.col9}'],
    ['明细合计：{list1_total}'],
    ['汇总', '包装', '条数', '次数', '框架', '文本段数'],
    ['{list2.col1}', '{list2.col2}', '{list2.col3}', '{list2.col4}', '{list2.col5}', '{list2.col6}'],
    ['汇总合计：{list2_total}'],
  ])
  const workbook = Buffer.from(XLSX.write({ SheetNames: ['Sheet1'], Sheets: { Sheet1: sheet } }, { bookType: 'xlsx', type: 'buffer', bookSST: true }))
  const files = unzipSync(new Uint8Array(workbook))
  const sheetPath = 'xl/worksheets/sheet1.xml'
  const sheetXml = new TextDecoder().decode(files[sheetPath])
  files[sheetPath] = new TextEncoder().encode(sheetXml.replace('</worksheet>', '<mergeCells count="1"><mergeCell ref="A5:B5"/></mergeCells><pageSetup paperSize="9" orientation="portrait" horizontalDpi="600"/><drawing r:id="rId1"/></worksheet>'))
  files['xl/worksheets/_rels/sheet1.xml.rels'] = new TextEncoder().encode('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>')
  files['xl/drawings/drawing1.xml'] = new TextEncoder().encode('<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"/>')
  files['xl/drawings/_rels/drawing1.xml.rels'] = new TextEncoder().encode('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>')
  files['xl/media/image1.emf'] = new TextEncoder().encode('emf-fixture')
  return Buffer.from(zipSync(files))
}

describe('Nitro 外发上锡 Excel 导出', () => {
  let exportHandler
  let pathHandler
  let fillWfTemplate
  let buildWfTemplateData

  beforeAll(async () => {
    ({ fillWfTemplate } = await vi.importActual('../../server/utils/wf-export-excel.ts'));
    ({ buildWfTemplateData } = await vi.importActual('../../server/utils/wf-export.ts'))
    exportHandler = (await import('../../server/routes/prod-api/kingdee/exportWFData/index.post.ts')).default
    pathHandler = (await import('../../server/routes/prod-api/kingdee/exportWFData/[billno].post.ts')).default
  })

  beforeEach(() => {
    state.authenticated = { session: { userId: 1, roles: [] } }
    state.body = { billNos: 'WWFC1001' }
    state.routeBill = undefined
    state.template = createTemplate()
    state.frameRows = [{ frameId: '7', frameName: '框架A' }]
    state.sendRows = [[
      '供应商A', 'WWFC1001', '张三', '2026-08-13 08:00:00', '计划001', '物料A', 'SOT-23/其他', 'PCS', 'A/B', 10, 1, 1, 7,
    ]]
    state.generateWfExcel.mockReset()
    state.generateWfExcel.mockResolvedValue(Buffer.from('PKnitro-test'))
    state.executeBillQuery.mockReset()
    state.executeBillQuery.mockResolvedValue(state.sendRows)
    state.queryK3SqlServer.mockReset()
    state.queryK3SqlServer.mockImplementation(async (execute) => {
      const result = await execute({ input: vi.fn(), query: vi.fn(async () => ({ recordset: state.frameRows })) })
      return result.recordset
    })
    state.setResponseHeader.mockReset()
  })

  it('fills the original workbook shape, preserves styles and returns an XLSX PK header', async () => {
    const templateData = await buildWfTemplateData(state.sendRows, ['WWFC1001'])
    expect(templateData.headers.head_3).toBe('童炜城')

    const filled = fillWfTemplate(state.template, {
      headers: { head_1: '供应商A', head_2: 'WWFC1001', head_3: '童炜城', head_4: '2026-08-13', list1_total: 10, list2_total: 1 },
      list1: [
        { col1: 1, col2: '计划001', col3: '物料A', col4: 'SOT-23', col5: 'PCS', col6: 10, col7: 10, col8: 'A/B', col9: '框架A' },
        { col1: 2, col2: '计划002', col3: '物料B', col4: 'SOT-8', col5: 'PCS', col6: 20, col7: 20, col8: 'C/D', col9: '框架B' },
      ],
      list2: [
        { col1: 1, col2: 'SOT-23', col3: 10, col4: 1, col5: '框架A', col6: 2 },
        { col1: 2, col2: 'SOT-8', col3: 20, col4: 1, col5: '框架B', col6: 2 },
      ],
    })
    expect(filled.subarray(0, 2).toString()).toBe('PK')
    const filledFiles = unzipSync(new Uint8Array(filled))
    const filledSheetXml = new TextDecoder().decode(filledFiles['xl/worksheets/sheet1.xml'])
    expect(filledFiles['xl/media/image1.emf']).toBeDefined()
    expect(filledFiles['xl/drawings/drawing1.xml']).toBeDefined()
    expect(filledFiles['xl/worksheets/_rels/sheet1.xml.rels']).toBeDefined()
    expect(filledSheetXml).toContain('<drawing r:id="rId1"/>')
    expect(filledSheetXml).toContain('<mergeCell ref="A6:B6"/>')
    expect(filledSheetXml).toContain('<pageSetup paperSize="9" orientation="portrait" horizontalDpi="600"/>')
    expect(filledSheetXml).toContain('<dimension ref="A1:I10"/>')
    expect(filledSheetXml).toMatch(/<row r="10"[^>]*>/)
    const sharedStringsXml = new TextDecoder().decode(filledFiles['xl/sharedStrings.xml'])
    expect(sharedStringsXml).toMatch(/^(?:<\?xml[^>]*\?>\s*)?<sst\b[^>]*>/)
    expect(sharedStringsXml).not.toMatch(/<\?xml[^>]*\?\s+count=/)
    const sharedRoot = sharedStringsXml.match(/<sst\b[^>]*>/)?.[0]
    const declaredStringCount = Number(sharedRoot?.match(/\bcount="(\d+)"/)?.[1])
    const declaredUniqueCount = Number(sharedRoot?.match(/\buniqueCount="(\d+)"/)?.[1])
    const actualStringCount = Object.entries(filledFiles)
      .filter(([path]) => /^xl\/worksheets\/[^/]+\.xml$/.test(path))
      .reduce((total, [, content]) => total + ((new TextDecoder().decode(content).match(/<c\b[^>]*\bt\s*=\s*["']s["'][^>]*>/g) || []).length), 0)
    const actualUniqueCount = (sharedStringsXml.match(/<si\b/g) || []).length
    expect(declaredStringCount).toBe(actualStringCount)
    expect(declaredUniqueCount).toBe(actualUniqueCount)
    const filledWorkbook = XLSX.read(filled, { type: 'buffer' })
    const filledRows = XLSX.utils.sheet_to_json(filledWorkbook.Sheets.Sheet1, { header: 1, raw: true, defval: '' })
    expect(filledRows[0][0]).toBe('供应商：供应商A')
    expect(filledRows.some((row) => row.includes('物料A'))).toBe(true)
    expect(filledRows.some((row) => row.includes('物料B'))).toBe(true)
    expect(filledRows.some((row) => row.includes('框架A'))).toBe(true)
    expect(filledRows.some((row) => row.includes('框架B'))).toBe(true)

    state.queryK3SqlServer.mockClear()
    const result = await exportHandler({})

    expect(Buffer.isBuffer(result)).toBe(true)
    expect(result.subarray(0, 2).toString()).toBe('PK')
    expect(state.queryK3SqlServer).toHaveBeenCalledTimes(1)
    expect(state.setResponseHeader).toHaveBeenCalledWith(expect.anything(), 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(state.setResponseHeader.mock.calls.map((call) => call[1])).toContain('Content-Disposition')
  })

  it('keeps the legacy path parameter entry point', async () => {
    state.body = {}
    state.routeBill = 'wwfc1001'

    const result = await pathHandler({})

    expect(Buffer.isBuffer(result)).toBe(true)
    expect(state.executeBillQuery).toHaveBeenCalledWith(expect.objectContaining({ formId: 'SFC_OperOutGroupSend' }))
  })

  it('returns a template-missing error instead of fake Excel', async () => {
    state.generateWfExcel.mockRejectedValueOnce(new state.WfTemplateError('外发上锡 Excel 模板不存在，请检查 profilePath/wfsx_excel/WFDD.xlsx'))

    await expect(exportHandler({})).resolves.toEqual({
      code: 503,
      msg: '外发上锡 Excel 模板不存在，请检查 profilePath/wfsx_excel/WFDD.xlsx',
    })
  })

  it('returns SQL Server timeout without producing a file', async () => {
    state.queryK3SqlServer.mockRejectedValueOnce(new state.SqlServerError('timeout', 'K3 SQL Server 查询超时', 504))

    await expect(exportHandler({})).resolves.toEqual({
      code: 504,
      msg: 'K3 SQL Server 查询超时',
    })
    expect(state.generateWfExcel).not.toHaveBeenCalled()
  })

  it('keeps authentication and role boundaries on export', async () => {
    state.authenticated = null
    await expect(exportHandler({})).resolves.toEqual({ code: 401, msg: '登录状态已过期' })

    state.authenticated = { session: { userId: 9, roles: ['user'] } }
    await expect(exportHandler({})).resolves.toEqual({ code: 403, msg: '缺少 plating_clerk 角色权限' })
  })
})
