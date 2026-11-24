// @vitest-environment happy-dom
import { CalendarDate } from '@internationalized/date'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import TkDateRangePicker from '../packages/ui/TkDateRangePicker.vue'

const PopoverStub = defineComponent({
  props: ['open', 'content'],
  emits: ['update:open'],
  setup: (_props, { slots }) => () => h('div', [slots.default?.(), slots.content?.()]),
})

const ButtonStub = defineComponent({
  props: ['label', 'disabled', 'size', 'color', 'variant', 'icon', 'trailingIcon'],
  emits: ['click'],
  setup: (props, { attrs, emit, slots }) => () =>
    h(
      'button',
      {
        type: 'button',
        ...attrs,
        disabled: props.disabled,
        onClick: (e) => emit('click', e),
      },
      props.label ?? slots.default?.(),
    ),
})

const CalendarStub = defineComponent({
  props: ['modelValue', 'range', 'numberOfMonths', 'minValue', 'maxValue', 'locale'],
  emits: ['update:modelValue'],
  setup: (_props, { emit }) => () =>
    h('div', { 'data-testid': 'mock-calendar' }, [
      h(
        'button',
        {
          type: 'button',
          'data-testid': 'pick-partial',
          onClick: () => emit('update:modelValue', { start: new CalendarDate(2026, 11, 5), end: undefined }),
        },
        'pick-partial',
      ),
      h(
        'button',
        {
          type: 'button',
          'data-testid': 'pick-complete',
          onClick: () =>
            emit('update:modelValue', {
              start: new CalendarDate(2026, 11, 5),
              end: new CalendarDate(2026, 11, 18),
            }),
        },
        'pick-complete',
      ),
    ]),
})

const wrappers = []

function mountPicker(props = {}) {
  const wrapper = mount(TkDateRangePicker, {
    props,
    global: {
      stubs: {
        UPopover: PopoverStub,
        UButton: ButtonStub,
        UCalendar: CalendarStub,
      },
    },
  })
  wrappers.push(wrapper)
  return wrapper
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-19T10:00:00+08:00'))
})

afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount())
  vi.useRealTimers()
})

describe('TkDateRangePicker UI 交互', () => {
  it('空值展示 placeholder，有值展示起止日期文本', () => {
    const emptyWrapper = mountPicker({ placeholder: '提交日期范围' })
    expect(emptyWrapper.text()).toContain('提交日期范围')

    const filledWrapper = mountPicker({ modelValue: ['2026-11-01', '2026-11-19'] })
    expect(filledWrapper.text()).toContain('2026-11-01 ~ 2026-11-19')
  })

  it('点击「上月」和「清除」会分别发出 update:modelValue 与 change', async () => {
    const wrapper = mountPicker({ modelValue: ['2026-11-01', '2026-11-19'] })

    const lastMonthBtns = wrapper.findAll('button').filter((b) => b.text() === '上月')
    expect(lastMonthBtns.length).toBeGreaterThan(0)
    await lastMonthBtns[0].trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['2026-10-01', '2026-10-31']])
    expect(wrapper.emitted('change')?.[0]).toEqual([['2026-10-01', '2026-10-31']])

    const clearBtns = wrapper.findAll('button').filter((b) => b.text() === '清除')
    expect(clearBtns.length).toBeGreaterThan(0)
    await clearBtns[0].trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual([[]])
    expect(wrapper.emitted('change')?.[1]).toEqual([[]])
  })

  it('日历只选起日时不提前发出事件，补齐止日后发出完整区间', async () => {
    const wrapper = mountPicker({ modelValue: [] })

    await wrapper.find('[data-testid="pick-partial"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('change')).toBeUndefined()

    await wrapper.find('[data-testid="pick-complete"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['2026-11-05', '2026-11-18']])
    expect(wrapper.emitted('change')?.[0]).toEqual([['2026-11-05', '2026-11-18']])
  })
})
