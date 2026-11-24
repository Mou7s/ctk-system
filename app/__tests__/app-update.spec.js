// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAppUpdateMonitor, hasOpenEditor, loadAppUpdate } from '../utils/appUpdate'

beforeEach(() => { document.body.innerHTML = ''; vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-26T00:00:00Z')) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
describe('application version detection', () => {
  it('detects the next deployment against the version loaded by this document, only once', async () => {
    const fetchVersion = vi.fn().mockResolvedValueOnce({ version: 'old' }).mockResolvedValue({ version: 'new' })
    const onUpdate = vi.fn()
    const monitor = createAppUpdateMonitor({ currentVersion: 'old', fetchVersion, onUpdate })
    await monitor.check(); expect(onUpdate).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(60_000)
    await monitor.check(); await monitor.check()
    expect(onUpdate).toHaveBeenCalledExactlyOnceWith('new')
    expect(fetchVersion).toHaveBeenCalledTimes(2)
  })
  it('throttles focus storms and does not overlap requests', async () => {
    let finish
    const fetchVersion = vi.fn(() => new Promise(resolve => { finish = resolve }))
    const monitor = createAppUpdateMonitor({ currentVersion: 'old', fetchVersion, onUpdate: vi.fn() })
    const pending = monitor.check()
    await monitor.check(); expect(fetchVersion).toHaveBeenCalledOnce()
    finish({ version: 'old' }); await pending
    await monitor.check(); expect(fetchVersion).toHaveBeenCalledOnce()
  })
  it('recovers after a network failure and ignores invalid payloads', async () => {
    const fetchVersion = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ version: null }).mockResolvedValue({ version: 'new' })
    const onUpdate = vi.fn()
    const monitor = createAppUpdateMonitor({ currentVersion: 'old', fetchVersion, onUpdate })
    await monitor.check(); await vi.advanceTimersByTimeAsync(60_000)
    await monitor.check(); expect(onUpdate).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(60_000); await monitor.check()
    expect(onUpdate).toHaveBeenCalledExactlyOnceWith('new')
  })
  it('drops late responses after unmount and disables development polling', async () => {
    let finish
    const fetchVersion = vi.fn(() => new Promise(resolve => { finish = resolve }))
    const onUpdate = vi.fn()
    const monitor = createAppUpdateMonitor({ currentVersion: 'old', fetchVersion, onUpdate })
    const pending = monitor.check(); monitor.stop(); finish({ version: 'new' }); await pending
    await monitor.check(); expect(onUpdate).not.toHaveBeenCalled()
    const dev = createAppUpdateMonitor({ currentVersion: 'development', fetchVersion, onUpdate })
    await dev.check(); expect(fetchVersion).toHaveBeenCalledOnce()
  })
})
describe('safe manual reload', () => {
  it('does not treat list filters and read-only details as unsaved editors', () => {
    document.body.innerHTML = '<input placeholder="搜索"><div role="dialog"><input readonly></div>'
    const confirm = vi.fn(); const reload = vi.fn()
    expect(loadAppUpdate({ confirm, reload })).toBe(true)
    expect(confirm).not.toHaveBeenCalled(); expect(reload).toHaveBeenCalledOnce()
  })
  it.each(['<textarea></textarea>', '<input>', '<revo-grid></revo-grid>'])('blocks reload when the user cancels an open editor: %s', markup => {
    document.body.innerHTML = `<div role="dialog">${markup}</div>`
    const confirm = vi.fn(() => false); const reload = vi.fn()
    expect(loadAppUpdate({ confirm, reload })).toBe(false)
    expect(confirm).toHaveBeenCalledOnce(); expect(reload).not.toHaveBeenCalled()
  })
  it('allows an explicitly confirmed reload and ignores hidden/closed editors', () => {
    document.body.innerHTML = '<div role="dialog"><input></div>'
    const reload = vi.fn()
    expect(loadAppUpdate({ confirm: () => true, reload })).toBe(true)
    expect(reload).toHaveBeenCalledOnce()
    document.body.innerHTML = '<div style="display:none"><div role="dialog"><input></div></div><div role="dialog" data-state="closed"><textarea></textarea></div>'
    expect(hasOpenEditor()).toBe(false)
  })
})
