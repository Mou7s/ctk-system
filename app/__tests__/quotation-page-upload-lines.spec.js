// @vitest-environment happy-dom
// 需要 DOM：本文件 mount 组件/flushPromises，默认的 node 环境没有 document
import { describe, expect, it, vi } from 'vitest'
import { createPinia, defineStore, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'

// 页面用到的自动导入 / Nuxt 宏在测试环境里没有，先垫片（与 quotation-page-paste-number.spec.js 一致）。
globalThis.definePageMeta = () => {}
globalThis.defineStore = defineStore
globalThis.useToast = () => ({ add: () => {} })
setActivePinia(createPinia())

vi.mock('@/api/tk_custom/quotation', () => {
  const ok = vi.fn(async () => ({ code: 200, data: { rows: [], total: 0 } }))
  return {
    listQuotations: ok,
    getQuotation: ok,
    searchQuotationOptions: vi.fn(async () => ({ code: 200, data: [] })),
    checkQuotationEndUserConflict: vi.fn(async () => ({ code: 200, data: { hasConflict: false, conflictCount: 0, matchedEndUsers: [], conflicts: [] } })),
    createQuotation: ok,
    updateQuotation: ok,
    uploadQuotation: ok,
    reviewQuotation: ok,
    submitQuotation: ok,
    deleteQuotation: ok,
    getQuotationAnalysis: ok,
    getQuotationDownloadUrl: vi.fn(() => ''),
    getQuotationAnalysisExportUrl: vi.fn(() => ''),
  }
})

const PAGE = '../../app/pages/tk_custom/quotation/index.vue'

async function mountPage() {
  const page = await import(PAGE)
  const wrapper = mount(page.default)
  return { wrapper, state: wrapper.vm.$.setupState }
}

async function workbookFile(rows, name) {
  const XLSX = await import('xlsx/xlsx.mjs')
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), '报价单')
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  return new File([bytes], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

// LO 单实测（2026-09-15）：客户端预览与服务端入库必须是同一套序号口径。
// 客户 Excel 的 S/N 列自己重复/乱序（37、39 各出现两次），预览里照着 S/N 显示会让用户看到的
// 序号和入库后的序号不一致，而入库侧已固定 1..N。
describe('Quotation page Excel upload preview numbering', () => {
  it('预览序号按行顺序 1..N，不跟着客户表格的 S/N 列', async () => {
    const { wrapper, state } = await mountPage()
    const file = await workbookFile([
      ['示例企业有限公司'],
      ['Quotation Sheet'],
      ['Delivery terms:', null, 'FOB Shenzhen', null, 'Valid:', '30days', 'Payment Term:30% deposit'],
      ['Quote date:', new Date('2026-09-15'), 'Country:', '印度', 'Customer type:', '终端', 'Customer:', 'LO'],
      ['Contact:', 'tina'],
      [
        'S/N\n序号', 'Material Code\n物料编码', 'Material Name\n物料名称', 'Package\n封装',
        'Price/RMB (KPCS)\n单价（元）', 'Application\n应用', 'Manufacturer\n友商', 'MPN\n友商型号',
        'Qty\n数量', 'Die Size\n芯片大小', 'SPQ/Reel\n(pcs)', 'Price/USD KPCS\n千只单价（美元）',
        'Price/USD PC\n1只单价（美元）', 'L/T\n交期', 'Datasheet\n规格书', 'Remark\n备注',
      ],
      [36, 'MAT-001', 'BZV55Cxxx SOD-80', 'LL-34', 30.8, '消费级', '', '', null, 'STANDARD', '', 4.59, 0.00459, '', '', ''],
      [37, 'MAT-002', 'SS34A SMA', 'SMA', 66, '消费级', '', '', 30, 'STANDARD', '', 9.85, 0.00985, '', '', ''],
      [37, 'MAT-003', 'SS54 SMC', 'SMA', 144, '消费级', '', '', 5, 'STANDARD', '', 21.49, 0.02149, '', '', ''],
    ], '标准报价单模板 LO.xlsx')

    await state.processExcelFile(file)

    expect(state.parseError).toBe('')
    expect(state.parsedData.lines.map((line) => line.lineNo)).toEqual([1, 2, 3])
    wrapper.unmount()
  })
})
