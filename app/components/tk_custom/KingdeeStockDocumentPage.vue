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
          <h1 class="text-xl font-bold">{{ pageTitle }}</h1>
          <p class="mt-1 text-sm text-app-muted">{{ pageDescription }}</p>
        </div>
      </header>

      <section class="rounded-2xl border border-app-border bg-app-surface p-5 shadow-sm space-y-3">
        <!-- 第一行：核心关键字搜索 (4列等分) -->
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <UInput v-model="query.billNo" icon="i-lucide-file-text" :placeholder="billPlaceholder" class="w-full" @keyup.enter="handleQuery" />
          <UInput v-model="query.material" icon="i-lucide-package-search" placeholder="物料编码或名称" class="w-full" @keyup.enter="handleQuery" />
          <UInput v-model="query.packageName" icon="i-lucide-tags" placeholder="规格前缀（如 SOD-323 / SOT23）" title="按物料规格前缀匹配；SOT-23 与 SOT23 两种写法需分别查" class="w-full" @keyup.enter="handleQuery" />
          <UInput v-model="query.relatedParty" :icon="relatedIcon" :placeholder="relatedPlaceholder" class="w-full" @keyup.enter="handleQuery" />
        </div>

        <!-- 第二行：仓库 / 单据状态 / 日期范围 / 操作按钮同一行，宽屏不换行，窄屏自动换行 -->
        <div class="flex flex-wrap items-center gap-3">
          <UInput v-model="query.stock" icon="i-lucide-warehouse" placeholder="仓库编码或名称" class="w-full sm:w-52 lg:w-56" @keyup.enter="handleQuery" />
          <USelect v-model="query.documentStatus" :items="documentStatusOptions" value-key="value" label-key="label" class="w-full sm:w-40 lg:w-44" />
          <div class="min-w-0 flex-1 basis-64 lg:max-w-[360px]">
            <TkDateRangePicker v-model="dateRange" class="w-full" />
          </div>
          <div class="ml-auto flex flex-wrap items-center gap-2">
            <UButton icon="i-lucide-search" color="primary" size="md" class="whitespace-nowrap px-5 font-medium shadow-sm" @click="handleQuery">查询</UButton>
            <UButton icon="i-lucide-rotate-ccw" color="neutral" variant="outline" size="md" class="whitespace-nowrap px-4 font-medium" @click="resetQuery">重置</UButton>
            <UButton v-if="type === 'productionReceipt' || type === 'salesOutbound'" icon="i-lucide-file-spreadsheet" color="success" variant="soft" size="md" class="whitespace-nowrap px-4 font-medium ring-1 ring-inset ring-emerald-600/20" :loading="exporting" :title="exportButtonTitle" @click="handleExportMatrix">
              {{ exportButtonLabel }}
            </UButton>
          </div>
        </div>
      </section>

      <div v-if="truncated" class="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
        {{ truncatedBadgeText(truncated) }}
      </div>

      <section class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div v-for="item in summaryCards" :key="item.label" class="rounded-xl border border-app-border bg-app-surface p-4 shadow-sm">
          <div class="flex items-center justify-between text-sm text-app-muted">
            <span>{{ item.label }}</span>
            <UIcon :name="item.icon" class="size-5" :class="item.color" />
          </div>
          <div class="mt-2 text-2xl font-bold tabular-nums">{{ item.value }}</div>
          <div class="mt-1 text-xs text-app-muted">{{ item.help }}</div>
        </div>
      </section>

      <section class="overflow-hidden rounded-2xl border border-app-border bg-app-surface shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-app-border px-4 py-3">
          <div>
            <span class="font-semibold">{{ pageTitle }}明细</span>
            <span class="ml-2 text-xs text-app-muted">第 {{ pageNum }} 页 · 本页 {{ rows.length }} 条 · 共 {{ total.toLocaleString('zh-CN') }} 行{{ truncated ? '（已截断）' : '' }}</span>
          </div>
          <div class="flex items-center gap-2">
            <UBadge v-if="truncated" color="warning" variant="soft">{{ truncatedBadgeText(truncated) }}</UBadge>
            <span class="text-xs text-app-muted">{{ source }}</span>
          </div>
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
            <strong class="font-mono text-base text-primary">{{ formatQty(row.original.qty) }}</strong>
          </template>
          <template #related-cell="{ row }">
            <div class="min-w-[180px]">
              <div class="font-medium">{{ row.original.relatedName || row.original.relatedNumber || '-' }}</div>
              <div v-if="row.original.relatedName" class="mt-1 font-mono text-xs text-app-muted">{{ row.original.relatedNumber }}</div>
            </div>
          </template>
          <template #stock-cell="{ row }">
            <div class="min-w-[150px]">
              <div>{{ row.original.stockName || '-' }}</div>
              <div class="mt-1 font-mono text-xs text-app-muted">{{ row.original.stockNumber || '-' }}</div>
              <template v-if="!isSalesOutbound && (row.original.stockLocationName || row.original.stockLocationNumber)">
                <div class="mt-1 text-xs text-primary">{{ row.original.stockLocationName || '-' }}</div>
                <div class="mt-1 font-mono text-xs text-app-muted">仓位 {{ row.original.stockLocationNumber || '-' }}</div>
              </template>
            </div>
          </template>
          <template #status-cell="{ row }">
            <UBadge :color="documentStatusMeta(row.original.documentStatus).color" variant="soft">
              {{ documentStatusMeta(row.original.documentStatus).label }}
            </UBadge>
          </template>
          <template #date-cell="{ row }">
            <div class="min-w-[150px] space-y-1 whitespace-nowrap font-mono text-xs">
              <div>单据：{{ formatDate(row.original.date) }}</div>
              <div class="text-app-muted">审核：{{ formatDate(row.original.approveDate) }}</div>
            </div>
          </template>
          <template #empty>
            <div class="flex min-h-[320px] flex-col items-center justify-center text-app-muted">
              <UIcon name="i-lucide-warehouse" class="mb-3 size-12 opacity-40" />
              <p>当前条件下没有{{ pageTitle }}</p>
            </div>
          </template>
        </UTable>

        <Pagination
          v-show="total > 0"
          v-model:page="pageNum"
          v-model:limit="pageSize"
          :total="total"
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
import { listProductionReceipt, listSalesOutbound, exportProductionReceiptMatrix, exportSalesOutboundMatrix } from '@/api/tk_custom/stockDocument'
import { readBlobErrorMessage } from '@/utils/blob-download'
import { matrixExportFileName, summaryQuantityHelp, truncatedBadgeText } from '@/utils/stock-document-view'

const props = defineProps({
  type: {
    type: String,
    required: true,
    validator: value => ['salesOutbound', 'productionReceipt'].includes(value)
  }
})

const toast = useToast()
const loading = ref(false)
const exporting = ref(false)
const rows = ref([])
const total = ref(0)
const truncated = ref(false)
const summary = ref({})
const source = ref('K3Cloud')

async function handleExportMatrix() {
  const isSales = isSalesOutbound.value
  const prefix = isSales ? '成品出库明细表' : '成品入库明细表'
  try {
    exporting.value = true
    // 与屏幕筛选条件一致（单据状态由服务端固定为已审核，不参与透传）
    const params = { ...query }
    delete params.documentStatus
    const requestFn = isSales ? exportSalesOutboundMatrix : exportProductionReceiptMatrix
    const res = await requestFn(params)
    const failure = await readBlobErrorMessage(res, `${prefix}导出失败，请检查金蝶连接或稍后重试`)
    if (failure) throw new Error(failure)
    const blob = new Blob([res], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = matrixExportFileName(params.beginDate, prefix)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(link.href)
    toast.add({ title: '导出成功', description: `${prefix}（矩阵样式）已开始下载`, color: 'success' })
  } catch (err) {
    console.error('Failed to export matrix excel', err)
    toast.add({ title: '导出失败', description: err.message || '导出明细表失败', color: 'error' })
  } finally {
    exporting.value = false
  }
}
const pageNum = ref(1)
const pageSize = ref(10)

const isSalesOutbound = computed(() => props.type === 'salesOutbound')
const pageTitle = computed(() => isSalesOutbound.value ? '销售出库单' : '生产入库单')
const exportButtonLabel = computed(() => isSalesOutbound.value ? '导出成品出库明细表' : '导出成品入库明细表（已审核·按月）')
const exportButtonTitle = computed(() => isSalesOutbound.value
  ? '按当前筛选条件导出成品出库矩阵表'
  : '按当前筛选条件导出，仅含已审核入库，按单月生成矩阵表')
const pageDescription = computed(() => isSalesOutbound.value
  ? '实时查询金蝶销售出库单、客户、实发数量和出库仓库'
  : '实时查询金蝶生产入库单、来源生产订单、实收数量、塑封成品仓及封装仓位')
const billPlaceholder = computed(() => isSalesOutbound.value ? '销售出库单号' : '生产入库单号')
const relatedPlaceholder = computed(() => isSalesOutbound.value ? '客户编码或名称' : '生产订单号')
const relatedIcon = computed(() => isSalesOutbound.value ? 'i-lucide-building-2' : 'i-lucide-factory')

const documentStatusOptions = [
  { label: '全部单据状态', value: 'all' },
  { label: '已审核', value: 'C' },
  { label: '重新审核', value: 'D' },
  { label: '创建', value: 'A' },
  { label: '审核中', value: 'B' },
  { label: '暂存', value: 'Z' }
]

const documentStatusMap = {
  Z: { label: '暂存', color: 'neutral' },
  A: { label: '创建', color: 'warning' },
  B: { label: '审核中', color: 'info' },
  C: { label: '已审核', color: 'success' },
  D: { label: '重新审核', color: 'warning' }
}

const columns = computed(() => [
  { accessorKey: 'bill', header: pageTitle.value },
  { accessorKey: 'material', header: '物料信息' },
  { accessorKey: 'quantity', header: isSalesOutbound.value ? '实发数量' : '实收数量' },
  { accessorKey: 'related', header: isSalesOutbound.value ? '客户' : '生产订单' },
  { accessorKey: 'stock', header: isSalesOutbound.value ? '出库仓库' : '入库仓库 / 封装仓位' },
  { accessorKey: 'status', header: '单据状态' },
  { accessorKey: 'date', header: '业务时间' }
])

const summaryCards = computed(() => {
  const quantityHelp = summaryQuantityHelp(truncated.value)
  const quantityLabel = isSalesOutbound.value ? '实发总数' : '实收总数'
  return [
    { label: `${pageTitle.value}数量`, value: Number(summary.value.billCount || 0).toLocaleString('zh-CN'), help: truncated.value ? '按单据号去重（截断口径）' : '按单据号去重', icon: 'i-lucide-files', color: 'text-blue-500' },
    { label: '明细行数', value: Number(summary.value.lineCount || 0).toLocaleString('zh-CN'), help: quantityHelp, icon: 'i-lucide-list', color: 'text-cyan-500' },
    { label: truncated.value ? `${quantityLabel}（截断口径）` : quantityLabel, value: formatQty(summary.value.totalQty), help: quantityHelp, icon: 'i-lucide-package-check', color: 'text-amber-500' },
    { label: '已审核数量', value: formatQty(summary.value.approvedQty), help: `${Number(summary.value.approvedBillCount || 0).toLocaleString('zh-CN')} 张已审核单据`, icon: 'i-lucide-badge-check', color: 'text-emerald-500' }
  ]
})

function toDateInput(date) {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

function defaultQuery() {
  const now = new Date()
  const firstDayOfMonth = toDateInput(new Date(now.getFullYear(), now.getMonth(), 1))
  const today = toDateInput(now)
  return {
    billNo: '',
    material: '',
    packageName: '',
    relatedParty: '',
    stock: '',
    documentStatus: 'all',
    beginDate: firstDayOfMonth,
    endDate: today
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

function formatQty(value) {
  return Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 3 })
}

function formatDate(value) {
  return value ? String(value).slice(0, 10) : '-'
}

function documentStatusMeta(value) {
  return documentStatusMap[String(value)] || { label: value || '未知', color: 'neutral' }
}

async function loadData() {
  loading.value = true
  try {
    const request = isSalesOutbound.value ? listSalesOutbound : listProductionReceipt
    const response = await request({
      ...query,
      documentStatus: query.documentStatus === 'all' ? undefined : query.documentStatus,
      pageNum: pageNum.value,
      pageSize: pageSize.value
    })
    if (response?.code !== 200) throw new Error(response?.msg || '金蝶查询返回异常')
    const data = response?.data || {}
    rows.value = Array.isArray(data.rows) ? data.rows : []
    total.value = Number(data.total || 0)
    summary.value = data.summary || {}
    truncated.value = Boolean(data.truncated)
    source.value = data.source || 'K3Cloud'
  } catch (error) {
    rows.value = []
    total.value = 0
    summary.value = {}
    truncated.value = false
    toast.add({
      title: `${pageTitle.value}查询失败`,
      description: error?.data?.msg || error?.message || '请检查金蝶连接',
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}

function handleQuery() {
  pageNum.value = 1
  loadData()
}

function resetQuery() {
  Object.assign(query, defaultQuery())
  handleQuery()
}

onMounted(loadData)
</script>
