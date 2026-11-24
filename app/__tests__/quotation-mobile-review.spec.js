// @vitest-environment happy-dom
// 需要 DOM：本文件 mount 组件/flushPromises，默认的 node 环境没有 document
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, defineStore, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'

/**
 * 移动端审核链路（2026-09-17）：初审人在手机浏览器里审核报价单。
 * - 明细从 24 列 RevoGrid 换成只读卡片（手机没有双击/框选/Ctrl+V）；
 * - 审核意见与「通过 / 退回」同屏（原来意见在顶部、按钮在 footer，中间隔一屏明细）；
 * - 通过 / 退回都要二次确认（误触「退回」会把单据打回业务员并通知所有经手人）；
 * - 退回意见必填的错误贴在输入框上，而不是只弹一个 toast；
 * - 列表手机卡片：单击打开、主操作随状态给、次要操作收进菜单。
 * 注：「待我初审/二审/终审」一键入口 2026-09-18 已按用户口径删除，列表统一走「状态」下拉筛选、
 * 默认全部单据，所以这里不再有用例守它。
 * 这里用的是页面的真实脚本（接口、RevoGrid 打桩），不是模板字符串匹配。
 */

globalThis.definePageMeta = () => {}
globalThis.defineStore = defineStore
globalThis.useToast = () => ({ add: () => {} })
setActivePinia(createPinia())

const state = vi.hoisted(() => ({ list: { rows: [], total: 0 }, quotation: null, listCalls: [] }))

vi.mock('@/api/tk_custom/quotation', () => {
  const ok = vi.fn(async () => ({ code: 200, data: { id: 5 } }))
  return {
    listQuotations: vi.fn(async (query) => {
      state.listCalls.push(query)
      return { code: 200, rows: state.list.rows, total: state.list.total }
    }),
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

/** 手机 / 桌面视口：页面用 @vueuse 的 useMediaQuery('(max-width: 639px)') 判定 */
function setPhoneViewport(phone) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query) => ({
      matches: phone,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }),
  })
}

/** store 必须动态取：静态 import 会在 globalThis.defineStore 之前执行，store 模块会报 defineStore is not defined */
async function userStore() {
  const mod = await import('@/store/modules/user')
  return mod.default()
}

async function mountPage() {
  const page = await import(PAGE)
  const grid = await import('../../app/packages/ui/TkQuotationGrid.vue')
  const cards = await import('../../app/packages/ui/TkQuotationLineCards.vue')
  const wrapper = mount(page.default, {
    global: {
      components: { TkQuotationGrid: grid.default, TkQuotationLineCards: cards.default },
      stubs: {
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

function pendingInitialDetail() {
  return {
    id: 5,
    quoteNo: 'BJ2026091700001',
    customerName: '深圳客户A',
    salespersonName: '张三',
    createTime: '2026-09-18 09:08:53',
    status: 'PENDING_INITIAL',
    statusLabel: '待初审',
    canEditDraft: false,
    canInitialReview: true,
    canSecondReview: false,
    canFinalReview: false,
    deliveryTerms: 'FOB Shenzhen',
    validity: '30days',
    paymentTerm: 'Net 30 days',
    lines: [
      { id: 1, lineNo: 1, ctkMpn: 'AD-3.0SMDJ22CA', packageName: 'SMC', qty: 5, unit: 'kpcs', originalPriceRmb: 12.44, rate: 7.1 },
      { id: 2, lineNo: 2, ctkMpn: 'N-XXX', packageName: 'SMB', qty: 3, unit: 'kpcs', originalPriceRmb: 0, rate: 7.1 },
    ],
    revisions: [],
  }
}

describe('报价单移动端审核', () => {
  it('城市随草稿回显、提交和撤销重做，并在新建时清空', async () => {
    const store = await userStore()
    store.permissions = ['tk_custom:quotation:list', 'tk_custom:quotation:upload']
    state.quotation = { ...pendingInitialDetail(), city: 'Mumbai', status: 'DRAFT', canEditDraft: true }
    const api = await import('@/api/tk_custom/quotation')
    const { wrapper, state: pageState } = await mountPage()
    await pageState.openEdit({ id: 5 })
    expect(pageState.formData.city).toBe('Mumbai')
    expect(wrapper.html()).toContain('城市 / City')
    pageState.recordFormHistory()
    pageState.formData.city = '深圳 / Shenzhen'
    pageState.undoFormEdit()
    expect(pageState.formData.city).toBe('Mumbai')
    pageState.redoFormEdit()
    expect(pageState.formData.city).toBe('深圳 / Shenzhen')
    await pageState.submitFormQuotation('save')
    expect(api.updateQuotation).toHaveBeenCalledWith(5, expect.objectContaining({ city: '深圳 / Shenzhen' }))
    await pageState.openRecord({ id: 5 })
    expect(pageState.detail.city).toBe('Mumbai')
    pageState.openUpload()
    expect(pageState.formData.city).toBe('')
    wrapper.unmount()
  })

  beforeEach(() => {
    state.list = { rows: [], total: 0 }
    state.quotation = null
    state.listCalls = []
    setPhoneViewport(false)
    // 模块级 vi.fn 在用例之间共享：不清调用记录，后面的 not.toHaveBeenCalled() 会被上一个用例带红
    vi.clearAllMocks()
  })

  it('手机视口：明细渲染只读卡片，不再渲染只读网格', async () => {
    const store = await userStore()
    store.permissions = ['tk_custom:quotation:list', 'tk_custom:quotation:initialReview']
    setPhoneViewport(true)
    state.quotation = pendingInitialDetail()
    const { wrapper, state: pageState } = await mountPage()

    expect(pageState.isPhone).toBe(true)
    await pageState.openRecord({ id: 5 })
    await flushPromises()

    expect(wrapper.findComponent({ name: 'TkQuotationLineCards' }).exists()).toBe(true)
    // 24 列网格在 375px 屏上只能盲滑，手机端不该再出现
    const readonlyGrid = wrapper.findAllComponents({ name: 'VGrid' }).find((item) => item.props('readonly') === true)
    expect(readonlyGrid).toBeUndefined()
    // 手机弹窗走全屏（vh → dvh 回退写在 global.css 的 .quotation-phone-modal 里）
    expect(pageState.detailModalUi.content).toContain('quotation-phone-modal')
    expect(pageState.detailModalUi.footer).toContain('quotation-phone-footer')
    wrapper.unmount()
  })

  it('桌面视口：审核明细仍是只读网格（回归，不能被手机改造带偏）', async () => {
    const store = await userStore()
    store.permissions = ['tk_custom:quotation:list', 'tk_custom:quotation:initialReview']
    state.quotation = pendingInitialDetail()
    const { wrapper, state: pageState } = await mountPage()

    expect(pageState.isPhone).toBe(false)
    await pageState.openRecord({ id: 5 })
    await flushPromises()

    expect(wrapper.findComponent({ name: 'TkQuotationLineCards' }).exists()).toBe(false)
    const readonlyGrid = wrapper.findAllComponents({ name: 'VGrid' }).find((item) => item.props('readonly') === true)
    expect(readonlyGrid, '桌面端必须还有只读的审核明细网格').toBeTruthy()
    expect(pageState.detailModalUi.content).not.toContain('quotation-phone-modal')
    wrapper.unmount()
  })

  it('退回意见为空：不进入确认态、不调接口，错误贴在输入框上', async () => {
    const store = await userStore()
    store.permissions = ['tk_custom:quotation:list', 'tk_custom:quotation:initialReview']
    state.quotation = pendingInitialDetail()
    const api = await import('@/api/tk_custom/quotation')
    const { wrapper, state: pageState } = await mountPage()

    await pageState.openRecord({ id: 5 })
    await flushPromises()
    pageState.startReview()
    await flushPromises()

    pageState.reviewComment = ''
    pageState.requestReview('return')
    await flushPromises()

    expect(pageState.reviewCommentError).toContain('退回必须填写审核原因')
    expect(pageState.pendingReviewAction).toBe('')
    expect(api.reviewQuotation).not.toHaveBeenCalled()
    expect(wrapper.html()).toContain('退回必须填写审核原因')
    wrapper.unmount()
  })

  it('填了意见先出二次确认条，确认后才真正提交一次', async () => {
    const store = await userStore()
    store.permissions = ['tk_custom:quotation:list', 'tk_custom:quotation:initialReview']
    state.quotation = pendingInitialDetail()
    const api = await import('@/api/tk_custom/quotation')
    const { wrapper, state: pageState } = await mountPage()

    await pageState.openRecord({ id: 5 })
    await flushPromises()
    pageState.startReview()
    pageState.reviewComment = '价格偏高，请业务员重报'
    pageState.requestReview('return')
    await flushPromises()

    // 只进入确认态：还没提交
    expect(pageState.pendingReviewAction).toBe('return')
    expect(api.reviewQuotation).not.toHaveBeenCalled()
    const confirmHtml = wrapper.html()
    expect(confirmHtml).toContain('确认退回')
    expect(confirmHtml).toContain('BJ2026091700001')
    expect(confirmHtml).toContain('从初审重跑')

    pageState.confirmReview()
    await flushPromises()
    expect(api.reviewQuotation).toHaveBeenCalledTimes(1)
    expect(api.reviewQuotation).toHaveBeenCalledWith(expect.objectContaining({ action: 'return', stage: 'initial', comment: '价格偏高，请业务员重报' }))
    wrapper.unmount()
  })

  it('确认条可以取消：取消后不提交，退回接口一次都没调', async () => {
    const store = await userStore()
    store.permissions = ['tk_custom:quotation:list', 'tk_custom:quotation:initialReview']
    state.quotation = pendingInitialDetail()
    const api = await import('@/api/tk_custom/quotation')
    const { wrapper, state: pageState } = await mountPage()

    await pageState.openRecord({ id: 5 })
    await flushPromises()
    pageState.startReview()
    pageState.reviewComment = '型号写错了'
    pageState.requestReview('return')
    await flushPromises()
    pageState.cancelPendingReview()
    await flushPromises()

    expect(pageState.pendingReviewAction).toBe('')
    expect(api.reviewQuotation).not.toHaveBeenCalled()
    // 意见还在，避免误点取消后还要重打一遍
    expect(pageState.reviewComment).toBe('型号写错了')
    wrapper.unmount()
  })

  it('通过同样要确认，确认文案说明流转到下一环节', async () => {
    const store = await userStore()
    store.permissions = ['tk_custom:quotation:list', 'tk_custom:quotation:initialReview']
    state.quotation = pendingInitialDetail()
    const api = await import('@/api/tk_custom/quotation')
    const { wrapper, state: pageState } = await mountPage()

    await pageState.openRecord({ id: 5 })
    await flushPromises()
    pageState.startReview()
    pageState.requestReview('approve')
    await flushPromises()

    expect(pageState.pendingReviewAction).toBe('approve')
    expect(wrapper.html()).toContain('确认通过')
    expect(api.reviewQuotation).not.toHaveBeenCalled()

    pageState.confirmReview()
    await flushPromises()
    expect(api.reviewQuotation).toHaveBeenCalledWith(expect.objectContaining({ action: 'approve' }))
    wrapper.unmount()
  })

  it('手机视口：顶部只留一行摘要，条款与业务员收进折叠，展开才铺开', async () => {
    const store = await userStore()
    store.permissions = ['tk_custom:quotation:list', 'tk_custom:quotation:initialReview']
    setPhoneViewport(true)
    state.quotation = pendingInitialDetail()
    const { wrapper, state: pageState } = await mountPage()

    await pageState.openRecord({ id: 5 })
    await flushPromises()

    // 摘要行：客户 + 状态 + 单号 + 短时间（折叠态）
    const collapsed = wrapper.html()
    expect(pageState.phoneInfoOpen).toBe(false)
    expect(collapsed).toContain('深圳客户A')
    expect(collapsed).toContain('待初审')
    expect(collapsed).toContain('BJ2026091700001')
    expect(collapsed).toContain('09-18 09:08')
    expect(collapsed).toContain('条款与信息')
    // 折叠态不该出现业务员与贸易条款（那是展开后才看的）
    expect(collapsed).not.toContain('业务员：')
    expect(collapsed).not.toContain('贸易条款：')

    pageState.phoneInfoOpen = true
    await flushPromises()
    const expanded = wrapper.html()
    expect(expanded).toContain('业务员：')
    expect(expanded).toContain('贸易条款：')
    expect(expanded).toContain('收起')
    // 展开区不能再把摘要行已有的信息渲染第二遍（客户名/单号/提交时间/状态都在摘要里了）
    const countOf = (haystack, needle) => haystack.split(needle).length - 1
    expect(countOf(expanded, '深圳客户A')).toBe(1)
    expect(countOf(expanded, 'BJ2026091700001')).toBe(1)
    expect(countOf(expanded, '2026-09-18 09:08:53')).toBe(0)
    // 标题侧：手机不带单号（桌面才带）
    expect(pageState.detailModalTitle).toBe('报价单详情')
    wrapper.unmount()
  })

  it('手机视口：明细搜索默认收成图标，点开才有输入框', async () => {
    const store = await userStore()
    store.permissions = ['tk_custom:quotation:list', 'tk_custom:quotation:initialReview']
    setPhoneViewport(true)
    state.quotation = pendingInitialDetail()
    const { wrapper, state: pageState } = await mountPage()

    await pageState.openRecord({ id: 5 })
    await flushPromises()
    expect(pageState.phoneSearchOpen).toBe(false)
    expect(wrapper.html()).not.toContain('快速筛选型号、封装、描述…')

    await pageState.openPhoneSearch()
    await flushPromises()
    expect(pageState.phoneSearchOpen).toBe(true)
    expect(wrapper.html()).toContain('快速筛选型号、封装、描述…')

    pageState.detailSearch = 'XXX'
    await pageState.closePhoneSearch()
    await flushPromises()
    // 收起时把筛选词也清掉，否则列表还筛着、输入框却看不见了
    expect(pageState.detailSearch).toBe('')
    expect(wrapper.html()).not.toContain('快速筛选型号、封装、描述…')
    wrapper.unmount()
  })

  it('手机视口：底部只留主操作，撤回/编辑/删除/下载收进「⋯」', async () => {
    const store = await userStore()
    store.permissions = ['tk_custom:quotation:list', 'tk_custom:quotation:initialReview', 'tk_custom:quotation:download']
    setPhoneViewport(true)
    state.quotation = pendingInitialDetail()
    const { wrapper, state: pageState } = await mountPage()

    await pageState.openRecord({ id: 5 })
    await flushPromises()

    // 初审人看到的是「开始初审」这一颗大按钮
    expect(pageState.phonePrimaryAction.label).toBe('开始初审')
    expect(pageState.phonePrimaryAction.color).toBe('primary')
    const html = wrapper.html()
    expect(html).toContain('开始初审')
    // 撤回是业务员动作，不在初审人手机上直接摆出来；关闭交给弹窗右上角的 ×
    // （用 >撤回为草稿< 判定：注释里出现同名字样不算，Vue dev 会把注释渲染进 html）
    expect(html).not.toContain('>撤回为草稿<')
    expect(pageState.phoneDetailMenuItems).toEqual([])

    // 已通过 + 有下载权限：下载收进菜单
    pageState.detail = { ...pageState.detail, status: 'APPROVED', canInitialReview: false, canDownload: true, canEditDraft: false }
    await flushPromises()
    expect(pageState.phonePrimaryAction).toBe(null)
    expect(pageState.phoneDetailMenuItems.map((item) => item.label)).toEqual(['下载已审核 Excel'])
    expect(wrapper.html()).toContain('关闭')
    wrapper.unmount()
  })

  it('桌面视口：弹窗标题仍带单号', async () => {
    const store = await userStore()
    store.permissions = ['tk_custom:quotation:list', 'tk_custom:quotation:initialReview']
    state.quotation = pendingInitialDetail()
    const { wrapper, state: pageState } = await mountPage()

    await pageState.openRecord({ id: 5 })
    await flushPromises()
    expect(pageState.detailModalTitle).toBe('报价单详情 · BJ2026091700001')
    wrapper.unmount()
  })

  it('桌面视口：折叠与底部收口都不生效（原样保留）', async () => {
    const store = await userStore()
    store.permissions = ['tk_custom:quotation:list', 'tk_custom:quotation:initialReview']
    state.quotation = pendingInitialDetail()
    const { wrapper, state: pageState } = await mountPage()

    await pageState.openRecord({ id: 5 })
    await flushPromises()
    const html = wrapper.html()
    // 桌面常驻展开：业务员、贸易条款、搜索框、关闭按钮都在
    expect(html).toContain('业务员：')
    expect(html).toContain('贸易条款：')
    expect(html).toContain('快速筛选型号、封装、描述…')
    expect(html).toContain('关闭')
    expect(html).toContain('开始初审')
    wrapper.unmount()
  })

  it('手机短时间只截到「09-18 09:08」', async () => {
    const store = await userStore()
    store.permissions = ['tk_custom:quotation:list']
    const { wrapper, state: pageState } = await mountPage()

    expect(pageState.phoneShortTime('2026-09-18 09:08:53')).toBe('09-18 09:08')
    expect(pageState.phoneShortTime('')).toBe('未填')
    expect(pageState.phoneShortTime(null)).toBe('未填')
    wrapper.unmount()
  })

  it('审核意见框全页只有一处（顶部再放一个会让人以为填错了地方）', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/pages/tk_custom/quotation/index.vue'), 'utf8')
    const occurrences = source.split('填写审核意见，退回时请说明修改原因').length - 1
    expect(occurrences).toBe(1)
    expect(source).toContain('<UTextarea')
    expect(source).toContain('v-if="!isPhone && !reviewStage"')
  })

  it('手机全屏弹窗高度写成 vh → dvh 两行声明，不认 dvh 的浏览器能退回 vh', () => {
    const css = readFileSync(resolve(process.cwd(), 'app/assets/styles/global.css'), 'utf8')
    const start = css.indexOf('.quotation-phone-modal {')
    expect(start, '找不到手机端全屏弹窗样式').toBeGreaterThan(-1)
    const body = css.slice(start, css.indexOf('}', start))
    const vhIndex = body.indexOf('height: 100vh;')
    const dvhIndex = body.indexOf('height: 100dvh;')
    expect(vhIndex).toBeGreaterThan(-1)
    expect(dvhIndex).toBeGreaterThan(vhIndex)
    // 底部操作条要躲开 iPhone 的 home indicator
    expect(css).toContain('env(safe-area-inset-bottom')
  })

  it('列表默认就是全部单据：任何账号进来都不被「待审」视图过滤（入口已删）', async () => {
    const store = await userStore()
    // 给到审核权限也一样：列表数据源必须还是 rows 全量，页面上不该再有待审按钮
    store.permissions = ['tk_custom:quotation:list', 'tk_custom:quotation:upload', 'tk_custom:quotation:initialReview']
    state.list = {
      rows: [
        { id: 9, quoteNo: 'BJ2', status: 'PENDING_INITIAL', canInitialReview: true },
        { id: 10, quoteNo: 'BJ3', status: 'DRAFT', canInitialReview: false },
      ],
      total: 2,
    }
    const { wrapper, state: pageState } = await mountPage()

    expect(pageState.rows).toHaveLength(2)
    const listCall = state.listCalls.filter((call) => call.pageSize !== 1).at(-1)
    expect(listCall.status || '').toBe('')
    const html = wrapper.html()
    expect(html).not.toContain('待我初审')
    expect(html).not.toContain('待我终审')
    expect(html).not.toContain('待我二审')
    // 只剩「状态」下拉这条筛选路径
    expect(html).toContain('全部状态')
    wrapper.unmount()
  })

  it('手机卡片列表：待初审单子点「审核」直接进审核态（省掉再按一次开始初审）', async () => {
    const store = await userStore()
    store.permissions = ['tk_custom:quotation:list', 'tk_custom:quotation:initialReview']
    const row = { id: 5, quoteNo: 'BJ2026091700001', status: 'PENDING_INITIAL', statusLabel: '待初审', canInitialReview: true }
    state.quotation = pendingInitialDetail()
    const { wrapper, state: pageState } = await mountPage()

    expect(pageState.canReviewRow(row)).toBe(true)
    expect(pageState.canReviewRow({ id: 6, status: 'PENDING_INITIAL', canInitialReview: false })).toBe(false)

    await pageState.openReview(row)
    await flushPromises()
    expect(pageState.detailOpen).toBe(true)
    expect(pageState.reviewStage).toBe('initial')
    wrapper.unmount()
  })

  it('手机卡片：主操作摆卡片上，撤回/删除/下载收进「⋯」，没有就是空菜单', async () => {
    const store = await userStore()
    store.permissions = ['tk_custom:quotation:list', 'tk_custom:quotation:initialReview', 'tk_custom:quotation:download']
    const { wrapper, state: pageState } = await mountPage()

    // 待初审（别人提交的）：既不能编辑也不能撤回到我名下 → 只有审核 + 查看
    expect(pageState.phoneCardMenuItems({ id: 1, status: 'PENDING_INITIAL', canInitialReview: true })).toEqual([])
    // 我的草稿：删除收进菜单
    const draftMenu = pageState.phoneCardMenuItems({ id: 2, status: 'DRAFT', canDeleteDraft: true, salespersonId: 7 })
    expect(draftMenu.map((item) => item.label)).toEqual(['删除草稿'])
    // 已通过：下载收进菜单
    const approvedMenu = pageState.phoneCardMenuItems({ id: 3, status: 'APPROVED', canDownload: true })
    expect(approvedMenu.map((item) => item.label)).toEqual(['下载已审核'])

    // 接线：卡片整块点击打开详情，按钮不冒泡到卡片；次要操作走下拉菜单
    const source = readFileSync(resolve(process.cwd(), 'app/pages/tk_custom/quotation/index.vue'), 'utf8')
    expect(source).toContain('@click="openReview(row)"')
    expect(source).toContain('@click="openRecord(row)"')
    expect(source).toContain(':items="phoneCardMenuItems(row)"')
    expect(source).toContain('data-row-interaction="ignore" @click.stop')
    wrapper.unmount()
  })

})
