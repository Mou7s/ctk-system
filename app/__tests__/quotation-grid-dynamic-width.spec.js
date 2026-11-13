// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { createPinia, defineStore, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

globalThis.definePageMeta = () => {}
globalThis.defineStore = defineStore
globalThis.useToast = () => ({ add: () => {} })
setActivePinia(createPinia())

vi.mock('@revolist/vue3-datagrid', () => ({
  default: { name: 'VGrid', props: ['columns', 'source'], template: '<div class="v-grid-stub" />' },
}))

const GRID = '../../app/packages/ui/TkQuotationGrid.vue'

async function mountGrid(props = {}) {
  const grid = await import(GRID)
  const wrapper = mount(grid.default, {
    props,
  })
  return wrapper
}

describe('quotation grid dynamic width', () => {
  it('默认无长内容时，各列保持预设保底基准宽度', async () => {
    const wrapper = await mountGrid()
    const columns = wrapper.findComponent({ name: 'VGrid' }).props('columns')
    const ctkCol = columns.find((c) => c.prop === 'ctkMpn')
    const remarkCol = columns.find((c) => c.prop === 'remark')

    expect(ctkCol.size).toBe(200)
    expect(remarkCol.size).toBe(145)

    wrapper.unmount()
  })

  it('当填入较长型号或备注时，列宽自动撑宽，表格 minWidth 协同变大', async () => {
    const longCtkMpn = 'CTK-TPS54302DDCR-Q1-AUTOMOTIVE-HIGH-PRECISION'
    const longRemark = '客户要求附带原厂测试报告及RoHS环保认证证书'
    const wrapper = await mountGrid({
      lines: [
        {
          ctkMpn: longCtkMpn,
          remark: longRemark,
        },
      ],
    })
    await nextTick()

    const columns = wrapper.findComponent({ name: 'VGrid' }).props('columns')
    const ctkCol = columns.find((c) => c.prop === 'ctkMpn')
    const remarkCol = columns.find((c) => c.prop === 'remark')

    // 较长内容自动撑宽，大于基准值
    expect(ctkCol.size).toBeGreaterThan(200)
    expect(remarkCol.size).toBeGreaterThan(145)

    // table 元素上 style minWidth 亦同步撑开
    const tableEl = wrapper.find('table')
    expect(tableEl.attributes('style')).toContain('min-width')

    wrapper.unmount()
  })

  it('当内容极其长时，列宽受最大宽度保护上限约束，避免破坏排版', async () => {
    const superLongRemark = 'A'.repeat(500)
    const wrapper = await mountGrid({
      lines: [
        {
          remark: superLongRemark,
        },
      ],
    })
    await nextTick()

    const columns = wrapper.findComponent({ name: 'VGrid' }).props('columns')
    const remarkCol = columns.find((c) => c.prop === 'remark')

    // 触碰最大上限 420px，不无限膨胀
    expect(remarkCol.size).toBe(420)

    wrapper.unmount()
  })
})
