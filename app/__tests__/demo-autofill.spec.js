import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'

const state = vi.hoisted(() => ({
  headers: [],
  config: {
    demoMysqlUrl: '',
    demoMysqlHost: 'mysql',
    demoLoginUsername: 'demo',
    demoLoginPassword: 'example-demo-value',
  },
}))

vi.mock('h3', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    setResponseHeader: vi.fn((event, key, value) => {
      state.headers.push({ event, key, value })
    }),
  }
})

vi.mock('../../server/utils/runtime.ts', () => ({
  getNitroServerConfig: () => state.config,
}))

globalThis.defineEventHandler = handler => handler

describe('demo autofill endpoint and login page flow', () => {
  let demoAutofillHandler

  beforeAll(async () => {
    demoAutofillHandler = (await import('../../server/routes/prod-api/demoAutofill.get.ts')).default
  })

  beforeEach(() => {
    state.headers = []
    state.config = {
      demoMysqlUrl: '',
      demoMysqlHost: 'mysql',
      demoLoginUsername: 'demo',
      demoLoginPassword: 'example-demo-value',
    }
  })

  it('returns demo credentials only when demo DB, demo username, and password are configured', async () => {
    const res = await demoAutofillHandler({})
    expect(res).toEqual({
      code: 200,
      msg: '操作成功',
      enabled: true,
      username: 'demo',
      password: 'example-demo-value',
    })
    expect(state.headers).toContainEqual({
      event: {},
      key: 'Cache-Control',
      value: 'no-store',
    })
  })

  it('never leaks credentials if configured username is not a demo account', async () => {
    state.config.demoLoginUsername = 'admin'
    const res = await demoAutofillHandler({})
    expect(res).toEqual({
      code: 200,
      msg: '操作成功',
      enabled: false,
    })
    expect(res.username).toBeUndefined()
    expect(res.password).toBeUndefined()
  })

  it('returns enabled=false when demo password or demo datasource is missing', async () => {
    state.config.demoLoginPassword = ''
    expect(await demoAutofillHandler({})).toEqual({
      code: 200,
      msg: '操作成功',
      enabled: false,
    })

    state.config.demoLoginPassword = 'example-demo-value'
    state.config.demoMysqlHost = ''
    state.config.demoMysqlUrl = ''
    expect(await demoAutofillHandler({})).toEqual({
      code: 200,
      msg: '操作成功',
      enabled: false,
    })
  })

  it('populates loginForm from getDemoAutofill without overwriting user input and ignores stale responses', async () => {
    const source = readFileSync(new URL('../pages/login.vue', import.meta.url), 'utf8')
    const sliceStart = source.indexOf('let demoAutofillRequestId = 0;')
    const sliceEnd = source.indexOf('watch(isDemoEntry,')
    expect(sliceStart).toBeGreaterThan(-1)
    expect(sliceEnd).toBeGreaterThan(sliceStart)

    let resolveFirst
    const getDemoAutofill = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
      .mockResolvedValueOnce({ code: 200, enabled: true, username: 'demo', password: 'fresh-password' })

    const context = {
      getDemoAutofill,
      isDemoEntry: { value: true },
      demoAutofillStatus: { value: 'idle' },
      loginForm: { value: { username: '', password: '', rememberMe: true } },
    }
    vm.createContext(context)
    vm.runInContext(source.slice(sliceStart, sliceEnd), context)

    const p1 = context.loadDemoAutofill()
    expect(context.loginForm.value.rememberMe).toBe(false)
    const p2 = context.loadDemoAutofill()
    await p2
    expect(context.demoAutofillStatus.value).toBe('ready')
    expect(context.loginForm.value.username).toBe('demo')
    expect(context.loginForm.value.password).toBe('fresh-password')

    resolveFirst({ code: 200, enabled: true, username: 'demo', password: 'stale-password' })
    await p1
    expect(context.loginForm.value.password).toBe('fresh-password')
  })

  it('compiles login.vue and demo.vue cleanly without template errors', () => {
    for (const file of ['../pages/login.vue', '../pages/demo.vue']) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8')
      const { descriptor } = parse(source)
      const script = compileScript(descriptor, { id: file })
      const template = compileTemplate({
        source: descriptor.template.content,
        filename: file,
        id: file,
        compilerOptions: { bindingMetadata: script.bindings },
      })
      expect(template.errors).toEqual([])
    }
  })
})
