<template>
  <div class="absolute inset-0 overflow-y-auto bg-app-bg p-3 text-app-text sm:p-4 md:p-6">
    <div class="mx-auto flex max-w-[1800px] flex-col gap-4">
      <header class="relative overflow-hidden rounded-2xl border border-app-border bg-app-surface px-4 py-3 shadow-sm sm:px-5 sm:py-4">
        <div class="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-blue-500 via-emerald-500 to-violet-500" />
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div class="min-w-0">
            <div class="mb-1 flex flex-wrap items-center gap-2">
              <UBadge color="success" variant="soft">质量指标总览</UBadge>
              <UBadge color="neutral" variant="soft">K3Cloud 实时数据</UBadge>
              <span class="text-xs text-app-muted">{{ statusLabel }}</span>
            </div>
            <h2 class="text-xl font-bold sm:text-2xl">生产质量看板</h2>
          </div>
          <div class="flex items-center justify-between gap-3 sm:shrink-0 sm:justify-end">
            <div class="hidden text-right text-xs text-app-muted sm:block">
              <div>最后更新</div>
              <div class="mt-0.5 font-mono text-app-text">{{ formattedLastUpdated }}</div>
            </div>
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-refresh-cw"
              :loading="loading"
              @click="fetchData"
            >
              刷新数据
            </UButton>
          </div>
        </div>
      </header>

      <section class="rounded-2xl border border-app-border bg-app-surface p-4 shadow-sm">
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(280px,1fr)_10rem_auto_auto]">
          <div class="min-w-0 text-xs font-medium text-app-muted">
            <span class="mb-1.5 block">汇报日期</span>
            <TkDateRangePicker v-model="dateRange" class="w-full" />
          </div>
          <div class="min-w-0 text-xs font-medium text-app-muted">
            <span class="mb-1.5 block">工序达标阈值 (%)</span>
            <UInput
              v-model="thresholdDraft"
              type="number"
              min="0"
              max="100"
              step="0.1"
              inputmode="decimal"
              class="w-full"
              @keyup.enter="fetchData"
            />
            <span class="mt-1 block text-[11px] font-normal text-app-muted">点击查询后生效</span>
          </div>
          <div class="flex min-w-0 items-center gap-2 sm:col-span-2 xl:col-span-1">
            <span class="hidden shrink-0 text-xs font-medium text-app-muted sm:inline">快捷</span>
            <div class="grid min-w-0 flex-1 grid-cols-4 rounded-lg border border-app-border bg-app-bg p-1">
              <button
                v-for="item in quickRanges"
                :key="item.value"
                type="button"
                class="min-w-0 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors sm:px-3"
                :class="activeRange === item.value
                  ? 'bg-primary-500 text-white shadow-sm'
                  : 'text-app-muted hover:bg-app-surface hover:text-app-text'"
                @click="setDateRange(item.value)"
              >
                {{ item.label }}
              </button>
            </div>
          </div>
          <div class="flex items-center justify-end gap-2 sm:col-span-2 xl:col-span-1">
            <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-rotate-ccw" @click="resetFilters">
              重置
            </UButton>
            <UButton size="sm" icon="i-lucide-search" :loading="loading" class="min-w-24 justify-center" @click="fetchData">
              查询
            </UButton>
          </div>
        </div>
      </section>

      <div v-if="errorMessage" class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-circle-alert" class="size-5 shrink-0" />
          <div>
            <div class="font-semibold">看板数据加载失败</div>
            <div class="mt-0.5 text-xs opacity-80">{{ errorMessage }}</div>
          </div>
        </div>
        <UButton size="xs" color="error" variant="soft" @click="fetchData">重试</UButton>
      </div>

      <section class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <article
          v-for="card in summaryCards"
          :key="card.key"
          class="rounded-2xl border border-app-border bg-app-surface p-4 shadow-sm"
        >
          <div class="flex items-center justify-between gap-2 text-sm text-app-muted">
            <span>{{ card.label }}</span>
            <span class="rounded-full px-2 py-0.5 text-[11px]" :class="metricBadgeClass(card)">
              {{ card.targetLabel }}
            </span>
          </div>
          <div class="mt-2 flex items-end gap-2">
            <span class="font-mono text-2xl font-bold" :class="rateTextClass(card.rate, card)">
              {{ formatRate(card.rate) }}
            </span>
            <span v-if="isAnomaly(card.rate)" class="mb-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
              超过 100%
            </span>
          </div>
          <p class="mt-1 text-xs text-app-muted">{{ card.formula }}</p>
          <p class="mt-3 font-mono text-xs text-app-muted">
            {{ card.hasData ? formatNumber(card.qualifiedQty) : '—' }}
            <span class="px-1">/</span>
            {{ card.hasData ? formatNumber(card.inputQty) : '—' }}
            <span class="ml-1">{{ card.qualifiedLabel }} / {{ card.inputLabel }}</span>
          </p>
        </article>

        <article class="rounded-2xl border border-app-border bg-app-surface p-4 shadow-sm md:col-span-2 xl:col-span-1">
          <div class="flex items-center justify-between text-sm text-app-muted">
            <span>统计范围</span>
            <UIcon name="i-lucide-package" class="size-5 text-cyan-500" />
          </div>
          <div class="mt-2 font-mono text-2xl font-bold text-cyan-600 dark:text-cyan-400">
            {{ formatNumber(summary.packageCount) }}
          </div>
          <p class="mt-1 text-xs text-app-muted">封装规格数</p>
          <p class="mt-3 text-xs text-app-muted">
            入库计划 {{ formatNumber(summary.packagingPlanCount) }} · 测试计划 {{ formatNumber(summary.testingPlanCount) }}
          </p>
        </article>
      </section>

      <section class="overflow-hidden rounded-2xl border border-app-border bg-app-surface shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-app-border px-4 py-3">
          <div>
            <h3 class="font-semibold">指标分析</h3>
            <p class="mt-1 text-xs text-app-muted">选择指标查看封装对比和明细，按当前指标从低到高排列</p>
          </div>
          <div class="grid grid-cols-2 gap-1 rounded-lg border border-app-border bg-app-bg p-1 sm:flex" role="tablist" aria-label="质量指标">
            <button
              v-for="metric in PROCESS_YIELD_METRICS"
              :key="metric.key"
              type="button"
              role="tab"
              :aria-selected="activeMetricKey === metric.key"
              class="min-w-0 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors sm:px-4"
              :class="activeMetricKey === metric.key
                ? 'bg-primary-500 text-white shadow-sm'
                : 'text-app-muted hover:bg-app-surface hover:text-app-text'"
              @click="selectMetric(metric.key)"
            >
              {{ metric.label }}
            </button>
          </div>
        </div>

        <div class="p-4">
          <div class="rounded-xl border border-app-border bg-app-bg/40 p-4">
            <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 class="font-semibold">{{ activeMetric.label }}对比</h4>
                <p class="mt-1 text-xs text-app-muted">{{ activeMetric.description }}</p>
                <p class="mt-1 text-xs text-app-muted">
                  <template v-if="activeMetric.key === 'process'">
                    按入库汇报计划和当前达标阈值 {{ formatThreshold(appliedThreshold) }}% 统计
                  </template>
                  <template v-else>{{ activeMetric.scopeNote }}</template>
                </p>
                <p class="mt-1 text-xs text-primary-600 dark:text-primary-400">双击任意封装规格条形，查看参与当前指标统计的工序计划号</p>
              </div>
              <UBadge :color="activeMetric.mode === 'plans' ? 'primary' : 'success'" variant="soft">
                {{ activeMetric.targetLabel }}
              </UBadge>
            </div>
            <div class="relative min-h-[360px]">
              <VChart
                v-if="chartRows.length"
                :option="chartOption"
                class="w-full cursor-pointer"
                :style="{ height: `${chartHeight}px` }"
                autoresize
                @dblclick="handleChartDoubleClick"
              />
              <div v-else class="absolute inset-0 flex items-center justify-center text-sm text-app-muted">
                当前日期范围内暂无{{ activeMetric.label }}数据
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <USlideover
      v-model:open="planDrawerOpen"
      side="right"
      :ui="{ content: '!w-[80vw] !max-w-[1280px] max-sm:!w-full rounded-l-2xl rounded-r-none' }"
    >
      <template #content>
        <div class="flex h-full min-h-0 flex-col bg-app-surface">
          <header class="flex shrink-0 items-start justify-between gap-4 border-b border-app-border px-5 py-4">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <UBadge color="primary" variant="soft">{{ planDetailMetric.label }}计划明细</UBadge>
                <UBadge v-if="planDetailPackage" color="neutral" variant="soft">{{ planDetailPackage }}</UBadge>
              </div>
              <h3 class="mt-2 text-lg font-bold">{{ planDetailPackage || '全部封装规格' }}</h3>
              <p class="mt-1 text-xs text-app-muted">
                共 {{ planDetailAllRows.length }} 个参与“{{ planDetailMetric.label }}”统计的工序计划
                <template v-if="planDetailPlanNo.trim()">，当前匹配 {{ planDetailFilteredTotal }} 个</template>
                ；打开后本地筛选，无需重复请求。
              </p>
            </div>
            <UButton color="neutral" variant="ghost" icon="i-lucide-x" aria-label="关闭" @click="planDrawerOpen = false" />
          </header>

          <div class="shrink-0 space-y-3 border-b border-app-border bg-app-bg/40 px-5 py-4">
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(220px,1fr)_auto]">
              <UInput
                v-model="planDetailPlanNo"
                icon="i-lucide-search"
                placeholder="输入工序计划号 / 生产订单即时筛选"
                :disabled="planDetailLoading"
              />
              <div class="flex items-center gap-2">
                <UButton color="neutral" variant="outline" :disabled="planDetailLoading || !hasPlanDetailTableControls" @click="resetPlanDetailSearch">
                  重置筛选
                </UButton>
                <UButton color="neutral" variant="soft" icon="i-lucide-refresh-cw" :loading="planDetailLoading" @click="loadPlanDetails">
                  重新加载
                </UButton>
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-2 text-xs text-app-muted">
              <span>当前汇报日期：{{ filters.startDate }} 至 {{ filters.endDate }}</span>
              <span class="text-app-border">|</span>
              <span>当前指标：{{ planDetailMetric.label }}</span>
              <span class="text-app-border">|</span>
              <span>数量只统计当前汇报日期范围内的数据</span>
              <span class="text-app-border">|</span>
              <span v-if="planDetailMetric.key === 'process'">工序达标率按当前达标阈值 {{ formatThreshold(appliedThreshold) }}% 判定</span>
              <span v-else>封装直通率=入库合格÷固晶投入；测试良率=（合格+尾数-增投）÷上工序转入</span>
              <span class="text-app-border">|</span>
              <span>表格支持横向滚动查看完整字段</span>
              <span class="text-app-border">|</span>
              <span>列头输入框可筛选，点击排序图标可切换升序/降序</span>
            </div>
            <div v-if="planDetailError" class="flex items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300">
              <span>{{ planDetailError }}</span>
              <UButton size="xs" color="error" variant="soft" @click="loadPlanDetails">重试</UButton>
            </div>
          </div>

          <div class="min-h-0 flex-1 overflow-hidden px-5 py-4">
            <div class="h-full min-h-0 overflow-hidden">
              <TkUTable
                sticky
                :data="planDetailRows"
                :columns="planDetailColumns"
                :key="planDetailTableKey"
                :loading="planDetailLoading"
                :interactive="false"
                :virtualize="{ estimateSize: 56, overscan: 10 }"
                class="h-full min-h-[240px] text-xs"
                wrapper-class="h-full max-h-[calc(100dvh-17rem)]"
                :ui="{ base: 'min-w-[1180px]' }"
              >
              <template #planNo-cell="{ row }">
                <span class="whitespace-nowrap font-mono font-semibold text-primary">{{ row.original.planNo || '-' }}</span>
              </template>
              <template #moNumber-cell="{ row }">
                <div class="whitespace-nowrap">
                  <div class="font-mono">{{ row.original.moNumber || '-' }}</div>
                  <div class="mt-0.5 text-[11px] text-app-muted">行号 {{ row.original.moEntrySeq || '-' }}</div>
                </div>
              </template>
              <template #orderDate-cell="{ row }">
                <span class="whitespace-nowrap font-mono">{{ row.original.orderDate || '-' }}</span>
              </template>
              <template #materialName-cell="{ row }">
                <div class="min-w-[160px]">
                  <div class="font-medium">{{ row.original.materialName || '-' }}</div>
                  <div class="mt-0.5 text-[11px] text-app-muted">{{ row.original.materialNumber || '-' }}</div>
                </div>
              </template>
              <template #solidCrystalInputQty-cell="{ row }">
                <span class="whitespace-nowrap font-mono">{{ formatNumber(row.original.solidCrystalInputQty) }}</span>
              </template>
              <template #packagingInputQty-cell="{ row }">
                <span class="whitespace-nowrap font-mono">{{ formatNumber(row.original.packagingInputQty) }}</span>
              </template>
              <template #packagingQualifiedQty-cell="{ row }">
                <div class="whitespace-nowrap">
                  <div class="font-mono font-semibold text-emerald-600 dark:text-emerald-400">{{ formatNumber(row.original.packagingQualifiedQty) }}</div>
                  <div class="mt-0.5 text-[11px] text-app-muted">{{ row.original.packagingReportDate || '未汇报' }}</div>
                </div>
              </template>
              <template #packagingRate-cell="{ row }">
                <span class="whitespace-nowrap font-mono font-semibold" :class="detailRateClass(row.original.packagingRate, planDetailMetric.usesThreshold)">
                  {{ formatNullableRate(row.original.packagingRate) }}
                </span>
              </template>
              <template #packagingStatus-cell="{ row }">
                <UBadge :color="detailStatusColor(row.original.packagingStatus)" variant="soft">
                  {{ row.original.packagingStatus || '-' }}
                </UBadge>
              </template>
              <template #testingInputQty-cell="{ row }">
                <span class="whitespace-nowrap font-mono">{{ formatNumber(row.original.testingInputQty) }}</span>
              </template>
              <template #testingReportQualifiedQty-cell="{ row }">
                <span class="whitespace-nowrap font-mono">{{ formatNumber(row.original.testingReportQualifiedQty) }}</span>
              </template>
              <template #testingTailQty-cell="{ row }">
                <span class="whitespace-nowrap font-mono">{{ formatNumber(row.original.testingTailQty) }}</span>
              </template>
              <template #testingIncreaseQty-cell="{ row }">
                <span class="whitespace-nowrap font-mono">{{ formatNumber(row.original.testingIncreaseQty) }}</span>
              </template>
              <template #testingStraightThroughQty-cell="{ row }">
                <div class="whitespace-nowrap">
                  <div class="font-mono font-semibold text-emerald-600 dark:text-emerald-400">{{ formatNumber(row.original.testingStraightThroughQty) }}</div>
                  <div class="mt-0.5 text-[11px] text-app-muted">{{ row.original.testingReportDate || '未汇报' }}</div>
                </div>
              </template>
              <template #testingRate-cell="{ row }">
                <span class="whitespace-nowrap font-mono font-semibold" :class="detailRateClass(row.original.testingRate)">
                  {{ formatNullableRate(row.original.testingRate) }}
                </span>
              </template>
              <template #testingStatus-cell="{ row }">
                <UBadge :color="detailStatusColor(row.original.testingStatus)" variant="soft">
                  {{ row.original.testingStatus || '-' }}
                </UBadge>
              </template>
              <template #empty>
                <div class="flex min-h-[200px] items-center justify-center text-sm text-app-muted">
                  {{ planDetailLoading ? '明细加载中…' : '当前条件下暂无工序计划' }}
                </div>
              </template>
              </TkUTable>
            </div>
          </div>

          <div v-if="planDetailFilteredTotal > 0" class="shrink-0 border-t border-app-border px-5 py-3">
            <TkPagination
              v-model:page="planDetailPage"
              v-model:page-size="planDetailPageSize"
              :total="planDetailFilteredTotal"
              :page-sizes="[20, 50, 100]"
              :show-page-size="true"
            />
          </div>
        </div>
      </template>
    </USlideover>
  </div>
</template>

<script setup name="processYield">
import dayjs from 'dayjs'
import { h, resolveComponent } from 'vue'
import {
  getProcessYieldDashboardData,
  getProcessYieldDashboardPlanDetails,
} from '@/api/tk_custom/processYield'
import { TkPagination, TkUTable } from '@ctk-system/ui'
import {
  PROCESS_YIELD_METRICS,
  PROCESS_YIELD_THRESHOLD,
  buildDashboardSummary,
  metricRow,
  normalizeDashboardResponse,
  toNumber,
} from '@ctk-system/shared'

const toast = useToast()
const loading = ref(false)
const errorMessage = ref('')
const activeMetricKey = ref('packaging')
const requestSerial = ref(0)
const dashboard = ref({
  rows: [],
  summary: buildDashboardSummary([]),
  generatedAt: '',
})

const PLAN_DETAIL_FETCH_SIZE = 5000

const planDrawerOpen = ref(false)
const planDetailLoading = ref(false)
const planDetailError = ref('')
const planDetailAllRows = ref([])
const planDetailPage = ref(1)
const planDetailPageSize = ref(50)
const planDetailPackage = ref('')
const planDetailMetricKey = ref('packaging')
const planDetailPlanNo = ref('')
const planDetailRequestSerial = ref(0)
const planDetailSort = ref({ key: '', direction: '' })
const thresholdDraft = ref(String(PROCESS_YIELD_THRESHOLD))
const appliedThreshold = ref(PROCESS_YIELD_THRESHOLD)

const filters = ref({
  startDate: dayjs().startOf('month').format('YYYY-MM-DD'),
  endDate: dayjs().format('YYYY-MM-DD'),
})

const dateRange = computed({
  get: () => {
    const { startDate, endDate } = filters.value
    return startDate && endDate ? [startDate, endDate] : []
  },
  set: (value) => {
    filters.value.startDate = value?.[0] || ''
    filters.value.endDate = value?.[1] || ''
  },
})

const quickRanges = [
  { label: '今天', value: 'today' },
  { label: '本周', value: 'week' },
  { label: '本月', value: 'month' },
  { label: '近30天', value: 'last30Days' },
]

const effectiveMetrics = computed(() => PROCESS_YIELD_METRICS.map((metric) => {
  const threshold = formatThreshold(appliedThreshold.value)
  const targetLabel = metric.usesThreshold
    ? (metric.mode === 'plans' ? `达标线 ${threshold}%` : `合格线 ${threshold}%`)
    : metric.targetLabel
  return {
    ...metric,
    targetLabel,
    target: metric.usesThreshold ? appliedThreshold.value : metric.target,
    ...(metric.key === 'process'
      ? { description: `达到 ${threshold}% 达标线的工序计划单 ÷ 工序计划总数` }
      : {}),
  }
}))

const activeMetric = computed(() => {
  return effectiveMetrics.value.find((item) => item.key === activeMetricKey.value) || effectiveMetrics.value[0]
})

const summary = computed(() => dashboard.value.summary || buildDashboardSummary(dashboard.value.rows))

const summaryCards = computed(() => effectiveMetrics.value.map((metric) => {
  const item = metricRow(summary.value, metric)
  return { ...metric, ...item, hasData: metric.mode === 'plans' ? item.planCount > 0 : item.inputQty > 0 }
}))

const activeRows = computed(() => {
  return dashboard.value.rows
    .map((row) => metricRow(row, activeMetric.value))
    .filter((row) => row.hasData)
    .sort((a, b) => {
      if (a.rate === null && b.rate === null) return b.inputQty - a.inputQty
      if (a.rate === null) return 1
      if (b.rate === null) return -1
      return a.rate - b.rate || b.inputQty - a.inputQty
    })
})

const chartRows = computed(() => activeRows.value.filter((row) => row.rate !== null))

const planDetailFilterKeys = [
  'planNo',
  'moNumber',
  'orderDate',
  'materialName',
  'solidCrystalInputQty',
  'packagingInputQty',
  'packagingQualifiedQty',
  'packagingRate',
  'packagingStatus',
  'testingInputQty',
  'testingReportQualifiedQty',
  'testingTailQty',
  'testingIncreaseQty',
  'testingStraightThroughQty',
  'testingRate',
  'testingStatus',
]

const planDetailColumnFilters = reactive(
  Object.fromEntries(planDetailFilterKeys.map((key) => [key, ''])),
)

const planDetailNumericKeys = new Set([
  'solidCrystalInputQty',
  'packagingInputQty',
  'packagingQualifiedQty',
  'packagingRate',
  'testingInputQty',
  'testingReportQualifiedQty',
  'testingTailQty',
  'testingIncreaseQty',
  'testingStraightThroughQty',
  'testingRate',
])

const planDetailDateKeys = new Set(['orderDate', 'packagingReportDate', 'testingReportDate'])

function planDetailColumn(accessorKey, label, options = {}) {
  return {
    accessorKey,
    ...options,
    enableSorting: false,
    header: () => renderPlanDetailHeader(accessorKey, label),
  }
}

const planDetailBaseColumns = [
  planDetailColumn('planNo', '工序计划号', { size: 170 }),
  planDetailColumn('moNumber', '生产订单', { size: 180 }),
  planDetailColumn('orderDate', '订单日期', { size: 140 }),
  planDetailColumn('materialName', '物料', { size: 220 }),
]

const planDetailMetricColumns = {
  packaging: [
    planDetailColumn('solidCrystalInputQty', '固晶投入', { size: 135 }),
    planDetailColumn('packagingInputQty', '入库投入', { size: 135 }),
    planDetailColumn('packagingQualifiedQty', '入库合格/日期', { size: 160 }),
    planDetailColumn('packagingRate', '封装直通率', { size: 145 }),
    planDetailColumn('packagingStatus', '入库状态', { size: 145 }),
  ],
  testing: [
    planDetailColumn('testingInputQty', '上工序转入', { size: 145 }),
    planDetailColumn('testingReportQualifiedQty', '测试合格', { size: 135 }),
    planDetailColumn('testingTailQty', '尾数', { size: 120 }),
    planDetailColumn('testingIncreaseQty', '增投数量', { size: 135 }),
    planDetailColumn('testingStraightThroughQty', '测试直通/日期', { size: 165 }),
    planDetailColumn('testingRate', '测试良率', { size: 145 }),
    planDetailColumn('testingStatus', '测试状态', { size: 145 }),
  ],
  process: [
    planDetailColumn('solidCrystalInputQty', '固晶投入', { size: 135 }),
    planDetailColumn('packagingQualifiedQty', '入库合格/日期', { size: 160 }),
    planDetailColumn('packagingRate', '封装直通率', { size: 145 }),
    planDetailColumn('packagingStatus', '达标状态', { size: 145 }),
  ],
}

function renderPlanDetailHeader(accessorKey, label) {
  const direction = planDetailSort.value.key === accessorKey
    ? planDetailSort.value.direction
    : ''
  const sortIcon = direction === 'asc'
    ? 'i-lucide-arrow-up'
    : direction === 'desc'
      ? 'i-lucide-arrow-down'
      : 'i-lucide-arrow-up-down'
  const sortLabel = direction === 'asc'
    ? `取消${label}排序`
    : direction === 'desc'
      ? `清除${label}排序`
      : `按${label}升序排序`
  const Input = resolveComponent('UInput')
  const Button = resolveComponent('UButton')

  return h('div', { class: 'min-w-[96px] py-0.5' }, [
    h('div', { class: 'flex items-center justify-between gap-1' }, [
      h('span', { class: 'truncate' }, label),
      h(Button, {
        type: 'button',
        size: 'xs',
        color: direction ? 'primary' : 'neutral',
        variant: direction ? 'soft' : 'ghost',
        icon: sortIcon,
        title: sortLabel,
        'aria-label': sortLabel,
        class: 'h-5 w-5 shrink-0 justify-center p-0',
        onClick: (event) => {
          event.stopPropagation()
          togglePlanDetailSort(accessorKey)
        },
      }, () => ''),
    ]),
    h(Input, {
      modelValue: planDetailColumnFilters[accessorKey] || '',
      size: 'xs',
      color: 'neutral',
      variant: 'outline',
      placeholder: '筛选',
      title: `筛选${label}`,
      'aria-label': `筛选${label}`,
      class: 'mt-1 w-full min-w-[84px]',
      onClick: (event) => event.stopPropagation(),
      'onUpdate:modelValue': (value) => {
        planDetailColumnFilters[accessorKey] = value ?? ''
        planDetailPage.value = 1
      },
    }),
  ])
}

function togglePlanDetailSort(accessorKey) {
  if (planDetailSort.value.key !== accessorKey) {
    planDetailSort.value = { key: accessorKey, direction: 'asc' }
  } else if (planDetailSort.value.direction === 'asc') {
    planDetailSort.value = { key: accessorKey, direction: 'desc' }
  } else {
    planDetailSort.value = { key: '', direction: '' }
  }
  planDetailPage.value = 1
}

const hasPlanDetailTableControls = computed(() => {
  return Boolean(
    planDetailPlanNo.value.trim()
      || Object.values(planDetailColumnFilters).some((value) => String(value || '').trim())
      || planDetailSort.value.key,
  )
})

const planDetailColumns = computed(() => {
  const metricKey = planDetailMetricKey.value
  return [
    ...planDetailBaseColumns,
    ...(planDetailMetricColumns[metricKey] || planDetailMetricColumns.packaging),
  ]
})

const planDetailTableKey = computed(() => {
  return [
    planDetailMetricKey.value,
    planDetailPackage.value,
    planDetailRequestSerial.value,
  ].join('|')
})

const planDetailFilteredRows = computed(() => {
  const keyword = planDetailPlanNo.value.trim().toLowerCase()
  const rows = planDetailAllRows.value.filter((row) => {
    const planNo = String(row.planNo || '').toLowerCase()
    const moNumber = String(row.moNumber || '').toLowerCase()
    const materialName = String(row.materialName || '').toLowerCase()
    const materialNumber = String(row.materialNumber || '').toLowerCase()
    const matchesKeyword = !keyword || planNo.includes(keyword)
      || moNumber.includes(keyword)
      || materialName.includes(keyword)
      || materialNumber.includes(keyword)
    if (!matchesKeyword) return false

    return Object.entries(planDetailColumnFilters).every(([key, value]) => {
      const filter = String(value || '').trim().toLowerCase()
      if (!filter) return true
      return planDetailColumnFilterText(row, key).toLowerCase().includes(filter)
    })
  })

  const { key, direction } = planDetailSort.value
  if (!key || !direction) return rows

  return [...rows].sort((left, right) => comparePlanDetailRows(left, right, key, direction))
})

function planDetailColumnFilterText(row, key) {
  if (key === 'planNo') return String(row.planNo || '')
  if (key === 'moNumber') return `${row.moNumber || ''} 行号 ${row.moEntrySeq || ''}`
  if (key === 'orderDate') return String(row.orderDate || '')
  if (key === 'materialName') return `${row.materialName || ''} ${row.materialNumber || ''}`
  if (key === 'packagingQualifiedQty') {
    return `${planDetailNumericFilterText(row.packagingQualifiedQty)} ${row.packagingReportDate || ''}`
  }
  if (key === 'testingStraightThroughQty') {
    return `${planDetailNumericFilterText(row.testingStraightThroughQty)} ${row.testingReportDate || ''}`
  }
  if (planDetailNumericKeys.has(key)) return planDetailNumericFilterText(row[key])
  return String(row[key] ?? '')
}

function planDetailNumericFilterText(value) {
  if (value === null || value === undefined || value === '') return ''
  return `${value} ${formatNumber(value)}`
}

function comparePlanDetailRows(left, right, key, direction) {
  const leftValue = planDetailSortValue(left, key)
  const rightValue = planDetailSortValue(right, key)
  const leftMissing = leftValue === null || leftValue === undefined || leftValue === ''
  const rightMissing = rightValue === null || rightValue === undefined || rightValue === ''
  if (leftMissing && rightMissing) return 0
  if (leftMissing) return 1
  if (rightMissing) return -1

  let result
  if (planDetailNumericKeys.has(key)) {
    result = Number(leftValue) - Number(rightValue)
  } else if (planDetailDateKeys.has(key)) {
    result = String(leftValue).localeCompare(String(rightValue))
  } else {
    result = String(leftValue).localeCompare(String(rightValue), 'zh-CN', { numeric: true, sensitivity: 'base' })
  }

  return direction === 'desc' ? -result : result
}

function planDetailSortValue(row, key) {
  if (planDetailNumericKeys.has(key)) {
    const value = Number(row[key])
    return Number.isFinite(value) ? value : null
  }
  return planDetailColumnFilterText(row, key).trim()
}

const planDetailFilteredTotal = computed(() => planDetailFilteredRows.value.length)

const planDetailRows = computed(() => {
  const pageSize = Math.max(1, Number(planDetailPageSize.value) || 50)
  const maxPage = Math.max(1, Math.ceil(planDetailFilteredTotal.value / pageSize) || 1)
  const page = Math.min(Math.max(1, Number(planDetailPage.value) || 1), maxPage)
  const start = (page - 1) * pageSize
  return planDetailFilteredRows.value.slice(start, start + pageSize)
})

watch(planDetailPlanNo, () => {
  planDetailPage.value = 1
})

watch(planDetailPageSize, () => {
  planDetailPage.value = 1
})

watch(planDetailFilteredTotal, (total) => {
  const pageSize = Math.max(1, Number(planDetailPageSize.value) || 50)
  const maxPage = Math.max(1, Math.ceil(total / pageSize) || 1)
  if (planDetailPage.value > maxPage) planDetailPage.value = maxPage
})

const chartHeight = computed(() => Math.min(Math.max(chartRows.value.length * 34 + 110, 360), 640))

const chartOption = computed(() => {
  const metric = activeMetric.value
  if (!chartRows.value.length) {
    return { animation: false, series: [] }
  }

  const rows = chartRows.value.map((row) => ({
    ...row,
    displayRate: Math.min(Math.max(row.rate, 0), 100),
  }))

  return {
    animationDuration: 350,
    tooltip: {
      trigger: 'item',
      confine: true,
      formatter: (params) => {
        const data = params?.data || {}
        const lines = [
          `<strong>${escapeHtml(data.packageName)}</strong>`,
          `${metric.rateLabel}：${formatRate(data.rate)}`,
          `${metric.qualifiedLabel}：${formatNumber(data.qualifiedQty)}`,
          `${metric.inputLabel}：${formatNumber(data.inputQty)}`,
        ]
        if (isAnomaly(data.rate)) lines.push('<span style="color:#f59e0b">数据超过 100%，请核查</span>')
        return lines.join('<br>')
      },
    },
    grid: { left: 18, right: 88, top: 12, bottom: 28, containLabel: true },
    xAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLabel: { formatter: '{value}%', color: '#94a3b8' },
      splitLine: { lineStyle: { type: 'dashed', color: 'rgba(148,163,184,.2)' } },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: rows.map((item) => item.packageName),
      axisLabel: { color: '#94a3b8', width: 130, overflow: 'truncate' },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    series: [{
      name: metric.label,
      type: 'bar',
      cursor: 'pointer',
      barWidth: 18,
      showBackground: true,
      backgroundStyle: { color: 'rgba(148,163,184,.12)', borderRadius: 5 },
      data: rows.map((row) => ({
        ...row,
        value: Number(row.displayRate.toFixed(2)),
        itemStyle: { color: rateColor(row.rate, metric), borderRadius: [0, 5, 5, 0] },
      })),
      label: {
        show: true,
        position: 'right',
        color: '#94a3b8',
        fontFamily: 'monospace',
        fontWeight: 700,
        formatter: ({ data }) => formatRate(data.rate),
      },
      markLine: {
        silent: true,
        symbol: 'none',
        lineStyle: { color: metric.color, type: 'dashed', width: 1.5 },
        label: { show: false },
        data: [{ xAxis: metric.target }],
      },
    }],
  }
})

const statusLabel = computed(() => {
  if (loading.value) return '正在查询'
  if (errorMessage.value) return '查询失败'
  if (dashboard.value.rows.length) return '数据已加载'
  return '暂无数据'
})

const formattedLastUpdated = computed(() => {
  if (!dashboard.value.generatedAt) return '—'
  const parsed = dayjs(dashboard.value.generatedAt)
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm:ss') : dashboard.value.generatedAt
})

const activeRange = computed(() => {
  const endDate = dayjs().format('YYYY-MM-DD')
  if (filters.value.endDate !== endDate) return ''
  if (filters.value.startDate === endDate) return 'today'
  if (filters.value.startDate === dayjs().startOf('week').format('YYYY-MM-DD')) return 'week'
  if (filters.value.startDate === dayjs().startOf('month').format('YYYY-MM-DD')) return 'month'
  if (filters.value.startDate === dayjs().subtract(29, 'day').format('YYYY-MM-DD')) return 'last30Days'
  return ''
})

function setDateRange(type) {
  const today = dayjs()
  if (type === 'today') filters.value.startDate = today.format('YYYY-MM-DD')
  if (type === 'week') filters.value.startDate = today.startOf('week').format('YYYY-MM-DD')
  if (type === 'month') filters.value.startDate = today.startOf('month').format('YYYY-MM-DD')
  if (type === 'last30Days') filters.value.startDate = today.subtract(29, 'day').format('YYYY-MM-DD')
  filters.value.endDate = today.format('YYYY-MM-DD')
  fetchData()
}

function resetFilters() {
  filters.value.startDate = dayjs().startOf('month').format('YYYY-MM-DD')
  filters.value.endDate = dayjs().format('YYYY-MM-DD')
  thresholdDraft.value = formatThreshold(PROCESS_YIELD_THRESHOLD)
  appliedThreshold.value = PROCESS_YIELD_THRESHOLD
  fetchData()
}

const planDetailMetric = computed(() => {
  return effectiveMetrics.value.find((item) => item.key === planDetailMetricKey.value) || effectiveMetrics.value[0]
})

function clearPlanDetailRows() {
  planDetailAllRows.value = []
  planDetailError.value = ''
}

function selectMetric(metricKey) {
  activeMetricKey.value = metricKey
  if (planDrawerOpen.value) {
    planDetailMetricKey.value = metricKey
    planDetailPlanNo.value = ''
    planDetailPage.value = 1
    loadPlanDetails()
  }
}

function openPlanDetails(packageName = '', metricKey = activeMetricKey.value) {
  planDetailPackage.value = packageName || ''
  planDetailMetricKey.value = metricKey || 'packaging'
  planDetailPlanNo.value = ''
  planDetailPage.value = 1
  planDrawerOpen.value = true
  loadPlanDetails()
}

function handleChartDoubleClick(params = {}) {
  if (params?.componentType !== 'series') return
  const packageName = params?.data?.packageName || params?.name || ''
  if (!packageName) return
  openPlanDetails(packageName, activeMetricKey.value)
}

function resetPlanDetailSearch() {
  planDetailPlanNo.value = ''
  Object.keys(planDetailColumnFilters).forEach((key) => {
    planDetailColumnFilters[key] = ''
  })
  planDetailSort.value = { key: '', direction: '' }
  planDetailPage.value = 1
}

async function loadPlanDetails() {
  const serial = planDetailRequestSerial.value + 1
  planDetailRequestSerial.value = serial
  planDetailLoading.value = true
  planDetailError.value = ''
  planDetailAllRows.value = []
  planDetailPage.value = 1

  try {
    const result = await getProcessYieldDashboardPlanDetails({
      ...filters.value,
      packageName: planDetailPackage.value,
      metricKey: planDetailMetricKey.value,
      planNo: '',
      pageNum: 1,
      pageSize: PLAN_DETAIL_FETCH_SIZE,
      threshold: appliedThreshold.value,
    })
    if (serial !== planDetailRequestSerial.value) return

    const payload = result?.data && result?.rows === undefined ? result.data : result
    const rows = Array.isArray(payload?.rows) ? payload.rows : []
    const total = Number(payload?.total || rows.length || 0)
    planDetailAllRows.value = rows.map(normalizePlanDetailRow)

    if (total > rows.length) {
      toast.add({
        title: `明细已加载 ${rows.length} 条，还有 ${total - rows.length} 条未载入`,
        color: 'warning',
        duration: 4000,
      })
    }
  } catch (error) {
    if (serial !== planDetailRequestSerial.value) return
    planDetailAllRows.value = []
    planDetailError.value = error?.message || '请检查后端服务和数据权限'
    toast.add({ title: '获取工序计划明细失败', color: 'error', duration: 4000 })
  } finally {
    if (serial === planDetailRequestSerial.value) planDetailLoading.value = false
  }
}

function normalizePlanDetailRow(row = {}) {
  return {
    ...row,
    solidCrystalInputQty: toNumber(row.solidCrystalInputQty),
    packagingInputQty: toNumber(row.packagingInputQty),
    packagingQualifiedQty: toNumber(row.packagingQualifiedQty),
    packagingRate: toNullableNumber(row.packagingRate),
    testingInputQty: toNumber(row.testingInputQty),
    testingReportQualifiedQty: toNumber(row.testingReportQualifiedQty ?? row.testingQualifiedQty),
    testingTailQty: toNumber(row.testingTailQty),
    testingIncreaseQty: toNumber(row.testingIncreaseQty),
    testingStraightThroughQty: toNumber(row.testingStraightThroughQty ?? row.testingQualifiedQty),
    testingQualifiedQty: toNumber(row.testingQualifiedQty),
    testingRate: toNullableNumber(row.testingRate),
  }
}

function toNullableNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

async function fetchData() {
  const serial = requestSerial.value + 1
  requestSerial.value = serial
  appliedThreshold.value = normalizeThreshold(thresholdDraft.value)
  thresholdDraft.value = formatThreshold(appliedThreshold.value)
  loading.value = true
  errorMessage.value = ''

  try {
    const result = await getProcessYieldDashboardData({
      ...filters.value,
      threshold: appliedThreshold.value,
    })
    if (serial !== requestSerial.value) return
    dashboard.value = normalizeDashboardResponse(result)
    if (!dashboard.value.summary) dashboard.value.summary = buildDashboardSummary(dashboard.value.rows)
    if (!dashboard.value.generatedAt) dashboard.value.generatedAt = new Date().toISOString()
    if (planDrawerOpen.value) loadPlanDetails()
  } catch (error) {
    if (serial !== requestSerial.value) return
    dashboard.value = { rows: [], summary: buildDashboardSummary([]), generatedAt: '' }
    errorMessage.value = error?.message || '请检查后端服务和数据权限'
    toast.add({ title: '获取看板数据失败', color: 'error', duration: 4000 })
  } finally {
    if (serial === requestSerial.value) loading.value = false
  }
}

function formatNumber(value) {
  return toNumber(value).toLocaleString('zh-CN', { maximumFractionDigits: 3 })
}

function formatRate(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? '—'
    : `${Number(value).toFixed(2)}%`
}

function formatNullableRate(value) {
  return value === null || value === undefined ? '—' : formatRate(value)
}

function detailRateClass(rate, usesThreshold = false) {
  if (rate === null || rate === undefined) return 'text-app-muted'
  if (isAnomaly(rate)) return 'text-amber-600 dark:text-amber-400'
  const target = usesThreshold ? appliedThreshold.value : 100
  if (rate >= target) return 'text-emerald-600 dark:text-emerald-400'
  if (rate >= 90) return 'text-blue-600 dark:text-blue-400'
  return 'text-amber-600 dark:text-amber-400'
}

function detailStatusColor(status) {
  if (status === '已达标') return 'success'
  if (status === '已汇报') return 'success'
  if (status === '待汇报') return 'warning'
  if (status === '已汇报未达标') return 'error'
  return 'neutral'
}

function rateTextClass(rate, metric) {
  if (rate === null || rate === undefined) return 'text-app-muted'
  if (isAnomaly(rate)) return 'text-amber-600 dark:text-amber-400'
  const target = metric?.usesThreshold ? appliedThreshold.value : 100
  if (metric?.mode === 'plans') {
    if (rate >= target) return 'text-emerald-600 dark:text-emerald-400'
    if (rate >= 90) return 'text-violet-600 dark:text-violet-400'
    return 'text-amber-600 dark:text-amber-400'
  }
  if (rate >= target) return 'text-emerald-600 dark:text-emerald-400'
  if (rate >= 90) return 'text-blue-600 dark:text-blue-400'
  return 'text-amber-600 dark:text-amber-400'
}

function rateBarClass(rate, metric) {
  const target = metric?.usesThreshold ? appliedThreshold.value : 100
  if (isAnomaly(rate) || rate >= target) return 'bg-emerald-500'
  if (metric?.mode === 'plans' && rate >= 90) return 'bg-violet-500'
  if (metric?.mode !== 'plans' && rate >= 90) return 'bg-blue-500'
  return 'bg-amber-500'
}

function rateColor(rate, metric) {
  const target = metric?.usesThreshold ? appliedThreshold.value : 100
  if (isAnomaly(rate) || rate >= target) return '#10b981'
  if (metric?.mode === 'plans' && rate >= 90) return '#8b5cf6'
  if (metric?.mode !== 'plans' && rate >= 90) return '#3b82f6'
  return '#f59e0b'
}

function metricBadgeClass(card) {
  if (!card.hasData) return 'bg-gray-500/10 text-app-muted'
  if (isAnomaly(card.rate)) return 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
  return card.mode === 'plans'
    ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400'
    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
}

function isAnomaly(rate) {
  return rate !== null && rate !== undefined && Number(rate) > 100.000001
}

function normalizeThreshold(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return PROCESS_YIELD_THRESHOLD
  return Math.min(100, Math.max(0, Number(parsed.toFixed(1))))
}

function formatThreshold(value) {
  return normalizeThreshold(value).toLocaleString('zh-CN', { maximumFractionDigits: 1 })
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

onMounted(() => {
  fetchData()
})
</script>
