// @vitest-environment happy-dom
// 需要 DOM：本文件 mount 组件，默认的 node 环境没有 document
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TkSegmented from '../packages/ui/TkSegmented.vue'

/**
 * 分段控件（TkSegmented）：苹果式滑块 + 等宽选项。
 * 契约：受控组件（只 emit，不改自己的值）、滑块位置由选中项索引决定、
 * 滑块走 transform（不改布局，动画可中断）、禁用项不出值。
 */
const ITEMS = [
  { value: 'matrix', label: '封装 × 工序' },
  { value: 'list', label: '明细列表' }
]

function mountSegmented(props = {}) {
  return mount(TkSegmented, {
    props: { modelValue: 'matrix', items: ITEMS, ...props },
    global: { stubs: { UIcon: { template: '<i />' } } }
  })
}

describe('TkSegmented', () => {
  it('renders one equal-width option per item and marks the selected one', () => {
    const wrapper = mountSegmented()
    const options = wrapper.findAll('.tk-segmented__option')

    expect(options.map((option) => option.text())).toEqual(['封装 × 工序', '明细列表'])
    expect(options[0].classes()).toContain('is-active')
    expect(options[1].classes()).not.toContain('is-active')
    expect(options[0].attributes('aria-pressed')).toBe('true')
    expect(wrapper.attributes('style')).toContain('--tk-segmented-count: 2')
    // 没有分组名时不渲染空 aria-label
    expect(wrapper.attributes('aria-label')).toBeUndefined()
    expect(mountSegmented({ label: '视图' }).attributes('aria-label')).toBe('视图')
  })

  it('is controlled: clicking only emits the new value', async () => {
    const wrapper = mountSegmented()

    await wrapper.findAll('.tk-segmented__option')[1].trigger('click')

    expect(wrapper.emitted('update:modelValue')).toEqual([['list']])
    // 值由父组件决定，点完自己不变
    expect(wrapper.findAll('.tk-segmented__option')[0].classes()).toContain('is-active')
  })

  it('moves the thumb by index with transform, not by re-layout', () => {
    const first = mountSegmented()
    const second = mountSegmented({ modelValue: 'list' })

    expect(first.find('.tk-segmented__thumb').attributes('style')).toContain('--i: 0')
    expect(second.find('.tk-segmented__thumb').attributes('style')).toContain('--i: 1')
  })

  it('falls back to the first position when the value matches nothing, and skips disabled items', async () => {
    const wrapper = mountSegmented({ modelValue: 'unknown' })
    expect(wrapper.find('.tk-segmented__thumb').attributes('style')).toContain('--i: 0')

    const withDisabled = mountSegmented({ items: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B', disabled: true }] })
    expect(withDisabled.findAll('.tk-segmented__option')[1].attributes('disabled')).toBeDefined()
  })
})
