// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Filter from '../packages/ui/TkQuotationAnalysisFilter.vue'
const wrappers = []
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); vi.useRealTimers() })
function render(fetchOptions) {
  const wrapper = mount(Filter, { props: { field: 'manufacturerMpn', label: '友商型号', modelValue: '', filters: { manufacturer: 'TI', status: 'APPROVED' }, fetchOptions }, global: { stubs: { UFormField: { template: '<div><slot /></div>' }, USelectMenu: { name: 'USelectMenu', props: ['items', 'modelValue', 'searchTerm', 'loading'], emits: ['update:open', 'update:searchTerm', 'update:modelValue'], template: '<div />' } } } })
  wrappers.push(wrapper)
  return wrapper
}
describe('报价搜索选择框', () => {
  it('打开时从现有数据搜索，选择和清除值，关键词请求保留其他条件', async () => {
    vi.useFakeTimers()
    const request = vi.fn(async () => ({ code: 200, data: { items: ['LM358'], hasMore: false } }))
    const wrapper = render(request), menu = wrapper.findComponent({ name: 'USelectMenu' })
    menu.vm.$emit('update:open', true)
    await flushPromises()
    expect(menu.props('items')).toContainEqual({ label: 'LM358', value: 'LM358' })
    expect(menu.props('items').every(item => item.value !== '')).toBe(true)
    menu.vm.$emit('update:modelValue', 'LM358')
    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual(['LM358'])
    menu.vm.$emit('update:searchTerm', 'LM')
    await wrapper.vm.$nextTick()
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    expect(request).toHaveBeenLastCalledWith({ manufacturer: 'TI', status: 'APPROVED', optionsField: 'manufacturerMpn', optionsSearch: 'LM' })
    menu.vm.$emit('update:modelValue', undefined)
    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([''])
  })
  it('旧请求晚返回不会覆盖新搜索结果', async () => {
    vi.useFakeTimers()
    let resolveOld
    const request = vi.fn().mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve })).mockResolvedValueOnce({ code: 200, data: { items: ['NEW'] } })
    const wrapper = render(request), menu = wrapper.findComponent({ name: 'USelectMenu' })
    menu.vm.$emit('update:open', true)
    menu.vm.$emit('update:searchTerm', 'NEW')
    await wrapper.vm.$nextTick()
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    resolveOld({ code: 200, data: { items: ['OLD'] } })
    await flushPromises()
    expect(menu.props('items')).toContainEqual({ label: 'NEW', value: 'NEW' })
    expect(menu.props('items')).not.toContainEqual({ label: 'OLD', value: 'OLD' })
  })
})
