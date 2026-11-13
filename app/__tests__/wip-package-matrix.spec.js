// @vitest-environment happy-dom
// 需要 DOM：本文件 mount 组件，默认的 node 环境没有 document
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import WipPackageMatrix from '../components/tk_custom/WipPackageMatrix.vue'

/**
 * 车间半成品在制「封装 × 工序」矩阵：
 * - 一个轴是封装、一个轴是工序，交叉格就是在制数量，行列都要有合计；
 * - 空格不要渲染成 0，避免把「这道工序没有在制」看成「在制是 0」；
 * - 点格子要能带着 (封装, 工序) 去下钻，行头/列头只锁定单个维度；
 * - 两个轴可以互换，互换后同一组合的格子必须还是同一份数据（不能错位）。
 */
const MATRIX = {
  packages: [
    { name: 'PDFN5X6', wipQty: 100, orderCount: 2, materialCount: 2, sortOrder: 2147483647 },
    { name: 'SOD-123', wipQty: 50, orderCount: 1, materialCount: 1, sortOrder: 2147483647 }
  ],
  processes: [
    { name: '固晶部', wipQty: 90, orderCount: 2, materialCount: 2, sortOrder: 10 },
    { name: '焊线部', wipQty: 60, orderCount: 1, materialCount: 1, sortOrder: 20 }
  ],
  cells: [
    { packageName: 'PDFN5X6', processName: '固晶部', wipQty: 40, orderCount: 1, materialCount: 1, unreportedQty: 0, unreportedCount: 0 },
    { packageName: 'SOD-123', processName: '固晶部', wipQty: 50, orderCount: 1, materialCount: 1, unreportedQty: 50, unreportedCount: 1 },
    { packageName: 'PDFN5X6', processName: '焊线部', wipQty: 60, orderCount: 1, materialCount: 1, unreportedQty: 0, unreportedCount: 0 }
  ],
  totalQty: 150,
  maxCellQty: 60,
  cellCount: 3,
  packageCount: 2,
  processCount: 2
}

function mountMatrix(props = {}) {
  return mount(WipPackageMatrix, {
    props: { matrix: MATRIX, ...props },
    global: { stubs: { UButton: { template: '<button type="button"><slot /></button>' } } }
  })
}

function axisNames(wrapper, selector) {
  return wrapper.findAll(`${selector} .axis-name`).map((node) => node.text())
}

// 格子文本 = 数量 + 副行（订单数 或 未汇报），没在制的格子渲染成 —
function cellTexts(row) {
  return row.findAll('td.matrix-cell').map((cell) => {
    const qty = cell.find('.cell-qty')
    if (!qty.exists()) return cell.text()
    const meta = cell.find('.cell-meta').text()
    return `${qty.text()}|${meta}`
  })
}

function heatValue(node) {
  return Number(node.attributes('data-heat') || 0)
}

describe('WipPackageMatrix（封装 × 工序 在制矩阵）', () => {
  it('renders packages as rows, processes as columns, with row/column/grand totals', () => {
    const wrapper = mountMatrix()
    const bodyRows = wrapper.findAll('tbody tr')

    expect(axisNames(wrapper, '.axis-row')).toEqual(['PDFN5X6', 'SOD-123'])
    expect(axisNames(wrapper, '.axis-col')).toEqual(['固晶部', '焊线部'])
    expect(bodyRows).toHaveLength(2)
    // 行合计在右侧、列合计在吸顶的列头里（页面头部给总在制）——同一个数字不说三遍
    expect(bodyRows[0].find('.matrix-total').text()).toBe('100')
    expect(bodyRows[1].find('.matrix-total').text()).toBe('50')
    expect(wrapper.find('tfoot').exists()).toBe(false)

    // 列头带该工序的在制合计与料/单信息
    const columnHeaders = wrapper.findAll('.axis-col .axis-button')
    expect(columnHeaders[0].text()).toContain('固晶部')
    expect(columnHeaders[0].text()).toContain('90')
    expect(wrapper.findAll('.axis-row .axis-meta')[0].text()).toBe('2 料 · 2 单')
  })

  it('shows every cell quantity and keeps missing combinations as empty, not zero', () => {
    const wrapper = mountMatrix()
    const rows = wrapper.findAll('tbody tr')

    expect(cellTexts(rows[0])).toEqual(['40|1 单', '60|1 单'])
    // 未汇报格也要保留订单数：不汇报≠不知道有多少单
    expect(cellTexts(rows[1])).toEqual(['50|未汇报· 1 单', '—'])

    // 只有 3 个组合有量，第 4 格必须是空位
    expect(wrapper.findAll('td.matrix-cell--empty')).toHaveLength(1)
    expect(wrapper.findAll('button.cell-button')).toHaveLength(3)
  })

  it('deepens the heat colour with the quantity relative to the peak cell', () => {
    const wrapper = mountMatrix()
    const buttons = wrapper.findAll('button.cell-button')
    const peak = buttons.find((button) => button.text().startsWith('60'))
    const middle = buttons.find((button) => button.text().startsWith('50'))
    const smallest = buttons.find((button) => button.text().startsWith('40'))

    // 对数档：峰值格最深，中间格次之，最小格最浅，且都落在 8%~66% 的可读区间
    expect(heatValue(peak)).toBeGreaterThan(heatValue(middle))
    expect(heatValue(middle)).toBeGreaterThan(heatValue(smallest))
    expect(heatValue(peak)).toBe(66)
    expect(heatValue(smallest)).toBeGreaterThanOrEqual(8)
    expect(peak.attributes('title')).toContain('PDFN5X6 · 焊线部')
    expect(middle.attributes('title')).toContain('其中 1 行未汇报')
  })

  it('drills into the clicked cell with both axis names', async () => {
    const wrapper = mountMatrix()
    const rows = wrapper.findAll('tbody tr')

    await rows[0].findAll('button.cell-button')[0].trigger('click')
    expect(wrapper.emitted('drill-cell')[0][0]).toEqual({ packageName: 'PDFN5X6', processName: '固晶部' })

    await rows[1].findAll('button.cell-button')[0].trigger('click')
    expect(wrapper.emitted('drill-cell')[1][0]).toEqual({ packageName: 'SOD-123', processName: '固晶部' })
  })

  it('drills on a single axis when a row or column header is clicked', async () => {
    const wrapper = mountMatrix()

    await wrapper.findAll('.axis-row .axis-button')[1].trigger('click')
    expect(wrapper.emitted('drill-axis')[0][0]).toEqual({ axis: 'package', name: 'SOD-123' })

    await wrapper.findAll('.axis-col .axis-button')[1].trigger('click')
    expect(wrapper.emitted('drill-axis')[1][0]).toEqual({ axis: 'process', name: '焊线部' })
  })

  it('keeps the same pairing after swapping the two axes', async () => {
    const wrapper = mountMatrix({ transposed: true })
    const rows = wrapper.findAll('tbody tr')

    expect(axisNames(wrapper, '.axis-row')).toEqual(['固晶部', '焊线部'])
    expect(axisNames(wrapper, '.axis-col')).toEqual(['PDFN5X6', 'SOD-123'])
    expect(cellTexts(rows[0])).toEqual(['40|1 单', '50|未汇报· 1 单'])
    expect(cellTexts(rows[1])).toEqual(['60|1 单', '—'])

    await rows[1].findAll('button.cell-button')[0].trigger('click')
    expect(wrapper.emitted('drill-cell')[0][0]).toEqual({ packageName: 'PDFN5X6', processName: '焊线部' })
  })

  it('offers the axis switch as a segmented control and reports an empty matrix instead of blank space', async () => {
    const wrapper = mountMatrix()
    const options = wrapper.findAll('.matrix-bar .tk-segmented__option')

    expect(options.map((option) => option.text())).toEqual(['封装为行', '工序为行'])
    expect(options[0].classes()).toContain('is-active')
    expect(options[0].attributes('aria-pressed')).toBe('true')

    await options[1].trigger('click')
    expect(wrapper.emitted('set-transposed')[0][0]).toBe(true)

    // 已经是「工序为行」时点另一侧必须报 false：行轴是幂等的设定，不是取反
    const flipped = mountMatrix({ transposed: true })
    expect(flipped.findAll('.matrix-bar .tk-segmented__option')[1].classes()).toContain('is-active')
    await flipped.findAll('.matrix-bar .tk-segmented__option')[0].trigger('click')
    expect(flipped.emitted('set-transposed')[0][0]).toBe(false)

    const empty = mountMatrix({ matrix: { packages: [], processes: [], cells: [], totalQty: 0, maxCellQty: 0, cellCount: 0 } })
    expect(empty.find('.matrix-empty').text()).toBe('当前筛选下没有在制数据')
    expect(empty.find('tbody tr').exists()).toBe(true)
  })

  it('folds five-digit quantities into 万 so the tile stays readable, keeping the exact value in the tooltip', () => {
    const wrapper = mountMatrix({
      matrix: {
        packages: [{ name: 'SOD-123', wipQty: 311939.66, orderCount: 1771, materialCount: 212, sortOrder: 999 }],
        processes: [{ name: '固晶部', wipQty: 311939.66, orderCount: 1771, materialCount: 212, sortOrder: 10 }],
        cells: [{ packageName: 'SOD-123', processName: '固晶部', wipQty: 311939.66, orderCount: 1771, materialCount: 212, unreportedQty: 311939.66, unreportedCount: 1771 }],
        totalQty: 311939.66,
        maxCellQty: 311939.66,
        cellCount: 1
      }
    })

    expect(wrapper.find('.cell-qty').text()).toBe('31.2万')
    expect(wrapper.find('.axis-qty').text()).toBe('31.2万')
    expect(wrapper.find('.matrix-total').text()).toBe('31.2万')
    expect(wrapper.find('.cell-button').attributes('title')).toContain('在制 311,939.66')
    // 未汇报是「带点的小字」，不是把格子染成警示色
    expect(wrapper.find('.cell-dot').exists()).toBe(true)
    expect(wrapper.find('.cell-flag').text()).toBe('未汇报')
  })
})
