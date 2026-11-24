// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { describe, expect, it } from 'vitest'
import Cards from '../packages/ui/TkDomesticQuotationLineCards.vue'

const line = { id: 1, lineNo: 1, customerMaterialName: '客户名称', ctkMpn: 'TESDB24D5', packageName: 'SOD-523', unit: 'PCS', originalPriceRmb: 0.068, minPackCount: 8000, remark: '备注', reviewPriceRmb: 0.068 }
const formatPrice = value => String(value)

describe('内贸移动端明细', () => {
  it('卡片直接展示名称、完整封装、小数单价和包装量', () => {
    const wrapper = mount(Cards, { props: { lines: [line], formatPrice } })
    for (const text of ['客户名称', 'TESDB24D5', 'SOD-523', '¥0.068', '8000', '备注']) expect(wrapper.text()).toContain(text)
    expect(wrapper.find('table').exists()).toBe(false)
    wrapper.unmount()
  })
  it('审核价格通过行ID回传，不直接修改只读数据', () => {
    const wrapper = mount(Cards, { props: { lines: [line], reviewStage: 'second', formatPrice }, global: { stubs: { UInput: { props: ['modelValue', 'disabled'], template: '<input :disabled="disabled" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' } } } })
    wrapper.find('input').setValue('0.065')
    expect(wrapper.emitted('review-price')[0]).toEqual([1, '0.065'])
    expect(line.originalPriceRmb).toBe(0.068)
    wrapper.unmount()
  })
  it('页面窄屏折叠次要单头、使用卡片，桌面保留表格且编译成功', () => {
    const source = readFileSync('app/pages/tk_custom/domesticQuotation/index.vue', 'utf8')
    expect(source).toContain('客户与单据信息')
    expect(source).toContain('<TkDomesticQuotationLineCards class="sm:hidden"')
    expect(source).toContain('hidden overflow-x-auto sm:block')
    expect(source).toContain('max-sm:h-[100dvh]')
    const { descriptor } = parse(source)
    compileScript(descriptor, { id: 'domestic-mobile' })
    expect(compileTemplate({ source: descriptor.template.content, filename: 'domestic.vue', id: 'domestic-mobile' }).errors).toEqual([])
  })
})
