import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { unzipSync } from 'fflate'
import * as XLSX from 'xlsx/xlsx.mjs'

const state = vi.hoisted(() => ({
  authenticated: { session: { userId: 2 } },
  query: { beginDate: '2026-08-01', endDate: '2026-08-02' },
  executeBillQuery: vi.fn(),
  setResponseHeader: vi.fn(),
  K3CloudError: class K3CloudError extends Error {
    kind = 'unavailable'
    statusCode = 502
  },
}))

vi.mock('h3', () => ({
  getQuery: vi.fn(() => state.query),
  setResponseHeader: state.setResponseHeader,
}))
vi.mock('../../server/utils/auth.ts', () => ({
  getAuthSession: vi.fn(async () => state.authenticated),
}))
vi.mock('../../server/utils/k3.ts', () => ({
  executeBillQuery: state.executeBillQuery,
  K3CloudError: state.K3CloudError,
}))
vi.mock('../../server/utils/response.ts', () => ({
  apiError: (msg, code = 500) => ({ code, msg }),
  errorMessage: (error) => error?.message || 'unknown error',
}))

globalThis.defineEventHandler = (handler) => handler

function rowsOf(result) {
  const workbook = XLSX.read(Buffer.from(result), { type: 'buffer', cellFormula: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  return { workbook, sheet, rows: XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' }) }
}

describe('Nitro production-receipt matrix export route', () => {
  let handler

  beforeAll(async () => {
    handler = (await import('../../server/routes/prod-api/tk_custom/stockDocument/exportProductionReceiptMatrix.get.ts')).default
  })

  beforeEach(() => {
    state.authenticated = { session: { userId: 2 } }
    state.query = { beginDate: '2026-08-01', endDate: '2026-08-02' }
    state.executeBillQuery.mockReset()
    state.setResponseHeader.mockReset()
  })

  it('exports the migrated matrix with material, daily subtotal, and total formulas', async () => {
    state.executeBillQuery.mockResolvedValueOnce([
      ['2026-08-01 08:00:00', 'M001', '物料A', 'SOT-23 单芯', 10],
      ['2026-08-02 08:00:00', 'M002', '物料B', 'SOD-323 双芯', 3.5],
    ])

    const result = await handler({})
    expect(Buffer.isBuffer(result)).toBe(true)
    expect(result.subarray(0, 2).toString()).toBe('PK')
    expect(state.executeBillQuery).toHaveBeenCalledWith(expect.objectContaining({
      formId: 'PRD_INSTOCK',
      // 与列表页共用 buildDocumentFilter：状态固定已审核 + 归一化日期区间
      filterString: "1=1 and FDocumentStatus='C' and FDate>='2026-08-01' and FDate<'2026-08-03'",
      startRow: 0,
      limit: 1000,
    }))

    const { workbook, sheet, rows } = rowsOf(result)
    expect(workbook.SheetNames).toEqual(['2026年08月'])
    expect(rows[0][0]).toBe('2026/08')
    expect(rows[1][1]).toBe('塑封 SOD-323')
    expect(rows[2][1]).toBe('物料B')
    expect(rows[4][0]).toBe('8-1')
    expect(rows[4][1]).toBe('')
    expect(rows[5][0]).toBe('8-2')
    expect(rows.at(-1)[0]).toBe('月度合计')
    expect(sheet['C5'].f).toBe('SUM(B5:B5)')
    expect(sheet['C6'].f).toBe('SUM(B6:B6)')
    const files = unzipSync(new Uint8Array(result))
    const stylesXml = new TextDecoder().decode(files['xl/styles.xml'])
    const sheetXml = new TextDecoder().decode(files['xl/worksheets/sheet1.xml'])
    expect(stylesXml).toContain('FF1F4E78')
    expect(stylesXml).toContain('formatCode="#,##0"')
    expect(sheetXml).toContain('state="frozen"')
    expect(sheetXml).toMatch(/<row r="1"[^>]*ht="30"[^>]*customHeight="1"/)
    expect(sheetXml.indexOf('<pageMargins')).toBeLessThan(sheetXml.indexOf('<ignoredErrors'))
    expect(sheetXml).toMatch(/<c r="A1"[^>]*\bs="13"/)
    expect(sheetXml).toMatch(/<c r="B5"[^>]*\bs="8"/)
    expect(sheetXml).toMatch(/<c r="E5"[^>]*\bs="14"/)
    expect(decodeURIComponent(state.setResponseHeader.mock.calls[1][2])).toContain('成品入库明细表_202608.xlsx')
  })

  it('keeps the authentication and input validation boundaries', async () => {
    state.authenticated = null
    await expect(handler({})).resolves.toEqual({ code: 401, msg: '登录状态已过期' })
    expect(state.executeBillQuery).not.toHaveBeenCalled()

    state.authenticated = { session: { userId: 2 } }
    state.query = { beginDate: '2026-08-03', endDate: '2026-08-01' }
    await expect(handler({})).resolves.toEqual({ code: 400, msg: '结束日期不能早于开始日期' })
    expect(state.executeBillQuery).not.toHaveBeenCalled()
  })

  it('applies the list keyword filters and rejects cross-month ranges', async () => {
    state.query = { beginDate: '2026-08-25', endDate: '2026-09-05' }
    await expect(handler({})).resolves.toEqual({
      code: 400,
      msg: '月度入库明细表按月导出，请选择同一月份内的日期范围',
    })
    expect(state.executeBillQuery).not.toHaveBeenCalled()

    state.query = {
      beginDate: '2026-08-01',
      endDate: '2026-08-31',
      billNo: 'SCRK2608',
      material: "M'001",
      packageName: 'SOD-323',
      stock: 'CTK11',
      relatedParty: 'MO2608',
    }
    state.executeBillQuery.mockResolvedValueOnce([])

    await handler({})

    const filterString = state.executeBillQuery.mock.calls[0][0].filterString
    expect(filterString).toContain("FBillNo like '%SCRK2608%'")
    expect(filterString).toContain("M''001")
    expect(filterString).not.toContain("M'001 ")
    expect(filterString).toContain("FMaterialId.FSpecification like 'SOD-323%'")
    expect(filterString).toContain("FMoBillNo like '%MO2608%'")
    expect(filterString).toContain("FStockId.FNumber like '%CTK11%'")
    expect(filterString).toContain("FDocumentStatus='C'")
  })
})
