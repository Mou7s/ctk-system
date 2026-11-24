<template>
  <div class="app-container absolute inset-0 flex min-h-0 flex-col gap-3 overflow-hidden p-4 lg:p-5">
    <div class="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 xl:grid-cols-7">
      <div v-for="card in summaryCards" :key="card.key" class="rounded-xl border border-default bg-[var(--app-surface)] p-2 shadow-xs sm:p-3">
        <div class="text-xs leading-4 text-muted">{{ card.label }}</div>
        <div class="mt-0.5 text-xl font-semibold sm:mt-1 sm:text-2xl" :class="card.className">{{ summary[card.key] || 0 }}</div>
      </div>
    </div>

    <TkSearchPanel :model="queryParams" inline panel-class="search-form-premium shrink-0">
      <UInput v-model="queryParams.keyword" class="w-52" placeholder="客户/物料/业务员/国家" clearable />
      <USelect v-model="statusFilterValue" :items="statusFilterItems" value-key="value" label-key="label" class="w-32" />
      <USelect v-model="salespersonFilterValue" :items="salespersonFilterItems" value-key="value" label-key="label" placeholder="业务员" class="w-32" />
      <USelect v-model="countryFilterValue" :items="countryFilterItems" value-key="value" label-key="label" placeholder="国家" class="w-28" />
      <TkDateRangePicker v-model="sampleOrderDateRange" class="w-64" />
      <UCheckbox v-model="queryParams.overdue" label="只看逾期" />
      <UButton @click="resetQuery">重置</UButton>
    </TkSearchPanel>

    <TkToolbar class="shrink-0">
      <UButton v-if="canAdd" color="primary" icon="i-lucide-plus" @click="handleAdd">新增行</UButton>
      <UButton v-if="canRemove" color="error" variant="outline" icon="i-lucide-trash-2" @click="removeSelectedRows">删除选中行</UButton>
      <UButton v-if="canImport" color="success" variant="outline" icon="i-lucide-upload" :loading="importing" @click="fileInput?.click()">导入 Excel</UButton>
      <UButton v-if="canQuery" color="warning" variant="outline" icon="i-lucide-download" @click="handleExport">导出当前结果</UButton>
      <input ref="fileInput" type="file" accept=".xlsx,.xls" class="hidden" @change="handleImportFile" />
      <span class="ml-2 text-xs text-muted">单击输入，点击其他单元格自动保存；新增行填 CTK part NO 和数量后自动创建；表头漏斗仅筛当前页，全表筛请用顶部搜索区。</span>
      <UButton v-if="gridFilterCount > 0" variant="ghost" size="xs" @click="clearGridFilters">清除本页筛选({{ gridFilterCount }})</UButton>
    </TkToolbar>

    <div class="table-container-premium min-h-0 flex-1 overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] shadow-xs">
      <TkSampleProgressGrid
        ref="sampleGridRef"
        :rows="displayRows"
        :fields="fieldColumns"
        :readonly="loading"
        :can-edit-row="isRowEditable"
        :can-remove="canRemove"
        :groups="sampleColumnGroups"
        @edit="handleGridEdit"
        @paste="handleGridPaste"
        @action="handleGridAction"
        @filter="handleGridFilter"
      />
    </div>

    <pagination
      v-show="total > 0"
      :total="total"
      v-model:page="pageModel"
      v-model:limit="pageSizeModel"
      class="shrink-0"
      @pagination="handlePagination"
    />
  </div>
</template>

<script setup name="SampleProgress">
import { useTkListQuery } from '@ctk-system/composables'
import { applySampleProgressPasteGrid, parseQuotationPasteGrid } from '@ctk-system/shared'
import { hasStaticPermission } from '@/router/static-navigation'
import useUserStore from '@/store/modules/user'
import TkSampleProgressGrid from '@/packages/ui/TkSampleProgressGrid.vue'

import {
  addSampleProgress,
  deleteSampleProgress,
  getSampleProgressOptions,
  getSampleProgressSummary,
  importSampleProgress,
  listSampleProgress,
  updateSampleProgress,
} from '@/api/tk_custom/sampleProgress.js'

const toast = useToast()
const { proxy } = getCurrentInstance()
const userStore = useUserStore()
const fileInput = ref(null)
const sampleGridRef = ref(null)
const importing = ref(false)
const draftRows = ref([])
const gridFilterCount = ref(0)
const summary = reactive({ total: 0, registered: 0, waiting: 0, processing: 0, completed: 0, abnormal: 0, overdue: 0 })
const filterKeys = ['keyword', 'status', 'salesperson', 'country', 'sampleOrderDateFrom', 'sampleOrderDateTo', 'overdue']
const rowTimers = new Set()
let listErrorNotified = false
let filterSearchTimer = null
let suppressFilterWatch = false
let draftSequence = 0

const summaryCards = [
  { key: 'total', label: '全部记录', className: 'text-primary' },
  { key: 'registered', label: '已登记', className: 'text-sky-500' },
  { key: 'waiting', label: '采购/待到样', className: 'text-warning' },
  { key: 'processing', label: '到样/测试/寄出', className: 'text-success' },
  { key: 'completed', label: '已完成', className: 'text-emerald-500' },
  { key: 'abnormal', label: '异常', className: 'text-error' },
  { key: 'overdue', label: '逾期未完成', className: 'text-red-500' },
]

const statusItems = [
  { label: '全部状态', value: '' },
  { label: '已登记', value: 'registered' },
  { label: '采购中', value: 'purchasing' },
  { label: '待到样', value: 'waiting_sample' },
  { label: '已到样', value: 'received' },
  { label: '测试中', value: 'testing' },
  { label: '已寄出', value: 'shipped' },
  { label: '已转订单', value: 'converted' },
  { label: '已关闭', value: 'closed' },
  { label: '异常', value: 'abnormal' },
]
const statusFilterItems = statusItems.map((item) => ({ ...item, value: item.value || '__all__' }))
const salespersonFilterItems = ref([{ label: '全部业务员', value: '__all__' }])
const countryFilterItems = ref([{ label: '全部国家', value: '__all__' }])
const yesNoItems = [{ label: '是', value: '是' }, { label: '否', value: '否' }]
const customerTypeItems = ['分销商', '终端客户', '方案商', '品牌商', '其他'].map((value) => ({ label: value, value }))
const brandRequirementItems = ['CTK', '中性', '其他'].map((value) => ({ label: value, value }))
const gradeRequirementItems = ['消费级', '工控级', '车规级'].map((value) => ({ label: value, value }))
const testResultItems = ['OK', 'NG'].map((value) => ({ label: value, value }))
const orderStatusItems = ['YES', 'NO'].map((value) => ({ label: value, value }))

const fieldColumns = [
  { key: 'customerReceived', header: '客户是否收样', type: 'select', items: yesNoItems, size: 135 },
  { key: 'salesperson', header: '业务员', size: 120 },
  { key: 'country', header: '国家', size: 110 },
  { key: 'city', header: '城市', size: 110 },
  { key: 'customerName', header: '客户名称', size: 170, placeholder: '客户名称' },
  { key: 'customerType', header: '客户类型', type: 'select', items: customerTypeItems, size: 120 },
  { key: 'productApplication', header: '产品应用', size: 150 },
  { key: 'brandRequirement', header: '品牌要求', type: 'select', items: brandRequirementItems, size: 120 },
  { key: 'gradeRequirement', header: '等级需求', type: 'select', items: gradeRequirementItems, size: 120 },
  { key: 'partNo', header: 'CTK part NO', size: 155, placeholder: '必填' },
  { key: 'packageName', header: '封装', size: 110 },
  { key: 'quantity', header: '数量', type: 'number', size: 110, placeholder: '必填' },
  { key: 'unit', header: '单位', size: 90 },
  { key: 'datasheet', header: '规格书', size: 170 },
  { key: 'sampleOrderDate', header: '样品下单日期', type: 'date', size: 155 },
  { key: 'sampleRequiredDate', header: '样品需求日', type: 'date', size: 155 },
  { key: 'buyer', header: '采购员', size: 120 },
  { key: 'supplierCode', header: '供应商代码(001)', size: 140 },
  { key: 'chipSize', header: '芯片尺寸', size: 120 },
  { key: 'waferFactoryCode', header: '晶圆厂代码', size: 140 },
  { key: 'sampleDueDate', header: '样品交期', type: 'date', size: 155 },
  { key: 'merchandiser', header: '跟单员', size: 120 },
  { key: 'actualArrivalQty', header: '实际到样数量', type: 'number', size: 140 },
  { key: 'deliveryStatus', header: '样品交付情况', size: 150 },
  { key: 'actualDeliveryDate', header: '实际交期', type: 'date', size: 155 },
  { key: 'testQty', header: '测样数量', type: 'number', size: 120 },
  { key: 'retainedQty', header: '留样数量', type: 'number', size: 120 },
  { key: 'shippingStatus', header: '发走情况', size: 140 },
  { key: 'testOwner', header: '检测负责人', size: 130 },
  { key: 'testResult', header: '检测结果（与规格书比较）', type: 'select', items: testResultItems, size: 120 },
  { key: 'orderStatus', header: '订单情况', type: 'select', items: orderStatusItems, size: 165 },
  { key: 'remark', header: '备注', type: 'textarea', size: 220 },
  { key: 'progressStatus', header: '流程状态', type: 'select', items: statusItems.slice(1), size: 130 },
]

const businessFields = fieldColumns.map((column) => column.key)

// 表头分区带，对应 Excel「样品客户进度表」的填写人分组；color 为角标背景色。
const sampleColumnGroups = [
  { name: '业务员填写', color: '#eef2ff', keys: ['salesperson', 'country', 'city', 'customerName', 'customerType', 'productApplication', 'brandRequirement', 'gradeRequirement', 'partNo', 'packageName', 'quantity', 'unit', 'datasheet', 'sampleOrderDate', 'sampleRequiredDate'] },
  { name: '采购填写', color: '#ecfdf5', keys: ['buyer', 'supplierCode', 'chipSize', 'waferFactoryCode', 'sampleDueDate'] },
  { name: '跟单填写', color: '#fff1f2', keys: ['merchandiser', 'actualArrivalQty', 'deliveryStatus', 'actualDeliveryDate', 'testQty', 'retainedQty', 'shippingStatus', 'testOwner'] },
  { name: '技术/服务部填写', color: '#fffbeb', keys: ['testResult', 'orderStatus'] },
]

const queryParams = ref({
  pageNum: 1,
  pageSize: 20,
  keyword: '',
  status: '',
  salesperson: '',
  country: '',
  sampleOrderDateFrom: '',
  sampleOrderDateTo: '',
  overdue: false,
})

const statusFilterValue = computed({
  get: () => queryParams.value.status || '__all__',
  set: (value) => { queryParams.value.status = value === '__all__' ? '' : value },
})
const salespersonFilterValue = computed({
  get: () => queryParams.value.salesperson || '__all__',
  set: (value) => { queryParams.value.salesperson = value === '__all__' ? '' : value },
})
const countryFilterValue = computed({
  get: () => queryParams.value.country || '__all__',
  set: (value) => { queryParams.value.country = value === '__all__' ? '' : value },
})
const sampleOrderDateRange = computed({
  get() {
    const { sampleOrderDateFrom, sampleOrderDateTo } = queryParams.value
    return sampleOrderDateFrom && sampleOrderDateTo ? [sampleOrderDateFrom, sampleOrderDateTo] : []
  },
  set(value) {
    queryParams.value.sampleOrderDateFrom = value?.[0] || ''
    queryParams.value.sampleOrderDateTo = value?.[1] || ''
  },
})

const can = (permission) => hasStaticPermission(userStore, permission)
const canQuery = computed(() => can('tk_custom:sampleProgress:query'))
const canAdd = computed(() => can('tk_custom:sampleProgress:add'))
const canEdit = computed(() => can('tk_custom:sampleProgress:edit'))
const canRemove = computed(() => can('tk_custom:sampleProgress:remove'))
const canImport = computed(() => can('tk_custom:sampleProgress:import'))
const displayRows = computed(() => [...draftRows.value, ...sampleList.value])

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}))
}

function normalizeForCompare(value) {
  return value === undefined || value === '' ? null : value
}

function fieldValueEqual(a, b) {
  const x = normalizeForCompare(a)
  const y = normalizeForCompare(b)
  if (x == null || y == null) return x == null && y == null
  // 数量列是文本存储（50-100pcs），100 与 '100' 视为相同，避免无意义回写。
  return x === y || String(x) === String(y)
}

// full=true 发全量（新增/建快照）；默认只发相对 __snapshot 的差异字段，后端按携带字段部分更新。
function toPayload(row, full = false) {
  const payload = {}
  if (row?.id != null) payload.id = row.id
  const snapshot = full ? null : row?.__snapshot || {}
  for (const field of businessFields) {
    const value = row?.[field] ?? null
    if (snapshot && fieldValueEqual(value, snapshot[field])) continue
    payload[field] = value
  }
  return payload
}

function defaultRow() {
  return {
    id: null,
    customerReceived: null,
    salesperson: null,
    country: null,
    city: null,
    customerName: null,
    customerType: null,
    productApplication: null,
    brandRequirement: null,
    gradeRequirement: null,
    partNo: null,
    packageName: null,
    quantity: null,
    unit: 'PCS',
    datasheet: null,
    sampleOrderDate: null,
    sampleRequiredDate: null,
    buyer: null,
    supplierCode: null,
    chipSize: null,
    waferFactoryCode: null,
    sampleDueDate: null,
    merchandiser: null,
    actualArrivalQty: null,
    deliveryStatus: null,
    actualDeliveryDate: null,
    testQty: null,
    retainedQty: null,
    shippingStatus: null,
    testOwner: null,
    testResult: null,
    orderStatus: null,
    progressStatus: 'registered',
    remark: null,
  }
}

function prepareRow(source = {}, isDraft = false) {
  const row = Object.assign(isDraft ? defaultRow() : {}, source)
  const payload = toPayload(row, true)
  Object.assign(row, {
    __rowKey: isDraft ? `draft-${++draftSequence}` : String(row.id),
    __isDraft: isDraft,
    __localState: isDraft ? 'draft' : 'saved',
    __error: '',
    __version: 0,
    __saveTimer: null,
    __savePromise: null,
    __saveAgain: false,
    __snapshot: clone(payload),
  })
  return row
}

function isRowEditable(row) {
  return row?.__isDraft ? canAdd.value : canEdit.value
}

function markDirty(row) {
  row.__version += 1
  row.__error = ''
  if (!row.__isDraft) row.__localState = 'dirty'
}

function handleCellInput(row, key, value) {
  if (!isRowEditable(row)) return
  row[key] = value
  markDirty(row)
}

function handleCellCommit(row) {
  if (!isRowEditable(row)) return
  if (row.__isDraft) {
    if (hasRequiredFields(row)) scheduleDraftSave(row)
    return
  }
  scheduleRowSave(row)
}

function handleGridEdit({ row, key, value }) {
  if (!row || !key || !isRowEditable(row)) return
  handleCellInput(row, key, value)
  handleCellCommit(row)
}

function handleGridPaste({ text, startCell }) {
  if (!startCell || !displayRows.value.length) return
  try {
    const rows = parseQuotationPasteGrid(text)
    const startRow = Number(startCell.row || 0)
    const startColumn = Number(startCell.column || 0)
    const result = applySampleProgressPasteGrid(
      displayRows.value,
      rows,
      fieldColumns,
      startRow,
      startColumn,
    )

    for (const rowIndex of result.changedRows) {
      const row = displayRows.value[rowIndex]
      const nextRow = result.lines[rowIndex]
      if (!row || !nextRow || !isRowEditable(row)) continue
      let changed = false
      for (const column of fieldColumns) {
        if (row[column.key] === nextRow[column.key]) continue
        handleCellInput(row, column.key, nextRow[column.key])
        changed = true
      }
      if (changed) handleCellCommit(row)
    }
  } catch (error) {
    toast.add({ title: error?.message || 'Excel 粘贴内容解析失败', color: 'error' })
  }
}

function handleGridAction({ action, row }) {
  if (action === 'retry') retryRowSave(row)
  else if (action === 'cancel') cancelDraft(row)
  else if (action === 'delete') handleDelete(row)
}

function handleGridFilter(count) {
  gridFilterCount.value = Number(count) || 0
}

function clearGridFilters() {
  sampleGridRef.value?.clearAllFilters?.()
  gridFilterCount.value = 0
}

function hasRequiredFields(row) {
  return Boolean(String(row?.partNo || '').trim() && String(row?.quantity || '').trim())
}

function clearRowTimer(row) {
  if (row?.__saveTimer) {
    clearTimeout(row.__saveTimer)
    rowTimers.delete(row.__saveTimer)
    row.__saveTimer = null
  }
}

function scheduleRowSave(row, delay = 300) {
  if (!row?.id || !canEdit.value) return
  clearRowTimer(row)
  if (row.__savePromise) {
    row.__saveAgain = true
    return
  }
  row.__localState = 'dirty'
  const timer = setTimeout(() => {
    rowTimers.delete(timer)
    row.__saveTimer = null
    saveExistingRow(row)
  }, delay)
  row.__saveTimer = timer
  rowTimers.add(timer)
}

async function saveExistingRow(row) {
  if (!row?.id || !canEdit.value) return
  if (row.__savePromise) {
    row.__saveAgain = true
    return
  }
  const version = row.__version
  const payload = toPayload(row)
  payload.id = row.id
  if (Object.keys(payload).length <= 1) {
    row.__snapshot = clone(toPayload(row, true))
    row.__localState = 'saved'
    return
  }
  row.__localState = 'saving'
  row.__error = ''
  const request = updateSampleProgress(payload)
  row.__savePromise = request
  try {
    const response = await request
    // 后端返回按“库里现状 + 本次改动”推导的状态，前端同步回来。
    if (response?.data?.status) row.progressStatus = response.data.status
    if (row.__version === version) {
      row.__snapshot = clone(toPayload(row, true))
      row.__localState = 'saved'
    } else {
      row.__localState = 'dirty'
      row.__saveAgain = true
    }
  } catch (error) {
    row.__localState = 'error'
    row.__error = error?.message || '保存失败'
    toast.add({ title: `记录 ${row.partNo || row.id} 保存失败，请重试`, color: 'error' })
  } finally {
    row.__savePromise = null
    if (row.__saveAgain) {
      row.__saveAgain = false
      scheduleRowSave(row)
    }
  }
}

function scheduleDraftSave(row) {
  if (!row?.__isDraft || !hasRequiredFields(row) || !canAdd.value) return
  clearRowTimer(row)
  if (row.__savePromise) {
    row.__saveAgain = true
    return
  }
  row.__localState = 'draft'
  const timer = setTimeout(() => {
    rowTimers.delete(timer)
    row.__saveTimer = null
    createDraftRow(row)
  }, 300)
  row.__saveTimer = timer
  rowTimers.add(timer)
}

async function createDraftRow(row) {
  if (!row?.__isDraft || !hasRequiredFields(row) || !canAdd.value) return
  if (row.__savePromise) {
    row.__saveAgain = true
    return
  }
  const version = row.__version
  const payload = toPayload(row, true)
  row.__localState = 'saving'
  row.__error = ''
  const request = addSampleProgress(payload)
  row.__savePromise = request
  try {
    const response = await request
    const id = response?.data?.id
    if (!id) throw new Error('新增成功但未返回记录编号')
    if (response?.data?.status) row.progressStatus = response.data.status
    row.id = id
    row.__isDraft = false
    row.__rowKey = String(id)
    row.__snapshot = clone(toPayload(row, true))
    row.__localState = row.__version === version ? 'saved' : 'dirty'
    if (row.__version !== version) row.__saveAgain = true
    // 本地落位、不整页重载：getList 会把 sampleList 换成全新对象，在途编辑行的定时器还指着旧对象。
    draftRows.value = draftRows.value.filter((item) => item !== row)
    if (queryParams.value.pageNum === 1 && !sampleList.value.some((item) => item.id === id)) sampleList.value.unshift(row)
    total.value += 1
    await loadSummary()
    await loadFilterOptions()
  } catch (error) {
    row.__localState = 'error'
    row.__error = error?.message || '新增失败'
    toast.add({ title: row.__error, color: 'error' })
  } finally {
    row.__savePromise = null
    if (row.__saveAgain && !row.__isDraft) {
      row.__saveAgain = false
      scheduleRowSave(row, 0)
    }
  }
}

function retryRowSave(row) {
  if (row?.__isDraft) scheduleDraftSave(row)
  else scheduleRowSave(row, 0)
}

function handleAdd() {
  if (!canAdd.value) return
  if (draftRows.value.length >= 500) {
    toast.add({ title: '新增行不能超过 500 行', color: 'warning' })
    return
  }
  draftRows.value.push(prepareRow({}, true))
}

function cancelDraft(row) {
  clearRowTimer(row)
  if (row?.__savePromise) {
    toast.add({ title: '新增请求正在保存，请稍候', color: 'warning' })
    return
  }
  draftRows.value = draftRows.value.filter((item) => item !== row)
}

async function handleDelete(row) {
  if (!row?.id || !canRemove.value || !window.confirm(`确认删除 ${row.partNo || row.id} 吗？`)) return
  clearRowTimer(row)
  try {
    await deleteSampleProgress(row.id)
    toast.add({ title: '样品进度已删除', color: 'success' })
    sampleList.value = sampleList.value.filter((item) => item !== row)
    total.value = Math.max(0, total.value - 1)
    await loadSummary()
  } catch (error) {
    toast.add({ title: error?.message || '删除失败', color: 'error' })
  }
}

async function removeSelectedRows() {
  if (!canRemove.value) {
    toast.add({ title: '你没有删除权限', color: 'warning' })
    return
  }
  const indexes = await sampleGridRef.value?.getSelectedRowIndexes?.()
  if (!indexes?.length) {
    toast.add({ title: '请先框选要删除的行', color: 'warning' })
    return
  }
  const selected = indexes.map((index) => displayRows.value[index]).filter(Boolean)
  if (!selected.length) return
  if (!window.confirm(`确认删除选中的 ${selected.length} 行吗？`)) return

  const drafts = selected.filter((row) => row.__isDraft)
  const saved = selected.filter((row) => row?.id != null)
  drafts.forEach((row) => cancelDraft(row))

  if (saved.length) {
    try {
      await deleteSampleProgress(saved.map((row) => row.id))
      toast.add({ title: `已删除 ${saved.length} 行`, color: 'success' })
      const savedSet = new Set(saved)
      sampleList.value = sampleList.value.filter((item) => !savedSet.has(item))
      total.value = Math.max(0, total.value - saved.length)
      await loadSummary()
    } catch (error) {
      toast.add({ title: error?.message || '删除失败', color: 'error' })
    }
  }
  sampleGridRef.value?.clearSelectedRange?.()
}

function hasPendingChanges() {
  return displayRows.value.some((row) => ['draft', 'dirty', 'saving', 'error'].includes(row.__localState))
}

function guardNavigation() {
  if (!hasPendingChanges()) return true
  toast.add({ title: '请先等待保存完成，或处理失败记录后再切换列表', color: 'warning' })
  return false
}

const pageModel = computed({
  get: () => queryParams.value.pageNum,
  set: (value) => { if (guardNavigation()) queryParams.value.pageNum = value },
})
const pageSizeModel = computed({
  get: () => queryParams.value.pageSize,
  set: (value) => { if (guardNavigation()) queryParams.value.pageSize = value },
})

async function loadSummary() {
  try {
    const response = await getSampleProgressSummary({
      ...queryParams.value,
      overdue: queryParams.value.overdue ? '1' : '',
    })
    Object.assign(summary, response?.data || {})
  } catch (_) {
    // 列表数据仍可使用，统计接口失败时保留上一次结果。
  }
}

async function loadFilterOptions() {
  try {
    const response = await getSampleProgressOptions()
    const data = response?.data || {}
    const toItems = (values, allLabel) => [
      { label: allLabel, value: '__all__' },
      ...(Array.isArray(values) ? values.filter(Boolean).map((value) => ({ label: value, value })) : []),
    ]
    salespersonFilterItems.value = toItems(data.salesperson, '全部业务员')
    countryFilterItems.value = toItems(data.country, '全部国家')
  } catch (_) {
    // 下拉选项不可用时保留“全部”选项。
  }
}

const { loading, list: sampleList, total, getList, handleQuery: queryList, resetQuery: resetListQuery } = useTkListQuery({
  queryParams,
  fetchList: async () => {
    try {
      const response = await listSampleProgress({
        ...queryParams.value,
        overdue: queryParams.value.overdue ? '1' : '',
      })
      return response
    } catch (error) {
      if (import.meta.client && !listErrorNotified) {
        listErrorNotified = true
        toast.add({ title: error?.message || '样品进度列表暂时不可用，请检查查询权限', color: 'error' })
      }
      return { rows: [], total: 0 }
    }
  },
  beforeReset: () => {
    suppressFilterWatch = true
    Object.assign(queryParams.value, {
      pageNum: 1,
      keyword: '',
      status: '',
      salesperson: '',
      country: '',
      sampleOrderDateFrom: '',
      sampleOrderDateTo: '',
      overdue: false,
    })
    nextTick(() => { suppressFilterWatch = false })
  },
  afterLoad: () => {
    sampleList.value = sampleList.value.map((row) => prepareRow(row))
    loadSummary()
  },
})

function handleQuery() {
  if (guardNavigation()) return queryList()
}

function resetQuery() {
  if (guardNavigation()) return resetListQuery()
}

function handlePagination() {
  if (guardNavigation()) getList()
}

watch(() => filterKeys.map((key) => queryParams.value[key]), (next, previous) => {
  if (suppressFilterWatch) return
  if (hasPendingChanges()) {
    suppressFilterWatch = true
    filterKeys.forEach((key, index) => { queryParams.value[key] = previous[index] })
    nextTick(() => { suppressFilterWatch = false })
    guardNavigation()
    return
  }
  clearTimeout(filterSearchTimer)
  filterSearchTimer = setTimeout(() => {
    filterSearchTimer = null
    handleQuery()
  }, 250)
}, { deep: true })

async function handleImportFile(event) {
  if (!canImport.value) return
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (!guardNavigation()) return
  importing.value = true
  try {
    const response = await importSampleProgress(file)
    toast.add({ title: response?.msg || '导入成功', color: 'success' })
    await getList()
    await loadSummary()
    await loadFilterOptions()
  } catch (error) {
    toast.add({ title: error?.message || '导入失败', color: 'error' })
  } finally {
    importing.value = false
  }
}

function handleExport() {
  if (!canQuery.value) return
  proxy.download('tk_custom/sample_progress/export', {
    ...queryParams.value,
    overdue: queryParams.value.overdue ? '1' : '',
  }, `客户样品进度_${Date.now()}.xlsx`)
}

onMounted(loadFilterOptions)
onBeforeUnmount(() => {
  clearTimeout(filterSearchTimer)
  for (const timer of rowTimers) clearTimeout(timer)
  for (const row of displayRows.value) clearRowTimer(row)
})

getList()
</script>
