// @vitest-environment happy-dom
import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import TkQuotationHistoryPrices from '../packages/ui/TkQuotationHistoryPrices.vue'

const request = vi.hoisted(() => vi.fn())
vi.mock('@/utils/request', () => ({ default: request }))

describe('审核历史价客户信息', () => {
  it.each([
    [{ packageName: 'SOT-23', customerStyle: '分销商', city: '深圳 / Shenzhen', dieSize: '0.23*0.23' }, '封装：SOT-23', '客户性质：分销商', '城市：深圳 / Shenzhen', '芯片大小：0.23*0.23'],
    [{}, '封装：—', '客户性质：—', '城市：—', '芯片大小：—'],
  ])('在每条价格记录显示封装和客户信息，缺失时显示占位符', async (fields, packageText, styleText, cityText, dieSizeText) => {
    request.mockResolvedValue({ code: 200, data: [{ lineId: 1, priceRmb: 60, customerName: 'Centum', quoteNo: 'BJ001', quoteDate: '2026-10-21', ...fields }] })
    const wrapper = mount(TkQuotationHistoryPrices, {
      props: { ctkMpn: 'ABS10' },
      global: { stubs: { UPopover: { template: '<div><slot /><slot name="content" /></div>' } } },
    })
    await wrapper.vm.$.setupState.handleOpen(true)
    await flushPromises()
    expect(wrapper.text()).toContain(packageText)
    expect(wrapper.text()).toContain(styleText)
    expect(wrapper.text()).toContain(cityText)
    expect(wrapper.text()).toContain(dieSizeText)
    expect(wrapper.text()).toContain('¥60.00')
    expect(wrapper.text()).toContain('Centum')
    expect(wrapper.text()).toContain('BJ001')
    wrapper.unmount()
  })

  it.each([
    [{ customerName: 'VJ ELECTRO SALES', isReference: true }, true],
    [{ customerName: 'BINARY', isReference: true }, true],
    [{ customerName: 'Centum', isReference: false }, false],
  ])('参考客户 (%s) 显示对应徽章', async (record, shouldShowBadge) => {
    request.mockResolvedValue({ code: 200, data: [{ lineId: 2, priceRmb: 20, quoteNo: 'BJ002', quoteDate: '2026-10-22', ...record }] })
    const wrapper = mount(TkQuotationHistoryPrices, {
      props: { ctkMpn: 'RS1M' },
      global: {
        stubs: {
          UPopover: { template: '<div><slot /><slot name="content" /></div>' },
          UBadge: { template: '<span><slot /></span>' },
        },
      },
    })
    await wrapper.vm.$.setupState.handleOpen(true)
    await flushPromises()
    if (shouldShowBadge) {
      expect(wrapper.text()).toContain('参考客户')
    } else {
      expect(wrapper.text()).not.toContain('参考客户')
    }
    wrapper.unmount()
  })
})
