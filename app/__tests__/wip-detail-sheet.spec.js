// @vitest-environment happy-dom
// 需要 DOM：本文件 mount 组件并读 document.body（抽屉 Teleport 到 body）
//
// 说明：真机的明细表是 TkUTable（Nuxt UI UTable），它内部依赖 Nuxt 的虚拟模块
// （#imports / #build/ui/table），在 vitest 里装不起来，所以这里用一个「忠实于我们用到的契约」
// 的替身：吃 data / columns / meta.class / 各列 -cell 插槽，渲染成普通 table。
// 另有一条不 mount 的接线用例（读 .vue 源码）守住真机上确实用的是 TkUTable + 行虚拟化。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { parse } from '@vue/compiler-sfc'
import { computed, h } from 'vue'
import WipDetailSheet from '../components/tk_custom/WipDetailSheet.vue'

/**
 * 在制明细抽屉（取代原来的「明细列表」tab）：
 * - 打开就把这一格的明细一次性拉回来（all=true，不分页），格子的封装/工序覆盖筛选栏同名维度；
 * - 换格子重新拉，同一格重复打开不重复请求；排序在本机做，不产生请求；
 * - 未汇报行要带标记（业务上「一道都没汇报」和在制 0 不是一回事）；
 * - 导出、ESC/遮罩关闭都要能用（底部不再有分页控件）；
 * - 明细表走 TkUTable，行数多时开行虚拟化（DOM 里只留看得见的行）。
 */
const DETAIL_ROWS = [
  {
    moNumber: 'MO260919034', moEntrySeq: '1', billNo: 'SY260909001', processNumber: '10', processName: '固晶部',
    materialNumber: 'NAD0030011', materialName: 'TK1N4148W', specification: 'SOD-123/3K盘/无/T4',
    operQty: 65.82, qualifiedQty: 0, nextReceivedQty: 0, wipQty: 65.82,
    routeName: '塑封路线', departmentName: '固晶车间', lastReportTime: ' ', unreported: true, wipStatus: 'unreported',
    reportQty: 0, transInQty: 0, transOutQty: 0,
  },
  {
    moNumber: 'MO260902054', moEntrySeq: '1', billNo: 'SY260902011', processNumber: '20', processName: '焊线部',
    materialNumber: 'NAM0750002', materialName: 'CTK80N03DF5', specification: 'PDFN5X6/5K盘/无',
    operQty: 22.4, qualifiedQty: 0, nextReceivedQty: 0, wipQty: 22.4,
    routeName: '塑封路线', departmentName: '焊线车间', lastReportTime: '2026-09-19 08:30:00', unreported: false, wipStatus: 'received',
    reportQty: 0, transInQty: 22.4, transOutQty: 0,
  },
]

// TkUTable 替身：只实现本组件用到的部分（columns/data/meta.class.tr/各列插槽/表头插槽/空状态/排序）。
// 表头插槽按真机契约给一个最小的 column：读当前排序 getIsSorted、两态切换 toggleSorting，
// 并把 v-model:sorting 的新状态抛回父组件（真机是 UTable 的 defineModel('sorting')）。
// 真机的行序由 TanStack 的 getSortedRowModel 排（数据是全量的），替身用同一条 sortingFn 复现，
// 这样「点了表头行序真的换了」是可断言的，而不是只看箭头变没变。
const TkUTableStub = {
  name: 'TkUTable',
  props: {
    data: { type: Array, default: () => [] },
    columns: { type: Array, default: () => [] },
    meta: { type: Object, default: () => ({}) },
    virtualize: { type: [Boolean, Object], default: false },
    empty: { type: String, default: '' },
    sorting: { type: Array, default: () => [] },
  },
  emits: ['update:sorting'],
  setup(props, { emit, slots }) {
    const columnList = computed(() => props.columns || [])
    const headerColumn = (id) => ({
      id,
      getIsSorted() {
        const entry = (props.sorting || []).find((item) => item && item.id === id)
        return entry ? (entry.desc ? 'desc' : 'asc') : false
      },
      // 与 TanStack 一致：永远显式给方向（正序 ⇄ 倒序），不会切到「无序」
      toggleSorting(desc) {
        emit('update:sorting', [{ id, desc: Boolean(desc) }])
      },
    })
    const sortedRows = () => {
      const entry = (props.sorting || [])[0]
      if (!entry) return props.data
      const column = columnList.value.find((item) => (item.id || item.accessorKey) === entry.id)
      if (!column?.sortingFn) return props.data
      const toRow = (original) => ({
        original,
        getValue(key) {
          const target = columnList.value.find((item) => (item.id || item.accessorKey) === key)
          return target ? original[target.accessorKey] : undefined
        },
      })
      const sign = entry.desc ? -1 : 1
      return [...props.data].sort((left, right) => sign * column.sortingFn(toRow(left), toRow(right), entry.id))
    }
    return () => {
      const head = h('tr', columnList.value.map((column) => {
        const key = column.id || column.accessorKey
        const headerSlot = slots[`${key}-header`]
        const content = headerSlot ? headerSlot({ column: headerColumn(key) }) : column.header
        return h('th', { class: column.meta?.class?.th }, content)
      }))
      const rows = sortedRows()
      const body = rows.length
        ? rows.map((row) => h(
            'tr',
            { class: props.meta?.class?.tr?.({ original: row }) || '' },
            columnList.value.map((column) => {
              const key = column.id || column.accessorKey
              const cell = slots[`${key}-cell`]
              return h('td', { class: column.meta?.class?.td }, cell ? cell({ row: { original: row } }) : String(row[column.accessorKey] ?? ''))
            }),
          ))
        : [h('tr', [h('td', { class: 'tk-sheet__empty' }, props.empty)])]
      return h('table', [h('thead', [head]), h('tbody', body)])
    }
  },
}

const state = vi.hoisted(() => ({ calls: [], report: null, fail: false }))

globalThis.getWipList = async (params) => {
  state.calls.push(params)
  if (state.fail) throw new Error('查询失败')
  return { data: state.report }
}

// 一次性加载（all=true）的响应：没有翻页概念——page=1、pageCount=1、pageSize 就是全部条数
const REPORT = {
  details: DETAIL_ROWS,
  detailsTotal: 1771,
  page: 1,
  pageSize: 1771,
  pageCount: 1,
  totalQty: 311939.66,
  orderCount: 1515,
}

function mountSheet(props = {}) {
  return mount(WipDetailSheet, {
    props: {
      open: true,
      filters: { packageName: 'SOD-123', processName: '固晶部', onlyPositive: false, hideZeroWip: true },
      title: 'SOD-123 × 固晶部',
      subtitle: '该封装停在这道工序的在制品',
      ...props,
    },
    global: {
      stubs: {
        // 声明式 props 之外的 attrs（class / wrapper-class / ui …）会落到替身的根元素上，与真机一致
        TkUTable: TkUTableStub,
        teleport: true,
        UButton: { template: '<button type="button" v-bind="$attrs"><slot /></button>' },
        UIcon: { template: '<i />' },
      },
    },
  })
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('WipDetailSheet（在制明细抽屉）', () => {
  beforeEach(() => {
    state.calls = []
    state.fail = false
    state.report = { ...REPORT }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches the clicked scope on open and renders the detail rows', async () => {
    const wrapper = mountSheet()
    await flush()

    expect(state.calls).toHaveLength(1)
    expect(state.calls[0]).toMatchObject({
      packageName: 'SOD-123',
      processName: '固晶部',
      // 一次性把这一格拉完：不带页码、页大小，加载也不带排序（排序是本机的事）
      all: true,
      // 明细只要「还压在这道工序上的」：在制为 0 的行交给服务端滤掉（hideZeroWip），
      // 负值异常行仍要看得到（onlyPositive 关掉）。两个开关都按拿到的 filters 原样转发。
      hideZeroWip: true,
      onlyPositive: false
    })
    expect(state.calls[0]).not.toHaveProperty('page')
    expect(state.calls[0]).not.toHaveProperty('pageSize')
    expect(state.calls[0]).not.toHaveProperty('sortBy')

    const rows = wrapper.findAll('.tk-sheet__table tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('MO260919034')
    expect(rows[0].text()).toContain('NAD0030011')
    expect(rows[0].find('.tk-sheet__status').text()).toBe('未汇报')
    expect(rows[0].classes()).toContain('is-unreported')
    // 只接住上道转入、本工序没汇报的行同样要点出来（TX031463 包装入库 就是这么一条）
    expect(rows[1].classes()).toContain('is-unreported')
    expect(rows[1].find('.tk-sheet__status').text()).toBe('未汇报 · 上道已转入')
    expect(rows[1].text()).toContain('22.4')

    // 头部给出这一格的合计/条数/订单数
    const metrics = wrapper.findAll('.tk-sheet__metric-value').map((node) => node.text())
    expect(metrics).toEqual(['311,939.66', '1771', '1515'])
    const info = wrapper.find('.tk-sheet__info').text()
    expect(info).toContain('共 1771 条')
    // 底部只剩「共 N 条 + 表格形态」，不再有「第 x / y 页」
    expect(info).not.toContain('页')
  })

  it('closes on ESC and on a scrim click, and offers export for its own scope', async () => {
    const wrapper = mountSheet()
    await flush()

    const esc = new window.KeyboardEvent('keydown', { key: 'Escape' })
    window.dispatchEvent(esc)
    expect(wrapper.emitted('close')).toHaveLength(1)

    await wrapper.find('.tk-sheet__scrim').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(2)

    const exportButton = wrapper.findAll('button').find((button) => button.text().includes('导出这批'))
    await exportButton.trigger('click')
    expect(wrapper.emitted('export')[0][0]).toMatchObject({ packageName: 'SOD-123', processName: '固晶部' })
  })

  it('一次性加载：底部没有分页控件，只有换格子才重新请求', async () => {
    const wrapper = mountSheet()
    await flush()
    expect(state.calls).toHaveLength(1)

    // 分页控件已经删掉：没有「上一页/下一页」，也没有页大小下拉
    expect(wrapper.findAll('.tk-sheet__foot button').map((button) => button.text())).toEqual(['导出这批'])
    expect(wrapper.find('select').exists()).toBe(false)

    // 换一格才重新取数，而且仍然是一次性全量
    await wrapper.setProps({ filters: { packageName: 'PDFN5X6', processName: '焊线部' } })
    await flush()
    expect(state.calls).toHaveLength(2)
    expect(state.calls[1]).toMatchObject({ packageName: 'PDFN5X6', processName: '焊线部', all: true })
  })

  it('表头可按 生产订单 / 流程单 / 在制数量 正序倒序排：本机排全场，一条请求都不发', async () => {
    const wrapper = mountSheet()
    await flush()
    expect(state.calls).toHaveLength(1)

    const table = wrapper.findComponent(TkUTableStub)
    // 只有这三列开了排序：其余列开了也只是「看着排好了」，没有对应口径
    expect(table.props('columns').filter((column) => column.enableSorting).map((column) => column.accessorKey))
      .toEqual(['moNumber', 'billNo', 'wipQtyText'])

    // 表头只有这三个按钮，其它列头仍是纯文字
    const headerButtons = () => wrapper.findAll('.tk-sheet__table thead th button')
    expect(headerButtons().map((button) => button.text())).toEqual(['生产订单', '流程单', '在制数量'])

    const rowOrders = () => wrapper.findAll('.tk-sheet__table tbody tr').map((row) => row.text().slice(0, 11))
    // 默认顺序就是服务端给的顺序（fixture：65.82 在前，22.4 在后）
    expect(rowOrders()).toEqual(['MO260919034', 'MO260902054'])

    // 点「在制数量」第一次 = 正序：小的排前面，且不发任何请求
    await headerButtons()[2].trigger('click')
    await flush()
    expect(state.calls).toHaveLength(1)
    expect(rowOrders()).toEqual(['MO260902054', 'MO260919034'])
    expect(headerButtons()[2].classes()).toContain('is-sorted')
    expect(headerButtons()[2].find('i').attributes('name')).toBe('i-lucide-arrow-up-narrow-wide')

    // 再点一次 = 倒序（两态切换，不会切到「无序」）：大的排前面，仍然不发请求
    await headerButtons()[2].trigger('click')
    await flush()
    expect(state.calls).toHaveLength(1)
    expect(rowOrders()).toEqual(['MO260919034', 'MO260902054'])
    expect(headerButtons()[2].find('i').attributes('name')).toBe('i-lucide-arrow-down-wide-narrow')

    // 换到「生产订单」列：回到正序（MO260902054 < MO260919034），上一列的高亮让位
    await headerButtons()[0].trigger('click')
    await flush()
    expect(state.calls).toHaveLength(1)
    expect(rowOrders()).toEqual(['MO260902054', 'MO260919034'])
    expect(headerButtons()[0].classes()).toContain('is-sorted')
    expect(headerButtons()[2].classes()).not.toContain('is-sorted')

    // 加载全程只有开场那一次
    expect(state.calls).toHaveLength(1)
    // 导出仍带上同一套排序：屏幕顺序 = Excel 顺序（服务端在全量上按同一口径排）
    await wrapper.findAll('button').find((button) => button.text().includes('导出这批')).trigger('click')
    expect(wrapper.emitted('export').pop()[0]).toMatchObject({ packageName: 'SOD-123', sortBy: 'moNumber', sortDir: 'asc' })
  })

  it('does not refetch the same scope when reopened, and does not fetch while closed', async () => {
    const wrapper = mountSheet()
    await flush()
    expect(state.calls).toHaveLength(1)

    await wrapper.setProps({ open: false })
    await wrapper.setProps({ open: true })
    await flush()
    expect(state.calls).toHaveLength(1)

    const closed = mountSheet({ open: false })
    await flush()
    expect(state.calls).toHaveLength(1)
    expect(closed.find('.tk-sheet__table').exists()).toBe(false)
  })

  it('survives a failed fetch with an empty body and the sheet still closes', async () => {
    state.fail = true
    const wrapper = mountSheet()
    await flush()

    expect(wrapper.find('.tk-sheet__empty').text()).toBe('这个组合下没有在制明细')
    await wrapper.find('.tk-sheet__close').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('行数超过门槛才开行虚拟化，小列表不虚拟化（虚拟化在有高度的滚动容器里才有意义）', async () => {
    const many = Array.from({ length: 200 }, (_, index) => ({ ...DETAIL_ROWS[0], moNumber: `MO${index}` }))
    state.report = { ...REPORT, details: many }
    const wrapper = mountSheet()
    await flush()

    const table = wrapper.findComponent(TkUTableStub)
    expect(table.props('virtualize')).toBeTruthy()
    expect(table.props('virtualize').estimateSize).toBeGreaterThan(0)
    expect(wrapper.find('.tk-sheet__info').text()).toContain('虚拟滚动')

    state.report = { ...REPORT, details: DETAIL_ROWS }
    const small = mountSheet()
    await flush()
    expect(small.findComponent(TkUTableStub).props('virtualize')).toBe(false)
    expect(small.find('.tk-sheet__info').text()).toContain('全部 2 行')
  })

  it('真机接线上用的是 TkUTable（明细表不再手写 <table>）', async () => {
    const source = readFileSync(resolve(process.cwd(), 'app/components/tk_custom/WipDetailSheet.vue'), 'utf8')
    const { descriptor, errors } = parse(source, { filename: 'WipDetailSheet.vue' })
    expect(errors).toHaveLength(0)

    const collect = (node, predicate, found = []) => {
      if (!node || typeof node !== 'object') return found
      if (predicate(node)) found.push(node)
      for (const key of ['children', 'branches', 'if', 'else', 'then', 'content', 'props']) {
        const value = node[key]
        if (Array.isArray(value)) value.forEach((child) => collect(child, predicate, found))
        else if (value && typeof value === 'object') collect(value, predicate, found)
      }
      return found
    }

    const tables = collect(descriptor.template.ast, (node) => node.type === 1 && node.tag === 'TkUTable')
    expect(tables).toHaveLength(1)
    const attrName = (prop) => (prop.type === 7 ? prop.arg?.content ?? prop.name : prop.name)
    const attrs = (tables[0].props || []).map(attrName)
    expect(attrs).toContain('virtualize')
    expect(attrs).toContain('columns')
    expect(attrs).toContain('meta')

    // 列定义与插槽都还在：状态列是插槽渲染的，17 列不能少
    expect(source).toContain("const columns = [")
    expect(source).toContain('id: \'status\'')
    expect(source).toContain('#status-cell="{ row }"')
    // 手写的 <table> 已经换掉
    expect(descriptor.template.ast.children.filter((node) => node.tag === 'table')).toHaveLength(0)
  })
})
