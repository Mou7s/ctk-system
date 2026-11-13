<template>
  <div class="absolute inset-0 overflow-y-auto bg-app-bg p-4 text-app-text md:p-6">
    <div class="mx-auto flex max-w-[1800px] flex-col gap-4 pb-16">
      <header class="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-app-border bg-app-surface px-5 py-4 shadow-sm">
        <div>
          <div class="mb-1 flex flex-wrap items-center gap-2">
            <UBadge color="primary" variant="soft">销售</UBadge>
            <UBadge color="success" variant="soft">仅统计已审核销售订单</UBadge>
          </div>
          <h1 class="text-xl font-bold">销售价格走势</h1>
          <p class="mt-1 text-sm text-app-muted">按客户和物料观察成交单价变化，不代表人工改价原因。</p>
        </div>
        <UButton icon="i-lucide-refresh-cw" :loading="loading" @click="loadTrend">刷新数据</UButton>
      </header>

      <section class="rounded-2xl border border-app-border bg-app-surface p-4 shadow-sm">
        <div class="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(280px,320px)_minmax(150px,180px)_auto] xl:items-end [&>*]:min-w-0">
          <UFormField label="客户">
            <UInputMenu
              v-model="selectedCustomerNumbers"
              v-model:search-term="customerSearchTerm"
              :items="customerOptions"
              :loading="customerLoading"
              multiple
              value-key="number"
              label-key="label"
              placeholder="搜索并选择客户"
              open-on-focus
              virtualize
              class="w-full"
              @update:open="handleOptionOpen('customer', $event)"
            />
          </UFormField>

          <UFormField label="物料">
            <UInputMenu
              v-model="selectedMaterialNumbers"
              v-model:search-term="materialSearchTerm"
              :items="materialOptions"
              :loading="materialLoading"
              multiple
              value-key="number"
              label-key="label"
              placeholder="搜索并选择物料"
              open-on-focus
              virtualize
              class="w-full"
              @update:open="handleOptionOpen('material', $event)"
            />
          </UFormField>

          <UFormField label="订单日期">
            <UPopover v-model:open="dateRangeOpen" :content="{ align: 'center' }">
                    <UButton color="neutral" variant="outline" icon="i-lucide-calendar" class="w-full min-w-[280px] font-normal w-full">
                      <span :class="dateRange?.length === 2 ? '' : 'text-dimmed'">{{ rangeDisplayText(dateRange) || '选择日期范围' }}</span>
                    </UButton>
                    <template #content>
                      <div class="flex items-stretch divide-x divide-default">
                        <div class="hidden sm:flex flex-col justify-center py-2">
                          <UButton
                            v-for="p in DATE_RANGE_PRESETS"
                            :key="p.label"
                            :label="p.label"
                            color="neutral"
                            variant="ghost"
                            class="rounded-none px-4"
                            :class="isPresetSelected(dateRange, p, 'date') ? 'bg-elevated' : 'hover:bg-elevated/50'"
                            truncate
                            @click="applydateRangePreset(p)"
                          />
                          <UButton
                            v-if="dateRange?.length"
                            label="清除"
                            color="neutral"
                            variant="ghost"
                            class="rounded-none px-4 text-error hover:bg-elevated/50"
                            truncate
                            @click="cleardateRange"
                          />
                        </div>
                        <UCalendar
                          :default-value="rangeArrayToCalendar(dateRange)"
                          range
                          :number-of-months="calendarMonths"
                          locale="zh-CN"
                          class="p-2"
                          @update:model-value="ondateRangePick"
                        />
                      </div>
                    </template>
                  </UPopover>
          </UFormField>

          <UFormField label="价格口径">
            <USelect v-model="priceMetric" :items="priceMetricOptions" value-key="value" label-key="label" class="w-full" />
          </UFormField>

          <div class="flex gap-2 lg:col-span-2 xl:col-span-1">
            <UBadge color="primary" variant="soft" class="flex-1 justify-center px-3 py-2 text-center">筛选后自动更新</UBadge>
            <UTooltip text="重置筛选条件">
              <UButton color="neutral" variant="outline" icon="i-lucide-rotate-ccw" aria-label="重置筛选条件" @click="resetFilters" />
            </UTooltip>
          </div>
        </div>

        <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-app-muted">
          <UBadge color="neutral" variant="soft">近两个月默认范围</UBadge>
          <UBadge color="neutral" variant="soft">客户和物料至少选一个</UBadge>
          <UBadge color="neutral" variant="soft">每条订单明细一个数据点</UBadge>
          <UBadge :color="selectionTooMany ? 'error' : 'neutral'" variant="soft">
            {{ selectionHint }}
          </UBadge>
        </div>
        <p v-if="selectionTooMany" class="mt-3 text-sm text-red-600 dark:text-red-400">客户 × 物料组合最多查询 200 条曲线，请减少选择，价格走势会自动更新。</p>
      </section>

      <UAlert
        v-if="errorMessage"
        color="error"
        variant="soft"
        icon="i-lucide-circle-alert"
        title="查询销售价格走势失败"
        :description="errorMessage"
      />
      <UAlert
        v-if="truncated"
        color="warning"
        variant="soft"
        icon="i-lucide-triangle-alert"
        title="查询结果已截断"
        description="查询结果达到后端上限 20,000 条明细，请缩小日期范围后重新查询。"
      />

      <section class="overflow-hidden rounded-2xl border border-app-border bg-app-surface shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-app-border px-4 py-3">
          <div>
            <h2 class="font-semibold">价格走势</h2>
            <p class="mt-1 text-xs text-app-muted">横轴为销售订单日期，悬停数据点可查看订单号、数量及含税/未税单价。</p>
          </div>
          <div class="flex items-center gap-2 text-xs text-app-muted">
            <UBadge color="primary" variant="soft">{{ priceMetricLabel }}</UBadge>
            <span>{{ series.length }} 条曲线 · {{ pointCount }} 个明细点</span>
          </div>
        </div>

        <div v-if="loading" class="space-y-4 p-6">
          <div class="flex items-center justify-center gap-3">
            <USkeleton class="h-4 w-28" />
            <USkeleton class="h-4 w-40" />
          </div>
          <USkeleton class="h-[440px] w-full" />
        </div>
        <UEmpty
          v-else-if="!hasChartData"
          variant="naked"
          icon="i-lucide-chart-no-axes-combined"
          :title="hasQueried ? '当前日期范围内没有已审核销售订单明细' : '选择客户或物料后自动加载'"
          description="无数据组合会在下方单独列出，不会静默丢失。"
          class="min-h-[520px]"
        />
        <div v-else ref="chartEl" class="h-[520px] w-full min-w-0" />
      </section>

      <section class="overflow-hidden rounded-2xl border border-app-border bg-app-surface shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-app-border px-4 py-3">
          <div>
            <h2 class="font-semibold">价格变化摘要</h2>
            <p class="mt-1 text-xs text-app-muted">当前口径：{{ priceMetricLabel }}；正数表示最新价格高于首次价格，点击表头可排序。</p>
          </div>
          <UBadge color="neutral" variant="soft">{{ summaryRows.length }} 个客户 × 物料组合</UBadge>
        </div>

        <div v-if="loading" class="space-y-3 p-4">
          <USkeleton v-for="index in 4" :key="index" class="h-16 w-full" />
        </div>
        <div v-else-if="summaryRows.length" class="overflow-x-auto">
          <table class="min-w-[1080px] w-full text-left text-sm">
            <thead class="bg-app-bg/70 text-xs text-app-muted">
              <tr>
                <th v-for="item in summarySortHeaders" :key="item.key" class="whitespace-nowrap px-4 py-3 font-medium" :aria-sort="summarySortAria(item.key)">
                  <UButton
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    :icon="summarySortIcon(item.key)"
                    :aria-label="`${item.label}排序`"
                    class="-mx-2.5"
                    @click="toggleSummarySort(item.key)"
                  >
                    {{ item.label }}
                  </UButton>
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-app-border">
              <tr v-for="row in sortedSummaryRows" :key="row.key" class="align-top">
                <td class="px-4 py-3">
                  <div class="font-medium">{{ row.customerName || row.customerNumber }} / {{ row.materialName || row.materialNumber }}</div>
                  <div class="mt-1 font-mono text-xs text-app-muted">{{ row.customerNumber }} / {{ row.materialNumber }}</div>
                </td>
                <td class="px-4 py-3">
                  <div class="font-mono">{{ row.firstDate || '-' }}</div>
                  <div class="mt-1 text-xs text-app-muted">{{ row.firstBillNo || '-' }}</div>
                  <div class="mt-1 font-semibold tabular-nums">{{ formatPrice(row.firstValue) }}</div>
                </td>
                <td class="px-4 py-3">
                  <div class="font-mono">{{ row.latestDate || '-' }}</div>
                  <div class="mt-1 text-xs text-app-muted">{{ row.latestBillNo || '-' }}</div>
                  <div class="mt-1 font-semibold tabular-nums">{{ formatPrice(row.latestValue) }}</div>
                </td>
                <td class="px-4 py-3 font-semibold tabular-nums" :class="changeClass(row.change)">{{ formatChange(row.change) }}</td>
                <td class="px-4 py-3 font-semibold tabular-nums" :class="changeClass(row.percent)">{{ formatPercent(row.percent) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <UEmpty
          v-else
          variant="naked"
          icon="i-lucide-table-2"
          title="暂无价格摘要"
          description="筛选后将在这里显示首次价格、最新价格及涨跌幅。"
          class="px-4 py-8"
        />
      </section>

      <section v-if="noDataPairs.length" class="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
        <div class="flex items-start gap-3">
          <UIcon name="i-lucide-info" class="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div>
            <h2 class="font-semibold text-amber-900 dark:text-amber-200">无数据组合（{{ noDataPairs.length }}）</h2>
            <p class="mt-1 text-sm text-amber-800 dark:text-amber-300">所选日期范围内没有已审核销售订单明细。</p>
            <div class="mt-3 flex flex-wrap gap-2">
              <UBadge v-for="item in noDataPairs" :key="item.key" color="warning" variant="soft">{{ item.label }}</UBadge>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useDebounceFn } from '@vueuse/core'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getSalesPriceTrend, searchSalesPriceTrendOptions } from '@/api/tk_custom/salesPriceTrend'
import {
  MAX_PRICE_TREND_SERIES,
  buildSalesPriceSummary,
  getSalesPricePointValue,
  salesPricePairKey,
  sortSalesPriceSummaries,
} from '@/packages/shared'
import { chartTooltip, getChartTheme } from '@/utils/chartTheme'

echarts.use([LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

const toast = useToast()
const chartEl = ref(null)
const chart = ref(null)
const loading = ref(false)
const customerLoading = ref(false)
const materialLoading = ref(false)
const errorMessage = ref('')
const truncated = ref(false)
const hasQueried = ref(false)
const series = ref([])
const pointCount = ref(0)
const selectedCustomerNumbers = ref([])
const selectedMaterialNumbers = ref([])
const customerSearchTerm = ref('')
const materialSearchTerm = ref('')
const customerOptions = ref([])
const materialOptions = ref([])
const customerOptionMap = new Map()
const materialOptionMap = new Map()
const optionSearchVersion = {
  customer: 0,
  material: 0,
}
let trendRequestVersion = 0
const OPTION_SEARCH_LIMIT = 50
const priceMetric = ref('tax')
const priceMetricOptions = [
  { label: '含税单价', value: 'tax' },
  { label: '未税单价', value: 'preTax' },
]
const summarySortHeaders = [
  { key: 'customerMaterial', label: '客户 / 物料' },
  { key: 'firstDate', label: '首次订单及价格' },
  { key: 'latestDate', label: '最新订单及价格' },
  { key: 'change', label: '涨跌金额' },
  { key: 'percent', label: '涨跌比例' },
]
const dateRange = ref(defaultDateRange())
import { DATE_RANGE_PRESETS, calendarToArray, isPresetSelected, presetToArray, rangeArrayToCalendar, rangeDisplayText, useCalendarMonths } from '@/packages/shared/dateRange'
// 日期范围：原生 UPopover + UCalendar range（原生 range，值格式不变）
const dateRangeOpen = ref(false);
  const calendarMonths = useCalendarMonths();
function ondateRangePick(range) {
  if (!range?.start || !range?.end) return
  dateRange.value = calendarToArray(range, 'date')
  dateRangeOpen.value = false
}
function applydateRangePreset(preset) {
  dateRange.value = presetToArray(preset, 'date')
  dateRangeOpen.value = false
}
function cleardateRange() {
  dateRange.value = []
  dateRangeOpen.value = false
}

const selectionTooMany = computed(() => selectedCustomerNumbers.value.length * selectedMaterialNumbers.value.length > MAX_PRICE_TREND_SERIES)
const selectionHint = computed(() => {
  const customerCount = selectedCustomerNumbers.value.length
  const materialCount = selectedMaterialNumbers.value.length
  if (customerCount && materialCount) return `${customerCount * materialCount} / 200 条组合曲线`
  if (customerCount) return `按客户展开物料，最多 200 条曲线`
  if (materialCount) return `按物料展开客户，最多 200 条曲线`
  return '请选择客户或物料'
})
const priceMetricLabel = computed(() => priceMetric.value === 'preTax' ? '未税单价' : '含税单价')
const hasChartData = computed(() => series.value.some(item => item.points?.some(point => getSalesPricePointValue(point, priceMetric.value) != null)))
const summaryRows = computed(() => series.value.map(item => buildSalesPriceSummary(item, priceMetric.value)))
const summarySort = ref({ key: '', direction: '' })
const sortedSummaryRows = computed(() => sortSalesPriceSummaries(
  summaryRows.value,
  summarySort.value.key,
  summarySort.value.direction,
))
const noDataPairs = computed(() => {
  if (!hasQueried.value || !selectedCustomerNumbers.value.length || !selectedMaterialNumbers.value.length) return []
  const existing = new Set(series.value.map(item => item.key || salesPricePairKey(item.customerNumber, item.materialNumber)))
  const pairs = []
  for (const customerNumber of selectedCustomerNumbers.value) {
    for (const materialNumber of selectedMaterialNumbers.value) {
      const key = salesPricePairKey(customerNumber, materialNumber)
      if (!existing.has(key)) {
        const customer = customerOptionMap.get(customerNumber)
        const material = materialOptionMap.get(materialNumber)
        pairs.push({
          key,
          label: `${customer?.name || customerNumber} / ${material?.name || materialNumber}`,
        })
      }
    }
  }
  return pairs
})

const refreshCustomerOptions = useDebounceFn((keyword, version) => fetchOptions('customer', keyword, version), 350)
const refreshMaterialOptions = useDebounceFn((keyword, version) => fetchOptions('material', keyword, version), 350)
const scheduleTrendLoad = useDebounceFn(() => refreshTrendFromFilters(), 250)

watch(customerSearchTerm, (value) => handleOptionSearchTermChange('customer', value))
watch(materialSearchTerm, (value) => handleOptionSearchTermChange('material', value))
watch(dateRange, refreshOptionsForDateRange, { deep: true })
watch(selectedCustomerNumbers, refreshMaterialOptionsForCustomers, { deep: true })
watch([selectedCustomerNumbers, selectedMaterialNumbers, dateRange], scheduleTrendLoad, { deep: true })
watch(priceMetric, () => renderChart())

onMounted(() => {
  window.addEventListener('resize', resizeChart)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeChart)
  chart.value?.dispose()
})

function handleOptionSearchTermChange(type, value) {
  const query = String(value || '').trim()
  const version = ++optionSearchVersion[type]
  if (!query) {
    setOptionItems(type, selectedOptionItems(type))
    setOptionLoading(type, true)
    if (type === 'customer') refreshCustomerOptions(query, version)
    else refreshMaterialOptions(query, version)
    return
  }
  if (type === 'customer') refreshCustomerOptions(query, version)
  else refreshMaterialOptions(query, version)
}

function handleOptionOpen(type, isOpen) {
  if (!isOpen || currentOptionSearchTerm(type)) return
  const version = ++optionSearchVersion[type]
  fetchOptions(type, '', version)
}

function refreshOptionsForDateRange() {
  if (!dateRange.value?.[0] || !dateRange.value?.[1]) return
  refreshOptionItemsForDateRange('customer')
  refreshOptionItemsForDateRange('material')
}

function refreshMaterialOptionsForCustomers() {
  if (!dateRange.value?.[0] || !dateRange.value?.[1]) return
  refreshOptionItemsForDateRange('material')
}

function refreshOptionItemsForDateRange(type) {
  const version = ++optionSearchVersion[type]
  const query = currentOptionSearchTerm(type)
  setOptionItems(type, selectedOptionItems(type))
  setOptionLoading(type, true)
  if (type === 'customer') refreshCustomerOptions(query, version)
  else refreshMaterialOptions(query, version)
}

async function fetchOptions(type, keyword, version) {
  const query = String(keyword || '').trim()
  if (version !== optionSearchVersion[type] || currentOptionSearchTerm(type) !== query) return
  const isCustomer = type === 'customer'
  setOptionLoading(type, true)
  try {
    const response = await searchSalesPriceTrendOptions(optionSearchParams(type, query))
    if (response?.code !== 200) throw new Error(response?.msg || '远程搜索失败')
    if (version !== optionSearchVersion[type] || currentOptionSearchTerm(type) !== query) return
    const rows = Array.isArray(response.data) ? response.data : []
    const items = rows.map(normalizeOption).filter(item => item.number)
    const map = isCustomer ? customerOptionMap : materialOptionMap
    items.forEach(item => map.set(item.number, item))
    setOptionItems(type, mergeOptions(selectedOptionItems(type), items))
  } catch (error) {
    if (version !== optionSearchVersion[type] || currentOptionSearchTerm(type) !== query) return
    toast.add({ title: '远程搜索失败', description: error?.message || '请检查金蝶连接', color: 'error' })
  } finally {
    if (version === optionSearchVersion[type]) setOptionLoading(type, false)
  }
}

function optionSearchParams(type, query) {
  const params = {
    type,
    ...(query ? { keyword: query, limit: OPTION_SEARCH_LIMIT } : { limit: 0 }),
  }
  if ((type === 'customer' || type === 'material') && dateRange.value?.[0] && dateRange.value?.[1]) {
    params.beginDate = dateRange.value[0]
    params.endDate = dateRange.value[1]
  }
  if (type === 'material' && selectedCustomerNumbers.value.length) {
    params.customerNumbers = selectedCustomerNumbers.value.join(',')
  }
  return params
}

function currentOptionSearchTerm(type) {
  return String(type === 'customer' ? customerSearchTerm.value : materialSearchTerm.value || '').trim()
}

function selectedOptionItems(type) {
  const isCustomer = type === 'customer'
  const map = isCustomer ? customerOptionMap : materialOptionMap
  const current = isCustomer ? selectedCustomerNumbers.value : selectedMaterialNumbers.value
  return current.map(number => map.get(number)).filter(Boolean)
}

function setOptionItems(type, items) {
  if (type === 'customer') customerOptions.value = items
  else materialOptions.value = items
}

function setOptionLoading(type, value) {
  if (type === 'customer') customerLoading.value = value
  else materialLoading.value = value
}

function refreshTrendFromFilters() {
  if (!selectedCustomerNumbers.value.length && !selectedMaterialNumbers.value.length) {
    invalidateTrendRequest()
    return
  }
  if (!dateRange.value?.[0] || !dateRange.value?.[1]) {
    invalidateTrendRequest()
    return
  }
  loadTrend()
}

function invalidateTrendRequest() {
  trendRequestVersion += 1
  loading.value = false
  series.value = []
  pointCount.value = 0
  truncated.value = false
  hasQueried.value = false
  errorMessage.value = ''
  chart.value?.clear()
}

async function loadTrend() {
  errorMessage.value = ''
  truncated.value = false
  const requestVersion = ++trendRequestVersion
  if (!selectedCustomerNumbers.value.length && !selectedMaterialNumbers.value.length) {
    errorMessage.value = '请至少选择一个客户或一个物料。'
    return
  }
  if (selectionTooMany.value) {
    series.value = []
    pointCount.value = 0
    hasQueried.value = false
    chart.value?.clear()
    return
  }
  if (!dateRange.value?.[0] || !dateRange.value?.[1]) {
    errorMessage.value = '请选择完整的订单日期范围。'
    return
  }

  const customerNumbers = selectedCustomerNumbers.value.join(',')
  const materialNumbers = selectedMaterialNumbers.value.join(',')
  const beginDate = dateRange.value[0]
  const endDate = dateRange.value[1]
  loading.value = true
  try {
    const response = await getSalesPriceTrend({
      customerNumbers,
      materialNumbers,
      beginDate,
      endDate,
    })
    if (requestVersion !== trendRequestVersion) return
    if (response?.code !== 200) throw new Error(response?.msg || '销售价格走势查询失败')
    const data = response.data || {}
    hasQueried.value = true
    series.value = Array.isArray(data.series) ? data.series : []
    pointCount.value = Number(data.pointCount || 0)
    truncated.value = Boolean(data.truncated)
  } catch (error) {
    if (requestVersion !== trendRequestVersion) return
    series.value = []
    hasQueried.value = false
    pointCount.value = 0
    errorMessage.value = error?.message || '请检查金蝶连接或稍后重试。'
    toast.add({ title: '查询销售价格走势失败', description: errorMessage.value, color: 'error' })
  } finally {
    if (requestVersion !== trendRequestVersion) return
    loading.value = false
    await nextTick()
    renderChart()
  }
}

function toggleSummarySort(key) {
  if (summarySort.value.key !== key) {
    summarySort.value = { key, direction: 'asc' }
    return
  }
  if (summarySort.value.direction === 'asc') {
    summarySort.value = { key, direction: 'desc' }
    return
  }
  summarySort.value = { key: '', direction: '' }
}

function summarySortIcon(key) {
  if (summarySort.value.key !== key) return 'i-lucide-arrow-up-down'
  return summarySort.value.direction === 'asc'
    ? 'i-lucide-arrow-up-narrow-wide'
    : 'i-lucide-arrow-down-wide-narrow'
}

function summarySortAria(key) {
  if (summarySort.value.key !== key) return 'none'
  return summarySort.value.direction === 'asc' ? 'ascending' : 'descending'
}

function resetFilters() {
  scheduleTrendLoad.cancel?.()
  optionSearchVersion.customer += 1
  optionSearchVersion.material += 1
  trendRequestVersion += 1
  customerLoading.value = false
  materialLoading.value = false
  selectedCustomerNumbers.value = []
  selectedMaterialNumbers.value = []
  customerSearchTerm.value = ''
  materialSearchTerm.value = ''
  customerOptions.value = []
  materialOptions.value = []
  dateRange.value = defaultDateRange()
  priceMetric.value = 'tax'
  series.value = []
  hasQueried.value = false
  pointCount.value = 0
  truncated.value = false
  errorMessage.value = ''
  chart.value?.clear()
}

function renderChart() {
  if (!chartEl.value || !hasChartData.value) return
  if (!chart.value || chart.value.getDom() !== chartEl.value) {
    chart.value?.dispose()
    chart.value = echarts.init(chartEl.value)
  }
  const theme = getChartTheme()
  const chartSeries = series.value
    .map(item => ({
      name: seriesLabel(item),
      type: 'line',
      smooth: false,
      showSymbol: true,
      symbol: 'circle',
      symbolSize: 7,
      lineStyle: { width: 2 },
      emphasis: { focus: 'series', lineStyle: { width: 3 } },
      data: (item.points || [])
        .map(point => ({
          value: [point.date, getSalesPricePointValue(point, priceMetric.value)],
          point,
        }))
        .filter(point => point.value[1] != null),
    }))
    .filter(item => item.data.length)

  chart.value.setOption({
    animation: false,
    color: ['#2563eb', '#0891b2', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#ca8a04'],
    grid: { left: 58, right: 28, top: 56, bottom: 92, containLabel: true },
    legend: {
      type: 'scroll',
      bottom: 20,
      left: 20,
      right: 20,
      textStyle: { color: theme.legendText },
    },
    tooltip: {
      ...chartTooltip(theme),
      trigger: 'item',
      confine: true,
      extraCssText: 'max-width: min(420px, 70vw); white-space: normal; overflow-wrap: anywhere; line-height: 1.5;',
      position: (point, params, dom, rect, size) => {
        const [viewWidth, viewHeight] = size.viewSize
        const [boxWidth, boxHeight] = size.contentSize
        const gap = 12
        let left = point[0] + gap
        let top = point[1] + gap
        if (left + boxWidth > viewWidth) left = point[0] - boxWidth - gap
        if (top + boxHeight > viewHeight) top = point[1] - boxHeight - gap
        return [
          Math.max(0, Math.min(left, viewWidth - boxWidth)),
          Math.max(0, Math.min(top, viewHeight - boxHeight)),
        ]
      },
      formatter: params => formatTooltip(params),
    },
    xAxis: {
      type: 'time',
      name: '订单日期',
      nameTextStyle: { color: theme.axisText },
      axisLabel: { color: theme.axisText },
      axisLine: { lineStyle: { color: theme.axisLine } },
      splitLine: { lineStyle: { color: theme.splitLine } },
    },
    yAxis: {
      type: 'value',
      name: priceMetricLabel.value,
      nameTextStyle: { color: theme.axisText },
      axisLabel: { color: theme.axisText },
      axisLine: { lineStyle: { color: theme.axisLine } },
      splitLine: { lineStyle: { color: theme.splitLine } },
    },
    series: chartSeries,
  }, { notMerge: true })
}

function seriesLabel(item) {
  const customer = item.customerName && item.customerName !== item.customerNumber
    ? `${item.customerName}（${item.customerNumber}）`
    : item.customerNumber
  const material = item.materialName && item.materialName !== item.materialNumber
    ? `${item.materialName}（${item.materialNumber}）`
    : item.materialNumber
  return `${customer} / ${material}`
}

function formatTooltip(params) {
  const item = Array.isArray(params) ? params[0] : params
  const point = item?.data?.point
  if (!point) return ''
  return [
    `<div style="font-weight:600;margin-bottom:6px">${escapeHtml(item.seriesName)}</div>`,
    `<div>日期：${escapeHtml(point.date || '-')}</div>`,
    `<div>订单号：${escapeHtml(point.billNo || '-')}</div>`,
    `<div>数量：${formatNumber(point.qty)}</div>`,
    `<div>含税单价：${formatPrice(point.taxPrice)}</div>`,
    `<div>未税单价：${formatPrice(point.preTaxPrice)}</div>`,
  ].join('')
}

function normalizeOption(item = {}) {
  const number = String(item.number || '').trim()
  const name = String(item.name || '').trim()
  const orderCount = item.orderCount == null ? null : Math.max(0, Number(item.orderCount) || 0)
  const baseLabel = `${name || number}${name && number ? `（${number}）` : ''}`
  return {
    number,
    name,
    specification: String(item.specification || '').trim(),
    orderCount,
    label: orderCount == null ? baseLabel : `${baseLabel} · ${orderCount} 单`,
  }
}

function mergeOptions(selectedItems, items) {
  const map = new Map()
  ;[...selectedItems, ...items].forEach(item => map.set(item.number, item))
  return [...map.values()]
}

function defaultDateRange() {
  const end = new Date()
  const begin = new Date(end)
  begin.setMonth(begin.getMonth() - 2)
  return [formatDate(begin), formatDate(end)]
}

function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatNumber(value) {
  if (value == null || value === '') return '-'
  return Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 4 })
}

function formatPrice(value) {
  if (value == null || value === '' || Number.isNaN(Number(value))) return '-'
  return Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 6 })
}

function formatChange(value) {
  if (value == null || Number.isNaN(Number(value))) return '-'
  return `${Number(value) > 0 ? '+' : ''}${formatPrice(value)}`
}

function formatPercent(value) {
  if (value == null || Number.isNaN(Number(value))) return '-'
  return `${Number(value) > 0 ? '+' : ''}${Number(value).toFixed(2)}%`
}

function changeClass(value) {
  if (value > 0) return 'text-red-600 dark:text-red-400'
  if (value < 0) return 'text-emerald-600 dark:text-emerald-400'
  return 'text-app-muted'
}

function resizeChart() {
  chart.value?.resize()
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
</script>
