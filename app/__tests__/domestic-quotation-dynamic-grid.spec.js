// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import * as Vue from 'vue'
import { shallowMount } from '@vue/test-utils'
import Grid from '../packages/ui/TkDomesticQuotationGrid.vue'
import { blankDomesticQuotationLine } from '../packages/ui/domesticQuotationGrid.js'

let wrapper
afterEach(() => { wrapper?.unmount() })
const mountGrid = (rows = []) => {
  wrapper = shallowMount(Grid, {
    props: { modelValue: rows, 'onUpdate:modelValue': value => wrapper.setProps({ modelValue: value }) },
    global: { stubs: { UButton: { template: '<button><slot /></button>' } } },
  })
  return wrapper
}

describe('内贸在线表格动态扩展', () => {
  it('从Excel粘贴超出初始行数时自动扩展，撤销事件保留完整前值', async () => {
    mountGrid()
    const input = wrapper.find('[data-grid-row="0"][data-grid-column="0"]')
    await input.trigger('paste', { clipboardData: { getData: () => Array.from({ length: 31 }, (_, i) => `客户${i}\tCTK-${i}\tSOT23\t0.07\t3000\t备注`).join('\n') } })
    await Vue.nextTick()
    expect(wrapper.props('modelValue')).toHaveLength(31)
    expect(wrapper.props('modelValue').at(-1)).toMatchObject({ ctkMpn: 'CTK-30', lineNo: 31 })
    expect(wrapper.emitted('edit')[0][0].previousLines).toHaveLength(5)
  })

  it('回填501行后仍可新增和插入，删除后行号连续且末行不丢失', async () => {
    mountGrid(Array.from({ length: 501 }, (_, i) => ({ ...blankDomesticQuotationLine(i + 1), ctkMpn: `CTK-${i + 1}` })))
    const button = label => wrapper.findAll('button').find(node => node.text() === label)
    await button('新增行').trigger('click'); await Vue.nextTick()
    expect(wrapper.props('modelValue')).toHaveLength(502)
    expect(wrapper.props('modelValue')[500].ctkMpn).toBe('CTK-501')
    await wrapper.find('[data-grid-row="0"][data-grid-column="0"]').trigger('focusin')
    await button('插入行').trigger('click'); await Vue.nextTick()
    expect(wrapper.props('modelValue')).toHaveLength(503)
    await button('删除行').trigger('click'); await Vue.nextTick()
    expect(wrapper.props('modelValue')).toHaveLength(502)
    expect(wrapper.props('modelValue').map(row => row.lineNo)).toEqual(Array.from({ length: 502 }, (_, i) => i + 1))
    expect(wrapper.props('modelValue').filter(row => row.ctkMpn)).toHaveLength(501)
  })
})
