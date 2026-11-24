import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'

const source = readFileSync(new URL('../pages/login.vue', import.meta.url), 'utf8')
function setup(getCodeImg) {
  const context = {
    getCodeImg,
    captchaState: { value: 'loading' },
    codeUrl: { value: 'old-image' },
    loginForm: { value: { code: 'old-code', uuid: 'old-uuid' } },
    loginErrors: { code: 'old-error' },
  }
  vm.createContext(context)
  vm.runInContext(source.slice(source.indexOf('let captchaRequestPending'), source.indexOf('function getCookie()')), context)
  return context
}

describe('login captcha loading and recovery', () => {
  it('hides captcha when the server disables it and clears old challenge data', async () => {
    const state = setup(vi.fn().mockResolvedValue({ code: 200, captchaEnabled: false }))
    await state.getCode()
    expect(state.captchaState.value).toBe('disabled')
    expect(state.codeUrl.value).toBe('')
    expect(state.loginForm.value).toEqual({ code: '', uuid: '' })
    expect(state.loginErrors.code).toBe('')
  })

  it('shows a complete challenge only after a successful response', async () => {
    const state = setup(vi.fn().mockResolvedValue({ code: 200, captchaEnabled: true, img: 'svg', uuid: 'challenge' }))
    await state.getCode()
    expect(state.captchaState.value).toBe('enabled')
    expect(state.codeUrl.value).toBe('data:image/svg+xml;base64,svg')
    expect(state.loginForm.value.uuid).toBe('challenge')
  })

  it.each([
    () => Promise.reject(new Error('network unavailable')),
    () => Promise.resolve({ code: 500 }),
    () => Promise.resolve({ code: 200, captchaEnabled: true }),
    () => Promise.resolve(undefined),
  ])('handles failures and allows retry to recover', async response => {
    const fetch = vi.fn().mockImplementationOnce(response).mockResolvedValue({ code: 200, captchaEnabled: false })
    const state = setup(fetch)
    await state.getCode()
    expect(state.captchaState.value).toBe('error')
    expect(state.codeUrl.value).toBe('')
    await state.getCode()
    expect(state.captchaState.value).toBe('disabled')
  })

  it('keeps loading state and suppresses duplicate requests', async () => {
    let resolve
    const fetch = vi.fn(() => new Promise(done => { resolve = done }))
    const state = setup(fetch)
    const pending = state.getCode()
    await state.getCode()
    expect(state.captchaState.value).toBe('loading')
    expect(fetch).toHaveBeenCalledOnce()
    resolve({ code: 200, captchaEnabled: false })
    await pending
    expect(state.captchaState.value).toBe('disabled')
  })

  it('compiles login page template and script', () => {
    const { descriptor } = parse(source)
    const script = compileScript(descriptor, { id: 'login-captcha' })
    const template = compileTemplate({ source: descriptor.template.content, filename: 'login.vue', id: 'login-captcha', compilerOptions: { bindingMetadata: script.bindings } })
    expect(template.errors).toEqual([])
  })
})
