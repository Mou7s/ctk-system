// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTkAutoRefresh } from '../../packages/composables/useTkAutoRefresh.js'

describe('useTkAutoRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('在满足 pollWhen 和 enabled 时，按 intervalMs 定时触发刷新', async () => {
    const onRefresh = vi.fn()
    const auto = useTkAutoRefresh({
      onRefresh,
      enabled: () => true,
      pollWhen: () => true,
      intervalMs: 10_000,
      cooldownMs: 5_000,
    })

    auto.start()
    expect(onRefresh).not.toHaveBeenCalled()

    vi.advanceTimersByTime(10_000)
    expect(onRefresh).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(10_000)
    expect(onRefresh).toHaveBeenCalledTimes(2)

    auto.stop()
    vi.advanceTimersByTime(10_000)
    expect(onRefresh).toHaveBeenCalledTimes(2)
  })

  it('enabled 为 false 时（如处于编辑态），定时器与焦点事件均不触发', async () => {
    const onRefresh = vi.fn()
    let isEditing = true
    const auto = useTkAutoRefresh({
      onRefresh,
      enabled: () => !isEditing,
      pollWhen: () => true,
      intervalMs: 10_000,
      cooldownMs: 5_000,
    })

    auto.start()
    vi.advanceTimersByTime(10_000)
    window.dispatchEvent(new Event('focus'))
    expect(onRefresh).not.toHaveBeenCalled()

    // 退出编辑态
    isEditing = false
    vi.advanceTimersByTime(10_000)
    expect(onRefresh).toHaveBeenCalledTimes(1)
    auto.stop()
  })

  it('pollWhen 为 false（如无待审单据）时定时器不触发，但焦点激活（focus）且已过冷却期可触发', async () => {
    const onRefresh = vi.fn()
    let hasPending = false
    const auto = useTkAutoRefresh({
      onRefresh,
      enabled: () => true,
      pollWhen: () => hasPending,
      intervalMs: 10_000,
      cooldownMs: 5_000,
    })

    auto.start()
    vi.advanceTimersByTime(20_000)
    expect(onRefresh).not.toHaveBeenCalled()

    // 用户切回窗口（focus）
    window.dispatchEvent(new Event('focus'))
    expect(onRefresh).toHaveBeenCalledTimes(1)

    // 冷却期（5秒）内再次切屏，不重复请求
    window.dispatchEvent(new Event('focus'))
    expect(onRefresh).toHaveBeenCalledTimes(1)

    // 过了冷却期切屏，再次触发
    vi.advanceTimersByTime(6_000)
    window.dispatchEvent(new Event('focus'))
    expect(onRefresh).toHaveBeenCalledTimes(2)

    auto.stop()
  })

  it('trigger(true) 可强制刷新，即使 enabled 为 false', async () => {
    const onRefresh = vi.fn()
    const auto = useTkAutoRefresh({
      onRefresh,
      enabled: () => false,
      intervalMs: 0,
    })

    await auto.trigger(false)
    expect(onRefresh).not.toHaveBeenCalled()

    await auto.trigger(true)
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })
})
