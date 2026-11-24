<template>
  <div class="app-container absolute inset-0 flex min-h-0 flex-col overflow-hidden px-2 pt-2 pb-0 sm:px-3 sm:pt-3">
    <div v-show="showSearch" class="flex flex-wrap items-end gap-2 mb-4 shrink-0">
      <UInput v-model="queryParams.operIp" placeholder="请输入操作地址" clearable class="w-60" @keyup.enter="handleQuery" />
      <UInput v-model="queryParams.title" placeholder="请输入系统模块" clearable class="w-60" @keyup.enter="handleQuery" />
      <UInput v-model="queryParams.operName" placeholder="请输入操作人员" clearable class="w-60" @keyup.enter="handleQuery" />
      <USelect v-model="queryParams.businessType" :items="sys_oper_type" placeholder="操作类型" clearable class="w-60" />
      <USelect v-model="queryParams.status" :items="sys_common_status" placeholder="操作状态" clearable class="w-60" />
      <TkDateRangePicker v-model="dateRange" value-format="datetime" class="w-full sm:w-64" />
      <UButton color="primary" icon="i-lucide-search" @click="handleQuery">搜索</UButton>
      <UButton variant="outline" icon="i-lucide-rotate-ccw" @click="resetQuery">重置</UButton>
    </div>

    <div class="flex items-center gap-2 mb-4 shrink-0">
      <UButton color="error" variant="outline" icon="i-lucide-trash" :disabled="multiple" @click="handleDelete">删除</UButton>
      <UButton color="error" variant="outline" icon="i-lucide-eraser" @click="handleClean">清空</UButton>
      <UButton color="warning" variant="outline" icon="i-lucide-download" @click="handleExport">导出</UButton>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList" class="ml-auto" />
    </div>

    <div class="min-h-0 flex-1 overflow-hidden">
    <TkUTable
      ref="operlogTableRef"
      :loading="loading"
      :data="operlogList"
      :columns="columns"
      :ui="{ td: 'p-2 text-sm text-default whitespace-nowrap', th: 'px-3 py-2 text-sm text-highlighted text-left font-semibold' }"
      :default-sort="defaultSort"
      @selection-change="handleSelectionChange"
      @sort-change="handleSortChange"
      style="height: 100%"
    />
    </div>

    <pagination
      class="shrink-0"
      v-show="total > 0"
      :total="total"
      v-model:page="queryParams.pageNum"
      v-model:limit="queryParams.pageSize"
      @pagination="getList"
    />

    <UModal v-model:open="open" title="操作日志详细" :ui="{ content: 'max-w-3xl' }">
      <template #body>
        <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt class="text-muted">操作模块：</dt><dd>{{ form.title }} / {{ typeFormat(form) }}</dd>
          <dt class="text-muted">登录信息：</dt><dd>{{ form.operName }} / {{ form.operIp }} / {{ form.operLocation }}</dd>
          <dt class="text-muted">请求地址：</dt><dd>{{ form.operUrl }}</dd>
          <dt class="text-muted">请求方式：</dt><dd>{{ form.requestMethod }}</dd>
          <dt class="text-muted col-span-2">操作方法：</dt><dd class="col-span-2">{{ form.method }}</dd>
          <dt class="text-muted col-span-2">请求参数：</dt><dd class="col-span-2">{{ form.operParam }}</dd>
          <dt class="text-muted col-span-2">返回参数：</dt><dd class="col-span-2">{{ form.jsonResult }}</dd>
          <dt class="text-muted">操作状态：</dt>
          <dd>
            <span v-if="form.status === 0">正常</span>
            <span v-else-if="form.status === 1">失败</span>
          </dd>
          <dt class="text-muted">消耗时间：</dt><dd>{{ form.costTime }}毫秒</dd>
          <dt class="text-muted">操作时间：</dt><dd>{{ parseTime(form.operTime) }}</dd>
          <template v-if="form.status === 1">
            <dt class="text-muted col-span-2">异常信息：</dt><dd class="col-span-2">{{ form.errorMsg }}</dd>
          </template>
        </dl>
      </template>
      <template #footer>
        <UButton @click="open = false">关 闭</UButton>
      </template>
    </UModal>
  </div>
</template>

<script setup name="Operlog">
import { h, resolveComponent } from 'vue'
import { list, delOperlog, cleanOperlog } from '@/api/monitor/operlog'
import { useDict } from '@/utils/dict'
import { TkUTable } from '@ctk-system/ui'
import { useTkListQuery } from '@ctk-system/composables'
import { parseTime } from '@/utils/helpers'
const toast = useToast();

const UButton = resolveComponent('UButton')

const { proxy } = getCurrentInstance()
const { sys_oper_type, sys_common_status } = useDict('sys_oper_type', 'sys_common_status')

const open = ref(false)
const showSearch = ref(true)
const ids = ref([])
const single = ref(true)
const multiple = ref(true)
const title = ref('')
const dateRange = ref([])
const defaultSort = ref({ prop: 'operTime', order: 'descending' })
const operlogTableRef = ref(null)

const queryParams = ref({
  pageNum: 1,
  pageSize: 10,
  operIp: undefined,
  title: undefined,
  operName: undefined,
  businessType: undefined,
  status: undefined,
})

// 列表查询（分页 / loading / 并发守卫 / code!==200 判定）统一交给公共 composable
const {
  list: operlogList,
  loading,
  total,
  error: listError,
  getList,
  handleQuery,
  resetQuery,
} = useTkListQuery({
  queryParams,
  fetchList: () => list(proxy.addDateRange(queryParams.value, dateRange.value)),
  beforeReset: () => {
    dateRange.value = []
  },
})
watch(listError, (msg) => {
  if (msg) toast.add({ title: '查询失败：' + msg, color: 'error' })
})
const form = ref({})

function typeFormat(row) {
  return sys_oper_type.value?.find?.((d) => d.value === row.businessType)?.label ?? row.businessType
}

function handleSelectionChange(selection) {
  ids.value = selection.map((item) => item.operId)
  multiple.value = !selection.length
}

function handleSortChange(column) {
  queryParams.value.orderByColumn = column.prop
  queryParams.value.isAsc = column.order
  getList()
}

function handleView(row) {
  open.value = true
  form.value = row
}

function handleDelete() {
  const operIds = ids.value
  if (!confirm(`是否确认删除日志编号为"${operIds}"的数据项?`)) return
  delOperlog(operIds).then(() => {
    getList()
    toast.add({ title: '删除成功', color: 'success' })
  })
}

function handleClean() {
  if (!confirm('是否确认清空所有操作日志数据项?')) return
  cleanOperlog().then(() => {
    getList()
    toast.add({ title: '清空成功', color: 'success' })
  })
}

function handleExport() {
  proxy.download('monitor/operlog/export', { ...queryParams.value }, `config_${Date.now()}.xlsx`)
}

const dictLabel = (list, value) => list?.find?.((d) => d.value === value)?.label ?? value ?? ''

const columns = [
  { id: 'selection', header: () => h('span'), enableSorting: false, enableHiding: false },
  { accessorKey: 'operId', header: '日志编号', cell: ({ row }) => h('span', String(row.original.operId ?? '')) },
  { accessorKey: 'title', header: '系统模块', cell: ({ row }) => h('span', row.original.title ?? '') },
  { accessorKey: 'businessType', header: '操作类型', cell: ({ row }) => h('span', dictLabel(sys_oper_type.value, row.original.businessType)) },
  { accessorKey: 'operName', header: '操作人员', size: 110, cell: ({ row }) => h('span', row.original.operName ?? ''), enableSorting: true },
  { accessorKey: 'operIp', header: '操作地址', size: 130, cell: ({ row }) => h('span', row.original.operIp ?? '') },
  { accessorKey: 'status', header: '操作状态', cell: ({ row }) => h('span', dictLabel(sys_common_status.value, row.original.status)) },
  { accessorKey: 'operTime', header: '操作日期', size: 180, cell: ({ row }) => h('span', row.original.operTime ? parseTime(row.original.operTime) : ''), enableSorting: true },
  { accessorKey: 'costTime', header: '消耗时间', size: 110, cell: ({ row }) => h('span', `${row.original.costTime ?? ''}毫秒`), enableSorting: true },
  {
    id: 'actions',
    header: '操作',
    enableSorting: false,
    cell: ({ row }) =>
      h(UButton, { variant: 'link', color: 'primary', icon: 'i-lucide-eye', onClick: () => handleView(row.original) }, () => '详细'),
  },
]

onMounted(() => {
  getList()
})
</script>