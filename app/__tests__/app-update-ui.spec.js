// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
const state = vi.hoisted(() => ({ reload: vi.fn() }))
vi.mock('@/utils/appUpdate', async importOriginal => ({ ...await importOriginal(), loadAppUpdate: state.reload }))
import AppUpdateNotice from '../components/AppUpdateNotice.vue'

beforeEach(() => {
  vi.useFakeTimers()
  state.reload.mockReset()
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { releaseVersion: 'loaded-version' } }))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
describe('global update notice lifecycle', () => {
  it('shows a new version in the top bar and cleans up timers and focus listeners', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ version: 'loaded-version' }) })
      .mockResolvedValue({ ok: true, json: async () => ({ version: 'next-version' }) })
    vi.stubGlobal('fetch', fetch)
    const wrapper = mount(AppUpdateNotice, { global: { stubs: { UButton: { template: '<button><slot /></button>' } } } })
    await flushPromises()
    expect(wrapper.find('button').exists()).toBe(false)
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/^\/app-version\?_=/), expect.objectContaining({ cache: 'no-store' }))
    await vi.advanceTimersByTimeAsync(30_000)
    window.dispatchEvent(new Event('focus')); await flushPromises()
    expect(wrapper.text()).toContain('系统已更新')
    expect(wrapper.text()).toContain('加载新版')
    expect(state.reload).not.toHaveBeenCalled()
    await wrapper.get('button').trigger('click')
    expect(state.reload).toHaveBeenCalledOnce()
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(120_000)
    window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange'))
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
