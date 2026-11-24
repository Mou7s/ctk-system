// @vitest-environment happy-dom
// 需要 DOM：本文件 mount 组件/flushPromises，默认的 node 环境没有 document
import { describe, expect, it, vi } from 'vitest'
import { createPinia, defineStore, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { uploadQuotation } from '@/api/tk_custom/quotation'

// 页面用到的自动导入 / Nuxt 宏在测试环境里没有，先垫片。
globalThis.definePageMeta = () => {}
globalThis.defineStore = defineStore
globalThis.useToast = () => ({ add: () => {} })
setActivePinia(createPinia())

vi.mock('@/api/tk_custom/quotation', () => {
  const listOk = vi.fn(async () => ({ code: 200, data: { rows: [], total: 0 } }))
  const detailOk = vi.fn(async () => ({ code: 200, data: { id: 7, quoteNo: 'Q20260916001', lines: [] } }))
  return {
    listQuotations: listOk,
    getQuotation: detailOk,
    searchQuotationOptions: vi.fn(async () => ({ code: 200, data: [] })),
    checkQuotationPrices: vi.fn(async () => ({ code: 200, data: [] })),
    checkQuotationEndUserConflict: vi.fn(async () => ({ code: 200, data: { hasConflict: false, conflictCount: 0, matchedEndUsers: [], conflicts: [] } })),
    createQuotation: listOk,
    updateQuotation: listOk,
    uploadQuotation: vi.fn(async () => ({ code: 200, data: { id: 12, quoteNo: 'Q20260916002' } })),
    reviewQuotation: listOk,
    submitQuotation: listOk,
    deleteQuotation: listOk,
    getQuotationAnalysis: listOk,
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

// 用户口径（2026-09-17）：建单只走「下载标准模板 → 在 Excel 里填好 → 上传自动建单」，
// 网页表格录入（粘贴/直接填表）整块取消；编辑草稿与已退回改为上传覆盖。
describe('报价单建单只走上传模板', () => {
  it('新建弹窗不再预填数据，表格录入相关入口已移除', async () => {
    const { wrapper, state } = await mountPage()

    state.openUpload()

    expect(state.parsedData).toBe(null)
    expect(state.editingId).toBe(null)
    expect(state.selectedFile).toBe(null)
    // 旧入口（表格录入）不应再存在
    expect(state.pasteColumns).toBeUndefined()
    expect(state.handleQuotationGridPaste).toBeUndefined()
    expect(state.submitPastedQuotation).toBeUndefined()
    expect(state.blankPasteLine).toBeUndefined()

    wrapper.unmount()
  })

  it('编辑草稿/已退回：同一个上传弹窗，带出单据 id 与单号', async () => {
    const { wrapper, state } = await mountPage()

    await state.openEdit({ id: 7 })

    expect(state.editingId).toBe(7)
    expect(state.editingQuoteNo).toBe('Q20260916001')
    // 明细不预填：内容由重新上传的 Excel 决定
    expect(state.parsedData).toBe(null)
    expect(state.uploadOpen).toBe(true)

    wrapper.unmount()
  })

  it('编辑态上传：formData 里带上单据 id，服务端据此覆盖而不是新建', async () => {
    const { wrapper, state } = await mountPage()
    state.selectedFile = new File([new Uint8Array([1, 2, 3])], '报价单.xlsx')
    state.editingId = 12

    await state.submitUploadFile('submit')

    const call = uploadQuotation.mock.calls.at(-1)?.[0]
    expect(call).toBeInstanceOf(FormData)
    expect(call.get('id')).toBe('12')
    expect(call.get('action')).toBe('submit')
    expect(String(call.get('requestId') || '')).not.toBe('')

    wrapper.unmount()
  })

  it('新建上传：不带 id，走新建', async () => {
    const { wrapper, state } = await mountPage()
    state.selectedFile = new File([new Uint8Array([4, 5])], '报价单.xlsx')
    state.editingId = null

    await state.submitUploadFile('save')

    const call = uploadQuotation.mock.calls.at(-1)?.[0]
    expect(call.get('id')).toBe(null)
    expect(call.get('action')).toBe('save')

    wrapper.unmount()
  })
})
