// @vitest-environment happy-dom
// 需要 DOM：本文件 mount 组件/flushPromises，默认的 node 环境没有 document
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, defineStore, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'

/**
 * 报价单「退回流程」页面行为回归（2026-09-16 改版）：
 * - 任何环节退回后单据落「已退回」，对业务员等同可编辑草稿（改价 / 改条款 / 改明细）；
 * - 已退回单据的入口是「修改重提 / 重新提交初审」，不再是「编辑草稿」；
 * - 审核态下明细与条款只读，审核人只有「通过 / 退回业务员」，退回意见必填；
 * - 详情里的审批留痕按轮次展示，历史轮次与意见保留。
 */

globalThis.definePageMeta = () => {}
globalThis.defineStore = defineStore
globalThis.useToast = () => ({ add: () => {} })
setActivePinia(createPinia())

const state = vi.hoisted(() => ({ list: { rows: [], total: 0 }, quotation: null }))

vi.mock('@/api/tk_custom/quotation', () => {
  const ok = vi.fn(async () => ({ code: 200, data: { id: 5 } }))
  return {
    // 页面 loadList 读的是适配层展开后的 response.rows / response.total
    listQuotations: vi.fn(async () => ({ code: 200, rows: state.list.rows, total: state.list.total })),
    getQuotation: vi.fn(async () => ({ code: 200, data: state.quotation })),
    searchQuotationOptions: vi.fn(async () => ({ code: 200, data: [] })),
    checkQuotationPrices: vi.fn(async () => ({ code: 200, data: [] })),
    checkQuotationEndUserConflict: vi.fn(async () => ({ code: 200, data: { hasConflict: false, conflictCount: 0, matchedEndUsers: [], conflicts: [] } })),
    createQuotation: ok,
    updateQuotation: ok,
    uploadQuotation: ok,
    reviewQuotation: vi.fn(async () => ({ code: 200, data: { status: 'RETURNED', statusLabel: '已退回' } })),
    submitQuotation: vi.fn(async () => ({ code: 200, data: { status: 'PENDING_INITIAL' } })),
    deleteQuotation: ok,
    getQuotationAnalysis: vi.fn(async () => ({ code: 200, data: { quoteCount: 0, lineCount: 0, rows: [], detailRows: [] } })),
    getQuotationDownloadUrl: vi.fn(() => ''),
    getQuotationAnalysisExportUrl: vi.fn(() => ''),
  }
})

vi.mock('@revolist/vue3-datagrid', () => ({
  default: { name: 'VGrid', props: ['columns', 'source', 'readonly'], template: '<div class="v-grid-stub" />' },
}))

const PAGE = '../../app/pages/tk_custom/quotation/index.vue'

async function mountPage() {
  const page = await import(PAGE)
  // 页面里 TkQuotationGrid 走 Nuxt 自动导入（nuxt.config 注册了 app/packages/ui），列表是原生 UTable，
  // 测试环境需要显式注册：网格注册真实组件（列名/readonly 都在它身上），
  // 列表 UTable 用桩把 #<列id>-cell 插槽按行渲染出来（插槽契约：row.original = 行数据）
  const grid = await import('../../app/packages/ui/TkQuotationGrid.vue')
  const wrapper = mount(page.default, {
    global: {
      components: { TkQuotationGrid: grid.default },
      stubs: {
        // UModal 用具名插槽，未注册时 body/footer 内容不会被渲染，这里补一个桩
        UModal: { template: '<div class="umodal-stub"><slot name="header" /><slot name="body" /><slot name="footer" /></div>' },
        UTable: {
          name: 'UTable',
          props: ['data', 'columns'],
          template: `<table class="tkutable-stub"><tbody><tr v-for="(row, index) in data" :key="index"><td v-for="column in columns" :key="column.id"><slot :name="column.id + '-cell'" :row="{ original: row, index }" /></td></tr></tbody></table>`,
        },
      },
    },
  })
  await flushPromises()
  return { wrapper, state: wrapper.vm.$.setupState }
}

function returnedRow(overrides = {}) {
  return {
    id: 5,
    quoteNo: 'BJ2026091600001',
    quoteDate: '2026-09-16',
    customerName: '深圳客户A',
    salespersonName: '张三',
    lineCount: 1,
    status: 'RETURNED',
    statusLabel: '已退回',
    canEditDraft: true,
    canDeleteDraft: false,
    canInitialReview: false,
    canSecondReview: false,
    canFinalReview: false,
    canDownload: false,
    canWithdraw: false,
    ...overrides,
  }
}

function returnedDetail(overrides = {}) {
  return {
    ...returnedRow(),
    deliveryTerms: 'FOB Shenzhen',
    leadTime: '1-30days',
    warranty: '2 years',
    validity: '30days',
    paymentTerm: 'Net 30 days',
    lines: [{ id: 1, lineNo: 1, ctkMpn: 'X1', description: '产品', originalPriceRmb: 1.23, originalPriceUsd: 0.2, finalPriceRmb: null }],
    revisions: [
      { id: 1, round: 1, action: 'SUBMIT_INITIAL', actionLabel: '提交初审', operatorName: '张三', createTime: '2026-09-16 09:00:00', comment: '' },
      { id: 2, round: 1, action: 'RETURN_BY_INITIAL', actionLabel: '初审退回业务员', operatorName: '沈小姐', createTime: '2026-09-16 09:10:00', comment: '客户名称写错了' },
    ],
    ...overrides,
  }
}

describe('报价单退回流程页面', () => {
  beforeEach(() => {
    state.list = { rows: [], total: 0 }
    state.quotation = null
  })

  it('列表：已退回单据给出「修改重提 / 重新提交初审」入口', async () => {
    state.list = { rows: [returnedRow()], total: 1 }
    const { wrapper } = await mountPage()

    const html = wrapper.html()
    expect(html).toContain('重新提交初审')
    expect(html).toContain('修改重提')
    // 已退回不再走「编辑草稿 / 删除草稿」那套按钮（注释里出现同名字样不算）
    expect(html).not.toContain('>删除草稿<')
    wrapper.unmount()
  })

  it('详情：已退回可编辑重提；审批留痕默认收起成一行，展开后才铺开', async () => {
    state.quotation = returnedDetail()
    const { wrapper, state: pageState } = await mountPage()

    await pageState.openRecord({ id: 5 })
    await flushPromises()

    // 折叠态：只占一行，摘要给最新一条，不把每条留痕铺在页面上
    expect(pageState.revisionOpen).toBe(false)
    const collapsed = wrapper.html()
    expect(collapsed).toContain('修改后重新提交初审')
    expect(collapsed).toContain('审批留痕')
    expect(collapsed).toContain('共 1 轮')
    expect(collapsed).toContain('最新：初审退回业务员')
    expect(collapsed).not.toContain('第 1 轮')
    expect(collapsed).not.toContain('客户名称写错了')
    expect(pageState.latestRevision.actionLabel).toBe('初审退回业务员')

    // 展开态：按轮次显示完整留痕与意见
    pageState.revisionOpen = true
    await flushPromises()
    const expanded = wrapper.html()
    expect(expanded).toContain('第 1 轮')
    expect(expanded).toContain('提交初审')
    expect(expanded).toContain('初审退回业务员')
    expect(expanded).toContain('客户名称写错了')
    expect(pageState.revisionRounds).toBe(1)
    wrapper.unmount()
  })

  it('审核态：退回意见必填且退回不提交改价', async () => {
    state.quotation = returnedDetail({
      status: 'PENDING_INITIAL',
      statusLabel: '待初审',
      canEditDraft: false,
      canInitialReview: true,
    })
    const api = await import('@/api/tk_custom/quotation')
    const { wrapper, state: pageState } = await mountPage()

    await pageState.openRecord({ id: 5 })
    await flushPromises()
    // 未进入审核态时没有审核操作条（留痕里的「退回业务员」字样不算）
    expect(pageState.reviewStage).toBe('')
    expect(wrapper.html()).not.toContain('明细与条款均为只读')

    pageState.startReview()
    await flushPromises()
    expect(pageState.reviewStage).toBe('initial')
    const html = wrapper.html()
    expect(html).toContain('退回业务员')
    expect(html).toContain('可调整人民币单价')

    // 退回意见为空：不调用接口
    pageState.reviewComment = ''
    await pageState.submitReview('return')
    expect(api.reviewQuotation).not.toHaveBeenCalled()

    // 填了意见才提交；退回时价格变更为空。
    pageState.reviewComment = '价格偏高，请业务员重报'
    await pageState.submitReview('return')
    expect(api.reviewQuotation).toHaveBeenCalledWith(expect.objectContaining({
      id: 5,
      stage: 'initial',
      action: 'return',
      comment: '价格偏高，请业务员重报',
    }))
    const payload = api.reviewQuotation.mock.calls.at(-1)[0]
    expect(payload.priceChanges).toEqual([])
    wrapper.unmount()
  })

  it('审核态：价格单独编辑，明细网格仍只读', async () => {
    state.quotation = returnedDetail({
      status: 'PENDING_FINAL',
      statusLabel: '待终审',
      canEditDraft: false,
      canFinalReview: true,
    })
    const { wrapper, state: pageState } = await mountPage()

    await pageState.openRecord({ id: 5 })
    await flushPromises()
    pageState.startReview()
    await flushPromises()

    expect(pageState.reviewStage).toBe('final')
    // 页面上有两个网格：在线录入（可编辑）+ 审核明细（只读），这里盯只读那个
    const grids = wrapper.findAllComponents({ name: 'VGrid' })
    const reviewGrid = grids.find((item) => item.props('readonly') === true)
    expect(reviewGrid, '没找到只读的审核明细网格').toBeTruthy()
    const detailGrid = wrapper.findAllComponents({ name: 'TkQuotationGrid' }).find((item) => item.props('readonly') === true)
    expect(detailGrid?.props('reviewPriceEditable')).toBe(true)
    expect(detailGrid?.find('[aria-label="第1行人民币单价"]').exists()).toBe(true)
    expect(wrapper.find('.max-h-36.overflow-y-auto').exists()).toBe(false)
    expect(grids.some((item) => item.props('readonly') === false), '在线录入的网格必须可编辑').toBe(true)
    // 价格列：单价(人民币/千只)（美元价只读派生）+ 最终报价，汇率已提升至表头
    const names = reviewGrid.props('columns').map((column) => column.name)
    expect(names).toContain('单价(人民币/千只)')
    expect(names).toContain('最终报价(人民币)')
    expect(names).not.toContain('汇率')
    expect(names).not.toContain('初审人民币单价')
    expect(names).not.toContain('终审人民币单价')
    const api = await import('@/api/tk_custom/quotation')
    const lineId = pageState.editableLines[0].id
    expect(wrapper.html()).toContain('审核指引：下表中')
    expect(wrapper.html()).toContain('可修改')
    expect(pageState.modifiedReviewLineCount).toBe(0)
    pageState.editableLines[0].reviewPriceRmb = 12.34
    expect(pageState.modifiedReviewLineCount).toBe(1)
    await pageState.submitReview('approve')
    expect(api.reviewQuotation).toHaveBeenCalledWith(expect.objectContaining({
      stage: 'final',
      action: 'approve',
      priceChanges: [{ id: lineId, priceRmb: 12.34 }],
    }))
    wrapper.unmount()
  })
  it('列表：走原生 UTable 的列定义与行数据（不再是 TkUTable/手写表）', async () => {
    state.list = { rows: [returnedRow()], total: 1 }
    const { wrapper } = await mountPage()

    const table = wrapper.findComponent({ name: 'UTable' })
    expect(table.exists()).toBe(true)
    expect(table.props('data')).toHaveLength(1)
    const ids = table.props('columns').map((column) => column.id)
    expect(ids).toEqual(['quoteNo', 'customerName', 'salespersonName', 'lineCount', 'status', 'updateTime', 'actions'])
    wrapper.unmount()
  })
})
