import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from '@vue/compiler-sfc'

// 回归验证（2026-09-23 用户反馈）：
// 在网格第一行「终端客户」输入内容后弹出「创建 "TEST"」，点击后无法确认创建。
// 根本原因：
//   1. 缺少 mode="autocomplete"，退化为默认 combobox 导致输入的自由文本不进模型；
//   2. Nuxt UI 的 UInputMenu 在 create-item 触发时 e.preventDefault()，reka ComboboxItem 既不落值也不收起；
//   3. 缺少 @create 事件监听与受控 :open / @update:open，导致点击创建无响应。
const GRID_FILE = resolve(process.cwd(), 'app/packages/ui/TkQuotationGrid.vue')
const source = readFileSync(GRID_FILE, 'utf8')
const { descriptor, errors } = parse(source, { filename: GRID_FILE })

function walk(node, visit) {
  visit(node)
  for (const child of node.children || []) walk(child, visit)
}

function collect(templateAst, match) {
  const found = []
  walk(templateAst, (node) => {
    if (match(node)) found.push(node)
  })
  return found
}

function propName(prop) {
  if (prop.type === 6) return prop.name
  if (prop.type === 7 && prop.arg) return prop.arg.content ?? null
  return null
}

function staticValue(node, name) {
  const prop = (node.props || []).find((item) => item.type === 6 && item.name === name)
  return prop?.value?.content ?? null
}

const inputMenus = collect(
  descriptor.template?.ast,
  (node) => node.type === 1 && node.tag === 'UInputMenu',
)

describe('报价明细网格终端客户 UInputMenu: 支持创建并确认生效', () => {
  it('SFC 模板解析无错误', () => {
    expect(errors).toEqual([])
  })

  it('终端客户输入框必须是 autocomplete 模式且接住 create 事件与受控 open 状态', () => {
    const endUserMenu = inputMenus.find((node) => staticValue(node, 'placeholder') === '终端客户')
    expect(endUserMenu, '未找到 placeholder 为「终端客户」的 UInputMenu').toBeTruthy()

    // 1. 必须是 autocomplete
    expect(staticValue(endUserMenu, 'mode')).toBe('autocomplete')

    // 2. 必须开启 create-item
    expect(staticValue(endUserMenu, 'create-item')).toBe('always')

    // 3. 必须接住 create 事件与 open 受控状态
    const propNames = (endUserMenu.props || []).map(propName)
    expect(propNames).toContain('open')
    expect(propNames).toContain('update:open')
    expect(propNames).toContain('create')
    expect(propNames).toContain('update:model-value')
  })

  it('脚本中包含 handleCellCreate 处理函数并关闭下拉菜单', () => {
    expect(source).toContain('function handleCellCreate(')
    expect(source).toContain('openMenuKey.value = \'\'')
  })
})
