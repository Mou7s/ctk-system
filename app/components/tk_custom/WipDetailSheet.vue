<template>
  <Teleport to="body">
    <div v-if="open" class="tk-sheet" role="dialog" aria-modal="true" :aria-label="title || '在制明细'">
      <!-- 变暗遮罩：把注意力收到这一层，点遮罩即可退回 -->
      <div class="tk-sheet__scrim" @click="emit('close')" />

      <section class="tk-sheet__panel">
        <header class="tk-sheet__head">
          <div class="tk-sheet__titles">
            <h2 class="tk-sheet__title">{{ title }}</h2>
            <p class="tk-sheet__subtitle">{{ subtitle }}</p>
          </div>
          <div class="tk-sheet__metrics">
            <span class="tk-sheet__metric">
              <span class="tk-sheet__metric-label">在制合计</span>
              <strong class="tk-sheet__metric-value">{{ formatQty(report.totalQty) }}</strong>
            </span>
            <span class="tk-sheet__metric">
              <span class="tk-sheet__metric-label">明细</span>
              <strong class="tk-sheet__metric-value">{{ report.detailsTotal ?? 0 }}</strong>
            </span>
            <span class="tk-sheet__metric">
              <span class="tk-sheet__metric-label">订单</span>
              <strong class="tk-sheet__metric-value">{{ report.orderCount ?? 0 }}</strong>
            </span>
          </div>
          <button ref="closeButton" class="tk-sheet__close" type="button" aria-label="关闭" @click="emit('close')">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
            </svg>
          </button>
        </header>

        <div class="tk-sheet__body">
          <!-- 明细用 TkUTable（Nuxt UI UTable）：行数多时开行虚拟化，DOM 里只留看得见的那些行。
               明细是一次性全部加载的（all=true，没有分页），所以 sorting 这个 v-model 只在本机排：
               TanStack 的 getSortedRowModel 拿到的就是全量行，排出来的顺序 = 全场顺序，不再重查 -->
          <TkUTable
            :key="tableKey"
            class="tk-sheet__table"
            wrapper-class="tk-sheet__wrapper"
            :data="displayRows"
            :columns="columns"
            :meta="tableMeta"
            :virtualize="virtualizeOptions"
            :interactive="false"
            :loading="loading"
            :empty="EMPTY_TEXT"
            sticky
            stock-theme
            :ui="tableUi"
            v-model:sorting="sorting"
          >
            <!-- 可排序列的表头：Nuxt UI 的写法（表头按钮 + 排序箭头），两态切换 正序 ⇄ 倒序。
                 文字在前、箭头在后：① 标题和下面的单元格文字同一起点；② inline-flex 的基线取第一个子项，
                 取文字基线才不会把表头行顶高（取图标基线会多出 2px 行高） -->
            <template #moNumber-header="{ column }">
              <button type="button" class="tk-sheet__sort" :class="{ 'is-sorted': !!column.getIsSorted() }" @click="onSortClick(column)">
                生产订单
                <UIcon :name="sortIcon(column.getIsSorted())" class="tk-sheet__sort-icon" />
              </button>
            </template>
            <template #billNo-header="{ column }">
              <button type="button" class="tk-sheet__sort" :class="{ 'is-sorted': !!column.getIsSorted() }" @click="onSortClick(column)">
                流程单
                <UIcon :name="sortIcon(column.getIsSorted())" class="tk-sheet__sort-icon" />
              </button>
            </template>
            <template #wipQtyText-header="{ column }">
              <button type="button" class="tk-sheet__sort" :class="{ 'is-sorted': !!column.getIsSorted() }" @click="onSortClick(column)">
                在制数量
                <UIcon :name="sortIcon(column.getIsSorted())" class="tk-sheet__sort-icon" />
              </button>
            </template>
            <template #status-cell="{ row }">
              <span class="tk-sheet__status" :class="`is-${row.original.statusKey}`" :title="row.original.statusHint">
                <i v-if="row.original.statusKey !== 'reported'" class="tk-sheet__dot" />{{ row.original.statusLabel }}
              </span>
            </template>
          </TkUTable>
        </div>

        <footer class="tk-sheet__foot">
          <span class="tk-sheet__info">
            共 {{ report.detailsTotal ?? 0 }} 条
            <span v-if="loading" class="tk-sheet__muted">· 加载中…</span>
            <span v-else class="tk-sheet__muted">· 表格 {{ renderedHint }}</span>
          </span>
          <div class="tk-sheet__actions">
            <UButton size="sm" color="success" variant="soft" icon="i-lucide-download" @click="emit('export', exportFilters)">导出这批</UButton>
          </div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { TkUTable } from '@ctk-system/ui'

const props = defineProps({
  open: {
    type: Boolean,
    default: false
  },
  /** 抽屉自己的筛选（页面把被点的那一格写进来），与筛选栏解耦 */
  filters: {
    type: Object,
    default: () => ({})
  },
  title: {
    type: String,
    default: '在制明细'
  },
  subtitle: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['close', 'export'])

const EMPTY_TEXT = '这个组合下没有在制明细'
// 行虚拟化的门槛：几十行的表压根不需要虚拟化，行数上千时它才救得了滚动
const VIRTUALIZE_ABOVE = 80

const loading = ref(false)
const report = ref({})
const closeButton = ref(null)

// UTable 的 v-model:sorting（TanStack 的排序状态）。明细是一次性全量加载的，
// 前端手里永远是这一格的全部行，UTable 在本机排出来的就是全场顺序——点表头不再请求。
const sorting = ref([])

// 列 id → 导出时带的排序字段（屏幕顺序 = Excel 顺序）。在制数量那列的 id 是格式化过的
// wipQtyText（带千分位），真正排序用的是原始数值 wipQty，所以这里要做一次映射。
// 加载本身不带排序：页面顺序由 UTable 在本机排（见 SORT_FNS）
const SORT_FIELD_BY_COLUMN = {
  moNumber: 'moNumber',
  billNo: 'billNo',
  wipQtyText: 'wipQty'
}

const sortQuery = computed(() => {
  const entry = (Array.isArray(sorting.value) ? sorting.value : [])
    .find((item) => item && Object.prototype.hasOwnProperty.call(SORT_FIELD_BY_COLUMN, item.id))
  if (!entry) return {}
  return { sortBy: SORT_FIELD_BY_COLUMN[entry.id], sortDir: entry.desc ? 'desc' : 'asc' }
})

// Nuxt UI 文档的两态切换：正序 ⇄ 倒序（永远显式给方向，所以不会切到「无序」让人分不清当前是哪种）
function onSortClick(column) {
  column.toggleSorting(column.getIsSorted() === 'asc')
}

// 箭头放在文字后面（见模板注释：inline-flex 的基线取第一个子项）
function sortIcon(state) {
  if (state === 'asc') return 'i-lucide-arrow-up-narrow-wide'
  if (state === 'desc') return 'i-lucide-arrow-down-wide-narrow'
  return 'i-lucide-arrow-up-down'
}

// 导出走同一套排序：屏幕上看的顺序就是 Excel 里的顺序
const exportFilters = computed(() => ({ ...props.filters, ...sortQuery.value }))

let queryVersion = 0
// 同一格重复打开不重新请求；换了格子才从头拉。
// 一次就把这一格的明细全部拉回来（all=true，不分页），所以这里没有页码：
// 排序/翻看都在本机发生，只有筛选条件（含玻封/塑封）变了才重新请求。
const scopeKey = computed(() => [
  props.filters?.packageName || '',
  props.filters?.processName || '',
  // 换工艺（玻封/塑封）也是换一套明细，不能沿用上一批
  props.filters?.packageType || '',
  props.filters?.materialKeyword || '',
  props.filters?.moNumber || '',
  props.filters?.billNo || '',
  props.filters?.onlyPositive === false ? '0' : '1'
].join('|'))

function load() {
  const currentQueryVersion = ++queryVersion
  loading.value = true
  getWipList({ ...props.filters, all: true })
    .then((res) => {
      if (currentQueryVersion !== queryVersion) return
      report.value = res.data || {}
    })
    .catch(() => {
      if (currentQueryVersion !== queryVersion) return
      report.value = { details: [] }
    })
    .finally(() => {
      if (currentQueryVersion !== queryVersion) return
      loading.value = false
    })
}

watch(() => [props.open, scopeKey.value], ([open], previous) => {
  if (!open) return
  const scopeChanged = previous?.[1] !== scopeKey.value
  if (scopeChanged || !report.value.details) {
    report.value = {}
    load()
  }
  nextTick(() => closeButton.value?.focus?.())
}, { immediate: true })

function onKeydown(event) {
  if (event.key === 'Escape' && props.open) emit('close')
}

window.addEventListener('keydown', onKeydown)
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// 本工序是否汇报，只看金蝶里这道工序有没有汇报（汇报数量>0）。
// 上道转入、本工序合格/转出都可能是转移单或上一道动作带来的，不能当成本工序汇报。
const STATUS_LABELS = {
  reported: '已汇报',
  produced: '未汇报 · 有产出无汇报单',
  received: '未汇报 · 上道已转入',
  unreported: '未汇报',
}

const STATUS_HINTS = {
  reported: '金蝶里这道工序有工序汇报（汇报数量>0）',
  produced: '这道工序没有汇报单，但已有合格/转出数量（常见于外发上锡这类靠转移单带入的工序）',
  received: '上道把料转进来了，本工序还没有任何汇报——料停在这里',
  unreported: '工序计划已下发，这道工序一点动静都没有（整单一道都没汇报时，数量按工序计划数量计在首道）',
}

function wipStatus(detail) {
  const status = String(detail?.wipStatus ?? '')
  if (status) return status
  return detail?.unreported ? 'unreported' : 'reported'
}

function formatQty(value) {
  const number = Number(value || 0)
  if (!Number.isFinite(number)) return '0'
  return number.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 3 })
}

// 数字/状态在这里一次算好：表格拿到的是「已经是字符串」的行，避免每个单元格里再跑一遍格式化
const displayRows = computed(() => (report.value.details || []).map((detail, index) => {
  const status = wipStatus(detail)
  return {
    ...detail,
    rowKey: `${detail.billNo || ''}_${detail.processNumber || ''}_${detail.moNumber || ''}_${detail.moEntrySeq || ''}_${index}`,
    statusKey: status,
    statusLabel: STATUS_LABELS[status],
    statusHint: STATUS_HINTS[status],
    operQtyText: formatQty(detail.operQty),
    wipQtyText: formatQty(detail.wipQty),
    reportQtyText: formatQty(detail.reportQty),
    qualifiedQtyText: formatQty(detail.qualifiedQty),
    transInQtyText: formatQty(detail.transInQty),
    transOutQtyText: formatQty(detail.transOutQty),
    nextReceivedQtyText: formatQty(detail.nextReceivedQty)
  }
}))

// 排序口径必须和服务端（server/utils/wip.ts 的 compareText / wipQty 比较）逐字一致：
// 屏幕顺序是本机排的，而「导出这批」的 Excel 顺序是服务端排的，两边算法不一致
// 就会出现「看着是这个顺序，导出来是另一个顺序」。
//   · 文本走码位比较（不用 localeCompare：大小写会让 'a' 和 'B' 的次序跟后端不一致）；
//   · 在制数量走原始数值 wipQty —— wipQtyText 是格式化后的字符串（带千分位），
//     拿它比会把 1,440 排到 90 前面。
function compareText(left, right) {
  const a = String(left ?? '')
  const b = String(right ?? '')
  return a < b ? -1 : a > b ? 1 : 0
}

function numberValue(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

const SORT_FNS = {
  text: (left, right, columnId) => compareText(left.getValue(columnId), right.getValue(columnId)),
  wipQty: (left, right) => numberValue(left.original?.wipQty) - numberValue(right.original?.wipQty)
}

function column(accessorKey, label, options = {}) {
  const classes = [
    options.align === 'right' ? 'is-right' : '',
    options.align === 'center' ? 'is-center' : '',
    options.mono ? 'is-code' : '',
    options.strong ? 'is-strong' : ''
  ].filter(Boolean).join(' ')
  return {
    accessorKey,
    header: label,
    // 只有明确给了 sortable 的列才开：其余列没有服务端排序口径，
    // 开了也只是「本页看着排好了」，翻一页又乱回去
    enableSorting: Boolean(options.sortingFn),
    // 单列排序：多列排序服务端不认，开成两列会各排各的
    enableMultiSort: false,
    ...(options.sortingFn ? { sortingFn: options.sortingFn } : {}),
    size: options.size || 118,
    meta: classes ? { class: { td: classes, th: classes } } : undefined
  }
}

const columns = [
  column('moNumber', '生产订单', { size: 150, sortingFn: SORT_FNS.text }),
  column('moEntrySeq', '行号', { align: 'center', size: 70 }),
  column('billNo', '流程单', { size: 140, sortingFn: SORT_FNS.text }),
  column('processNumber', '工序号', { align: 'center', size: 80 }),
  column('processName', '工序', { size: 120 }),
  column('materialNumber', '物料编码', { mono: true, size: 130 }),
  column('materialName', '物料名称', { size: 150 }),
  column('operQtyText', '工序数量', { align: 'right', size: 110 }),
  column('wipQtyText', '在制数量', { align: 'right', strong: true, size: 110, sortingFn: SORT_FNS.wipQty }),
  column('reportQtyText', '汇报数量', { align: 'right', size: 110 }),
  column('qualifiedQtyText', '本工序合格', { align: 'right', size: 120 }),
  column('transInQtyText', '上道转入', { align: 'right', size: 110 }),
  column('transOutQtyText', '本工序转出', { align: 'right', size: 120 }),
  column('nextReceivedQtyText', '下道已接收', { align: 'right', size: 120 }),
  column('routeName', '工艺路线', { size: 150 }),
  column('departmentName', '加工车间', { size: 150 }),
  {
    id: 'status',
    accessorKey: 'statusLabel',
    header: '状态',
    enableSorting: false,
    size: 170,
    meta: { class: { td: 'tk-sheet__status-cell', th: 'tk-sheet__status-cell is-center' } }
  }
]

// 未汇报的行整体泛黄：扫一眼就知道这张单哪些工序没人汇报
const tableMeta = {
  class: {
    tr: (row) => (row?.original?.statusKey && row.original.statusKey !== 'reported' ? 'is-unreported' : '')
  }
}

// 行虚拟化：只渲染视口内的行（+ 上下 overscan），几百行的 DOM 从「几千个格子」降到「几十个」
// estimateSize 是首帧估算：官方主题下实测行高 52.5~55.5（带未汇报圆点的行高 3px），取众数 55，
// 渲染后虚拟器会按真实高度校正，估大估小只影响滚动条初值
const virtualizeOptions = computed(() => (displayRows.value.length > VIRTUALIZE_ABOVE ? { estimateSize: 55, overscan: 12 } : false))

const renderedHint = computed(() => (virtualizeOptions.value ? '虚拟滚动' : `全部 ${displayRows.value.length} 行`))

// UTable 的行虚拟化是「setup 时读一次」的：抽屉是先挂载再取数，首帧 virtualize=false，
// 之后就算换成对象也不会再建虚拟器。所以等数据到齐、开关定型后用 key 重建一次表格。
const tableKey = computed(() => (virtualizeOptions.value ? 'virtual' : 'plain'))

// 明细表走 Nuxt UI 官方主题（TkUTable 的 stock-theme 已跳过项目默认）：
// 字号、内边距、行分隔线、毛玻璃 sticky 表头全部来自官方 theme，这里只留本页特有的布局类——
// 列宽与横向滚动（tk-sheet__grid）、空态文案（tk-sheet__empty）。业务语义样式
// （未汇报底色、在制数量加粗、单号等宽、状态吸右）仍在下面的 scoped CSS 里，不属于主题。
const tableUi = {
  base: 'tk-sheet__grid',
  empty: 'tk-sheet__empty'
}
</script>

<style scoped>
.tk-sheet {
  --sheet-spring: linear(0, 0.0434 3.7%, 0.1402 7.4%, 0.2627 11.1%, 0.3922 14.8%, 0.5165 18.5%, 0.6285 22.2%, 0.7247 25.9%, 0.8041 29.6%, 0.8673 33.3%, 0.9159 37%, 0.9519 40.7%, 0.9774 44.4%, 0.9947 48.1%, 1.0055 51.9%, 1.0115 55.6%, 1.0143 59.3%, 1.015 63%, 1.0143 66.7%, 1.0128 70.4%, 1.0109 74.1%, 1.009 77.8%, 1.0071 81.5%, 1.0054 85.2%, 1.004 88.9%, 1.0028 92.6%, 1.0019 96.3%, 1.0012 100%);
  --sheet-hairline: color-mix(in srgb, var(--app-text) 8%, transparent);

  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  justify-content: flex-end;
}

/* 遮罩不写 backdrop-filter：一个铺满屏幕的模糊层在滚动时每次都要重新采样，
   而这个遮罩本来就只有 42% 的不透明度，模糊在屏幕上看不出来，只值一顿 GPU */
.tk-sheet__scrim {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, #0b1220 46%, transparent);
  animation: sheetScrim 260ms ease both;
}

/* 从右侧滑入、也从右侧退出（来去同一条路径）。
   面板底色够实（96%），背后那点模糊看不见——但一个大面积的 backdrop-filter 会让
   里面滚动的表格每帧都要重新模糊一次，这正是「明细滚动发涩」的元凶，所以不写了 */
.tk-sheet__panel {
  position: relative;
  display: flex;
  flex-direction: column;
  /* 17 列的明细表，抽屉开宽一点可以少横向滚动（与生产质量看板的抽屉同宽） */
  width: min(1280px, 94vw);
  height: 100%;
  background: color-mix(in srgb, var(--app-surface) 96%, transparent);
  /* 左侧一条「光打到材质边缘」的高光 + 大范围软阴影：浅色深色都能看出这是一层浮起来的面 */
  box-shadow:
    0 0 0 1px var(--sheet-hairline),
    inset 1px 0 0 color-mix(in srgb, #ffffff 55%, transparent),
    -24px 0 48px -24px var(--app-shadow);
  animation: sheetIn 400ms var(--sheet-spring) both;
}

html.dark .tk-sheet__panel {
  box-shadow:
    0 0 0 1px var(--sheet-hairline),
    inset 1px 0 0 color-mix(in srgb, #ffffff 14%, transparent),
    -24px 0 48px -24px var(--app-shadow);
}

.tk-sheet__head {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--sheet-hairline);
}

.tk-sheet__titles {
  min-width: 0;
  flex: 1;
}

.tk-sheet__title {
  margin: 0;
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--app-text);
}

.tk-sheet__subtitle {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--app-page-text-muted);
}

.tk-sheet__metrics {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-shrink: 0;
}

.tk-sheet__metric {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.tk-sheet__metric-label {
  font-size: 10.5px;
  color: var(--app-page-text-muted);
}

.tk-sheet__metric-value {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--app-text);
  font-variant-numeric: tabular-nums;
}

.tk-sheet__close {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-text) 6%, transparent);
  color: var(--app-text-secondary);
  cursor: pointer;
  transition: background-color 160ms ease, transform 120ms ease;
}

.tk-sheet__close:hover {
  background: color-mix(in srgb, var(--app-text) 12%, transparent);
}

.tk-sheet__close:active {
  transform: scale(0.94);
}

/* 滚动交给 TkUTable 自己的容器（虚拟滚动要的就是这个容器的高度） */
.tk-sheet__body {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.tk-sheet__table {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--app-text);
}

:deep(.tk-sheet__wrapper) {
  height: 100%;
  max-height: 100%;
  overflow: auto;
  overscroll-behavior: contain;
  background: transparent;
}

:deep(.tk-sheet__grid) {
  min-width: 100%;
  width: max-content;
}

/* 表头样式交给官方主题：sticky + bg-default/75 backdrop-blur 由 sticky 属性给，
   字号/字重/颜色/内边距来自 th 的官方类。这里只补本页两件主题不管的事：
   标题不换行、表格没有居中语义时默认左对齐 */
:deep(.tk-sheet__grid th) {
  text-align: left;
  white-space: nowrap;
}

/* 单元格同样只留主题不管的：不换行 + 数字等宽（右对齐列的数字不会行行抖）。
   分隔线用官方 tbody 的 divide-y，底色透明（未汇报底色才透得出来） */
:deep(.tk-sheet__grid td) {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

:deep(.tk-sheet__grid th.is-right),
:deep(.tk-sheet__grid td.is-right) {
  text-align: right;
}

:deep(.tk-sheet__grid th.is-center),
:deep(.tk-sheet__grid td.is-center) {
  text-align: center;
}

:deep(.tk-sheet__grid td.is-strong) {
  font-weight: 700;
  color: var(--wip-accent-strong, var(--app-link-color));
}

:deep(.tk-sheet__grid td.is-code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--app-text-secondary);
}

:deep(.tk-sheet__grid tr.is-unreported td) {
  background: color-mix(in srgb, #f59e0b 10%, var(--app-surface));
}

/* 状态吸右：横向滚动时不会被推到屏幕外。
   底色用不透明的，所以同样不需要 backdrop-filter */
:deep(.tk-sheet__grid th.tk-sheet__status-cell),
:deep(.tk-sheet__grid td.tk-sheet__status-cell) {
  position: sticky;
  right: 0;
  z-index: 1;
  padding-right: 16px;
  background: color-mix(in srgb, var(--app-surface) 97%, transparent);
  box-shadow: inset 1px 0 0 var(--sheet-hairline), -8px 0 10px -8px color-mix(in srgb, var(--app-text) 22%, transparent);
}

:deep(.tk-sheet__grid th.tk-sheet__status-cell) {
  z-index: 3;
}

:deep(.tk-sheet__grid tr.is-unreported td.tk-sheet__status-cell) {
  background: color-mix(in srgb, #f59e0b 10%, var(--app-surface));
}

/* 可排序列的表头按钮：文字逐项继承 th 的排版（官方 text-sm semibold + 同一行高），不引入自己的字号。
   横向用负外边距抵消官方 th 的 px-4，宽度撑满整格 → 文字和下面单元格（p-4 的 16px）同一起点，
   热区也铺满整个表头格；纵向不留 padding，按钮高度正好等于行高——行盒不会被撑大。
   上下的热区与 hover 底色交给 ::before（抵消 py-3.5=14px）：它不参与行高计算，只负责「点得中、有反馈」 */
.tk-sheet__sort {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
  box-sizing: border-box;
  width: calc(100% + 32px);
  margin: 0 -16px;
  padding: 0 16px;
  border: 0;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: inherit;
  font-weight: inherit;
  line-height: inherit;
  letter-spacing: inherit;
  white-space: nowrap;
  cursor: pointer;
  transition: color 140ms ease;
}

.tk-sheet__sort::before {
  content: "";
  position: absolute;
  inset: -14px 0;
  z-index: -1;
  border-radius: 6px;
  background: transparent;
  transition: background-color 140ms ease;
}

.tk-sheet__sort:hover {
  color: var(--app-text);
}

.tk-sheet__sort:hover::before {
  background: color-mix(in srgb, var(--app-text) 8%, transparent);
}

.tk-sheet__sort:focus-visible {
  outline: 2px solid var(--app-link-color);
  outline-offset: 2px;
}

/* 正在按这列排：标题和箭头一起亮起来，一眼看出当前是哪列、哪个方向 */
.tk-sheet__sort.is-sorted {
  color: var(--wip-accent-strong, var(--app-link-color));
}

.tk-sheet__sort-icon {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  opacity: 0.45;
  transition: opacity 140ms ease;
}

.tk-sheet__sort.is-sorted .tk-sheet__sort-icon {
  opacity: 1;
}

.tk-sheet__status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.tk-sheet__status.is-reported {
  color: var(--app-page-text-muted);
}

.tk-sheet__status.is-produced,
.tk-sheet__status.is-received,
.tk-sheet__status.is-unreported {
  font-weight: 600;
  color: #a15c07;
}

html.dark .tk-sheet__status.is-produced,
html.dark .tk-sheet__status.is-received,
html.dark .tk-sheet__status.is-unreported {
  color: #fcd34d;
}

.tk-sheet__dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #f59e0b;
}

.tk-sheet__muted {
  color: var(--app-page-text-muted);
}

.tk-sheet__empty {
  padding: 48px !important;
  text-align: center;
  color: var(--app-page-text-muted);
}

.tk-sheet__foot {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 20px;
  border-top: 1px solid var(--sheet-hairline);
  font-size: 12px;
  color: var(--app-text-secondary);
  background: color-mix(in srgb, var(--app-surface) 92%, transparent);
}

.tk-sheet__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

@keyframes sheetIn {
  from {
    opacity: 0;
    transform: translateX(24px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes sheetScrim {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tk-sheet__panel,
  .tk-sheet__scrim {
    animation: none;
  }

  .tk-sheet__close:active {
    transform: none;
  }
}

@media (prefers-reduced-transparency: reduce) {
  .tk-sheet__panel,
  .tk-sheet__foot {
    background: var(--app-surface);
  }
}
</style>
