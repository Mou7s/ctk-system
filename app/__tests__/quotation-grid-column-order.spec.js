// @vitest-environment happy-dom
// 需要 DOM：本文件 mount 组件/flushPromises，默认的 node 环境没有 document
import { describe, expect, it, vi } from 'vitest'
import { createPinia, defineStore, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { QUOTATION_GRID_BASE_COLUMNS, QUOTATION_GRID_DISPLAY_COLUMN_PROPS } from '@ctk-system/shared'

globalThis.definePageMeta = () => {}
globalThis.defineStore = defineStore
globalThis.useToast = () => ({ add: () => {} })
setActivePinia(createPinia())

// RevoGrid 是自定义元素，测试里换成能读出 columns 属性的桩：
// 断言的是组件真实传给网格的列顺序，而不是源码字符串。
vi.mock('@revolist/vue3-datagrid', () => ({
  default: { name: 'VGrid', props: ['columns', 'source'], template: '<div class="v-grid-stub" />' },
}))

vi.mock('@/api/tk_custom/quotation', () => {
  const ok = vi.fn(async () => ({ code: 200, data: { rows: [], total: 0 } }))
  return {
    listQuotations: ok,
    getQuotation: ok,
    searchQuotationOptions: vi.fn(async () => ({ code: 200, data: [] })),
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

const GRID = '../../app/packages/ui/TkQuotationGrid.vue'

async function mountGrid(props = {}) {
  const grid = await import(GRID)
  const wrapper = mount(grid.default, { props })
  const columns = wrapper.findComponent({ name: 'VGrid' }).props('columns')
  return { wrapper, columns }
}

// 默认基础列仍保留组件的通用顺序；外贸报价页面显式传入模板列序，让录入、粘贴和详情一致。
describe('quotation grid column order', () => {
  it('网格价格列固定为「业务员报价 + 成交价」两组，规格书固定在最后', async () => {
    const { wrapper: gridWrapper, columns } = await mountGrid()
    const gridProps = columns.map((column) => column.prop)

    // 前 11 列与共享基础列一致
    expect(gridProps.slice(0, QUOTATION_GRID_BASE_COLUMNS.length))
      .toEqual(QUOTATION_GRID_BASE_COLUMNS.map((column) => column.prop))
    // 列顺序与 Excel 模板 A..P 对齐：单价(元) → 两列按汇率算出的美元价 → 交期 → 规格书 → 备注；
    // 汇率与客户/国家/性质已提升至表头，成交价两列是系统内部概念，固定排在最后
    expect(gridProps.slice(QUOTATION_GRID_BASE_COLUMNS.length)).toEqual([
      'originalPriceRmb', 'usdKpcs', 'usdPc', 'leadTime', 'datasheet', 'remark',
      'displayPriceRmb', 'displayPriceUsd',
    ])

    gridWrapper.unmount()
  })

  it('applies the current foreign template order when the page supplies it', async () => {
    const { wrapper: gridWrapper, columns } = await mountGrid({ columnOrder: QUOTATION_GRID_DISPLAY_COLUMN_PROPS })
    const gridProps = columns.map((column) => column.prop)

    expect(gridProps.indexOf('dieSize')).toBe(gridProps.indexOf('packageName') + 1)
    expect(gridProps.slice(0, QUOTATION_GRID_DISPLAY_COLUMN_PROPS.length)).toEqual(QUOTATION_GRID_DISPLAY_COLUMN_PROPS)
    expect(gridProps.slice(QUOTATION_GRID_DISPLAY_COLUMN_PROPS.length)).toEqual(['displayPriceRmb', 'displayPriceUsd'])

    gridWrapper.unmount()
  })

  it('国家、客户性质、汇率、客户名称已从明细网格提升至单头统一录入', async () => {
    const { wrapper: gridWrapper } = await mountGrid()
    await flushPromises()
    await nextTick()
    const columns = gridWrapper.findComponent({ name: 'VGrid' }).props('columns')
    const byProp = new Map(columns.map((column) => [column.prop, column]))

    // 国家、客户性质、客户、报价日期、汇率、单位均已移出明细网格
    expect(byProp.has('country')).toBe(false)
    expect(byProp.has('customerStyle')).toBe(false)
    expect(byProp.has('quoteTo')).toBe(false)
    expect(byProp.has('quoteDate')).toBe(false)
    expect(byProp.has('rate')).toBe(false)
    expect(byProp.has('unit')).toBe(false)

    gridWrapper.unmount()
  })
})
