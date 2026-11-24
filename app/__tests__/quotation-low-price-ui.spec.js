// @vitest-environment happy-dom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const state = vi.hoisted(() => ({ check: vi.fn() }))
vi.mock('@/api/tk_custom/quotation', () => ({ checkQuotationPrices: state.check }))
import Notice from '../packages/ui/TkQuotationLowPriceNotice.vue'
import { confirmQuotationLowPrices } from '../utils/quotationLowPrice'

const warning = { lineNo: 1, ctkMpn: 'ABC', currentPrice: 60, previousPrice: 80, decreasePercent: 25, customerName: '历史客户', quoteNo: 'H1' }
describe('quotation price reminders', () => {
  beforeEach(() => { state.check.mockReset(); vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it('shows a scoped reminder when the entered price is lower', async () => {
    state.check.mockResolvedValue({ code: 200, data: [warning] })
    const wrapper = mount(Notice, { props: { businessType: 'DOMESTIC', customerName: '客户A', lines: [{ ctkMpn: 'ABC', unit: 'PCS', originalPriceRmb: .06 }] } })
    await vi.advanceTimersByTimeAsync(500); await flushPromises()
    expect(wrapper.text()).toContain('历史客户')
    expect(wrapper.text()).toContain('降低 25%')
    expect(state.check).toHaveBeenCalledWith(expect.objectContaining({ customerName: '客户A', lines: expect.any(Array) }), 'DOMESTIC')
    wrapper.unmount()
  })

  it('does not allow a stale response to replace the current line check', async () => {
    let finishOld
    state.check.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve }))
      .mockResolvedValueOnce({ code: 200, data: [] })
    const wrapper = mount(Notice, { props: { lines: [{ ctkMpn: 'OLD' }] } })
    await vi.advanceTimersByTimeAsync(500)
    await wrapper.setProps({ lines: [{ ctkMpn: 'NEW' }] })
    await vi.advanceTimersByTimeAsync(500); await flushPromises()
    finishOld({ code: 200, data: [warning] }); await flushPromises()
    expect(wrapper.text()).not.toContain('历史客户')
    wrapper.unmount()
  })

  it('shows errors as errors and lets the user cancel a low-price submission', async () => {
    state.check.mockResolvedValueOnce({ code: 500, msg: '历史查询失败' })
    const wrapper = mount(Notice, { props: { lines: [{ ctkMpn: 'ABC' }] } })
    await vi.advanceTimersByTimeAsync(500); await flushPromises()
    expect(wrapper.text()).toContain('历史查询失败')
    expect(wrapper.text()).not.toContain('低价提醒')
    wrapper.unmount()
    state.check.mockResolvedValue({ code: 200, data: [warning] })
    window.confirm = vi.fn(() => false)
    expect(await confirmQuotationLowPrices({ id: 7 })).toBe(false)
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('历史客户'))
  })
})
