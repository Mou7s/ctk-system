import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc'

// 只编译 SFC，不 import 组件（避免把 store / revogrid 拖进测试进程）。
const ROOT = process.cwd()
const GRID = resolve(ROOT, 'app/packages/ui/TkSampleProgressGrid.vue')
const CRONTAB = resolve(ROOT, 'app/components/Crontab/index.vue')
const STYLES = resolve(ROOT, 'app/assets/styles')

function compile(file, id) {
  const source = readFileSync(file, 'utf8')
  const { descriptor, errors } = parse(source, { filename: file })
  expect(errors).toEqual([])
  const script = compileScript(descriptor, { id })
  const template = compileTemplate({
    source: descriptor.template.content,
    filename: file,
    id,
    compilerOptions: { bindingMetadata: script.bindings },
  })
  expect(template.errors).toEqual([])
  return descriptor
}

function styleOf(descriptor) {
  return descriptor.styles.map((block) => block.content).join('\n')
}

describe('dark mode tables', () => {
  it('compiles TkSampleProgressGrid with its dark filter popover rules', () => {
    const style = styleOf(compile(GRID, 'sample-progress-grid'))
    expect(style).toContain('html.dark .sample-progress-filter-popover')
    expect(style).toContain('html.dark .sample-progress-filter-search')
    expect(style).toContain('html.dark .sample-progress-filter-clear')
    expect(style).toContain('html.dark .sample-grid-filter-button')
  })

  it('compiles the legacy Crontab table with dark fallbacks', () => {
    const style = styleOf(compile(CRONTAB, 'crontab'))
    expect(style).toContain('html.dark .popup-main')
    expect(style).toContain('html.dark .popup-result table span')
    expect(style).toContain('var(--app-surface)')
  })

  it('loads the dark table stylesheets after the other dark layers', () => {
    const entry = readFileSync(resolve(STYLES, 'tailwind.css'), 'utf8')
    const order = ['dark.css', 'dark-page-overrides.css', 'revogrid-dark.css', 'dark-tables.css']
      .map((name) => entry.indexOf(`@import "./${name}"`))
    expect(order.every((index) => index >= 0)).toBe(true)
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('keeps the native table fallback inside @layer base so page dark: classes still win', () => {
    const css = readFileSync(resolve(STYLES, 'dark-tables.css'), 'utf8')
    expect(css).toContain('@layer base {')
    expect(css).toContain('html.dark table thead th')
    expect(css).toContain('html.dark table tbody tr:hover')
    // 兜底只允许使用调色板令牌，写死颜色会在浅色/深色之间失配
    expect(css).not.toMatch(/#[0-9a-f]{6}/i)

    const revogrid = readFileSync(resolve(STYLES, 'revogrid-dark.css'), 'utf8')
    expect(revogrid).toContain('html.dark revo-grid')
    expect(revogrid).toContain('--rg-theme-background')
    expect(revogrid).toContain('--rg-theme-header-bg')
  })

  it('has the dark token variables the table styles rely on', () => {
    const css = readFileSync(resolve(STYLES, 'dark.css'), 'utf8')
    const darkBlock = css.slice(css.indexOf('html.dark {'), css.indexOf('html.theme-transition'))
    for (const token of ['--app-table-header-bg', '--app-table-header-text', '--app-page-hover', '--app-panel-bg']) {
      expect(darkBlock).toContain(token)
    }
    expect(existsSync(resolve(STYLES, 'dark-tables.css'))).toBe(true)
  })

  it('reports template errors when an SFC is broken', () => {
    const broken = '<template><div><span></div></template>\n<script setup>\nconst a = 1\n</script>\n'
    const { descriptor, errors } = parse(broken, { filename: 'broken.vue' })
    const template = compileTemplate({ source: descriptor.template.content, filename: 'broken.vue', id: 'broken' })
    expect(errors.length + template.errors.length).toBeGreaterThan(0)
  })
})
