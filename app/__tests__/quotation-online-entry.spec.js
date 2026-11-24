import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from '@vue/compiler-sfc'
import { QUOTATION_GRID_BASE_COLUMNS, QUOTATION_GRID_PASTE_COLUMN_PROPS } from '@ctk-system/shared'

// 报价单两种录入方式并存（2026-09-17）：
//   ① 在线表格录入 —— 可编辑表格用 RevoGrid（TkQuotationGrid），支持整块粘贴、撤销重做、选项可搜索下拉
//   ② 导入 Excel 模板 —— 上传解析（弹窗里的只读预览是手写 table）
// 这条 spec 守的是「接线还在」：两条路都得能提交、可编辑网格不能是只读实例、列表页走原生 UTable 的行打开。
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

describe('报价单：在线录入 + 导入 Excel 两条路', () => {
  it('SFC 模板可解析', () => {
    expect(errors).toEqual([])
    expect(descriptor.template?.ast).toBeTruthy()
  })

  it('弹窗顶部有「在线表格录入 / 导入 Excel 模板」分段切换', () => {
    const labels = collect(descriptor.template.ast, (node) => node.type === 2).map((node) => node.content.trim())
    expect(labels).toContain('在线表格录入')
    expect(labels).toContain('导入 Excel 模板')
    expect(source).toContain("switchInputMode('form')")
    expect(source).toContain("switchInputMode('upload')")
  })

  it('在线录入用的是可编辑网格（TkQuotationGrid 且非只读），绑定齐全', () => {
    const grids = collect(descriptor.template.ast, (node) => node.type === 1 && node.tag === 'TkQuotationGrid')
    expect(grids.length).toBeGreaterThanOrEqual(2) // 在线录入（可编辑）+ 详情明细（只读）
    const editable = grids.filter((node) => !(node.props || []).some((prop) => propName(prop) === 'readonly'))
    expect(editable).toHaveLength(1)
    const bound = (editable[0].props || []).map(propName).filter(Boolean)
    for (const name of ['lines', 'before-paste', 'history', 'edit', 'update:lines', 'option-picker', 'dropdown-append-to']) {
      expect(bound, `在线录入网格缺少 ${name}`).toContain(name)
    }
  })

  it('国家/客户性质走网格内置下拉选择框（option-picker=false，不再由页面挂可搜索下拉）', () => {
    const grids = collect(descriptor.template.ast, (node) => node.type === 1 && node.tag === 'TkQuotationGrid')
    const editable = grids.filter((node) => !(node.props || []).some((prop) => propName(prop) === 'readonly'))
    const optionPicker = (editable[0].props || []).find((prop) => propName(prop) === 'option-picker')
    expect(optionPicker, '在线录入网格必须显式关掉 option-picker').toBeTruthy()
    expect(optionPicker.exp?.content ?? optionPicker.value?.content).toBe('false')
    // 页面侧的可搜索下拉（选项编辑栏）已下线：既没有 option-edit 接线，也没有残留状态
    expect(source).not.toContain('@option-edit')
    expect(source).not.toContain('optionEdit')
  })

  it('两条路共用底部按钮，各自分发到自己的提交函数', () => {
    expect(source).toContain('function submitCurrent(')
    expect(source).toMatch(/inputMode\.value === 'form'[\s\S]{0,80}submitFormQuotation\(action\)/)
    expect(source).toMatch(/return submitUploadFile\(action\)/)
    expect(source).toContain("submitCurrent('save')")
    expect(source).toContain("submitCurrent('submit')")
  })

  it('在线录入走 JSON 建单/更新，导入 Excel 走文件上传，各自带幂等 requestId', () => {
    expect(source).toMatch(/editingId\.value\s*\n?\s*\?\s*await updateQuotation\(editingId\.value, payload\)/)
    expect(source).toContain('await createQuotation(payload)')
    expect(source).toContain("formData.append('requestId'")
    expect(source).toContain('requestId: `${Date.now()}-')
  })

  it('提交前本地校验与服务端同源（选项清单 + 必填项逐行提示）', () => {
    expect(source).toContain('quotationOptionViolations(')
    expect(source).toContain('formatQuotationOptionViolations(')
    for (const required of ['请先填写终端客户', '必须填写应用', '基准汇率']) {
      expect(source, `缺少校验提示：${required}`).toContain(required)
    }
  })

  it('整块粘贴按模板列序落位：paste 列 = 网格基础列 + 价格尾巴，美元/成交价列跳过', () => {
    expect(source).toContain('...QUOTATION_GRID_PASTE_COLUMN_PROPS.map((key) => ({')
    expect(QUOTATION_GRID_PASTE_COLUMN_PROPS).toEqual([
      'materialCode', 'ctkMpn', 'packageName', 'originalPriceRmb', 'application',
      'manufacturer', 'manufacturerMpn', 'qty', 'dieSize', 'spqReel', 'usdKpcs', 'usdPc',
      'leadTime', 'datasheet', 'remark',
    ])
    expect(source).toContain("key === 'originalPriceRmb' ? { price: true } : {}")
    expect(source).toContain("['usdKpcs', 'usdPc'].includes(key) ? { readonly: true } : {}")
    expect(source).toContain("{ key: 'displayPriceRmb', readonly: true }")
    expect(source).toContain("{ key: 'displayPriceUsd', readonly: true }")
    expect(source).toContain('applyQuotationPasteGrid(')
    expect(source).toContain('parseQuotationPasteGrid(')
  })

  it('模板整块粘贴的「序号列」判定宽度与模板列数一致（A..P = 16 列）', () => {
    // 当前模板列：序号 + 网格基础列 + 价格/交期/资料/备注尾巴（1 + 9 + 6 = 16 列）
    const templateWidth = 1 + QUOTATION_GRID_BASE_COLUMNS.length + 6
    expect(templateWidth).toBe(16)
    expect(source).toContain(`FORM_TEMPLATE_PASTE_WIDTH = ${templateWidth}`)
  })

  it('列表页用原生 UTable 且行打开的接线上是 @dblclick + :on-select', () => {
    const tables = collect(descriptor.template.ast, (node) => node.type === 1 && node.tag === 'UTable')
    expect(tables.length).toBeGreaterThanOrEqual(1)
    const attrs = tables.flatMap((node) => node.props || []).map(propName).filter(Boolean)
    expect(attrs).toContain('dblclick')
    expect(attrs).toContain('on-select')
    expect(attrs).toContain('row-selection')
    expect(attrs).toContain('columns')
    // 列表区不再手写内联 <table>（列定义走 listColumns + 插槽），也不再包 TkUTable
    expect(source).toContain('const listColumns = [')
    expect(source).not.toContain('<TkUTable')
    expect(source).not.toContain('@dblclick="handleRowDblclick(row)"')
    // 双击取行/第二下 click 仍走共享的同一套算法，不在页面里另长一套
    expect(source).toContain('resolveRowFromDoubleClick({')
    expect(source).toContain('isRepeatClick(event)')
  })

  it('切换录入方式不改变弹窗尺寸（固定 96vw / 92vh，不再按模式两态）', () => {
    const start = source.indexOf('const uploadModalUi')
    expect(start).toBeGreaterThan(-1)
    const block = source.slice(start, start + 360)
    expect(block).toContain('h-[92vh] w-[96vw]')
    // 两态尺寸已下线：不再有「没选文件时缩成小卡片」的分支
    expect(source).not.toContain('modalHasContent')
    expect(source).not.toContain('w-[min(640px,94vw)]')
  })

  it('误关保护：有关闭前的未提交内容确认', () => {
    expect(source).toContain('function requestCloseUpload(')
    expect(source).toContain('未提交的内容')
  })
})
