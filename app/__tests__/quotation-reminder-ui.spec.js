// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const state = vi.hoisted(() => ({ foreign: vi.fn(), domestic: vi.fn(), toast: vi.fn() }))
vi.mock('@/api/tk_custom/quotation', () => ({ remindQuotation: state.foreign }))
vi.mock('@/api/tk_custom/domesticQuotation', () => ({ remindDomesticQuotation: state.domestic }))
import Button from '../packages/ui/TkQuotationRemindButton.vue'

function render(quotation = { id: 10, status: 'PENDING_INITIAL', canRemind: true }, businessType = 'FOREIGN') {
  return mount(Button, { props: { quotation, businessType }, global: { stubs: {
    UButton: { props: ['disabled', 'loading'], template: '<button :disabled="disabled || loading"><slot /></button>' },
  } } })
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('useToast', () => ({ add: state.toast }))
  state.foreign.mockReset().mockResolvedValue({ code: 200 })
  state.domestic.mockReset().mockResolvedValue({ code: 200 })
  state.toast.mockReset()
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('applicant-only reminder button', () => {
  it('hides the button without the server applicant capability', () => {
    const wrapper = render({ id: 10, status: 'PENDING_INITIAL', canRemind: false })
    expect(wrapper.find('button').exists()).toBe(false)
    wrapper.unmount()
  })

  it('sends once, blocks rapid clicks, and allows another reminder after an hour', async () => {
    const wrapper = render()
    await wrapper.find('button').trigger('click'); await flushPromises()
    expect(state.foreign).toHaveBeenCalledWith(10)
    expect(wrapper.text()).toBe('已催审批')
    await wrapper.find('button').trigger('click')
    expect(state.foreign).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
    expect(wrapper.find('button').attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('uses the domestic endpoint and shows a delivery failure without false success', async () => {
    state.domestic.mockResolvedValue({ code: 502, msg: '发送结果待核查' })
    const wrapper = render(undefined, 'DOMESTIC')
    await wrapper.find('button').trigger('click'); await flushPromises()
    expect(state.domestic).toHaveBeenCalledWith(10)
    expect(state.foreign).not.toHaveBeenCalled()
    expect(state.toast).toHaveBeenCalledWith({ title: '发送结果待核查', color: 'error' })
    expect(wrapper.text()).toBe('催审批')
    wrapper.unmount()
  })

  it('does not apply a previous document send result to a new document', async () => {
    let finish
    state.foreign.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const wrapper = render()
    await wrapper.find('button').trigger('click')
    await wrapper.setProps({ quotation: { id: 11, status: 'PENDING_SECOND', canRemind: true } })
    finish({ code: 200 }); await flushPromises()
    expect(wrapper.text()).toBe('催审批')
    expect(wrapper.find('button').attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })
})
