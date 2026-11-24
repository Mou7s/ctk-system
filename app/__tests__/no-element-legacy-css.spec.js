import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// 2026-09-21：Element Plus 早就不在依赖里，但残留的 Element 样式还在生效——
// 全局层未分层样式优先级高于 Tailwind 的 @layer utilities，所以
// global.css 里那条裸元素规则 `aside { background: var(--app-aside-bg) }`
// 直接给工作台右侧「通知公告」卡（当时用的是 <aside>）刷上 #EEF1F6 灰底 + 内边距 + #E4E7ED 描边，
// 连 jukebox 侧栏自己的 bg-slate-100/70 与 p-5 也被它盖掉。
// 另外 `var(--el-color-primary)` / `var(--el-border-color)` 这类变量随依赖一起消失后，
// 引用它们的**活规则整条声明失效**（hover 背景、输入框边框静默不生效），是看不见的真 bug。
const ROOT = process.cwd()
const STYLES_DIR = resolve(ROOT, 'app/assets/styles')

// Element 组件类名（BEM 前缀），不要用「.el- 前缀」一刀切：
// 模板里有 .el-register-footer / .el-tree-select 这类**自定义**名字，模板还在用。
const ELEMENT_SELECTORS = [
  '.el-table', '.el-input', '.el-input-number', '.el-select', '.el-form-item', '.el-card',
  '.el-tree', '.el-tree-node', '.el-button', '.el-scrollbar', '.el-textarea', '.el-dialog',
  '.el-popup-parent--hidden',
]

function cssFiles() {
  return readdirSync(STYLES_DIR)
    .filter((name) => name.endsWith('.css'))
    .map((name) => ({ name, source: readFileSync(resolve(STYLES_DIR, name), 'utf8') }))
}

function vueFiles(dir = resolve(ROOT, 'app')) {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) found.push(...vueFiles(full))
    else if (entry.name.endsWith('.vue')) found.push(full)
  }
  return found
}

describe('全局样式里不许再有 Element Plus 时代的遗留', () => {
  it('样式文件与页面里都没有 Element 组件选择器', () => {
    const hits = []
    for (const { name, source } of cssFiles()) {
      for (const selector of ELEMENT_SELECTORS) if (source.includes(selector)) hits.push(`${name}: ${selector}`)
    }
    for (const file of vueFiles()) {
      const source = readFileSync(file, 'utf8')
      for (const selector of ELEMENT_SELECTORS) if (source.includes(selector)) hits.push(`${file.slice(ROOT.length + 1)}: ${selector}`)
    }
    expect(hits).toEqual([])
  })

  it('没有任何 --el-* 变量引用（依赖已移除，引用它的规则整条失效）', () => {
    const hits = []
    for (const { name, source } of cssFiles()) {
      if (source.includes('--el-')) hits.push(name)
    }
    for (const file of vueFiles()) {
      if (readFileSync(file, 'utf8').includes('--el-')) hits.push(file.slice(ROOT.length + 1))
    }
    expect(hits).toEqual([])
  })

  it('没有裸元素 aside 规则，也没有 aside 调色板 token', () => {
    const global = readFileSync(resolve(STYLES_DIR, 'global.css'), 'utf8')
    expect(global).not.toMatch(/(^|\n)\s*aside\s*[,{]/)
    const tokens = cssFiles().flatMap(({ name, source }) =>
      (source.match(/--app-aside-[\w-]+/g) || []).map((token) => `${name}: ${token}`),
    )
    expect(tokens).toEqual([])
  })

  it('已删除的旧时代类名不许回流（仍被引用的除外）', () => {
    const all = cssFiles().map(({ source }) => source).join('\n')
    for (const dead of ['.stat-card', '.kpi-card', '.metric-card', '.query-card', '.search-card', '.components-container', '.filter-container', '.sub-navbar', '.tree-border', '.pull-right', '.app-wrapper']) {
      expect(all, `${dead} 又被加回来了`).not.toContain(dead)
    }
    for (const alive of ['.table-card', '.qty-cell', '.wip-page', '.app-container', '.quotation-phone-modal']) {
      expect(all, `${alive} 被误删`).toContain(alive)
    }
    // 自定义名（只是长得像 Element）：注册页的 .el-register-footer 模板在用，必须留着
    const register = readFileSync(resolve(ROOT, 'app/pages/register.vue'), 'utf8')
    expect(register).toContain('.el-register-footer')
    expect(register).toContain('class="el-register-footer"')
  })

  it('工作台右侧卡片不再用 aside 元素（会被全局 aside 规则套上灰底）', () => {
    const home = readFileSync(resolve(ROOT, 'app/pages/index.vue'), 'utf8')
    expect(home).not.toMatch(/<aside[\s>]/)
    expect(home).not.toMatch(/<\/aside>/)
  })
})
