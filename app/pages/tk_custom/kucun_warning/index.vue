<template>
  <div class="app-container p-6 space-y-6 bg-gray-50 dark:bg-gray-900 absolute inset-0 overflow-y-auto">
    <!-- 头部 -->
    <UCard shadow="never" class="border border-gray-200/80 dark:border-gray-800 rounded-2xl shadow-sm">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="space-y-1">
          <h2 class="text-xl md:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <UIcon name="i-lucide-sliders-horizontal" class="text-primary-500 size-6" />
            金蝶库存预警中心
          </h2>
          <p class="text-xs md:text-sm text-gray-500 dark:text-gray-400">
            从金蝶只读刷新 · 本地快照秒开
            <span v-if="lastSyncTime" class="ml-1 text-primary-500">（最近同步：{{ lastSyncTime }}）</span>
          </p>
        </div>
      </div>
    </UCard>

    <!-- 统计卡片 -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div class="flex items-center p-5 bg-white dark:bg-gray-800 border border-gray-200/60 dark:border-gray-800 rounded-2xl shadow-sm border-l-4 border-l-amber-500">
        <div class="flex items-center justify-center w-12 h-12 rounded-xl mr-4 bg-amber-500/10 text-amber-500">
          <UIcon name="i-lucide-bell" class="size-6" />
        </div>
        <div class="flex flex-col">
          <span class="text-xs text-gray-400 dark:text-gray-500 mb-1">库存偏低 (安全库存以下)</span>
          <span class="text-2xl font-bold text-gray-900 dark:text-white">{{ stats.belowSafe }}</span>
        </div>
      </div>
      <div class="flex items-center p-5 bg-white dark:bg-gray-800 border border-gray-200/60 dark:border-gray-800 rounded-2xl shadow-sm border-l-4 border-l-emerald-500">
        <div class="flex items-center justify-center w-12 h-12 rounded-xl mr-4 bg-emerald-500/10 text-emerald-500">
          <UIcon name="i-lucide-circle-check" class="size-6" />
        </div>
        <div class="flex flex-col">
          <span class="text-xs text-gray-400 dark:text-gray-500 mb-1">库存状态正常</span>
          <span class="text-2xl font-bold text-gray-900 dark:text-white">{{ stats.normal }}</span>
        </div>
      </div>
    </div>

    <!-- 筛选 -->
    <TkSearchPanel
      :model="queryParams"
      :show-search="true"
      class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden"
    >
      <div class="px-5 py-4 w-full">
        <UForm :state="queryParams" class="flex flex-col sm:flex-row sm:items-end gap-4 flex-wrap w-full">
          <UFormField label="物料" name="keyword" class="text-sm font-semibold">
            <UInput
              v-model="queryParams.keyword"
              placeholder="编码或名称"
              clearable
              class="w-full sm:w-56"
              @keyup.enter="handleQuery"
            />
          </UFormField>
          <UFormField label="预警状态" name="status" class="text-sm font-semibold">
            <USelect
              v-model="queryParams.status"
              placeholder="全部状态"
              clearable
              class="w-full sm:w-48"
              :items="statusSelectOptions"
            />
          </UFormField>
          <UFormField label="类别" name="category" class="text-sm font-semibold">
            <USelect
              v-model="queryParams.category"
              placeholder="全部类别"
              clearable
              class="w-full sm:w-36"
              :items="categoryOptions"
            />
          </UFormField>
          <div class="flex items-center gap-2 sm:ml-auto pb-0.5">
            <UButton color="primary" icon="i-lucide-search" @click="handleQuery">搜索</UButton>
            <UButton color="neutral" variant="outline" icon="i-lucide-refresh-cw" @click="resetQuery">重置</UButton>
          </div>
        </UForm>
      </div>
    </TkSearchPanel>

    <!-- 工具栏 -->
    <TkToolbar class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-800 px-4 py-3 shadow-sm mb-0">
      <div class="flex flex-wrap items-center gap-2">
        <UButton color="primary" variant="subtle" icon="i-lucide-plus" @click="handleOpenEnableDialog">
          新增预警
        </UButton>
        <UButton color="warning" variant="subtle" icon="i-lucide-clock" @click="handleOpenJobDialog">
          定时播报设置
        </UButton>
        <UButton color="primary" variant="subtle" icon="i-lucide-message-circle" @click="handleOpenPushDialog">
          发送预警通知
        </UButton>
        <UButton
          color="neutral"
          variant="subtle"
          icon="i-lucide-square-pen"
          :disabled="!selectedRow"
          @click="handleUpdate(selectedRow)"
        >
          修改安全库存
        </UButton>
        <UButton
          v-if="selectedRowsList.length > 1"
          color="neutral"
          variant="subtle"
          icon="i-lucide-list-checks"
          :loading="batchLoading"
          @click="handleBatchSafeStock"
        >
          批量改安全库存（{{ selectedRowsList.length }}）
        </UButton>
        <UButton
          color="error"
          variant="subtle"
          icon="i-lucide-trash-2"
          :disabled="!selectedRowsList.length"
          :loading="removing"
          @click="selectedRowsList.length > 1 ? handleBatchRemove() : handleRemoveWarning(selectedRow)"
        >
          {{ selectedRowsList.length > 1 ? `批量移除预警（${selectedRowsList.length}）` : '移除预警' }}
        </UButton>
        <UButton color="success" variant="subtle" icon="i-lucide-download" :loading="exporting" @click="handleExportExcel">
          导出Excel
        </UButton>
        <UButton color="neutral" variant="subtle" icon="i-lucide-refresh-cw" :loading="syncing" @click="handleSyncFromKingdee">
          从金蝶刷新
        </UButton>
      </div>
    </TkToolbar>

    <!-- 列表（只读；双击打开编辑） -->
    <UCard shadow="never" class="border border-gray-200/80 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <TkUTable
          v-model:row-selection="selectedRows"
          :loading="loading"
          :data="filteredList"
          :columns="kucunWarningColumns"
          @selection-change="handleSelectionChange"
          @row-open="handleUpdate"
        >
          <template #select-cell="{ row }">
            <UCheckbox
              :model-value="row.getIsSelected()"
              @update:model-value="(value) => row.toggleSelected(!!value)"
              @click.stop
              aria-label="选择行"
            />
          </template>
          <template #materialCategory-cell="{ row }">
            <UBadge size="sm" variant="subtle" color="neutral">{{ getMaterialCategory(row.original.materialCode) }}</UBadge>
          </template>
          <template #actualTotal-cell="{ row }">
            <span :class="getStockClass(row.original)" class="font-mono font-semibold">{{ formatQty(row.original.actualTotal) }}</span>
          </template>
          <template #safeStock-cell="{ row }">
            <span class="font-mono">{{ formatQty(row.original.safeStock) }}</span>
          </template>
          <template #warningStatus-cell="{ row }">
            <UBadge :color="getBadgeColor(row.original.warningStatus)" variant="subtle" size="sm">
              {{ row.original.warningStatus }}
            </UBadge>
          </template>
          <template #stockOrgName-cell="{ row }">
            <span>{{ row.original.stockOrgName || row.original.stockOrgCode || '-' }}</span>
          </template>
        </TkUTable>
      </div>
    </UCard>

    <!-- 修改安全库存 -->
    <UModal v-model:open="editOpen" title="修改金蝶安全库存" :ui="{ content: 'sm:max-w-lg' }">
      <template #body>
        <UForm :state="editForm" class="space-y-4">
          <div class="grid grid-cols-2 gap-3 text-sm">
            <div class="col-span-2 rounded-xl bg-gray-50 dark:bg-gray-800/60 p-3 space-y-1.5">
              <div class="flex justify-between gap-2">
                <span class="text-gray-400">物料编码</span>
                <span class="font-mono font-medium">{{ editForm.materialCode || '-' }}</span>
              </div>
              <div class="flex justify-between gap-2">
                <span class="text-gray-400">物料名称</span>
                <span class="font-medium text-right">{{ editForm.materialName || '-' }}</span>
              </div>
              <div class="flex justify-between gap-2">
                <span class="text-gray-400">库存组织</span>
                <span class="text-right">{{ editForm.stockOrgName || editForm.stockOrgCode || '-' }}</span>
              </div>
              <div class="flex justify-between gap-2">
                <span class="text-gray-400">当前库存</span>
                <span class="font-mono font-semibold text-primary-500">{{ formatQty(editForm.actualTotal) }}</span>
              </div>
              <div class="flex justify-between gap-2">
                <span class="text-gray-400">当前状态</span>
                <UBadge :color="getBadgeColor(editForm.warningStatus)" variant="subtle" size="sm">
                  {{ editForm.warningStatus || '-' }}
                </UBadge>
              </div>
            </div>
          </div>
          <UFormField label="安全库存" required>
            <UInput
              v-model="editForm.safeStock"
              type="number"
              step="any"
              min="0"
              class="w-full font-mono"
              placeholder="请输入安全库存"
              @keyup.enter="submitEditForm"
            />
          </UFormField>
          <p class="text-xs text-amber-600 dark:text-amber-400">
            将回写金蝶物料资料库存计划（BD_MATERIAL.FSafeStock），并更新本地快照。
          </p>
        </UForm>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="primary" :loading="editSaving" @click="submitEditForm">保存到金蝶</UButton>
          <UButton variant="outline" @click="editOpen = false">取消</UButton>
        </div>
      </template>
    </UModal>

    <!-- 推送消息 -->
    <UModal v-model:open="pushDialogVisible" title="手动推送库存预警">
      <template #body>
        <UForm :state="pushForm" class="space-y-4">
          <UFormField label="接收对象">
            <div class="w-full flex flex-col gap-2">
              <USelectMenu
                v-model="pushForm.selectedUsers"
                multiple
                filterable
                placeholder="请选择需要接收库存预警的企微成员"
                class="w-full"
                :items="wecomUserOptions"
              />
              <p class="text-[11px] text-gray-400 dark:text-gray-500 leading-normal">
                通过企业微信 UserID 发送（支持多选）。列表来自本地 wxuser 表。
              </p>
            </div>
          </UFormField>
          <div class="p-4 rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-sm font-semibold">推送报表预览（异常 {{ stats.belowSafe }} 项）</span>
              <UBadge color="emerald" variant="subtle" size="sm">Excel</UBadge>
            </div>
            <div class="grid grid-cols-2 gap-2 text-center text-xs">
              <div class="rounded-xl bg-white dark:bg-gray-800 p-2 border border-gray-100 dark:border-gray-700">
                <div class="text-gray-400 mb-1">偏低</div>
                <div class="font-bold text-amber-500">{{ stats.belowSafe }}</div>
              </div>
              <div class="rounded-xl bg-white dark:bg-gray-800 p-2 border border-gray-100 dark:border-gray-700">
                <div class="text-gray-400 mb-1">正常</div>
                <div class="font-bold text-emerald-500">{{ stats.normal }}</div>
              </div>
            </div>
            <p class="text-xs text-gray-400">基于当前本地快照生成 Excel（全部 + 偏低明细）附件发送。</p>
          </div>
        </UForm>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="primary" :loading="pushing" @click="submitPushForm">立即推送</UButton>
          <UButton variant="outline" @click="pushDialogVisible = false">取消</UButton>
        </div>
      </template>
    </UModal>

    <!-- 定时播报 -->
    <UModal v-model:open="jobDialogVisible" title="每日定时播报设置">
      <template #body>
        <UForm :state="jobForm" class="space-y-4">
          <UFormField label="定时启动">
            <div class="flex items-center gap-3">
              <USwitch v-model="jobForm.enabled" />
              <span class="text-sm">{{ jobForm.enabled ? '已开启' : '已关闭' }}</span>
            </div>
          </UFormField>
          <UFormField v-if="jobForm.enabled" label="播报时间">
            <UInput v-model="jobForm.time" type="time" class="w-full" />
          </UFormField>
          <UFormField label="接收对象">
            <USelectMenu
              v-model="jobForm.selectedUsers"
              multiple
              filterable
              placeholder="请选择接收库存预警的企微成员"
              class="w-full"
              :items="wecomUserOptions"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="primary" :loading="jobSaving" @click="submitJobForm">保存设置</UButton>
          <UButton variant="outline" @click="jobDialogVisible = false">取消</UButton>
        </div>
      </template>
    </UModal>

    <!-- 新增预警 -->
    <UModal v-model:open="enableDialogVisible" title="新增物料预警" :ui="{ content: 'sm:max-w-lg' }">
      <template #body>
        <UForm :state="enableForm" class="space-y-4">
          <UFormField label="金蝶物料" required>
            <div class="relative">
              <UInput
                v-model="materialSearch"
                placeholder="输入物料编码或名称搜索（已审核未禁用）"
                class="w-full"
                icon="i-lucide-search"
                clearable
                @update:model-value="handleMaterialSearchInput"
              />
              <div
                v-if="materialOptions.length"
                class="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800"
              >
                <button
                  v-for="item in materialOptions"
                  :key="item.id || item.value"
                  type="button"
                  class="block w-full border-b border-gray-100 px-3 py-2.5 text-left last:border-0 hover:bg-blue-50 dark:border-gray-700 dark:hover:bg-gray-700"
                  @click="onMaterialSelect(item)"
                >
                  <div class="font-mono text-sm">{{ item.value }}</div>
                  <div class="truncate text-xs text-gray-500 dark:text-gray-300">
                    {{ item.name || '—' }}<span v-if="item.spec"> / {{ item.spec }}</span>
                  </div>
                </button>
              </div>
            </div>
          </UFormField>
          <UFormField label="安全库存" required>
            <UInput
              v-model="enableForm.safeStock"
              type="number"
              step="any"
              min="0"
              class="w-full font-mono"
              placeholder="请输入安全库存"
              @keyup.enter="submitEnableForm"
            />
          </UFormField>
          <p class="text-xs text-amber-600 dark:text-amber-400">
            将在金蝶开启该物料的安全库存预警开关并写入安全库存（回读校验），随后物料出现在本列表。
          </p>
        </UForm>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="primary" :loading="enableSaving" :disabled="!enableForm.material" @click="submitEnableForm">保存并开启预警</UButton>
          <UButton variant="outline" @click="enableDialogVisible = false">取消</UButton>
        </div>
      </template>
    </UModal>

    <!-- 批量改安全库存 -->
    <UModal v-model:open="batchDialogVisible" title="批量修改安全库存" :ui="{ content: 'sm:max-w-md' }">
      <template #body>
        <UForm :state="batchForm" class="space-y-4">
          <div class="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-3 text-sm space-y-1">
            <div class="text-gray-500">将对以下 {{ selectedRowsList.length }} 个物料统一设置安全库存：</div>
            <div class="font-mono text-xs text-gray-400 max-h-24 overflow-y-auto leading-relaxed">
              {{ selectedRowsList.map((r) => r.materialCode).join('、') }}
            </div>
          </div>
          <UFormField label="统一安全库存" required>
            <UInput
              v-model="batchForm.safeStock"
              type="number"
              step="any"
              min="0"
              class="w-full font-mono"
              placeholder="请输入安全库存"
              @keyup.enter="submitBatchSafeStock"
            />
          </UFormField>
          <p class="text-xs text-amber-600 dark:text-amber-400">
            每条独立写金蝶并回读校验；失败的不影响其他条目，完成后逐条反馈结果。
          </p>
        </UForm>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="primary" :loading="batchLoading" @click="submitBatchSafeStock">批量保存</UButton>
          <UButton variant="outline" @click="batchDialogVisible = false">取消</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script>
function nuxtMsg(message, color = 'neutral') {
  const t = typeof window !== 'undefined' ? window.__nuxt_ui_toast__ : null
  if (t) t.add({ title: String(message), color, duration: 4000 })
}
</script>

<script setup name="kucun_warning">
import { TkSearchPanel, TkToolbar, TkUTable } from '@ctk-system/ui'
import { h, resolveComponent } from 'vue'

const { proxy } = getCurrentInstance()

const loading = ref(false)
const syncing = ref(false)
const exporting = ref(false)
const removing = ref(false)
const pushing = ref(false)
const pushDialogVisible = ref(false)
const lastSyncTime = ref('')
const selectedRows = ref({})
const selectedRow = ref(null)

const editOpen = ref(false)
const editSaving = ref(false)
const editForm = reactive({
  materialCode: '',
  materialName: '',
  stockOrgCode: '',
  stockOrgName: '',
  actualTotal: 0,
  warningStatus: '',
  safeStock: 0
})

const jobDialogVisible = ref(false)
const jobSaving = ref(false)
const jobForm = reactive({
  enabled: true,
  time: '09:00',
  selectedUsers: []
})

const warningList = ref([])
const wecomUsers = ref([])

const queryParams = reactive({
  keyword: '',
  status: '',
  category: ''
})

const stats = reactive({
  belowSafe: 0,
  normal: 0
})

const pushForm = reactive({
  selectedUsers: []
})

const statusSelectOptions = [
  { label: '低于安全库存 (偏低)', value: '低于安全库存 (偏低)' },
  { label: '正常', value: '正常' }
]

const categoryOptions = [
  { label: '黑胶', value: '黑胶' },
  { label: '框架', value: '框架' },
  { label: '其他', value: '其他' }
]

const wecomUserOptions = computed(() =>
  wecomUsers.value.map((u) => ({ label: `${u.name} (${u.userid})`, value: u.userid }))
)

const UCheckbox = resolveComponent('UCheckbox')

const kucunWarningColumns = [
  {
    id: 'select',
    header: ({ table }) =>
      h(UCheckbox, {
        modelValue: table.getIsAllPageRowsSelected(),
        'onUpdate:modelValue': (value) => table.toggleAllPageRowsSelected(!!value),
        onClick: (e) => e.stopPropagation(),
        ariaLabel: '全选'
      }),
    cell: ({ row }) =>
      h(UCheckbox, {
        modelValue: row.getIsSelected(),
        'onUpdate:modelValue': (value) => row.toggleSelected(!!value),
        onClick: (e) => e.stopPropagation(),
        ariaLabel: '选择行'
      }),
    enableSorting: false,
    enableHiding: false,
    meta: { class: { td: 'w-10', th: 'w-10' } }
  },
  { accessorKey: 'materialCode', header: '物料编码' },
  { accessorKey: 'materialName', header: '物料名称' },
  { accessorKey: 'materialCategory', header: '类别' },
  { accessorKey: 'actualTotal', header: '库存总量' },
  { accessorKey: 'safeStock', header: '安全库存' },
  { accessorKey: 'warningStatus', header: '预警状态' },
  { accessorKey: 'stockOrgName', header: '库存组织' }
]

const filteredList = computed(() => {
  return warningList.value
    .filter((item) => {
      const keyword = queryParams.keyword.trim().toLowerCase()
      const keywordMatch =
        !keyword ||
        String(item.materialCode || '').toLowerCase().includes(keyword) ||
        String(item.materialName || '').toLowerCase().includes(keyword)
      const statusMatch = !queryParams.status || item.warningStatus === queryParams.status
      const categoryMatch = !queryParams.category || getMaterialCategory(item.materialCode) === queryParams.category
      return keywordMatch && statusMatch && categoryMatch
    })
    .slice()
    .sort((a, b) => {
      const aAbnormal = String(a.warningStatus || '') !== '正常' ? 0 : 1
      const bAbnormal = String(b.warningStatus || '') !== '正常' ? 0 : 1
      if (aAbnormal !== bAbnormal) return aAbnormal - bAbnormal
      return String(a.materialCode || '').localeCompare(String(b.materialCode || ''))
    })
})

function rowKey(row) {
  return `${row?.materialCode || ''}__${row?.stockOrgCode || ''}`
}

function handleSelectionChange(selection) {
  // 复选列支持多选；工具栏按钮（修改/移除）只对恰好一行时可用，语义与旧单选一致
  selectedRow.value = selection?.length === 1 ? selection[0] : null
  selectedRowsList.value = selection || []
}

// ---- 新增预警 ----
const enableDialogVisible = ref(false)
const enableSaving = ref(false)
const enableForm = reactive({ material: null, safeStock: '' })
const materialOptions = ref([])
const materialSearch = ref('')
let materialSearchSeq = 0
let materialSearchTimer = null

async function loadMaterialOptions(keyword) {
  const seq = ++materialSearchSeq
  try {
    const res = await getMaterialOptions({ keyword, limit: 50 })
    if (seq !== materialSearchSeq) return
    if (res.code !== 200) {
      materialOptions.value = []
      return
    }
    materialOptions.value = (res.data || []).map((item) => ({
      id: item.id,
      label: `${item.number} ${item.name}`.trim(),
      value: item.number,
      name: item.name,
      spec: item.spec,
    })).filter((item) => item.value)
  } catch {
    if (seq === materialSearchSeq) materialOptions.value = []
  }
}

function handleMaterialSearchInput(value) {
  const keyword = String(value || '').trim()
  if (keyword === enableForm.material?.value) {
    materialOptions.value = []
    return
  }
  enableForm.material = null
  materialOptions.value = []
  clearTimeout(materialSearchTimer)
  if (!keyword) return
  materialSearchTimer = setTimeout(() => loadMaterialOptions(keyword), 250)
}

function onMaterialSelect(item) {
  enableForm.material = item
  materialSearch.value = item.value
  materialOptions.value = []
}

function handleOpenEnableDialog() {
  enableForm.material = null
  enableForm.safeStock = ''
  materialSearch.value = ''
  materialOptions.value = []
  enableDialogVisible.value = true
}

const selectedRowsList = ref([])
const batchDialogVisible = ref(false)
const batchLoading = ref(false)
const batchForm = reactive({ safeStock: '' })

async function submitEnableForm() {
  if (!enableForm.material?.value) {
    nuxtMsg('请先选择金蝶物料', 'warning')
    return
  }
  const next = Number(enableForm.safeStock)
  if (Number.isNaN(next) || next < 0) {
    nuxtMsg('请输入有效的安全库存（≥0）', 'warning')
    return
  }
  enableSaving.value = true
  try {
    const res = await enableWarning({
      materialCode: enableForm.material.value,
      stockOrgCode: '100',
      safeStock: next,
    })
    if (res.code === 200) {
      nuxtMsg(`已开启 ${enableForm.material.value} 的库存预警（安全库存 ${next}）`, 'success')
      enableDialogVisible.value = false
      await getWarningList()
    } else {
      nuxtMsg(res.msg || '新增预警失败', 'error')
    }
  } catch (err) {
    nuxtMsg(err?.message || '新增预警请求失败', 'error')
  } finally {
    enableSaving.value = false
  }
}

// ---- 批量操作 ----
function handleBatchSafeStock() {
  if (selectedRowsList.value.length < 2) return
  batchForm.safeStock = ''
  batchDialogVisible.value = true
}

async function submitBatchSafeStock() {
  const next = Number(batchForm.safeStock)
  if (Number.isNaN(next) || next < 0) {
    nuxtMsg('请输入有效的安全库存（≥0）', 'warning')
    return
  }
  batchLoading.value = true
  try {
    const res = await batchWarning({
      action: 'safeStock',
      items: selectedRowsList.value.map((row) => ({
        materialCode: row.materialCode,
        stockOrgCode: row.stockOrgCode || '100',
        safeStock: next,
      })),
    })
    if (res.code === 200) {
      const fails = (res.data?.results || []).filter((r) => !r.ok)
      if (fails.length) {
        nuxtMsg(`${res.data?.summary || '批量完成'}；失败：${fails.map((f) => `${f.materialCode}（${f.error}）`).join('、')}`, 'warning')
      } else {
        nuxtMsg(res.data?.summary || '批量保存成功', 'success')
      }
      batchDialogVisible.value = false
      await getWarningList()
    } else {
      nuxtMsg(res.msg || '批量保存失败', 'error')
    }
  } catch (err) {
    nuxtMsg(err?.message || '批量保存请求失败', 'error')
  } finally {
    batchLoading.value = false
  }
}

async function handleBatchRemove() {
  const rows = selectedRowsList.value
  if (rows.length < 2) return
  try {
    await useModalConfirm().confirm(
      `确认移除以下 ${rows.length} 个物料的库存预警？\n将关闭金蝶安全库存预警开关并从本列表删除。\n${rows.map((r) => r.materialCode).join('、')}`,
      '批量移除预警',
      { confirmButtonText: '确认移除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  removing.value = true
  try {
    const res = await batchWarning({
      action: 'remove',
      items: rows.map((row) => ({
        materialCode: row.materialCode,
        stockOrgCode: row.stockOrgCode || '100',
      })),
    })
    if (res.code === 200) {
      const fails = (res.data?.results || []).filter((r) => !r.ok)
      if (fails.length) {
        nuxtMsg(`${res.data?.summary || '批量完成'}；失败：${fails.map((f) => `${f.materialCode}（${f.error}）`).join('、')}`, 'warning')
      } else {
        nuxtMsg(res.data?.summary || '批量移除成功', 'success')
      }
      await getWarningList()
    } else {
      nuxtMsg(res.msg || '批量移除失败', 'error')
    }
  } catch (err) {
    nuxtMsg(err?.message || '批量移除请求失败', 'error')
  } finally {
    removing.value = false
  }
}

function getBadgeColor(status) {
  if (!status) return 'success'
  if (String(status).includes('安全') || String(status).includes('偏低')) return 'warning'
  return 'success'
}

function getMaterialCategory(materialCode) {
  const code = String(materialCode || '').trim().toUpperCase()
  if (code.startsWith('N103')) return '黑胶'
  if (code.startsWith('N105')) return '框架'
  return '其他'
}

function getStockClass(row) {
  if (!row?.warningStatus) return ''
  if (String(row.warningStatus).includes('安全') || String(row.warningStatus).includes('偏低')) {
    return 'text-amber-500 font-bold'
  }
  return 'text-emerald-500 font-semibold'
}

function formatQty(value) {
  if (value === null || value === undefined || value === '') return '-'
  const n = Number(value)
  if (Number.isNaN(n)) return String(value)
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 })
}

function formatSyncTime(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function handleQuery() {
  // filteredList 响应式过滤
}

function resetQuery() {
  queryParams.keyword = ''
  queryParams.status = ''
  queryParams.category = ''
}

async function getWarningList() {
  loading.value = true
  try {
    const res = await listWarnings()
    if (res.code === 200) {
      warningList.value = res.data || []
      selectedRows.value = {}
      selectedRow.value = null
      const first = warningList.value[0]
      if (first?.syncTime) {
        lastSyncTime.value = formatSyncTime(first.syncTime)
      } else {
        await loadSyncTime()
      }
      calculateStats()
    } else {
      nuxtMsg(res.msg || '获取库存预警数据失败', 'error')
    }
  } catch (_) {
    nuxtMsg('请求接口异常', 'error')
  } finally {
    loading.value = false
  }
}

async function loadSyncTime() {
  try {
    const res = await getWarningSyncTime()
    if (res.code === 200 && res.data) {
      lastSyncTime.value = formatSyncTime(res.data)
    }
  } catch (_) { /* ignore */ }
}

function calculateStats() {
  stats.belowSafe = 0
  stats.normal = 0
  warningList.value.forEach((item) => {
    const status = String(item.warningStatus || '')
    if (status.includes('安全') || status.includes('偏低')) stats.belowSafe++
    else stats.normal++
  })
}

/** 双击行 / 工具栏修改：打开编辑弹窗（保存时写金蝶并回读校验）。 */
function handleUpdate(row) {
  const target = row || selectedRow.value
  if (!target) {
    nuxtMsg('请先选择一条记录', 'warning')
    return
  }
  editForm.materialCode = target.materialCode || ''
  editForm.materialName = target.materialName || ''
  editForm.stockOrgCode = target.stockOrgCode || ''
  editForm.stockOrgName = target.stockOrgName || ''
  editForm.actualTotal = target.actualTotal ?? 0
  editForm.warningStatus = target.warningStatus || ''
  editForm.safeStock = target.safeStock ?? 0
  editOpen.value = true
}

async function submitEditForm() {
  const next = Number(editForm.safeStock)
  if (Number.isNaN(next) || next < 0) {
    nuxtMsg('请输入有效的安全库存（≥0）', 'warning')
    return
  }
  if (!editForm.materialCode || !editForm.stockOrgCode) {
    nuxtMsg('物料或库存组织缺失，无法回写金蝶', 'error')
    return
  }
  editSaving.value = true
  try {
    const res = await updateWarningSafeStock({
      materialCode: editForm.materialCode,
      stockOrgCode: editForm.stockOrgCode,
      safeStock: next
    })
    if (res.code === 200) {
      const data = res.data || {}
      const key = rowKey(editForm)
      const idx = warningList.value.findIndex((x) => rowKey(x) === key)
      if (idx >= 0) {
        warningList.value[idx] = {
          ...warningList.value[idx],
          safeStock: data.safeStock ?? next,
          warningStatus: data.warningStatus || warningList.value[idx].warningStatus,
          safeWarningEnabled: data.safeWarningEnabled ?? true
        }
        warningList.value = warningList.value.slice()
      }
      calculateStats()
      editOpen.value = false
      nuxtMsg('已写入金蝶安全库存', 'success')
    } else {
      nuxtMsg(res.msg || '修改失败', 'error')
    }
  } catch (err) {
    nuxtMsg(err?.message || '修改安全库存请求失败', 'error')
  } finally {
    editSaving.value = false
  }
}

/** 移除预警：关闭金蝶安全库存预警开关 + 删除本地快照，后续同步不再出现 */
async function handleRemoveWarning(row) {
  const target = row || selectedRow.value
  if (!target) {
    nuxtMsg('请先选择一条记录', 'warning')
    return
  }
  if (!target.materialCode || !target.stockOrgCode) {
    nuxtMsg('物料或库存组织缺失，无法移除', 'error')
    return
  }
  try {
    await useModalConfirm().confirm(
      `确认移除物料「${target.materialCode}」的库存预警？\n将关闭金蝶安全库存预警开关，并从本列表删除（不再采购可用）。`,
      '移除库存预警',
      { confirmButtonText: '确认移除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  removing.value = true
  try {
    const res = await removeWarning({
      materialCode: target.materialCode,
      stockOrgCode: target.stockOrgCode
    })
    if (res.code === 200) {
      const key = rowKey(target)
      warningList.value = warningList.value.filter((x) => rowKey(x) !== key)
      selectedRows.value = {}
      selectedRow.value = null
      calculateStats()
      nuxtMsg(`已移除 ${target.materialCode} 的库存预警`, 'success')
    } else {
      nuxtMsg(res.msg || '移除失败', 'error')
    }
  } catch (err) {
    nuxtMsg(err?.message || '移除库存预警请求失败', 'error')
  } finally {
    removing.value = false
  }
}

function handleExportExcel() {
  exporting.value = true
  const date = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const name = `金蝶库存预警报表_${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.xlsx`
  proxy.download('tk_custom/kucun/warnings/export', {}, name)
    .catch(() => nuxtMsg('导出失败', 'error'))
    .finally(() => { exporting.value = false })
}

async function handleSyncFromKingdee() {
  syncing.value = true
  try {
    const res = await syncWarnings()
    if (res.code === 200) {
      nuxtMsg(`已从金蝶同步 ${res.data?.rows ?? 0} 条`, 'success')
      if (res.data?.syncTime) lastSyncTime.value = formatSyncTime(res.data.syncTime)
      await getWarningList()
    } else {
      nuxtMsg(res.msg || '同步失败', 'error')
    }
  } catch (_) {
    nuxtMsg('同步请求异常（金蝶可能超时）', 'error')
  } finally {
    syncing.value = false
  }
}

async function loadWecomUsers() {
  try {
    const res = await getWecomUsers()
    if (res.code === 200) wecomUsers.value = res.data || []
  } catch (err) {
    console.error('获取企微成员失败', err)
  }
}

function handleOpenPushDialog() {
  const savedUsers = localStorage.getItem('tk_kucun_push_selectedUsers')
  pushForm.selectedUsers = savedUsers ? JSON.parse(savedUsers) : []
  pushDialogVisible.value = true
}

function submitPushForm() {
  if (!pushForm.selectedUsers?.length) {
    nuxtMsg('请选择至少一个企微接收人', 'warning')
    return
  }
  pushing.value = true
  sendWarningMsg({ receiverIds: pushForm.selectedUsers.join(',') })
    .then((res) => {
      if (res.code === 200) {
        const data = res.data || {}
        if (data.skipped) {
          nuxtMsg(data.skipped, 'warning')
        } else {
          nuxtMsg(data.message || '消息推送成功！', 'success')
          localStorage.setItem('tk_kucun_push_selectedUsers', JSON.stringify(pushForm.selectedUsers))
          pushDialogVisible.value = false
        }
      } else {
        nuxtMsg(res.msg || '消息发送失败', 'error')
      }
    })
    .catch(() => nuxtMsg('发送请求失败', 'error'))
    .finally(() => { pushing.value = false })
}

async function handleOpenJobDialog() {
  loading.value = true
  try {
    const res = await getWarningJob()
    if (res.code === 200) {
      jobForm.enabled = Boolean(res.data.enabled)
      const h = String(res.data.hour ?? 8).padStart(2, '0')
      const m = String(res.data.minute ?? 0).padStart(2, '0')
      jobForm.time = `${h}:${m}`
      jobForm.selectedUsers = res.data.receivers ? res.data.receivers.split(',').filter(Boolean) : []
      jobDialogVisible.value = true
    } else {
      nuxtMsg(res.msg || '获取定时播报配置失败', 'error')
    }
  } catch (_) {
    nuxtMsg('获取定时播报配置出错', 'error')
  } finally {
    loading.value = false
  }
}

async function submitJobForm() {
  if (jobForm.enabled && !jobForm.time) {
    nuxtMsg('请选择播报时间', 'warning')
    return
  }
  jobSaving.value = true
  try {
    const timeParts = jobForm.time ? jobForm.time.split(':') : ['08', '00']
    const res = await saveWarningJob({
      enabled: jobForm.enabled,
      hour: parseInt(timeParts[0], 10),
      minute: parseInt(timeParts[1], 10),
      receivers: jobForm.selectedUsers.join(',')
    })
    if (res.code === 200) {
      nuxtMsg('定时播报设置保存成功', 'success')
      jobDialogVisible.value = false
    } else {
      nuxtMsg(res.msg || '保存定时播报配置失败', 'error')
    }
  } catch (_) {
    nuxtMsg('保存定时播报配置请求出错', 'error')
  } finally {
    jobSaving.value = false
  }
}

onMounted(() => {
  getWarningList()
  loadWecomUsers()
})
</script>
