// @vitest-environment happy-dom
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Analysis from '../packages/ui/TkQuotationAnalysis.vue'
import { quotationPriceAdjustment } from '../packages/shared/quotationAnalysis.js'

const api = vi.hoisted(() => ({ foreign: vi.fn(), domestic: vi.fn(), download: vi.fn(), foreignExport: vi.fn(() => '/foreign-export') }))
vi.mock('../api/tk_custom/quotation', () => ({ getQuotationAnalysis: api.foreign, getQuotationAnalysisExportUrl: api.foreignExport }))
vi.mock('../api/tk_custom/domesticQuotation', () => ({ getDomesticQuotationAnalysis: api.domestic, getDomesticQuotationAnalysisExportUrl: () => '/domestic-export' }))
vi.mock('../utils/request', () => ({ download: api.download }))

const row = { key: 'a', customerName: '客户%甲', ctkMpn: 'CTK_01', unit: 'KPCS', lineCount: 120, quoteCount: 4, latestFinalRmb: 9, minFinalRmb: 8, maxFinalRmb: 10, averageFinalRmb: 9 }
const detail = { quoteNo: 'Q1', lineNo: 1, customerName: row.customerName, ctkMpn: row.ctkMpn, unit: row.unit, originalPriceRmb: 10, finalPriceRmb: 9, originalPriceUsd: 2, finalPriceUsd: 1.5 }
const response = { code: 200, data: { quoteCount: 4, lineCount: 120, rows: [row], detailRows: [detail], detailPage: 1 } }
const Table = defineComponent({ props: ['data', 'columns', 'onSelect'], setup: (props, { slots }) => () => h('div', props.data.map(original => h('div', [props.onSelect ? h('button', { onClick: () => props.onSelect({}, { original }) }, '选择汇总行') : null, ...props.columns.map(column => slots[`${column.id}-cell`]?.({ row: { original } }))]))) })
const Button = defineComponent({ setup: (_p, { slots, attrs }) => () => h('button', attrs, slots.default?.()) })
const Passthrough = defineComponent({ setup: (_p, { slots }) => () => h('div', slots.default?.()) })
const Tabs = defineComponent({ props: ['items'], emits: ['update:modelValue'], setup: (props, { emit }) => () => h('div', props.items.map(item => h('button', { onClick: () => emit('update:modelValue', item.value) }, item.label))) })
const Input = defineComponent({ props: ['modelValue'], emits: ['update:modelValue'], setup: (props, { attrs, emit }) => () => h('input', { ...attrs, value: props.modelValue, onInput: event => emit('update:modelValue', event.target.value) }) })
const Select = defineComponent({ props: ['modelValue', 'items'], emits: ['update:modelValue'], setup: (props, { attrs, emit }) => () => h('select', { ...attrs, value: props.modelValue, onChange: event => emit('update:modelValue', event.target.value) }, props.items.map(item => h('option', { value: item.value }, item.label))) })
const wrappers = []
const Filter = defineComponent({ props: ['modelValue', 'placeholder', 'label'], emits: ['update:modelValue'], setup: (props, { emit }) => () => h('input', { placeholder: props.placeholder || props.label, value: props.modelValue, onInput: event => emit('update:modelValue', event.target.value) }) })
function render(props = {}) {
  const wrapper = mount(Analysis, { props, global: { stubs: { TkQuotationAnalysisFilter: Filter, TkDateRangePicker: Passthrough, UTable: Table, UButton: Button, UTooltip: Passthrough, UFieldGroup: Passthrough, UFormField: Passthrough, UPopover: Passthrough, UIcon: true, UBadge: Passthrough, UInput: Input, UCalendar: true, UTabs: Tabs, USelect: Select, UPagination: true, UAlert: true, USkeleton: true, UEmpty: true } } })
  wrappers.push(wrapper)
  return wrapper
}
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('useToast', () => ({ add: vi.fn() })); api.foreign.mockResolvedValue(response); api.domestic.mockResolvedValue(response) })
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); vi.unstubAllGlobals() })

describe('报价分析交互', () => {
  it('应用和友商等组合筛选会传给查询与导出，未分析的新输入不会偷换导出条件', async () => {
    const wrapper = render({ canExport: true })
    await flushPromises()
    await wrapper.find('input[placeholder="产品应用"]').setValue('电源')
    await wrapper.find('input[placeholder="友商名称"]').setValue('TI')
    await wrapper.find('input[placeholder="友商型号"]').setValue('LM358')
    await wrapper.find('input[placeholder="CTK 型号"]').setValue('CTK-LM358')
    await wrapper.find('input[placeholder="客户名称"]').setValue('客户甲')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    const filters = expect.objectContaining({ application: '电源', manufacturer: 'TI', manufacturerMpn: 'LM358', ctkMpn: 'CTK-LM358', customer: '客户甲', status: 'APPROVED' })
    expect(api.foreign).toHaveBeenLastCalledWith(filters)
    await wrapper.find('input[placeholder="产品应用"]').setValue('未分析新条件')
    await wrapper.findAll('button').find(button => button.text() === '导出筛选结果').trigger('click')
    await flushPromises()
    expect(api.foreignExport).toHaveBeenLastCalledWith(filters)
    await wrapper.findAll('button').find(button => button.attributes('aria-label') === '重置筛选').trigger('click')
    await flushPromises()
    expect(api.foreign).toHaveBeenLastCalledWith(expect.objectContaining({ application: '', manufacturer: '', manufacturerMpn: '', ctkMpn: '', customer: '', status: 'APPROVED' }))
  })
  it('选择汇总行精确查询历史，切换美元显示同一批明细的美元调价', async () => {
    const wrapper = render()
    await flushPromises()
    expect(wrapper.text()).toContain('￥9.00')
    await wrapper.findAll('button').find(button => button.text() === '价格汇总').trigger('click')
    await wrapper.findAll('button').find(button => button.text() === '选择汇总行').trigger('click')
    await flushPromises()
    expect(api.foreign).toHaveBeenLastCalledWith(expect.objectContaining({ detailsOnly: '1', groupCustomer: '客户%甲', groupMpn: 'CTK_01', groupUnit: 'KPCS', detailPage: 1 }))
    expect(wrapper.text()).toContain('-1.00 (-10.0%)')
    await wrapper.findAll('button').find(button => button.text() === '美元').trigger('click')
    expect(wrapper.text()).toContain('-0.50 (-25.0%)')
    await wrapper.findAll('button').find(button => button.text() === '全部明细').trigger('click')
    await flushPromises()
    expect(api.foreign).toHaveBeenLastCalledWith(expect.objectContaining({ customer: '', ctkMpn: '', from: '', to: '', detailsOnly: '1', detailPage: 1, application: '', manufacturer: '', manufacturerMpn: '', country: '', status: 'APPROVED' }))
  })
  it('内贸仅使用内贸接口，并保持人民币模式', async () => {
    const wrapper = render({ businessType: 'DOMESTIC' })
    await flushPromises()
    expect(api.domestic).toHaveBeenCalledTimes(1)
    expect(api.foreign).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('美元')
  })
  it('组合导出带精确匹配条件，状态选择会传给接口', async () => {
    const wrapper = render({ canExport: true })
    await flushPromises()
    await wrapper.find('select').setValue('ALL')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.foreign).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'ALL' }))
    await wrapper.findAll('button').find(button => button.text() === '价格汇总').trigger('click')
    await wrapper.findAll('button').find(button => button.text() === '选择汇总行').trigger('click')
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === '导出当前组合').trigger('click')
    await flushPromises()
    expect(api.foreignExport).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'ALL', groupCustomer: row.customerName, groupMpn: row.ctkMpn, groupUnit: row.unit }))
  })
  it('新查询先返回后，旧响应不得覆盖结果', async () => {
    let resolveOld
    api.foreign.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve }))
    const wrapper = render()
    await wrapper.vm.loadAnalysis()
    resolveOld({ code: 200, data: { rows: [], quoteCount: 99 } })
    await flushPromises()
    expect(wrapper.text()).toContain(row.customerName)
    expect(wrapper.text()).not.toContain('99')
  })
})

describe('报价调价幅度', () => {
  it('缺失不回退，原价为零时不产生无穷百分比', () => {
    expect(quotationPriceAdjustment(null, 9)).toBeNull()
    expect(quotationPriceAdjustment(10, null)).toBeNull()
    expect(quotationPriceAdjustment('', 9)).toBeNull()
    expect(quotationPriceAdjustment(0, 9)).toEqual({ delta: 9, percent: null })
    expect(quotationPriceAdjustment(10, 9)).toEqual({ delta: -1, percent: -10 })
  })
})
