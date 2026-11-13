<template>
  <div class="absolute inset-0 overflow-y-auto bg-app-bg p-4 text-app-text md:p-6">
    <div class="mx-auto flex max-w-[1800px] flex-col gap-4 pb-16">
      <header class="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-app-border bg-app-surface px-5 py-4 shadow-sm">
        <div>
          <div class="mb-1 flex items-center gap-2">
            <UBadge color="primary" variant="soft">生产管理</UBadge>
            <UBadge color="success" variant="soft">
              <span class="mr-1 inline-block size-1.5 rounded-full bg-emerald-500" />
              K3Cloud 实时数据
            </UBadge>
          </div>
          <h1 class="text-xl font-bold">生产订单列表</h1>
          <p class="mt-1 text-sm text-app-muted">创建代表业务转单，已审核代表投产；按日期和封装实时汇总</p>
        </div>
        <UButton icon="i-lucide-refresh-cw" :loading="loading || summaryLoading" @click="refreshAllData">
          刷新数据
        </UButton>
      </header>

      <section class="rounded-2xl border border-app-border bg-app-surface p-4 shadow-sm">
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-8">
          <UInput
            v-model="query.billNo"
            icon="i-lucide-file-text"
            placeholder="生产订单号"
            class="w-full"
            @keyup.enter="handleQuery"
          />
          <UInput
            v-model="query.material"
            icon="i-lucide-package-search"
            placeholder="物料编码或名称"
            class="w-full xl:col-span-2"
            @keyup.enter="handleQuery"
          />
          <USelect
            v-model="query.packageName"
            :items="packageOptions"
            value-key="value"
            label-key="label"
            class="w-full"
          />
          <USelect
            v-model="query.documentStatus"
            :items="documentStatusOptions"
            value-key="value"
            label-key="label"
            class="w-full"
          />
          <UPopover v-model:open="dateRangeOpen" :content="{ align: 'center' }">
                  <UButton color="neutral" variant="outline" icon="i-lucide-calendar" class="w-full min-w-[280px] font-normal w-full xl:col-span-2">
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
          <div class="flex gap-2">
            <UButton icon="i-lucide-search" class="flex-1 justify-center" @click="handleQuery">查询</UButton>
            <UButton color="neutral" variant="outline" icon="i-lucide-rotate-ccw" @click="resetQuery" />
          </div>
        </div>
      </section>

      <section class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div v-for="item in summaryCards" :key="item.label" class="rounded-xl border border-app-border bg-app-surface p-4 shadow-sm">
          <div class="flex items-center justify-between text-sm text-app-muted">
            <span>{{ item.label }}</span>
            <UIcon :name="item.icon" class="size-5" :class="item.color" />
          </div>
          <div class="mt-2 text-2xl font-bold tabular-nums">{{ item.value }}</div>
          <div v-if="item.help" class="mt-1 text-xs text-app-muted">{{ item.help }}</div>
        </div>
      </section>

      <section class="overflow-hidden rounded-2xl border border-app-border bg-app-surface shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-app-border px-4 py-3">
          <div>
            <span class="font-semibold">日期 / 封装汇总</span>
            <span class="ml-2 text-xs text-app-muted">{{ summaryRows.length }} 个组合 · {{ summarySourceRowCount }} 条订单明细</span>
          </div>
          <UBadge v-if="summaryTruncated" color="warning" variant="soft">数据量较大，已汇总前 20,000 行</UBadge>
        </div>

        <UTable :data="pagedSummaryRows" :columns="summaryColumns" :loading="summaryLoading" class="min-h-[280px]">
          <template #date-cell="{ row }">
            <span class="whitespace-nowrap font-mono font-semibold">{{ row.original.date }}</span>
          </template>
          <template #packageName-cell="{ row }">
            <UBadge color="neutral" variant="soft">{{ row.original.packageName }}</UBadge>
          </template>
          <template #created-cell="{ row }">
            <div class="min-w-[170px]">
              <div class="font-semibold text-amber-600 dark:text-amber-400">{{ formatQty(row.original.createdQty) }}</div>
              <div class="mt-1 text-xs text-app-muted">{{ row.original.createdOrderCount }} 张订单 · {{ row.original.createdLineCount }} 行</div>
            </div>
          </template>
          <template #approved-cell="{ row }">
            <div class="min-w-[170px]">
              <div class="font-semibold text-emerald-600 dark:text-emerald-400">{{ formatQty(row.original.approvedQty) }}</div>
              <div class="mt-1 text-xs text-app-muted">{{ row.original.approvedOrderCount }} 张订单 · {{ row.original.approvedLineCount }} 行</div>
            </div>
          </template>
          <template #empty>
            <div class="flex min-h-[220px] flex-col items-center justify-center text-app-muted">
              <UIcon name="i-lucide-chart-no-axes-combined" class="mb-3 size-10 opacity-40" />
              <p>当前条件下没有可汇总的生产订单</p>
            </div>
          </template>
        </UTable>
        <footer v-if="summaryRows.length > summaryPageSize" class="flex items-center justify-between border-t border-app-border px-4 py-3">
          <UButton color="neutral" variant="outline" icon="i-lucide-chevron-left" :disabled="summaryPage <= 1 || summaryLoading" @click="summaryPage--">
            上一页
          </UButton>
          <span class="text-sm text-app-muted">第 {{ summaryPage }} / {{ summaryPageCount }} 页</span>
          <UButton color="neutral" variant="outline" trailing-icon="i-lucide-chevron-right" :disabled="summaryPage >= summaryPageCount || summaryLoading" @click="summaryPage++">
            下一页
          </UButton>
        </footer>
      </section>

      <section class="overflow-hidden rounded-2xl border border-app-border bg-app-surface shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-app-border px-4 py-3">
          <div>
            <span class="font-semibold">订单明细</span>
            <span class="ml-2 text-xs text-app-muted">第 {{ pageNum }} 页 · 本页 {{ rows.length }} 条</span>
          </div>
          <span class="text-xs text-app-muted">数据源：{{ source }}</span>
        </div>

        <UTable :data="rows" :columns="columns" :loading="loading" class="min-h-[420px]">
          <template #bill-cell="{ row }">
            <div class="min-w-[150px]">
              <div class="font-mono font-semibold text-primary">{{ row.original.billNo }}</div>
              <div class="mt-1 text-xs text-app-muted">第 {{ row.original.seq || '-' }} 行</div>
            </div>
          </template>

          <template #material-cell="{ row }">
            <div class="min-w-[260px]">
              <div class="font-medium">{{ row.original.materialName || '-' }}</div>
              <div class="mt-1 font-mono text-xs text-app-muted">{{ row.original.materialNumber || '-' }}</div>
              <div class="mt-1 max-w-[360px] truncate text-xs text-app-muted" :title="row.original.specification">
                {{ row.original.specification || '无规格信息' }}
              </div>
            </div>
          </template>

          <template #quantity-cell="{ row }">
            <div class="min-w-[240px] space-y-2 text-xs">
              <div class="grid grid-cols-3 gap-2 text-center">
                <div><div class="text-app-muted">订单</div><strong>{{ formatQty(row.original.qty) }}</strong></div>
                <div><div class="text-app-muted">汇报</div><strong class="text-blue-500">{{ formatQty(row.original.reportedQty) }}</strong></div>
                <div><div class="text-app-muted">入库</div><strong class="text-emerald-500">{{ formatQty(row.original.stockInQty) }}</strong></div>
              </div>
              <div class="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div class="h-full rounded-full bg-emerald-500 transition-all" :style="{ width: `${progress(row.original)}%` }" />
              </div>
            </div>
          </template>

          <template #status-cell="{ row }">
            <div class="flex min-w-[130px] flex-col items-start gap-1.5">
              <UBadge :color="documentStatusMeta(row.original.documentStatus).color" variant="soft">
                {{ documentStatusMeta(row.original.documentStatus).label }}
              </UBadge>
              <span class="text-xs text-app-muted">生产：{{ productionStatusMeta(row.original.status).label }}</span>
            </div>
          </template>

          <template #date-cell="{ row }">
            <div class="min-w-[150px] space-y-1 whitespace-nowrap font-mono text-xs">
              <div>创建：{{ formatDate(row.original.createDate) }}</div>
              <div>审核：{{ formatDate(row.original.approveDate) }}</div>
              <div class="text-app-muted">单据：{{ formatDate(row.original.date) }}</div>
            </div>
          </template>

          <template #empty>
            <div class="flex min-h-[320px] flex-col items-center justify-center text-app-muted">
              <UIcon name="i-lucide-clipboard-list" class="mb-3 size-12 opacity-40" />
              <p>当前条件下没有生产订单</p>
            </div>
          </template>
        </UTable>

        <Pagination
          v-show="summarySourceRowCount > 0"
          v-model:page="pageNum"
          v-model:limit="pageSize"
          :total="summarySourceRowCount"
          :page-sizes="[10, 20, 50, 100]"
          :auto-scroll="false"
          class="border-t border-app-border bg-transparent"
          @pagination="loadData"
        />
      </section>
    </div>
  </div>
</template>

<script setup>
const toast = useToast()
const loading = ref(false)
const summaryLoading = ref(false)
const rows = ref([])
const summaryRows = ref([])
const summaryTotals = ref({})
const summarySourceRowCount = ref(0)
const summaryTruncated = ref(false)
const summaryPage = ref(1)
const summaryPageSize = 50
const pageNum = ref(1)
const pageSize = ref(10)
const source = ref('K3Cloud / PRD_MO')
const packageOptions = ref([{ label: '全部封装', value: 'all' }])

const documentStatusOptions = [
  { label: '全部单据状态', value: 'all' },
  { label: '业务转单（创建）', value: 'A' },
  { label: '已投产（已审核）', value: 'C' },
  { label: '审核中', value: 'B' },
  { label: '暂存', value: 'Z' }
]

const productionStatusMap = {
  1: { label: '计划', color: 'neutral' },
  2: { label: '计划确认', color: 'info' },
  3: { label: '下达', color: 'primary' },
  4: { label: '开工', color: 'warning' },
  5: { label: '完工', color: 'success' },
  6: { label: '结案', color: 'success' },
  7: { label: '结算', color: 'neutral' }
}

const documentStatusMap = {
  Z: { label: '暂存', color: 'neutral' },
  A: { label: '业务转单', color: 'warning' },
  B: { label: '审核中', color: 'info' },
  C: { label: '已投产', color: 'success' },
  D: { label: '重新审核', color: 'warning' }
}

const columns = [
  { accessorKey: 'bill', header: '生产订单' },
  { accessorKey: 'material', header: '物料信息' },
  { accessorKey: 'quantity', header: '数量进度' },
  { accessorKey: 'status', header: '订单状态' },
  { accessorKey: 'date', header: '业务时点' }
]

const summaryColumns = [
  { accessorKey: 'date', header: '订单日期' },
  { accessorKey: 'packageName', header: '封装' },
  { accessorKey: 'created', header: '当天创建 / 业务转单' },
  { accessorKey: 'approved', header: '当天审核 / 投产' }
]

const summaryPageCount = computed(() => Math.max(1, Math.ceil(summaryRows.value.length / summaryPageSize)))
const pagedSummaryRows = computed(() => {
  const start = (summaryPage.value - 1) * summaryPageSize
  return summaryRows.value.slice(start, start + summaryPageSize)
})

function toDateInput(date) {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

function defaultQuery() {
  const today = new Date()
  const todayInput = toDateInput(today)
  return {
    billNo: '',
    material: '',
    packageName: 'all',
    documentStatus: 'all',
    beginDate: todayInput,
    endDate: todayInput
  }
}

const query = reactive(defaultQuery())

const dateRange = computed({
  get: () => (query.beginDate && query.endDate ? [query.beginDate, query.endDate] : []),
  set: (value) => {
    query.beginDate = value?.[0] || ''
    query.endDate = value?.[1] || ''
  }
})


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
const summaryCards = computed(() => [
  { label: '业务转单订单', value: Number(summaryTotals.value.createdOrderCount || 0).toLocaleString('zh-CN'), help: '金蝶单据状态：创建', icon: 'i-lucide-file-input', color: 'text-amber-500' },
  { label: '业务转单数量', value: formatQty(summaryTotals.value.createdQty), help: '尚未审核投产', icon: 'i-lucide-package-plus', color: 'text-orange-500' },
  { label: '已投产订单', value: Number(summaryTotals.value.approvedOrderCount || 0).toLocaleString('zh-CN'), help: '金蝶单据状态：已审核', icon: 'i-lucide-badge-check', color: 'text-emerald-500' },
  { label: '已投产数量', value: formatQty(summaryTotals.value.approvedQty), help: '已审核生产订单数量', icon: 'i-lucide-factory', color: 'text-green-500' }
])

function formatQty(value) {
  return Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 3 })
}

function formatDate(value) {
  if (!value) return '-'
  return String(value).slice(0, 10)
}

function productionStatusMeta(value) {
  return productionStatusMap[String(value)] || { label: value || '未知', color: 'neutral' }
}

function documentStatusMeta(value) {
  return documentStatusMap[String(value)] || { label: value || '未知', color: 'neutral' }
}

function progress(row) {
  const qty = Number(row.qty || 0)
  if (qty <= 0) return 0
  return Math.min(100, Math.max(0, (Number(row.stockInQty || 0) / qty) * 100))
}

async function loadData() {
  loading.value = true
  try {
    const response = await listProductionOrders({
      ...query,
      packageName: query.packageName === 'all' ? undefined : query.packageName,
      documentStatus: query.documentStatus === 'all' ? undefined : query.documentStatus,
      pageNum: pageNum.value,
      pageSize: pageSize.value
    })
    if (response?.code !== 200) {
      throw new Error(response?.msg || '金蝶查询返回异常')
    }
    const data = response?.data || {}
    rows.value = Array.isArray(data.rows) ? data.rows : []
    source.value = data.source || 'K3Cloud / PRD_MO'
  } catch (error) {
    rows.value = []
    toast.add({
      title: '生产订单查询失败',
      description: error?.data?.msg || error?.message || '请检查金蝶连接',
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}

async function loadSummary() {
  summaryLoading.value = true
  try {
    const response = await summarizeProductionOrders({
      ...query,
      packageName: query.packageName === 'all' ? undefined : query.packageName,
      documentStatus: query.documentStatus === 'all' ? undefined : query.documentStatus
    })
    if (response?.code !== 200) {
      throw new Error(response?.msg || '金蝶汇总返回异常')
    }
    const data = response?.data || {}
    summaryRows.value = Array.isArray(data.rows) ? data.rows : []
    if (query.packageName === 'all') {
      const names = [...new Set(summaryRows.value.map(row => row.packageName).filter(Boolean))]
        .sort((a, b) => String(a).localeCompare(String(b), 'zh-CN'))
      packageOptions.value = [
        { label: '全部封装', value: 'all' },
        ...names.map(name => ({ label: name, value: name }))
      ]
    }
    summaryPage.value = 1
    summaryTotals.value = data.totals || {}
    summarySourceRowCount.value = Number(data.sourceRowCount || 0)
    summaryTruncated.value = Boolean(data.truncated)
  } catch (error) {
    summaryRows.value = []
    summaryPage.value = 1
    summaryTotals.value = {}
    summarySourceRowCount.value = 0
    summaryTruncated.value = false
    toast.add({
      title: '生产订单汇总失败',
      description: error?.data?.msg || error?.message || '请检查金蝶连接',
      color: 'error'
    })
  } finally {
    summaryLoading.value = false
  }
}

function refreshAllData() {
  return Promise.all([loadData(), loadSummary()])
}

function handleQuery() {
  pageNum.value = 1
  refreshAllData()
}

function resetQuery() {
  Object.assign(query, defaultQuery())
  handleQuery()
}

onMounted(refreshAllData)
</script>
