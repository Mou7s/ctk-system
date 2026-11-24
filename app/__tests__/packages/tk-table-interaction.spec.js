import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isRepeatClick, resolveRowFromDoubleClick } from '../../packages/ui/tkTableInteraction.js'

const ROOT = process.cwd()

/** 递归收集目录下的 .vue 页面 */
function listVueFiles(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) listVueFiles(full, found)
    else if (entry.name.endsWith('.vue')) found.push(full)
  }
  return found
}

describe('TkUTable 行交互纯函数', () => {
  it('双击的第二下 click 被识别（否则会选中→取消→再选中，事件重复发）', () => {
    expect(isRepeatClick({ detail: 1 })).toBe(false)
    expect(isRepeatClick({ detail: 2 })).toBe(true)
    expect(isRepeatClick({ detail: 3 })).toBe(true)
    expect(isRepeatClick({})).toBe(false)
    expect(isRepeatClick(undefined)).toBe(false)
  })

  it('优先用单击命中的行：DOM 序号被展开行推偏时也不会打开错行', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const tr = {}
    const row = resolveRowFromDoubleClick({
      recordedRow: rows[0],
      recordedTr: tr,
      tr,
      rows,
      // 部门/菜单管理页每个已展开行后面都多一个 tr，序号被推后两位
      domIndex: 2,
    })
    expect(row).toBe(rows[0])
  })

  it('记录的行已不在这个 tr 上（数据换过、tr 被复用）时退回 DOM 序号', () => {
    const rows = [{ id: 'a' }, { id: 'b' }]
    const row = resolveRowFromDoubleClick({
      recordedRow: rows[0],
      recordedTr: {},
      tr: {},
      rows,
      domIndex: 1,
    })
    expect(row).toBe(rows[1])
  })

  it('没有记录时按 DOM 序号兜底，越界或没有行模型时返回 null', () => {
    const rows = [{ id: 'a' }]
    expect(resolveRowFromDoubleClick({ rows, domIndex: 0 })).toBe(rows[0])
    expect(resolveRowFromDoubleClick({ rows, domIndex: 3 })).toBe(null)
    expect(resolveRowFromDoubleClick({ rows, domIndex: -1 })).toBe(null)
    expect(resolveRowFromDoubleClick({ rows, domIndex: undefined })).toBe(null)
    expect(resolveRowFromDoubleClick({ rows: null, domIndex: 0 })).toBe(null)
    expect(resolveRowFromDoubleClick({})).toBe(null)
  })
})

describe('TkUTable 接线与页面写法', () => {
  const tableSource = readFileSync(resolve(ROOT, 'app/packages/ui/TkUTable.vue'), 'utf8')

  it('双击取行走共享实现，单击里拦掉双击的第二下', () => {
    expect(tableSource).toContain('resolveRowFromDoubleClick({')
    expect(tableSource).toContain('isRepeatClick(event)')
    // 不能再回到「DOM 行序号直接当行模型下标」的写法
    expect(tableSource).not.toMatch(/visibleRows\(\)\[rowIndex\]/)
  })

  it('页面里不允许再用属性式事件绑定（:row-click 不是监听器，永远不会触发）', () => {
    const bad = [':row-click=', ':row-open=', ':row-dblclick=', ':selection-change=']
    const offenders = []
    for (const file of listVueFiles(resolve(ROOT, 'app/pages'))) {
      const source = readFileSync(file, 'utf8')
      for (const pattern of bad) {
        if (source.includes(pattern)) offenders.push(`${file.replace(ROOT, '')} → ${pattern}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
