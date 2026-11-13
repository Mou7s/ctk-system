<template>
  <div
    class="app-container flex h-full min-h-0 flex-col overflow-auto bg-app-bg p-1.5 text-app-text transition-colors duration-350 ease-in-out md:overflow-hidden md:px-2 md:py-1.5"
  >
    <div class="mb-4 flex shrink-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 class="m-0 flex items-center gap-2 text-xl font-bold tracking-tight text-default">
          <UIcon name="i-lucide-warehouse" class="h-6 w-6 text-primary-500" />
          金蝶即时库存
        </h1>
        <div class="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
          <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500"></span>
          数据来自金蝶 STK_Inventory，即时读取当前库存（零库存行金蝶不返回，查不到≠没建料）
          <span v-if="queriedAt" class="ml-1 font-medium text-default">
            (最后查询: {{ queriedAt }})
          </span>
        </div>
      </div>

      <UButton
        size="sm"
        color="neutral"
        variant="outline"
        icon="i-lucide-refresh-cw"
        :loading="loading"
        class="hover:bg-default/5"
        @click="handleRefresh"
      >
        刷新
      </UButton>
    </div>

    <UAlert
      v-if="errorMessage"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      :title="errorMessage"
      class="mb-3 shrink-0"
    />

    <UAlert
      v-if="warehouseErrorMessage"
      color="error"
      variant="soft"
      icon="i-lucide-warehouse"
      :title="warehouseErrorMessage"
      class="mb-3 shrink-0"
      :actions="[{ label: '重试', color: 'error', variant: 'soft', click: loadWarehouseOptions }]"
    />

    <UAlert
      v-if="locationErrorMessage"
      color="error"
      variant="soft"
      icon="i-lucide-map-pin"
      :title="locationErrorMessage"
      class="mb-3 shrink-0"
      :actions="[{ label: '重试', color: 'error', variant: 'soft', click: () => loadLocationOptions(true) }]"
    />

    <UAlert
      v-if="truncated"
      color="warning"
      variant="soft"
      icon="i-lucide-triangle-alert"
      title="本次查询结果超过安全上限，只展示已返回的部分库存，请缩小筛选范围后重试。"
      class="mb-3 shrink-0"
    />

    <div class="mb-3 flex shrink-0 flex-wrap items-center gap-2">
      <div class="flex items-center gap-1.5 rounded-lg border border-blue-200/60 bg-blue-500/[0.03] px-2.5 py-1 text-xs dark:border-blue-500/20 dark:bg-blue-500/[0.02]">
        <UIcon name="i-lucide-warehouse" class="h-3.5 w-3.5 text-blue-500" />
        <span class="text-muted">库存明细:</span>
        <strong class="font-bold tabular-nums text-blue-700 dark:text-blue-400">{{ summary.lineCount || 0 }}条</strong>
      </div>
      <div class="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-500/[0.03] px-2.5 py-1 text-xs dark:border-zinc-500/20">
        <UIcon name="i-lucide-list" class="h-3.5 w-3.5 text-zinc-500" />
        <span class="text-muted">物料:</span>
        <strong class="font-bold tabular-nums text-zinc-700 dark:text-zinc-300">{{ summary.materialCount || 0 }}种</strong>
      </div>
      <UCheckbox v-model="queryParams.availableOnly" label="仅看有可用量" class="ml-auto" />
    </div>

    <TkSearchPanel
      :model="queryParams"
      :panel-class="'!mb-3 !shrink-0 !gap-2.5 !rounded-xl !border !border-[var(--app-border)] !bg-[var(--app-surface)] !p-2.5 !shadow-sm !relative !overflow-hidden'"
    >
      <div class="pointer-events-none absolute left-0 right-0 top-0 h-[2px] bg-gradient-to-r from-primary-500/50 via-blue-500/50 to-emerald-500/50"></div>
      <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <UInput
          v-model="queryParams.material"
          placeholder="物料编码"
          icon="i-lucide-hash"
          clearable
          class="w-full"
          @keyup.enter="handleQuery"
        />
        <UInput
          v-model="queryParams.materialName"
          placeholder="物料名称"
          icon="i-lucide-box"
          clearable
          class="w-full"
          @keyup.enter="handleQuery"
        />
        <UInput
          v-model="queryParams.specification"
          placeholder="规格型号"
          icon="i-lucide-layers"
          clearable
          class="w-full"
          @keyup.enter="handleQuery"
        />
        <USelectMenu
          v-model="queryParams.stock"
          :items="warehouseOptions"
          value-key="value"
          label-key="label"
          placeholder="全部仓库"
          icon="i-lucide-warehouse"
          multiple
          clearable
          :loading="warehouseLoading"
          class="w-full"
          @update:open="handleWarehouseOpen"
          @update:model-value="handleWarehouseChange"
        />
        <USelectMenu
          v-model="queryParams.location"
          :items="locationOptions"
          value-key="value"
          label-key="label"
          placeholder="全部库位"
          icon="i-lucide-map-pin"
          multiple
          clearable
          :loading="locationLoading"
          class="w-full"
          @update:open="handleLocationOpen"
        />
        <div class="flex gap-2">
          <UButton
            variant="outline"
            icon="i-lucide-rotate-ccw"
            class="flex-1 justify-center text-muted hover:bg-default/5 hover:text-default"
            @click="handleReset"
          >
            重置
          </UButton>
          <UButton
            color="primary"
            icon="i-lucide-search"
            :loading="loading"
            class="flex-1 justify-center font-medium shadow-sm"
            @click="handleQuery"
          >
            搜索
          </UButton>
        </div>
      </div>
    </TkSearchPanel>

    <div class="mb-0 flex min-h-[420px] flex-none flex-col overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] md:flex-1 md:min-h-0">
      <div class="min-h-0 flex-1 overflow-auto">
        <TkUTable
          sticky
          :loading="loading"
          :data="inventoryList"
          :columns="columns"
          :interactive="false"
          class="inventory-table flex-1"
        >
          <template #materialNumber-cell="{ row }">
            <span class="font-mono font-medium">{{ row.original.materialNumber || '—' }}</span>
          </template>
          <template #materialName-cell="{ row }">
            <span class="whitespace-nowrap">{{ row.original.materialName || '—' }}</span>
          </template>
          <template #lotNumber-cell="{ row }">
            <span class="whitespace-nowrap font-mono">{{ row.original.lotNumber || '—' }}</span>
          </template>
          <template #baseQty-cell="{ row }">
            <span :class="getStockClass(row.original.baseQty)">{{ formatQty(row.original.baseQty) }}</span>
          </template>
          <template #availableQty-cell="{ row }">
            <span :class="getStockClass(row.original.availableQty)">{{ formatQty(row.original.availableQty) }}</span>
          </template>
          <template #lockedQty-cell="{ row }">
            <span class="font-mono tabular-nums">{{ formatQty(row.original.lockedQty) }}</span>
          </template>
          <template #stockStatusName-cell="{ row }">
            <span :class="row.original.stockStatusName === '可用' ? 'text-emerald-600 dark:text-emerald-400' : 'text-[#dc2626]'">
              {{ row.original.stockStatusName || '—' }}
            </span>
          </template>
          <template #empty>
            <UEmpty
              :description="hasQueried ? '暂无符合条件的金蝶库存（零库存行金蝶不返回），请调整筛选条件后重试' : '请输入筛选条件后点击搜索，即时读取金蝶当前库存'"
              :image-size="88"
            />
          </template>
        </TkUTable>
      </div>
    </div>

    <div v-if="total > 0" class="shrink-0">
      <TkPagination
        v-model:page="queryParams.pageNum"
        v-model:page-size="queryParams.pageSize"
        :total="total"
        :page-sizes="[20, 50, 100]"
        class="kingdee-stock-pagination"
        @pagination="getList"
      />
    </div>
  </div>
</template>

<script setup name="KingdeeInventory">
import { onMounted, ref } from 'vue'
import { useTkListQuery } from '@ctk-system/composables'
import { TkPagination, TkSearchPanel, TkUTable } from '@ctk-system/ui'
import { listKingdeeInventory, listKingdeeLocations, listKingdeeWarehouses } from '@/api/tk_custom/stockDocument'

const queryParams = ref({
  pageNum: 1,
  pageSize: 50,
  material: '',
  materialName: '',
  specification: '',
  stock: [],
  location: [],
  availableOnly: false
})

const summary = ref({ lineCount: 0, materialCount: 0 })
const queriedAt = ref('')
const truncated = ref(false)
const errorMessage = ref('')
const warehouseErrorMessage = ref('')
const warehouseLoading = ref(false)
const warehouseOptions = ref([])
const locationLoading = ref(false)
const locationOptions = ref([])
const locationErrorMessage = ref('')
const locationScope = ref('')
const hasQueried = ref(false)

const columns = [
  {
    accessorKey: 'materialNumber',
    header: '物料编码',
    meta: { class: { th: 'whitespace-nowrap', td: 'whitespace-nowrap' } }
  },
  {
    accessorKey: 'materialName',
    header: '物料名称',
    meta: { class: { th: 'whitespace-nowrap', td: 'whitespace-nowrap' } }
  },
  {
    accessorKey: 'specification',
    header: '规格型号',
    meta: { class: { th: 'whitespace-nowrap', td: 'whitespace-nowrap' } }
  },
  {
    accessorKey: 'unitName',
    header: '单位',
    meta: { class: { th: 'whitespace-nowrap', td: 'whitespace-nowrap' } }
  },
  {
    accessorKey: 'stockName',
    header: '仓库',
    meta: { class: { th: 'whitespace-nowrap', td: 'whitespace-nowrap' } }
  },
  {
    accessorKey: 'stockLocationName',
    header: '库位',
    meta: { class: { th: 'whitespace-nowrap', td: 'whitespace-nowrap' } }
  },
  {
    accessorKey: 'lotNumber',
    header: '批次',
    meta: { class: { th: 'whitespace-nowrap', td: 'whitespace-nowrap' } }
  },
  {
    accessorKey: 'baseQty',
    header: '账面量',
    meta: {
      class: {
        th: 'min-w-[130px] whitespace-nowrap text-right',
        td: 'whitespace-nowrap text-right'
      }
    }
  },
  {
    accessorKey: 'availableQty',
    header: '可用量',
    meta: {
      class: {
        th: 'min-w-[130px] whitespace-nowrap text-right',
        td: 'whitespace-nowrap text-right'
      }
    }
  },
  {
    accessorKey: 'lockedQty',
    header: '锁定量',
    meta: {
      class: {
        th: 'min-w-[110px] whitespace-nowrap text-right',
        td: 'whitespace-nowrap text-right'
      }
    }
  },
  {
    accessorKey: 'stockStatusName',
    header: '库存状态',
    meta: { class: { th: 'whitespace-nowrap', td: 'whitespace-nowrap' } }
  }
]

const { loading, list: inventoryList, total, getList, handleQuery } = useTkListQuery({
  queryParams,
  fetchList: async () => {
    errorMessage.value = ''
    hasQueried.value = true
    try {
      const stockParam = Array.isArray(queryParams.value.stock)
        ? queryParams.value.stock.map((item) => (typeof item === 'object' && item ? item.value : item)).filter(Boolean).join(',')
        : queryParams.value.stock
      const locationParam = Array.isArray(queryParams.value.location)
        ? queryParams.value.location.map((item) => (typeof item === 'object' && item ? item.value : item)).filter(Boolean).join(',')
        : queryParams.value.location
      const response = await listKingdeeInventory({
        ...queryParams.value,
        stock: stockParam,
        location: locationParam
      })
      const payload = response?.data && typeof response.data === 'object' ? response.data : response
      summary.value = payload?.summary || { lineCount: 0, materialCount: 0 }
      queriedAt.value = payload?.queriedAt || ''
      truncated.value = Boolean(payload?.truncated)
      return {
        rows: Array.isArray(payload?.rows) ? payload.rows : [],
        total: Number(payload?.total) || 0
      }
    } catch (error) {
      summary.value = { lineCount: 0, materialCount: 0 }
      queriedAt.value = ''
      truncated.value = false
      errorMessage.value = error?.message || '金蝶即时库存查询失败，请稍后重试。'
      return { rows: [], total: 0 }
    }
  }
})

function handleReset() {
  queryParams.value.pageNum = 1
  queryParams.value.material = ''
  queryParams.value.materialName = ''
  queryParams.value.specification = ''
  queryParams.value.stock = []
  queryParams.value.location = []
  queryParams.value.availableOnly = false
  inventoryList.value = []
  total.value = 0
  summary.value = { lineCount: 0, materialCount: 0 }
  queriedAt.value = ''
  truncated.value = false
  errorMessage.value = ''
  hasQueried.value = false
}

function selectedOptionValues(selection) {
  if (!Array.isArray(selection)) return []
  return selection.map((item) => (typeof item === 'object' && item ? item.value : item)).filter(Boolean)
}

function handleWarehouseChange() {
  // 仓库范围变了，已加载的库位选项失效；下次打开库位下拉时按新范围重载。
  // 这里不自动查询，等用户点搜索，避免多选时连击金蝶。
  locationScope.value = ''
  locationOptions.value = []
}

async function loadWarehouseOptions() {
  warehouseLoading.value = true
  warehouseErrorMessage.value = ''
  try {
    const response = await listKingdeeWarehouses()
    const payload = response?.data && typeof response.data === 'object' ? response.data : response
    const items = Array.isArray(payload) ? payload : []
    warehouseOptions.value = items.filter((item) => item?.value).map((item) => ({
      label: item.label || item.value,
      value: item.value
    }))
  } catch (error) {
    warehouseOptions.value = []
    warehouseErrorMessage.value = error?.message || '金蝶仓库列表加载失败，请稍后重试。'
  } finally {
    warehouseLoading.value = false
  }
}

async function loadLocationOptions(force = false) {
  const scope = selectedOptionValues(queryParams.value.stock).sort().join(',')
  if (!force && scope === locationScope.value && locationOptions.value.length) return
  locationLoading.value = true
  locationErrorMessage.value = ''
  try {
    const response = await listKingdeeLocations(scope ? { stock: scope } : undefined)
    const payload = response?.data && typeof response.data === 'object' ? response.data : response
    const items = Array.isArray(payload) ? payload : []
    locationOptions.value = items.filter((item) => item?.value).map((item) => ({
      label: item.label || item.value,
      value: item.value
    }))
    locationScope.value = scope
  } catch (error) {
    locationOptions.value = []
    locationErrorMessage.value = error?.message || '金蝶库位列表加载失败，请稍后重试。'
  } finally {
    locationLoading.value = false
  }
}

function handleWarehouseOpen(open) {
  if (open && !warehouseOptions.value.length && !warehouseLoading.value) {
    loadWarehouseOptions()
  }
}

function handleLocationOpen(open) {
  if (open && !locationLoading.value) {
    const scope = selectedOptionValues(queryParams.value.stock).sort().join(',')
    if (!locationOptions.value.length || scope !== locationScope.value) {
      loadLocationOptions(true)
    }
  }
}

function handleRefresh() {
  // 首屏未查过时刷新等同于搜索；查过后刷新保持当前页。
  if (!hasQueried.value) return handleQuery()
  return getList()
}

function formatQty(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 6 }).format(number)
}

function getStockClass(value) {
  const number = Number(value)
  const base = 'font-mono font-semibold tabular-nums'
  if (number < 0) return `${base} text-[#dc2626]`
  if (number === 0) return `${base} font-medium text-[var(--app-page-text-muted)]`
  return `${base} text-[var(--app-link-color)]`
}

onMounted(() => {
  // 打开页自动查全量即时库存；仓库是小主数据可并行预加载，
  // 库位依赖 STK_Inventory，等用户打开下拉时按已选仓库范围懒加载。
  loadWarehouseOptions()
  getList()
})
</script>

<style scoped>
.kingdee-stock-pagination {
  padding-top: 16px !important;
  padding-bottom: 16px !important;
}
</style>
