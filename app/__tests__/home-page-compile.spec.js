import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'

// 工作台首页（app/pages/index.vue）守卫：只编译、不 import 整页，
// 避免把 store / 全局插件链拖进进程（那会让单文件跑到 2s+，满并发时撞超时）。
//
// 2026-09-21 按 developer.apple.com/design 的 HIG 重做，守卫锁的每一条都能对应到 HIG 原文：
//   layout      「Group related items」→ 目录一个容器 + 发丝分隔线，不再一个分组一张卡
//   layout      「consistent, predictable positions」+ principles「Familiarity」
//               → 目录永远全量、永远按菜单顺序，不随使用记录变形
//   materials   「Don't use Liquid Glass in the content layer」→ 内容卡一律实底
//   color       「Avoid relying solely on color / use color sparingly」「limited palette」
//               → 全页只用一个强调色（primary），图标默认中性
//   color       「Avoid hard-coding system color values」→ 用语义 token，不写 slate-*/#hex
//   typography  「Support Dynamic Type」→ 不写 px 字号（rem 才能跟随用户放大）
//   accessibility「Use recommended defaults for custom type sizes」→ 正文 12px 起
//   accessibility「Strive to meet color contrast minimum standards」→ 实测对比度（zinc 实测值转 sRGB）：
//               neutral-700 on #fff = 10.44、neutral-500 on #fafafa = 4.62、neutral-400 = 2.62
//               → 正文用 text-default/text-muted，**不许用 text-dimmed 承载文字**（2.62 不过 AA）
//   accessibility「Offer sufficiently sized controls」(+12pt spacing) → 触控目标 min-h-11 (44px)
//   accessibility「Increase Contrast」→ prefers-contrast: more 整档提对比
//   accessibility「Convey information with more than color alone」→ 语义标签 + 图标 aria-hidden
//   motion      「Aim for brevity and precision / Let people cancel motion / avoid sustained
//               oscillation」→ 无过冲入场、按下 100ms 反馈、骨架屏静态（不许 animate-pulse）
const PAGE = resolve(process.cwd(), 'app/pages/index.vue')

function compilePage(source) {
  const { descriptor, errors } = parse(source, { filename: PAGE })
  if (errors.length) return { parseErrors: errors, templateErrors: [] }
  const script = compileScript(descriptor, { id: 'home-page-check' })
  const template = compileTemplate({
    source: descriptor.template.content,
    filename: PAGE,
    id: 'home-page-check',
    compilerOptions: { bindingMetadata: script.bindings },
  })
  return { parseErrors: [], templateErrors: template.errors }
}

const source = readFileSync(PAGE, 'utf8')

describe('工作台首页模板', () => {
  it('能编译通过', () => {
    const { parseErrors, templateErrors } = compilePage(source)
    expect(parseErrors).toEqual([])
    expect(templateErrors).toEqual([])
  })

  it('守卫本身有效：故意写坏的 SFC 必须报错', () => {
    const broken = source.replace('<template>', '<template>\n  <div v-if="a">x</div><div v-else>y</div><span')
    const { parseErrors, templateErrors } = compilePage(broken)
    expect(parseErrors.length + templateErrors.length).toBeGreaterThan(0)
  })

  it('不再有「快速查找功能」搜索框、说教块与无效色阶', () => {
    expect(source).not.toContain('快速查找功能')
    expect(source).not.toContain('searchKeyword')
    expect(source).not.toContain('UInput')
    expect(source).not.toContain('工作流操作提示')
    expect(source).not.toContain('今日工作概览')
    expect(source).not.toContain('border-gray-150')
  })

  it('目录结构稳定：全量 + 按菜单顺序，不随使用记录变形', () => {
    expect(source).toContain('v-for="category in menuCategories"')
    expect(source).toContain('全部功能')
    // 被否掉的两种形态都不许回来
    expect(source).not.toContain('最近使用模块')
    expect(source).not.toContain('usedCategories')
    expect(source).not.toContain('hasUsedModules')
    expect(source).not.toContain('displayCategories')
    // 个人化只体现在「常用功能」，且最多 4 个
    expect(source).toContain('sortItemsByUsage(userStore.id, getUsedMenuItems(userStore.id)).slice(0, 4)')
  })

  it('HIG 结构：目录一个容器 + 发丝分隔线分组；卡片同一套配方', () => {
    expect(source).toContain('divide-y divide-default')
    // 快捷卡 + 目录容器 + 公告卡 都是同一套配方（无半透明、无彩色底）
    const recipe = source.match(/rounded-2xl border border-default bg-default/g) || []
    expect(recipe.length).toBeGreaterThanOrEqual(3)
    expect(source).not.toContain('backdrop-blur')
    expect(source).not.toContain('bg-white/')
  })

  it('HIG 颜色：语义 token，不硬编码中性色，全页一个强调色', () => {
    // 「Avoid hard-coding system color values」：slate-*/gray-* 一律不许出现在本页
    expect(source).not.toMatch(/\b(?:text|bg|border|divide)-(?:slate|gray|zinc|neutral)-/)
    // 强调色只有 primary；语义 token 必须真的用上
    for (const cls of ['text-highlighted', 'text-muted', 'text-default', 'bg-default', 'bg-muted', 'bg-elevated', 'border-default', 'divide-default']) {
      expect(source, `缺少语义 token ${cls}`).toContain(cls)
    }
    // 对比度：text-dimmed（neutral-400 on 白 = 2.62）不达 AA，不许承载文字
    // （注意匹配前导空格：--ui-text-dimmed 这个 token 名本身要允许出现在增强对比块里）
    expect(source).not.toContain(' text-dimmed')
    // 分组彩虹色已废除：不再有按序号取色的调色板
    expect(source).not.toContain('CATEGORY_COLORS')
  })

  it('HIG 排版与无障碍：rem 字号、12px 起、触控 ≥44px、aria、增强对比', () => {
    // 「Support Dynamic Type」：不许写死 px 字号
    expect(source).not.toMatch(/text-\[\d+px\]/)
    // 触控目标：目录条目与公告条目都要 min-h-11（44px）
    expect((source.match(/min-h-11/g) || []).length).toBeGreaterThanOrEqual(2)
    // 图标是装饰：必须 aria-hidden；加载态要有给屏幕阅读器的文字
    expect((source.match(/aria-hidden="true"/g) || []).length).toBeGreaterThanOrEqual(8)
    expect(source).toContain('sr-only')
    expect(source).toContain('aria-labelledby')
    // Increase Contrast
    expect(source).toContain('@media (prefers-contrast: more)')
    // 减弱动态要有替代方案
    expect(source).toContain('@media (prefers-reduced-motion: reduce)')
    expect(source).toContain('@media (prefers-reduced-motion: no-preference)')
    // 键盘可达 + 按下即时反馈，且只过渡合成器友好属性
    expect(source).toContain('.home-card:active')
    expect(source).toContain('transition-property: transform, border-color, background-color, box-shadow, color')
    expect(source).toContain('.home-card:focus-visible')
    expect(source).toContain('var(--ui-primary)')
  })

  it('HIG motion：不做持续循环动画；等宽数字锁住跳动', () => {
    expect(source).not.toContain('animate-pulse')
    expect((source.match(/tabular-nums/g) || []).length).toBeGreaterThanOrEqual(3)
  })

  it('响应式：手机两列密排、标题区日期块换行、吸顶留间距', () => {
    expect(source).toContain('grid grid-cols-2 gap-1 md:grid-cols-3 sm:gap-1.5 xl:grid-cols-4')
    expect(source).toContain('-mx-2.5')
    expect(source).toContain('basis-full')
    expect(source).toContain('sm:basis-auto')
    expect(source).toContain('line-clamp-2')
    expect(source).toContain('xl:sticky')
    expect(source).toContain('xl:top-6')
  })
})
