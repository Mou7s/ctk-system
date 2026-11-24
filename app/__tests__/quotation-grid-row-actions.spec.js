import { describe, expect, it } from 'vitest'
import { getSelectedRowIndexes } from '../packages/ui/quotationGridSelection.js'

describe('报价单明细表：插入行与删除行目标定位', () => {
  it('当鼠标指针悬停在某行时，删除行与插入行以该悬停行为目标', () => {
    // 模拟无显式选中，但鼠标指针悬停在第 2 行（索引 2）
    const targetRows = getSelectedRowIndexes({
      selected: null,
      hovered: 2,
      lastFocused: null,
      fallback: 0,
    })
    expect(targetRows).toEqual([2])
  })

  it('显式点击选中的行优先于悬停行', () => {
    // 用户点击了第 3 行，鼠标即使划过第 1 行，目标依然是点击的第 3 行
    const targetRows = getSelectedRowIndexes({
      selected: 3,
      hovered: 1,
      lastFocused: { row: 2 },
      fallback: 0,
    })
    expect(targetRows).toEqual([3])
  })

  it('无显式选中但有单元格焦点时，以焦点所在行为目标', () => {
    const targetRows = getSelectedRowIndexes({
      selected: null,
      hovered: null,
      lastFocused: { row: 1 },
      fallback: 0,
    })
    expect(targetRows).toEqual([1])
  })

  it('全新打开表格无操作时，默认保底以第 1 行（索引 0）为目标，绝不报阻断警告', () => {
    const targetRows = getSelectedRowIndexes({
      selected: null,
      hovered: null,
      lastFocused: null,
      fallback: 0,
    })
    expect(targetRows).toEqual([0])
  })

  it('在目标行之前插入一行：新行插入在当前行下标之前，后续行顺移且序号 1..N 递增', () => {
    const lines = [
      { lineNo: 1, ctkMpn: 'A' },
      { lineNo: 2, ctkMpn: 'B' },
      { lineNo: 3, ctkMpn: 'C' },
    ]
    const at = 1 // 目标是第 2 行 (B)
    const blank = { lineNo: at + 1, ctkMpn: '' }

    const nextLines = [...lines]
    nextLines.splice(at, 0, blank)
    const result = nextLines.map((line, index) => ({ ...line, lineNo: index + 1 }))

    expect(result).toHaveLength(4)
    expect(result[0].ctkMpn).toBe('A')
    expect(result[1].ctkMpn).toBe('') // 在原第 2 行之前插入了新行
    expect(result[2].ctkMpn).toBe('B') // 原第 2 行顺延为第 3 行
    expect(result[3].ctkMpn).toBe('C')
    expect(result.map(l => l.lineNo)).toEqual([1, 2, 3, 4])
  })

  it('删除当前目标行：删除指定行，序号 1..N 重编，下一激活行保持当前位置', () => {
    const lines = [
      { lineNo: 1, ctkMpn: 'A' },
      { lineNo: 2, ctkMpn: 'B' },
      { lineNo: 3, ctkMpn: 'C' },
    ]
    const at = 1 // 删除第 2 行 (B)

    const nextLines = [...lines]
    nextLines.splice(at, 1)
    const result = nextLines.map((line, index) => ({ ...line, lineNo: index + 1 }))

    expect(result).toHaveLength(2)
    expect(result[0].ctkMpn).toBe('A')
    expect(result[1].ctkMpn).toBe('C')
    expect(result.map(l => l.lineNo)).toEqual([1, 2])

    // 删除第 1 位后，原位置下一个行下标为 Math.min(at, result.length - 1) = 1 (即现在的 C 行)
    const nextActive = Math.min(at, result.length - 1)
    expect(nextActive).toBe(1)
  })
})
