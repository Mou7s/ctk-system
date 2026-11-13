import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from '@vue/compiler-sfc'
import { QUOTATION_GRID_DISPLAY_COLUMN_PROPS } from '@ctk-system/shared'

// 上传预览按当前外贸模板 A..P 的顺序显示；整块复制、网格录入和 Excel 解析使用同一列序。
const PAGE = resolve(process.cwd(), 'app/pages/tk_custom/quotation/index.vue')

const PREVIEW_HEADER_BY_PROP = {
  materialCode: '物料编码',
  ctkMpn: '物料名称',
  packageName: '封装',
  originalPriceRmb: '单价（元）',
  application: '应用',
  manufacturer: '友商',
  manufacturerMpn: '友商型号',
  qty: '数量',
  dieSize: '芯片大小',
  spqReel: 'SPQ / Reel',
  usdKpcs: '千只单价（美元）',
  usdPc: '1只单价（美元）',
  leadTime: '交期',
  datasheet: '规格书',
  remark: '备注',
}

const EXPECTED_PREVIEW_HEADERS = [
  '#',
  ...QUOTATION_GRID_DISPLAY_COLUMN_PROPS.map((prop) => PREVIEW_HEADER_BY_PROP[prop]),
]

function elementText(node) {
  return (node.children || [])
    .filter((child) => child.type === 2) // TEXT
    .map((child) => child.content.trim())
    .join('')
}

function walk(node, visit) {
  visit(node)
  for (const child of node.children || []) walk(child, visit)
}

function findPreviewTable(templateAst) {
  let found = null
  walk(templateAst, (node) => {
    if (found || node.type !== 1 || node.tag !== 'table') return
    const labels = []
    walk(node, (child) => {
      if (child.type === 1 && child.tag === 'th') labels.push(elementText(child))
    })
    if (labels.includes('千只单价（美元）')) found = { node, labels }
  })
  return found
}

/** 到目标节点的祖先链（从根往下），用来检查布局类名落在哪一层 */
function pathTo(templateAst, match) {
  const stack = []
  let result = null
  walk2(templateAst)
  return result

  function walk2(node) {
    if (result) return
    stack.push(node)
    if (match(node)) {
      result = [...stack]
      stack.pop()
      return
    }
    for (const child of node.children || []) {
      walk2(child)
      if (result) break
    }
    stack.pop()
  }
}

function classAttr(node) {
  const attr = (node.props || []).find((prop) => prop.type === 6 && prop.name === 'class')
  return attr?.value?.content || ''
}

describe('Quotation 上传预览表', () => {
  const { descriptor, errors } = parse(readFileSync(PAGE, 'utf8'), { filename: PAGE })

  it('SFC 模板可解析', () => {
    expect(errors).toEqual([])
    expect(descriptor.template?.ast).toBeTruthy()
  })

  it('列与列序跟外贸模板 A..P 对齐（含核心物料字段与人民币单价）', () => {
    const preview = findPreviewTable(descriptor.template.ast)
    expect(preview, '没找到含「汇率」的预览表').toBeTruthy()
    expect(preview.labels).toEqual(EXPECTED_PREVIEW_HEADERS)
  })

  it('每行单元格数与表头一致（不漏列、不多列）', () => {
    const preview = findPreviewTable(descriptor.template.ast)
    const row = []
    walk(preview.node, (node) => {
      if (node.type === 1 && node.tag === 'tr' && node.children.some((child) => child.type === 1 && child.tag === 'td')) row.push(node)
      // 一行里只有 1 个 tr 带 td，即明细行模板
    })
    expect(row).toHaveLength(1)
    const cellCount = row[0].children.filter((child) => child.type === 1 && child.tag === 'td').length
    expect(cellCount).toBe(preview.labels.length)
  })

  it('渲染全部明细行（不截断到前 50 行）', () => {
    const preview = findPreviewTable(descriptor.template.ast)
    let rowSource = ''
    walk(preview.node, (node) => {
      if (node.type === 1 && node.tag === 'tr' && node.children.some((child) => child.type === 1 && child.tag === 'td')) {
        rowSource = node.loc.source
      }
    })
    expect(rowSource).toContain('v-for="line in parsedData.lines"')
    expect(rowSource).not.toMatch(/slice\(|\.filter\(|MAX_PREVIEW/)
    // 标题文案不能再说「前 50 行」，行数按实际明细条数显示
    const titleSource = descriptor.template.content
    expect(titleSource).not.toContain('前 50 行')
    expect(titleSource).toContain('parsedData.lines.length }} 行')
  })

  // 弹窗高度有限：上传区压成一行、基础信息卡片压扁，明细表吃掉剩余高度（原来固定 max-h-72/46vh 只给半屏）
  it('明细表占满弹窗剩余高度（卡片 flex-1 + 滚动容器不定高）', () => {
    const chain = pathTo(descriptor.template.ast, (node) => node.type === 1 && node.tag === 'table' && classAttr(node).includes('min-w-[1600px]'))
    expect(chain, '没找到预览表').toBeTruthy()
    const scrollWrapper = chain[chain.length - 2]
    const card = chain[chain.length - 3]
    expect(classAttr(scrollWrapper)).toContain('flex-1')
    expect(classAttr(scrollWrapper)).toContain('overflow-auto')
    expect(classAttr(scrollWrapper)).not.toMatch(/max-h-/)
    expect(classAttr(card)).toContain('flex-1')
    expect(classAttr(card)).toContain('min-h-0')
    // 已选文件后不再保留 p-6/p-8 的大拖拽框
    const source = descriptor.template.content
    expect(source).toContain('已选文件：压成一行状态条')
    const fileStrip = source.slice(source.indexOf('已选文件：压成一行状态条'), source.indexOf('未选文件：完整拖拽区'))
    expect(fileStrip).not.toContain('p-6 sm:p-8')
    expect(fileStrip).toContain('py-2')
  })
})
