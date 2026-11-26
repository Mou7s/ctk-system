import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'

const source = readFileSync(new URL('../pages/login.vue', import.meta.url), 'utf8')

describe('login page redesigned UI contract', () => {
  it('compiles cleanly without template or script errors', () => {
    const { descriptor } = parse(source)
    const script = compileScript(descriptor, { id: 'login-ui' })
    const template = compileTemplate({
      source: descriptor.template.content,
      filename: 'login.vue',
      id: 'login-ui',
      compilerOptions: { bindingMetadata: script.bindings },
    })
    expect(template.errors).toEqual([])
  })

  it('provides accessible password visibility toggle and label-input bindings', () => {
    expect(source).toContain('const showPassword = ref(false)')
    expect(source).toContain(":type=\"showPassword ? 'text' : 'password'\"")
    expect(source).toContain(":icon=\"showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'\"")
    expect(source).toContain(":aria-label=\"showPassword ? '隐藏密码' : '显示密码'\"")
    expect(source).toContain(':aria-pressed="showPassword"')
    expect(source).toContain('for="login-username"')
    expect(source).toContain('id="login-username"')
    expect(source).toContain('for="login-password"')
    expect(source).toContain('id="login-password"')
    expect(source).toContain('for="login-captcha"')
    expect(source).toContain('id="login-captcha"')
  })

  it('renders logo.webp in normal mode and hides it in demo mode', () => {
    expect(source).toContain('import defaultLogo from "@/assets/logo/logo.webp"')
    expect(source).toContain('const brandLogo = computed(() => (isDemoEntry.value ? "" : defaultLogo))')
    expect(source).toContain('v-if="brandLogo"')
    expect(source).toContain(':src="brandLogo"')
    expect(source).toContain('v-else class="hero-brand-mark"')
    expect(source).toContain('v-else class="mobile-brand-mark"')
    expect(source).toContain('background: transparent;')
    expect(source).toContain('filter: brightness(0) invert(1)')
  })

  it('preserves demo mode, captcha states, dark mode toggle, and avoids Element Plus', () => {
    expect(source).toContain('brand.brandMark')
    expect(source).toContain('brand.brandTitle')
    expect(source).toContain('brand.brandSubtitle')
    expect(source).toContain('brand.brandFooter')
    expect(source).toContain("captchaState === 'enabled'")
    expect(source).toContain("captchaState === 'loading'")
    expect(source).toContain("captchaState === 'error'")
    expect(source).toContain('<ClientOnly>')
    expect(source).toContain('aria-label="切换浅色/深色主题"')
    expect(source).not.toMatch(/<el-[a-z-]+/i)
  })
})
