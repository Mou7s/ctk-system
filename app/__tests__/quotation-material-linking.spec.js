import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from '@vue/compiler-sfc'
import { QUOTATION_PACKAGE_OPTIONS } from '@ctk-system/shared'
import { extractK3PackageName } from '../../server/utils/material-read.ts'

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

describe('报价单 CTK 型号与封装从金蝶带出与联动', () => {
  it('SFC 模板解析正常', () => {
    expect(errors).toEqual([])
  })

  it('金蝶物料规格解析函数 extractK3PackageName 符合金蝶口径', () => {
    expect(extractK3PackageName('SOD-123FL / 36V')).toBe('SOD-123FL')
    expect(extractK3PackageName('SMA/DO-214AC')).toBe('SMA')
    expect(extractK3PackageName('LL-34 / 0.5W')).toBe('LL-34')
    expect(extractK3PackageName('LL-41')).toBe('LL-41')
    expect(extractK3PackageName('TO-252')).toBe('TO-252')
    expect(extractK3PackageName('')).toBe('')
    expect(extractK3PackageName(null)).toBe('')
  })

  it('QUOTATION_PACKAGE_OPTIONS 包含主流封装候选', () => {
    expect(QUOTATION_PACKAGE_OPTIONS).toContain('SOD-123FL')
    expect(QUOTATION_PACKAGE_OPTIONS).toContain('SMA')
    expect(QUOTATION_PACKAGE_OPTIONS).toContain('TO-252')
    expect(QUOTATION_PACKAGE_OPTIONS).toContain('PDFN5x6')
  })

  it('物料编码输入框搜索金蝶候选，并把选中的编码交给联动处理', () => {
    const materialMenu = inputMenus.find((node) => staticValue(node, 'placeholder') === '搜索编码或名称')
    expect(materialMenu, '未找到物料编码搜索菜单').toBeTruthy()
    expect(staticValue(materialMenu, 'mode')).toBe('combobox')
    expect(staticValue(materialMenu, 'create-item')).toBe('always')

    const props = (materialMenu.props || []).map(propName)
    expect(props).toContain('items')
    expect(props).toContain('loading')
    expect(props).toContain('open')
    expect(props).toContain('update:open')
    expect(props).toContain('update:model-value')
    expect(props).toContain('update:search-term')
    expect(props).toContain('create')
    expect(staticValue(materialMenu, 'value-key')).toBe('value')
    expect(staticValue(materialMenu, 'label-key')).toBe('label')
  })

  it('封装输入框为 UInputMenu，支持选择常用候选与自由输入', () => {
    const pkgMenu = inputMenus.find((node) => staticValue(node, 'placeholder') === '封装')
    expect(pkgMenu, '未找到 placeholder 为「封装」的 UInputMenu').toBeTruthy()
    expect(staticValue(pkgMenu, 'mode')).toBe('autocomplete')
    expect(staticValue(pkgMenu, 'create-item')).toBe('always')

    const props = (pkgMenu.props || []).map(propName)
    expect(props).toContain('items')
    expect(props).toContain('open')
    expect(props).toContain('update:open')
    expect(props).toContain('update:model-value')
    expect(props).toContain('input')
    expect(props).toContain('blur')
  })

  it('选择金蝶物料后同步物料名称和封装，封装输入支持自由编辑和清空', () => {
    expect(source).toContain('materialOptions')
    expect(source).toContain('materialDict')
    expect(source).toContain('formatMpnDisplayValue')
    expect(source).toContain('handleMaterialCodeUpdate')
    expect(source).toContain('handleMaterialCodeCreate')
    expect(source).toContain('handleMaterialCodeBlur')
    expect(source).toContain('handlePackageInput')
    expect(source).toContain('handlePackageBlur')
    expect(source).toContain('handleRowPatch')
    expect(source).toContain("ctkMpn: String(material.name || material.ctkMpn || '').trim()")
    expect(source).toContain('patch.packageName = String(material.packageName || \'\').trim()')
    // blur 提交时不能要求输入非空，否则使用者无法清空误填的封装。
    expect(source).toContain('if (clean !== formatMpnDisplayValue(currentRow.packageName))')
  })

  it('服务端物料候选查询限定为金蝶云星空成品分类（A/B/D）且仅限 N 开头料号', async () => {
    const { readFileSync } = await import('node:fs')
    const serverFile = resolve(process.cwd(), 'server/utils/material-read.ts')
    const serverCode = readFileSync(serverFile, 'utf8')
    expect(serverCode).toContain('FinishedGroups AS')
    expect(serverCode).toContain("g.FNUMBER IN ('A', 'B', 'D')")
    expect(serverCode).toContain("m.FNUMBER LIKE 'N%'")
    const gridFile = resolve(process.cwd(), 'app/packages/ui/TkQuotationGrid.vue')
    const gridCode = readFileSync(gridFile, 'utf8')
    expect(gridCode).toContain('!/^N/i.test(num)')
  })

  it('数据层 normalizeGridValue 具备防 [object Object] 防线', async () => {
    const { normalizeGridValue } = await import('@ctk-system/shared')
    // 对象解构
    expect(normalizeGridValue('ctkMpn', { value: 'MBRF10200CT', packageName: 'TO-220F' })).toBe('MBRF10200CT')
    expect(normalizeGridValue('packageName', { value: 'TO-220F' })).toBe('TO-220F')
    // 脏字符串清洗
    expect(normalizeGridValue('ctkMpn', '[object Object]')).toBe('')
    expect(normalizeGridValue('packageName', '[object Object]')).toBe('')
    // 正常字符串
    expect(normalizeGridValue('ctkMpn', 'SMAJ5.0A')).toBe('SMAJ5.0A')
    expect(normalizeGridValue('packageName', 'SMA')).toBe('SMA')
  })
})


describe('物料名称搜索联动', () => {
  it('名称菜单按唯一物料值选择，手输名称不猜测编码', () => {
    const start = source.indexOf('function handleMaterialNameUpdate(')
    const end = source.indexOf('function handleMaterialNameCreate(', start)
    const codeUpdates = [], nameUpdates = []
    const update = new Function('formatMpnDisplayValue', 'materialCodeMenuOptions', 'handleMaterialCodeUpdate', 'handleCellUpdate', `${source.slice(start, end)}; return handleMaterialNameUpdate`)(
      String,
      { value: [{ value: 'k3:N001', name: '同名物料' }, { value: 'k3:N002', name: '同名物料' }] },
      (...args) => codeUpdates.push(args),
      (...args) => nameUpdates.push(args),
    )
    update(0, 'k3:N002')
    expect(codeUpdates).toEqual([[0, 'k3:N002']])
    update(0, '同名物料')
    expect(nameUpdates).toEqual([[0, 'ctkMpn', '同名物料']])
  })
  it('名称列不在失焦时用搜索词覆盖选中的金蝶物料', () => {
    const menu = inputMenus.find(node => staticValue(node, 'placeholder') === '搜索物料名称或编码')
    expect(menu).toBeTruthy()
    expect((menu.props || []).map(propName)).not.toContain('blur')
    expect(source).toContain('materialNameMenuOptions')
  })
})
