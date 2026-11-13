<template>
  <div class="min-w-0 space-y-3 pb-4" data-testid="quotation-analysis">
    <form class="rounded-xl border border-muted bg-elevated/40 p-3 shadow-xs space-y-3" @submit.prevent="loadAnalysis">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-muted/70 pb-2">
        <div class="flex items-center gap-2 text-xs text-muted">
          <UIcon name="i-lucide-sliders-horizontal" class="size-3.5 text-primary" />
          <span class="font-semibold text-highlighted">多维筛选条件</span>
          <UBadge color="neutral" variant="subtle" size="xs">当前口径：{{ appliedStatusLabel }}</UBadge>
        </div>
        <div class="flex items-center gap-2">
          <UButton v-if="!domestic" icon="i-lucide-sliders-horizontal" color="neutral" variant="outline" size="xs" class="sm:hidden" :aria-expanded="advancedOpen" @click="advancedOpen = !advancedOpen">应用与友商筛选</UButton>
          <UButton v-if="canExport" icon="i-lucide-download" color="neutral" variant="outline" size="xs" :loading="exporting" :disabled="loading || !analysis.lineCount" @click="exportAnalysis">导出筛选结果</UButton>
        </div>
      </div>

      <div class="grid grid-cols-1 items-end gap-2.5 sm:grid-cols-2" :class="domestic ? 'xl:grid-cols-[200px_minmax(140px,1fr)_minmax(140px,1fr)_minmax(130px,0.8fr)_140px_auto]' : 'xl:grid-cols-[220px_1fr_1fr_160px_auto]'">
        <UFormField label="创建时间">
          <UPopover v-model:open="dateOpen">
            <UButton icon="i-lucide-calendar" trailing-icon="i-lucide-chevron-down" color="neutral" variant="outline" class="w-full justify-between font-normal">
              <span class="truncate">{{ rangeDisplayText(dateRange) || '不限时间' }}</span>
            </UButton>
            <template #content>
              <div class="flex divide-x divide-muted">
                <div class="hidden flex-col py-2 sm:flex">
                  <UButton v-for="preset in DATE_RANGE_PRESETS" :key="preset.label" :label="preset.label" color="neutral" variant="ghost" class="rounded-none px-4" @click="pickPreset(preset)" />
                  <UButton color="neutral" variant="ghost" label="不限时间" class="rounded-none px-4" @click="dateRange = []; dateOpen = false" />
                </div>
                <UCalendar :default-value="rangeArrayToCalendar(dateRange)" range :number-of-months="calendarMonths" locale="zh-CN" class="p-2" @update:model-value="pickDate" />
              </div>
            </template>
          </UPopover>
        </UFormField>
        <TkQuotationAnalysisFilter v-model="query.customer" field="customer" label="客户" icon="i-lucide-building-2" placeholder="客户名称" :filters="optionFilters" :fetch-options="fetchAnalysis" />
        <TkQuotationAnalysisFilter v-model="query.ctkMpn" field="ctkMpn" label="型号" icon="i-lucide-search" placeholder="CTK 型号" :filters="optionFilters" :fetch-options="fetchAnalysis" />
        <TkQuotationAnalysisFilter v-if="domestic" v-model="query.application" field="application" label="产品应用" :filters="optionFilters" :fetch-options="fetchAnalysis" />
        <UFormField label="报价状态"><USelect v-model="query.status" :items="statusOptions" class="w-full" /></UFormField>
        <div class="flex items-center gap-1.5">
          <UButton type="submit" color="primary" variant="soft" icon="i-lucide-search" :loading="loading">分析</UButton>
          <UTooltip text="重置筛选"><UButton icon="i-lucide-rotate-ccw" color="neutral" variant="ghost" aria-label="重置筛选" :disabled="loading" @click="resetQuery" /></UTooltip>
        </div>
      </div>

      <div v-if="!domestic" class="grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4" :class="advancedOpen ? 'grid' : 'hidden sm:grid'">
        <TkQuotationAnalysisFilter v-model="query.application" field="application" label="产品应用" :filters="optionFilters" :fetch-options="fetchAnalysis" />
        <template v-if="!domestic">
          <TkQuotationAnalysisFilter v-model="query.manufacturer" field="manufacturer" label="友商" placeholder="友商名称" :filters="optionFilters" :fetch-options="fetchAnalysis" />
          <TkQuotationAnalysisFilter v-model="query.manufacturerMpn" field="manufacturerMpn" label="友商型号" :filters="optionFilters" :fetch-options="fetchAnalysis" />
          <TkQuotationAnalysisFilter v-model="query.country" field="country" label="国家" :filters="optionFilters" :fetch-options="fetchAnalysis" />
        </template>
      </div>
    </form>

    <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="error" />

    <dl class="grid grid-cols-2 gap-y-2 rounded-xl border border-muted bg-elevated/40 py-2.5 shadow-xs sm:grid-cols-5">
      <div v-for="metric in metrics" :key="metric.label" class="min-w-0 px-3.5 sm:border-r sm:border-muted sm:last:border-0">
        <dt class="text-xs text-muted">{{ metric.label }}</dt>
        <dd class="mt-0.5 text-lg font-semibold tabular-nums" :class="metric.warning ? 'text-warning' : 'text-highlighted'">{{ metric.value.toLocaleString() }}</dd>
      </div>
    </dl>

    <div class="overflow-hidden rounded-xl border border-muted bg-elevated/30 shadow-xs">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-muted bg-elevated/60 px-3.5 py-2">
        <UTabs v-model="view" :items="viewItems" :content="false" variant="link" :ui="{ list: 'p-0 border-b-0' }" class="min-w-0" />
        <div class="flex flex-wrap items-center gap-2">
          <UFieldGroup v-if="!domestic" size="xs">
            <UButton v-for="option in currencies" :key="option.value" :color="currency === option.value ? 'primary' : 'neutral'" :variant="currency === option.value ? 'soft' : 'outline'" :aria-pressed="currency === option.value" @click="currency = option.value">{{ option.label }}</UButton>
          </UFieldGroup>
          <UBadge v-else color="neutral" variant="subtle" size="xs">含税人民币 / 原计价单位</UBadge>
        </div>
      </div>

      <section v-if="view === 'summary'" class="min-w-0">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-muted/60 bg-default/40 px-3.5 py-2">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs font-medium text-default">{{ analysis.summaryRows.length }} 个客户 / 型号 / 单位组合</span>
            <span v-if="appliedStatus !== 'APPROVED'" class="text-xs text-muted">· 价格指标仅统计已通过报价</span>
          </div>
          <USelect v-model="sortBy" :items="sortOptions" size="xs" aria-label="价格汇总排序" class="w-40" />
        </div>
        <div v-if="loading" class="space-y-3 p-4"><USkeleton v-for="i in 5" :key="i" class="h-12 w-full" /></div>
        <template v-else-if="analysis.summaryRows.length">
          <UTable :data="summaryRows" :columns="summaryColumns" :ui="tableUi" :on-select="selectSummaryRow" sticky class="hidden max-h-[max(340px,calc(100dvh-360px))] w-full sm:block" data-testid="summary-table">
            <template #customerName-cell="{ row }"><div class="max-w-64"><div class="truncate font-medium text-highlighted" :title="row.original.customerName">{{ row.original.customerName || '—' }}</div><div class="mt-0.5 break-all font-mono text-xs text-muted">{{ row.original.ctkMpn || '—' }}</div></div></template>
            <template #unit-cell="{ row }">{{ row.original.unit || '—' }}</template>
            <template #latest-cell="{ row }"><span class="font-semibold tabular-nums text-highlighted">{{ price(row.original[`latestFinal${currency}`]) }}</span></template>
            <template #min-cell="{ row }"><span class="tabular-nums">{{ price(row.original[`minFinal${currency}`]) }}</span></template>
            <template #max-cell="{ row }"><span class="tabular-nums">{{ price(row.original[`maxFinal${currency}`]) }}</span></template>
            <template #average-cell="{ row }"><span class="tabular-nums">{{ price(row.original[`averageFinal${currency}`]) }}</span></template>
            <template #quoteCount-cell="{ row }"><span class="tabular-nums">{{ row.original.quoteCount }}</span></template>
            <template #latestSubmitTime-cell="{ row }"><span class="text-xs text-muted">{{ row.original.latestSubmitTime || '—' }}</span></template>
            <template #history-cell="{ row }"><UTooltip text="查看历史报价"><UButton icon="i-lucide-chevron-right" color="neutral" variant="ghost" size="xs" :aria-label="`查看 ${row.original.customerName} ${row.original.ctkMpn} 历史报价`" @click.stop="openGroup(row.original)" /></UTooltip></template>
          </UTable>
          <div class="divide-y divide-muted sm:hidden">
            <button v-for="row in summaryRows" :key="row.key" type="button" class="w-full p-3.5 text-left transition hover:bg-elevated/50 focus-visible:outline-2 focus-visible:outline-primary" @click="openGroup(row)">
              <div class="flex items-start justify-between gap-3"><div class="min-w-0"><div class="break-words text-sm font-medium text-highlighted">{{ row.customerName }}</div><div class="mt-1 break-all font-mono text-xs text-muted">{{ row.ctkMpn }} · {{ row.unit || '—' }}</div></div><UIcon name="i-lucide-chevron-right" class="mt-1 size-4 shrink-0 text-muted" /></div>
              <dl class="mt-3 grid grid-cols-4 gap-2 text-xs"><div v-for="stat in priceStats" :key="stat.key"><dt class="text-muted">{{ stat.label }}</dt><dd class="mt-1 break-all font-medium tabular-nums text-highlighted">{{ price(row[`${stat.key}${currency}`]) }}</dd></div></dl>
              <div class="mt-2.5 text-xs text-muted">{{ row.quoteCount }} 张报价单 · {{ row.lineCount }} 行</div>
            </button>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-2 border-t border-muted bg-elevated/40 px-4 py-2.5"><span class="text-xs text-muted">共 {{ analysis.summaryRows.length }} 个组合</span><UPagination v-model:page="summaryPage" :total="analysis.summaryRows.length" :items-per-page="50" :sibling-count="0" size="sm" :show-edges="false" /></div>
        </template>
        <UEmpty v-else icon="i-lucide-chart-no-axes-combined" title="暂无已通过报价" class="py-12" />
      </section>

      <section v-else class="min-w-0" data-testid="history-panel">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-muted/60 bg-default/40 px-3.5 py-2">
          <div class="min-w-0">
            <div v-if="selectedGroup" class="flex items-center gap-2"><UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" size="xs" aria-label="返回价格汇总" @click="view = 'summary'" /><div class="flex min-w-0 flex-wrap items-baseline gap-x-2"><h3 class="break-words text-xs font-semibold text-highlighted">{{ selectedGroup.customerName }}</h3><span class="break-all font-mono text-xs text-muted">{{ selectedGroup.ctkMpn }} · {{ selectedGroup.unit || '—' }}</span></div></div>
            <h3 v-else class="text-xs font-semibold text-highlighted">全部报价明细</h3>
          </div>
          <div class="flex flex-wrap items-center gap-2"><UBadge color="neutral" variant="subtle" size="xs">{{ details.total }} 行</UBadge><UButton v-if="selectedGroup && canExport" icon="i-lucide-download" color="neutral" variant="outline" size="xs" :loading="exporting" :disabled="detailsLoading" @click="exportAnalysis(true)">导出当前组合</UButton><UButton v-if="selectedGroup" icon="i-lucide-x" color="neutral" variant="outline" size="xs" @click="clearGroup">全部明细</UButton></div>
        </div>
        <UAlert v-if="detailError" color="error" variant="subtle" :title="detailError" class="m-3" />
        <div v-if="detailsLoading || loading" class="space-y-3 p-4"><USkeleton v-for="i in 4" :key="i" class="h-12 w-full" /></div>
        <template v-else-if="details.rows.length">
          <UTable :data="details.rows" :columns="detailColumns" :ui="tableUi" sticky class="hidden max-h-[max(340px,calc(100dvh-360px))] w-full sm:block" data-testid="detail-table">
            <template #quoteNo-cell="{ row }"><div class="font-mono text-xs font-medium text-highlighted">{{ row.original.quoteNo }}</div><div class="mt-0.5 text-[11px] text-muted">{{ row.original.submitTime }}</div></template>
            <template #customerName-cell="{ row }"><div class="max-w-48 truncate font-medium text-highlighted" :title="row.original.customerName">{{ row.original.customerName }}</div><div class="mt-0.5 font-mono text-xs text-muted">{{ row.original.ctkMpn }}</div></template>
            <template #unit-cell="{ row }">{{ row.original.unit || '—' }}</template>
            <template #original-cell="{ row }"><span class="tabular-nums">{{ price(row.original[`originalPrice${currency}`]) }}</span></template>
            <template #final-cell="{ row }"><span class="font-semibold tabular-nums text-highlighted">{{ price(row.original[`finalPrice${currency}`]) }}</span></template>
            <template #adjustment-cell="{ row }"><span class="tabular-nums" :class="changeClass(row.original)">{{ changeText(row.original) }}</span></template>
            <template #business-cell="{ row }"><div class="max-w-40 truncate" :title="row.original.application">{{ row.original.application || '—' }}</div><div class="mt-0.5 text-xs text-muted">{{ row.original.country || '—' }}</div></template>
            <template #manufacturer-cell="{ row }"><div class="max-w-40 truncate" :title="row.original.manufacturer">{{ row.original.manufacturer || '—' }}</div><div class="mt-0.5 max-w-48 truncate font-mono text-xs text-muted" :title="row.original.manufacturerMpn">{{ row.original.manufacturerMpn || '—' }}</div></template>
            <template #qty-cell="{ row }"><span class="tabular-nums">{{ quantity(row.original.qty) }}</span></template>
            <template #status-cell="{ row }"><UBadge color="neutral" variant="subtle" size="xs">{{ row.original.statusLabel || '—' }}</UBadge></template>
          </UTable>
          <div class="divide-y divide-muted sm:hidden">
            <article v-for="row in details.rows" :key="`${row.quoteNo}:${row.lineNo}`" class="p-3.5">
              <div class="flex flex-wrap justify-between gap-2 text-xs"><span class="font-mono text-highlighted">{{ row.quoteNo }} · {{ row.lineNo }}</span><span class="text-muted">{{ row.submitTime }}</span></div>
              <div class="mt-2 break-words text-sm font-medium text-highlighted">{{ row.customerName }}</div><div class="mt-1 break-all font-mono text-xs text-muted">{{ row.ctkMpn }} · {{ row.unit || '—' }}</div>
              <div class="mt-3 grid grid-cols-3 gap-2 text-xs"><div><div class="text-muted">业务员原价</div><div class="mt-1 break-all tabular-nums">{{ price(row[`originalPrice${currency}`]) }}</div></div><div><div class="text-muted">最终审核价</div><div class="mt-1 break-all font-semibold tabular-nums text-highlighted">{{ price(row[`finalPrice${currency}`]) }}</div></div><div><div class="text-muted">调价幅度</div><div class="mt-1 break-all tabular-nums" :class="changeClass(row)">{{ changeText(row) }}</div></div></div>
              <div class="mt-2.5 text-xs text-muted">{{ row.salespersonName }}</div>
              <dl class="mt-2.5 grid grid-cols-2 gap-3 border-t border-muted pt-2.5 text-xs"><div><dt class="text-muted">应用 / 国家</dt><dd class="mt-1 break-words">{{ row.application || '—' }} / {{ row.country || '—' }}</dd></div><div><dt class="text-muted">友商 / 友商型号</dt><dd class="mt-1 break-all">{{ row.manufacturer || '—' }} / {{ row.manufacturerMpn || '—' }}</dd></div><div><dt class="text-muted">封装 / 数量</dt><dd class="mt-1 break-all">{{ row.packageName || '—' }} / {{ quantity(row.qty) }} {{ row.unit }}</dd></div><div><dt class="text-muted">报价状态</dt><dd class="mt-1">{{ row.statusLabel || '—' }}</dd></div></dl>
            </article>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-2 border-t border-muted bg-elevated/40 px-4 py-2.5"><span class="text-xs text-muted">{{ (details.page - 1) * 100 + 1 }}–{{ Math.min(details.page * 100, details.total) }} / {{ details.total }}</span><UPagination :page="details.page" :total="details.total" :items-per-page="100" :sibling-count="0" size="sm" :show-edges="false" :disabled="detailsLoading" @update:page="loadDetails" /></div>
        </template>
        <UEmpty v-else icon="i-lucide-list" title="暂无报价明细" class="py-12" />
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import TkQuotationAnalysisFilter from './TkQuotationAnalysisFilter.vue'
import { getQuotationAnalysis, getQuotationAnalysisExportUrl } from '@/api/tk_custom/quotation'
import { getDomesticQuotationAnalysis, getDomesticQuotationAnalysisExportUrl } from '@/api/tk_custom/domesticQuotation'
import { mapQuotationAnalysisPayload, quotationPriceAdjustment } from '@/packages/shared/quotationAnalysis'
import { download as downloadFile } from '@/utils/request'
import { DATE_RANGE_PRESETS, calendarToArray, presetToArray, rangeArrayToCalendar, rangeDisplayText, useCalendarMonths } from '@/packages/shared/dateRange'

const props = defineProps({ businessType: { type: String, default: 'FOREIGN' }, canExport: { type: Boolean, default: false } })
const domestic = computed(() => props.businessType === 'DOMESTIC')
const toast = useToast()
const loading = ref(false)
const error = ref('')
const exporting = ref(false)
const emptyQuery = () => ({ customer: '', ctkMpn: '', application: '', manufacturer: '', manufacturerMpn: '', country: '', status: 'APPROVED' })
const query = reactive(emptyQuery())
const advancedOpen = ref(false)
const statusOptions = computed(() => [
  { label: '已通过', value: 'APPROVED' }, { label: '全部状态', value: 'ALL' }, { label: '草稿', value: 'DRAFT' },
  { label: '待初审', value: 'PENDING_INITIAL' }, { label: '待二审', value: 'PENDING_SECOND' },
  { label: '待终审', value: 'PENDING_FINAL' }, { label: '已退回', value: 'RETURNED' },
])
const appliedStatus = ref('APPROVED')
const appliedStatusLabel = computed(() => statusOptions.value.find(option => option.value === appliedStatus.value)?.label || '已通过')
const dateRange = ref([])
const optionFilters = computed(() => ({ ...query, filterMatch: 'exact', from: dateRange.value[0] || '', to: dateRange.value[1] || '' }))
const dateOpen = ref(false)
const calendarMonths = useCalendarMonths()
const currency = ref('Rmb')
const currencies = [{ label: '人民币', value: 'Rmb' }, { label: '美元', value: 'Usd' }]
const view = ref(domestic.value ? 'summary' : 'details')
const viewItems = [{ label: '价格汇总', value: 'summary', icon: 'i-lucide-chart-column' }, { label: '报价明细', value: 'details', icon: 'i-lucide-list' }]
const analysis = reactive(mapQuotationAnalysisPayload())
const details = reactive({ rows: [], total: 0, page: 1 })
const detailsLoading = ref(false)
const detailError = ref('')
const selectedGroup = ref(null)
const summaryPage = ref(1)
const sortBy = ref('recent')
const sortOptions = [{ label: '最近创建优先', value: 'recent' }, { label: '最新价格从低到高', value: 'priceAsc' }, { label: '最新价格从高到低', value: 'priceDesc' }, { label: '报价次数从多到少', value: 'count' }]
const metrics = computed(() => [
  { label: appliedStatus.value === 'APPROVED' ? '已通过报价单' : '报价单', value: analysis.quoteCount },
  { label: '客户 / 型号组合', value: analysis.summaryRows.length },
  { label: '报价明细', value: analysis.lineCount },
  { label: '审核调价行', value: currency.value === 'Rmb' ? analysis.changedRmbCount : analysis.changedUsdCount },
  { label: '无最终报价行', value: analysis.missingFinalCount, warning: appliedStatus.value === 'APPROVED' && analysis.missingFinalCount > 0 },
])
const numericMeta = { class: { th: 'text-right', td: 'text-right' } }
const summaryColumns = [
  { id: 'customerName', header: '客户 / 型号' }, { id: 'unit', header: '单位' },
  { id: 'latest', header: '最新报价', meta: numericMeta }, { id: 'min', header: '最低价', meta: numericMeta },
  { id: 'max', header: '最高价', meta: numericMeta }, { id: 'average', header: '已通过报价均价', meta: numericMeta },
  { id: 'quoteCount', header: '报价单数', meta: numericMeta }, { id: 'latestSubmitTime', header: '最近创建时间' }, { id: 'history', header: '' },
]
const detailColumns = computed(() => [
  { id: 'quoteNo', header: '报价单 / 创建时间' }, { id: 'customerName', header: '客户 / 型号' },
  ...(!domestic.value ? [{ id: 'business', header: '产品应用 / 国家' }, { id: 'manufacturer', header: '友商 / 友商型号' }, { accessorKey: 'packageName', header: '封装' }, { id: 'qty', header: '数量', meta: numericMeta }] : []),
  { accessorKey: 'salespersonName', header: '业务员' }, { id: 'unit', header: '单位' },
  { id: 'original', header: '业务员原价', meta: numericMeta }, { id: 'final', header: '最终审核价', meta: numericMeta },
  { id: 'adjustment', header: '调价幅度', meta: numericMeta },
  { id: 'status', header: '状态' },
])
const priceStats = [{ label: '最新', key: 'latestFinal' }, { label: '最低', key: 'minFinal' }, { label: '最高', key: 'maxFinal' }, { label: '均价', key: 'averageFinal' }]
const tableUi = { base: 'w-full min-w-[1000px]', th: 'bg-elevated/60 px-3 py-2.5 text-xs font-medium text-muted whitespace-nowrap', td: 'px-3 py-2.5 text-sm text-default', tr: 'hover:bg-elevated/40' }
const summaryRows = computed(() => {
  const rows = [...analysis.summaryRows]
  if (sortBy.value === 'count') rows.sort((a, b) => b.quoteCount - a.quoteCount)
  if (sortBy.value.startsWith('price')) rows.sort((a, b) => {
    const left = a[`latestFinal${currency.value}`], right = b[`latestFinal${currency.value}`]
    if (left == null) return right == null ? 0 : 1
    if (right == null) return -1
    return sortBy.value === 'priceAsc' ? left - right : right - left
  })
  return rows.slice((summaryPage.value - 1) * 50, summaryPage.value * 50)
})
watch([sortBy, currency], () => { summaryPage.value = 1 })
let requestId = 0
let detailRequestId = 0
let appliedQuery = {}
const fetchAnalysis = (filters) => domestic.value ? getDomesticQuotationAnalysis(filters) : getQuotationAnalysis(filters)

function pickDate(range) {
  if (!range?.start || !range?.end) return
  dateRange.value = calendarToArray(range, 'date')
  dateOpen.value = false
}
function pickPreset(preset) { dateRange.value = presetToArray(preset, 'date'); dateOpen.value = false }
function price(value) { return value == null || value === '' ? '—' : `${currency.value === 'Rmb' ? '￥' : '$'}${Number(value).toFixed(2)}` }
function quantity(value) { return value == null || value === '' ? '—' : Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 6 }) }
function adjustment(row) { return quotationPriceAdjustment(row[`originalPrice${currency.value}`], row[`finalPrice${currency.value}`]) }
function changeText(row) {
  const result = adjustment(row)
  if (!result) return '—'
  const delta = `${result.delta > 0 ? '+' : ''}${result.delta.toFixed(2)}`
  return result.percent == null ? delta : `${delta} (${result.percent > 0 ? '+' : ''}${result.percent.toFixed(1)}%)`
}
function changeClass(row) { const delta = adjustment(row)?.delta; return delta > 0 ? 'text-warning' : delta < 0 ? 'text-success' : 'text-muted' }
function resetQuery() { Object.assign(query, emptyQuery()); dateRange.value = []; return loadAnalysis() }
async function loadAnalysis() {
  const id = ++requestId
  ++detailRequestId
  detailsLoading.value = false
  loading.value = true
  error.value = ''
  const filters = { ...optionFilters.value }
  try {
    const response = await fetchAnalysis(filters)
    if (id !== requestId) return
    if (response?.code !== 200) throw new Error(response?.msg || '分析数据加载失败')
    appliedQuery = filters
    appliedStatus.value = filters.status
    Object.assign(analysis, mapQuotationAnalysisPayload(response.data))
    Object.assign(details, { rows: analysis.detailRows, total: analysis.lineCount, page: response.data.detailPage || 1 })
    selectedGroup.value = null
    detailError.value = ''
    summaryPage.value = 1
  } catch (err) { if (id === requestId) error.value = err?.message || '分析数据加载失败' }
  finally { if (id === requestId) loading.value = false }
}
function selectSummaryRow(_event, row) { openGroup(row.original) }
function openGroup(row) { selectedGroup.value = row; view.value = 'details'; details.rows = []; details.total = row.lineCount; details.page = 1; return loadDetails(1) }
function clearGroup() { selectedGroup.value = null; details.rows = []; details.total = analysis.lineCount; details.page = 1; return loadDetails(1) }
async function loadDetails(page = 1) {
  const id = ++detailRequestId
  detailsLoading.value = true
  detailError.value = ''
  const group = selectedGroup.value
  try {
    const response = await fetchAnalysis({ ...appliedQuery, detailsOnly: '1', detailPage: page, ...(group ? { groupCustomer: group.customerName, groupMpn: group.ctkMpn, groupUnit: group.unit || '' } : {}) })
    if (id !== detailRequestId) return
    if (response?.code !== 200) throw new Error(response?.msg || '历史报价加载失败')
    Object.assign(details, { rows: response.data.detailRows || [], total: response.data.lineCount || 0, page: response.data.detailPage || page })
  } catch (err) { if (id === detailRequestId) detailError.value = err?.message || '历史报价加载失败' }
  finally { if (id === detailRequestId) detailsLoading.value = false }
}
async function exportAnalysis(groupOnly = false) {
  const group = groupOnly === true ? selectedGroup.value : null
  if ((group ? details.total : analysis.lineCount) > 20000) { toast.add({ title: '导出最多支持 20,000 条明细，请缩小创建时间范围', color: 'warning' }); return }
  exporting.value = true
  try {
    const filters = { ...appliedQuery, ...(group ? { groupCustomer: group.customerName, groupMpn: group.ctkMpn, groupUnit: group.unit || '' } : {}) }
    const url = domestic.value ? getDomesticQuotationAnalysisExportUrl(filters) : getQuotationAnalysisExportUrl(filters)
    await downloadFile(url, {}, domestic.value ? '内贸报价价格分析.xlsx' : '报价价格分析.xlsx', { method: 'GET', body: undefined, baseURL: '' })
  } finally { exporting.value = false }
}
onMounted(loadAnalysis)
onBeforeUnmount(() => { ++requestId; ++detailRequestId })
defineExpose({ loadAnalysis, analysisLoading: loading })
</script>
