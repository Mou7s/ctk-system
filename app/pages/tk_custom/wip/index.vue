<template>
  <div class="wip-page">
    <!-- 头部：一句话说清这一屏是什么 + 一个搜索框。没有说明段落、没有筛选工具条 -->
    <header class="wip-head">
      <div class="wip-head__lead">
        <h1 class="wip-title">车间半成品在制</h1>
        <p class="wip-summary">
          <span class="wip-summary__value">{{ formatQty(report.totalQty) }}</span>
          <span class="wip-summary__unit">总在制</span>
          <span class="wip-summary__meta">
            {{ report.packageCount || 0 }} 封装 · {{ report.processCount || 0 }} 工序 · {{ report.orderCount || 0 }} 订单 · {{ report.detailsTotal ?? 0 }} 明细
            <template v-if="report.unreportedBillCount">· 未汇报流程单 {{ report.unreportedBillCount }}</template>
          </span>
        </p>
      </div>

      <div class="wip-tools">
        <!-- 封装工艺：玻封 / 塑封是两条线，默认只看塑封（占绝大多数），点一下切到玻封。
             服务端过滤：筛了哪条线，矩阵的工序列头就只剩那条线的工序，不再和另一条线合并排序 -->
        <TkSegmented
          class="wip-type-switch"
          :model-value="queryParams.packageType"
          :items="PACKAGE_TYPE_OPTIONS"
          label="封装工艺"
          @update:model-value="handlePackageType"
        />
        <div class="wip-search" :class="{ 'is-filled': hasKeyword }">
          <UIcon name="i-lucide-search" class="wip-search__icon" />
          <input
            v-model="queryParams.keyword"
            class="wip-search__input"
            type="search"
            placeholder="搜索订单 / 流程单 / 物料"
            aria-label="搜索订单、流程单或物料"
            @keyup.enter="fetchReport"
          >
          <button v-if="hasKeyword" class="wip-search__clear" type="button" aria-label="清除搜索" @click="clearKeyword">
            <UIcon name="i-lucide-x" />
          </button>
        </div>
        <button
          class="wip-icon-button"
          :class="{ 'is-busy': loading }"
          type="button"
          aria-label="重新取数"
          title="重新取数"
          @click="fetchReport"
        >
          <UIcon name="i-lucide-refresh-cw" />
        </button>
        <button
          class="wip-icon-button"
          type="button"
          :disabled="!canExport"
          :aria-label="canExport ? '按当前搜索导出明细' : '先搜索再导出'"
          :title="canExport ? '按当前搜索导出明细' : '导出前先搜索一个订单 / 流程单或物料'"
          @click="handleExport"
        >
          <UIcon name="i-lucide-download" />
        </button>
      </div>
    </header>

    <main class="wip-canvas" :class="{ 'is-refreshing': loading && queried }">
      <!-- 首屏（还没数据）给骨架，而不是空白等几秒 -->
      <WipMatrixSkeleton v-if="!queried" :loading="loading" />
      <WipPackageMatrix
        v-else
        :matrix="matrixData"
        :transposed="transposed"
        @set-transposed="transposed = $event"
        @drill-cell="openCellDetail"
        @drill-axis="openAxisDetail"
      />
    </main>

    <WipDetailSheet
      :open="detailOpen"
      :filters="detailFilters"
      :title="detailTitle"
      :subtitle="detailSubtitle"
      @close="detailOpen = false"
      @export="handleDetailExport"
    />
  </div>
</template>

<script setup name="Wip">
import TkSegmented from '@/packages/ui/TkSegmented.vue'
import WipPackageMatrix from '@/components/tk_custom/WipPackageMatrix.vue'
import WipDetailSheet from '@/components/tk_custom/WipDetailSheet.vue'
import WipMatrixSkeleton from '@/components/tk_custom/WipMatrixSkeleton.vue'

const { proxy } = getCurrentInstance()
const toast = useToast()

function nuxtMsg(message, color = 'neutral') {
  toast.add({ title: String(message), color, duration: 4000 })
}

const loading = ref(false)
const report = ref({})
const queried = ref(false)
const transposed = ref(false)

// 页面只有一个搜索框：订单 / 流程单 / 物料 都能搜。
// 按封装、按工序收窄不用输入框——点矩阵的行头、列头、格子就行。
const queryParams = ref({
  keyword: '',
  // 玻封 / 塑封两条线分开看；默认塑封（玻封只占极少一部分，要看的概率低）
  packageType: '塑封',
  onlyPositive: true
})

// 只有两个选项：没有「全部」。两条线的工序各不相同，混在一张矩阵里列头会互相串
const PACKAGE_TYPE_OPTIONS = [
  { value: '塑封', label: '塑封' },
  { value: '玻封', label: '玻封' }
]

// 切工艺就是换一套数据（行轴封装、列轴工序、合计、导出全跟着走），所以直接重新取数
function handlePackageType(value) {
  const next = PACKAGE_TYPE_OPTIONS.some((item) => item.value === value) ? value : queryParams.value.packageType
  if (next === queryParams.value.packageType) return
  queryParams.value.packageType = next
  fetchReport()
}

const hasKeyword = computed(() => String(queryParams.value.keyword || '').trim().length > 0)
const canExport = computed(() => hasKeyword.value)

// 明细抽屉：只在下钻时打开，不再是「切换视图」
const detailOpen = ref(false)
const detailScope = ref({ packageName: '', processName: '' })

let queryVersion = 0

const matrixData = computed(() => report.value.matrix || {
  packages: [],
  processes: [],
  cells: [],
  totalQty: 0,
  maxCellQty: 0,
  cellCount: 0
})

// 抽屉的筛选 = 当前搜索 + 被点的那一格。
// onlyPositive 关掉：格子的合计含负值行，明细就得让点开的人看见那些行；
// hideZeroWip 打开：在制恰好为 0 的行（料已经走完、不在这个工序上了）不进清单，
// 否则「已汇报完、料已转走」的历史行会把真正的在制品淹掉。
const detailFilters = computed(() => ({
  keyword: queryParams.value.keyword,
  packageType: queryParams.value.packageType,
  onlyPositive: false,
  hideZeroWip: true,
  packageName: detailScope.value.packageName,
  processName: detailScope.value.processName
}))

const detailTitle = computed(() => {
  const { packageName, processName, packageType } = detailFilters.value
  if (packageName && processName) return `${packageName} × ${processName}`
  if (packageName || processName) return packageName || processName
  return packageType ? `${packageType}在制明细` : '全部在制明细'
})

const detailSubtitle = computed(() => {
  const { packageName, processName } = detailFilters.value
  return packageName && processName ? '该封装停在这道工序的在制品' : '当前筛选下的在制明细'
})

function openCellDetail(payload) {
  detailScope.value = { packageName: payload?.packageName || '', processName: payload?.processName || '' }
  detailOpen.value = true
}

function openAxisDetail(payload) {
  const axis = payload?.axis
  const name = payload?.name || ''
  if (axis !== 'package' && axis !== 'process') return
  detailScope.value = axis === 'package'
    ? { packageName: name, processName: '' }
    : { packageName: '', processName: name }
  detailOpen.value = true
}

function clearKeyword() {
  queryParams.value.keyword = ''
  fetchReport()
}

// 打开页面就出一版数：不填搜索=全厂口径（实测 5s / 16.2 万行工序计划）
function fetchReport() {
  const currentQueryVersion = ++queryVersion
  loading.value = true
  getWipList({ ...queryParams.value })
    .then((res) => {
      if (currentQueryVersion !== queryVersion) return
      report.value = res.data || {}
      queried.value = true
    })
    .catch((error) => {
      if (currentQueryVersion !== queryVersion) return
      nuxtMsg(error?.message || '查询车间半成品在制失败', 'error')
    })
    .finally(() => {
      if (currentQueryVersion !== queryVersion) return
      loading.value = false
    })
}

function handleExport() {
  if (!canExport.value) {
    nuxtMsg('导出前先搜索一个订单 / 流程单或物料（全量明细有几万行，Excel 打开会很难受）', 'warning')
    return
  }
  proxy.download('tk_custom/wip/export', queryParams.value, `车间半成品在制明细_${Date.now()}.xlsx`)
}

// 抽屉里的导出针对抽屉的范围
function handleDetailExport(filters) {
  proxy.download('tk_custom/wip/export', filters, `车间半成品在制明细_${Date.now()}.xlsx`)
}

function formatQty(value) {
  const number = Number(value || 0)
  return number.toLocaleString('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  })
}

onMounted(fetchReport)
</script>

<style scoped>
.wip-page {
  --wip-accent: #2563eb;
  --wip-accent-strong: #1d4ed8;
  --spring-soft: linear(0, 0.0459 3.7%, 0.1432 7.4%, 0.2603 11.1%, 0.3791 14.8%, 0.4898 18.5%, 0.5877 22.2%, 0.6709 25.9%, 0.7392 29.6%, 0.7951 33.3%, 0.8403 37%, 0.8763 40.7%, 0.9048 44.4%, 0.9272 48.1%, 0.9444 51.9%, 0.9575 55.6%, 0.9677 59.3%, 0.9755 63%, 0.9816 66.7%, 0.9861 70.4%, 0.9896 74.1%, 0.9922 77.8%, 0.9941 81.5%, 0.9956 85.2%, 0.9967 88.9%, 0.9976 92.6%, 0.9982 96.3%, 0.9987 100%);

  height: calc(100vh - 84px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
  padding: 14px 16px 16px;
  gap: 12px;
  background: var(--app-bg);
  color: var(--app-text);
}

html.dark .wip-page {
  --wip-accent: #60a5fa;
  --wip-accent-strong: #93c5fd;
}

/* ── 头部 ─────────────────────────────────────────────── */
.wip-head {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  animation: headIn 380ms var(--spring-soft) both;
}

.wip-head__lead {
  min-width: 0;
}

/* 排版随字号变化：大标题收紧字距、压紧行高（苹果那套 optical sizing 的 Web 近似） */
.wip-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.022em;
  color: var(--app-text);
}

.wip-summary {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  margin: 8px 0 0;
  font-size: 12.5px;
  line-height: 1.4;
  color: var(--app-page-text-muted);
}

.wip-summary__value {
  font-size: 26px;
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.02em;
  color: var(--wip-accent-strong);
  font-variant-numeric: tabular-nums;
}

.wip-summary__unit {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--app-text-secondary);
  margin-right: 2px;
}

/* 数字一组、统计一组：靠间距分组，不靠分隔符 */
.wip-summary__meta {
  margin-left: 12px;
}

/* ── 工具：一个搜索框 + 两个图标按钮 ────────────────── */
.wip-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* 工艺切换（塑封 / 玻封）：分段控件有自己的宽度，别被 flex 压扁 */
.wip-type-switch {
  flex-shrink: 0;
}

.wip-search {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  width: 280px;
  padding: 0 10px;
  border-radius: 999px;
  /* 安静的填充式搜索框（不是带边框的白盒子）：焦点时才浮出描边 */
  background: color-mix(in srgb, var(--app-text) 6%, transparent);
  box-shadow: inset 0 0 0 1px transparent;
  transition: background-color 160ms ease, box-shadow 160ms ease, width 220ms var(--spring-soft);
}

.wip-search:focus-within {
  background: var(--app-surface);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--wip-accent) 55%, transparent), 0 4px 14px -10px var(--app-shadow);
}

.wip-search.is-filled {
  background: color-mix(in srgb, var(--wip-accent) 10%, var(--app-surface));
}

.wip-search__icon {
  flex-shrink: 0;
  color: var(--app-page-text-muted);
  font-size: 15px;
}

.wip-search__input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  font: inherit;
  font-size: 13px;
  color: var(--app-text);
}

.wip-search__input::placeholder {
  color: color-mix(in srgb, var(--app-text) 45%, transparent);
}

/* 去掉 search 类型自带的清除叉，用我们自己的（颜色跟主题走） */
.wip-search__input::-webkit-search-cancel-button {
  appearance: none;
}

.wip-search__clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-text) 12%, transparent);
  color: var(--app-text-secondary);
  cursor: pointer;
  transition: background-color 140ms ease, transform 120ms ease;
}

.wip-search__clear:hover {
  background: color-mix(in srgb, var(--app-text) 20%, transparent);
}

.wip-search__clear:active {
  transform: scale(0.9);
}

.wip-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-text) 6%, transparent);
  color: var(--app-text-secondary);
  cursor: pointer;
  font-size: 15px;
  transition: background-color 160ms ease, color 160ms ease, transform 120ms ease;
}

.wip-icon-button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--app-text) 12%, transparent);
  color: var(--app-text);
}

/* 按下即反馈，不等 click */
.wip-icon-button:active:not(:disabled) {
  transform: scale(0.94);
}

.wip-icon-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.wip-icon-button.is-busy {
  color: var(--wip-accent);
}

.wip-icon-button.is-busy :deep(svg) {
  animation: spin 900ms linear infinite;
}

/* ── 画布：矩阵占满剩余高度 ─────────────────────────── */
.wip-canvas {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  transition: opacity 200ms ease;
}

/* 重新取数时把旧数据压暗一档，而不是塞一条进度条把布局顶下去 */
.wip-canvas.is-refreshing {
  opacity: 0.55;
}

@keyframes headIn {
  from {
    opacity: 0;
    transform: translateY(-3px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 768px) {
  .wip-page {
    height: auto;
    min-height: calc(100vh - 84px);
    overflow: auto;
    padding: 12px;
  }

  .wip-head {
    flex-direction: column;
    align-items: stretch;
  }

  .wip-tools {
    justify-content: flex-end;
  }

  .wip-search {
    width: 100%;
  }

  .wip-canvas {
    min-height: 420px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .wip-head,
  .wip-icon-button.is-busy :deep(svg) {
    animation: none;
  }

  .wip-search,
  .wip-icon-button,
  .wip-search__clear {
    transition: background-color 120ms linear, box-shadow 120ms linear, color 120ms linear;
  }

  .wip-icon-button:active:not(:disabled),
  .wip-search__clear:active {
    transform: none;
  }
}

@media (prefers-contrast: more) {
  .wip-search {
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--app-text) 40%, transparent);
  }
}
</style>
