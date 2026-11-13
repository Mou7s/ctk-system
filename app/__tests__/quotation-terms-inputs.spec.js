import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from '@vue/compiler-sfc'

// 「单据条款」四个输入框（客户名称 / 贸易条款 / 有效期 / 付款方式）都是「可搜历史清单 + 可自由输入」。
//
// 回归背景（2026-09-18）：这四个框用了 UInputMenu 的 mode="combobox"。
// combobox 模式下，输入的文字不会进 v-model，只能靠点下拉里的「创建 "xxx"」落值；
// 而 Nuxt UI 的 create-item 会 preventDefault 掉 reka 的 ComboboxItem 默认行为
// （见 @nuxt/ui InputMenu.vue onCreate → e.preventDefault()，
//   配合 reka-ui ComboboxItem.js 的 `if (event.defaultPrevented) return`），
// 于是点「创建」既不落值也不收下拉 —— 表现就是客户名称打进去却填不上（保存时才报「请先填写客户名称」）。
//
// 所以这里锁死两件事：
//   ① 只能用 mode="autocomplete"（输入即取值），不允许退回 combobox；
//   ② 必须自己接住 create 事件把下拉收起，否则「创建 "xxx"」就是个点了没反应的死控件。
const PAGE = resolve(process.cwd(), 'app/pages/tk_custom/quotation/index.vue')
const source = readFileSync(PAGE, 'utf8')
const { descriptor, errors } = parse(source, { filename: PAGE })

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

/** 模板属性名：静态属性取 name，指令（:x / @x / v-x）取 arg 名 */
function propName(prop) {
  if (prop.type === 6) return prop.name
  if (prop.type === 7 && prop.arg) return prop.arg.content ?? null
  return null
}

/** 静态属性的字面值，如 mode="autocomplete" → "autocomplete" */
function staticValue(node, name) {
  const prop = (node.props || []).find((item) => item.type === 6 && item.name === name)
  return prop?.value?.content ?? null
}

const menus = collect(
  descriptor.template?.ast,
  (node) => node.type === 1 && node.tag === 'UInputMenu',
)

const TERMS_PLACEHOLDERS = ['搜索或输入客户名称', '请选择或输入贸易条款', '如 30days', '请选择或输入付款方式']

describe('报价单「单据条款」输入框：可自由输入', () => {
  it('SFC 可解析', () => {
    expect(errors).toEqual([])
  })

  it('四个条款输入框都用 autocomplete（combobox 下输入的内容进不了模型）', () => {
    for (const placeholder of TERMS_PLACEHOLDERS) {
      const menu = menus.find((node) => staticValue(node, 'placeholder') === placeholder)
      expect(menu, `没找到占位符为「${placeholder}」的 UInputMenu`).toBeTruthy()
      expect(staticValue(menu, 'mode'), `「${placeholder}」必须是 autocomplete`).toBe('autocomplete')
    }
    // 只约束这四个单头条款菜单；其他字段（例如物料编码）可以有不同的输入模式。
  })

  it('四个条款输入框都接住了 create 事件（否则「创建 xxx」点了没反应）', () => {
    for (const placeholder of TERMS_PLACEHOLDERS) {
      const menu = menus.find((node) => staticValue(node, 'placeholder') === placeholder)
      const names = (menu.props || []).map(propName)
      expect(names, `「${placeholder}」缺少 :open 绑定`).toContain('open')
      expect(names, `「${placeholder}」缺少 @update:open`).toContain('update:open')
      expect(names, `「${placeholder}」缺少 @create`).toContain('create')
      expect(source).toContain('handleOptionMenuCreate(')
    }
  })

  it('客户下拉按当前输入重拉历史客户，不会被输入框缓存挡住', () => {
    // 打开客户下拉时要按当前输入重新查一次（输入没变时 watch 不触发）
    expect(source).toContain("if (field === 'customer')")
    expect(source).toContain('fetchCustomerOptions(customerSearchTerm.value.trim()')
  })
})
