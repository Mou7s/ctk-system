<template>
  <div class="app-container absolute inset-0 flex min-h-0 flex-col overflow-hidden px-2 pt-2 pb-0 sm:px-3 sm:pt-3">
    <div v-show="showSearch" class="flex flex-wrap items-end gap-2 mb-4 shrink-0">
      <UInput v-model="queryParams.dictName" placeholder="请输入字典名称" clearable class="w-60" @keyup.enter="handleQuery" />
      <UInput v-model="queryParams.dictType" placeholder="请输入字典类型" clearable class="w-60" @keyup.enter="handleQuery" />
      <USelect v-model="queryParams.status" :items="sys_normal_disable" placeholder="字典状态" clearable class="w-60" />
      <TkDateRangePicker v-model="dateRange" class="w-full sm:w-64" />
      <UButton color="primary" icon="i-lucide-search" @click="handleQuery">搜索</UButton>
      <UButton variant="outline" icon="i-lucide-rotate-ccw" @click="resetQuery">重置</UButton>
    </div>

    <div class="flex items-center gap-2 mb-4 shrink-0">
      <UButton color="primary" variant="outline" icon="i-lucide-plus" @click="handleAdd">新增</UButton>
      <UButton color="success" variant="outline" icon="i-lucide-edit" :disabled="single" @click="handleUpdate">修改</UButton>
      <UButton color="error" variant="outline" icon="i-lucide-trash" :disabled="multiple" @click="handleDelete">删除</UButton>
      <UButton color="warning" variant="outline" icon="i-lucide-download" @click="handleExport">导出</UButton>
      <UButton color="error" variant="outline" icon="i-lucide-rotate-cw" @click="handleRefreshCache">刷新缓存</UButton>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList" class="ml-auto" />
    </div>

    <div class="min-h-0 flex-1 overflow-hidden">
      <TkUTable
        :loading="loading"
        :data="typeList"
        :columns="columns"
        :ui="{ td: 'p-2 text-sm text-default whitespace-nowrap', th: 'px-3 py-2 text-sm text-highlighted text-left font-semibold' }"
        style="height: 100%"
        @selection-change="handleSelectionChange"
        @row-dblclick="handleRowDblClick"
      />
    </div>

    <pagination
      v-show="total > 0"
      class="shrink-0"
      :total="total"
      v-model:page="queryParams.pageNum"
      v-model:limit="queryParams.pageSize"
      @pagination="getList"
    />

    <UModal v-model:open="open" :title="title" :ui="{ content: 'max-w-3xl' }">
      <template #body>
        <UForm ref="dictFormRef" :state="form" :rules="rules" class="space-y-4" @submit="submitForm">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UFormField label="字典名称" name="dictName" required>
              <UInput v-model="form.dictName" placeholder="请输入字典名称" class="w-full" />
            </UFormField>
            <UFormField label="字典类型" name="dictType" required>
              <UInput v-model="form.dictType" placeholder="请输入字典类型" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="状态" name="status">
            <URadioGroup v-model="form.status" :items="sys_normal_disable" />
          </UFormField>
          <UFormField label="备注" name="remark">
            <UTextarea v-model="form.remark" placeholder="请输入内容" class="w-full" :rows="3" />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton color="neutral" @click="cancel">取 消</UButton>
        <UButton color="primary" @click="submitForm">确 定</UButton>
      </template>
    </UModal>
  </div>
</template>

<script setup name="Dict">
import { h, resolveComponent } from 'vue'
import { listType, getType, delType, addType, updateType, refreshCache } from '@/api/system/dict/type'
import { useDict } from '@/utils/dict'
import { TkUTable } from '@ctk-system/ui'
import { useTkListQuery } from '@ctk-system/composables'
import { parseTime } from '@/utils/helpers'
const toast = useToast();

const UButton = resolveComponent('UButton')
const UCheckbox = resolveComponent('UCheckbox')

const router = useRouter()
const { proxy } = getCurrentInstance()
const { sys_normal_disable } = useDict('sys_normal_disable')

const open = ref(false)
const showSearch = ref(true)
const currentRowId = ref(null)
const ids = ref([])
const single = ref(true)
const multiple = ref(true)
const title = ref('')
const dateRange = ref([])
const dictFormRef = ref(null)

const queryParams = ref({
  pageNum: 1,
  pageSize: 50,
  dictName: undefined,
  dictType: undefined,
  status: undefined,
})

// 列表查询（分页 / loading / 并发守卫 / code!==200 判定）统一交给公共 composable
const {
  list: typeList,
  loading,
  total,
  error: listError,
  getList,
  handleQuery,
  resetQuery,
} = useTkListQuery({
  queryParams,
  fetchList: () => listType(proxy.addDateRange(queryParams.value, dateRange.value)),
  beforeReset: () => {
    queryParams.value.dictName = undefined
    queryParams.value.dictType = undefined
    queryParams.value.status = undefined
    dateRange.value = []
  },
})
watch(listError, (msg) => {
  if (msg) toast.add({ title: '查询失败：' + msg, color: 'error' })
})
const form = reactive({})
const rules = {
  dictName: [{ required: true, message: '字典名称不能为空', trigger: 'blur' }],
  dictType: [{ required: true, message: '字典类型不能为空', trigger: 'blur' }],
}

function cancel() {
  open.value = false
  reset()
}

function reset() {
  Object.assign(form, {
    dictId: undefined,
    dictName: undefined,
    dictType: undefined,
    status: '0',
    remark: undefined,
  })
  dictFormRef.value?.clear?.()
}

function handleAdd() {
  reset()
  open.value = true
  title.value = '添加字典类型'
}

function handleSelectionChange(selection) {
  ids.value = selection.map((item) => item.dictId)
  currentRowId.value = selection.length === 1 ? selection[0].dictId : null
  single.value = selection.length != 1
  multiple.value = !selection.length
}

function handleRowDblClick(row) {
  const data = row?.original ?? row
  if (!data?.dictId) return
  handleUpdate(data)
}

function handleUpdate(row) {
  reset()
  const dictId = row?.dictId || ids.value
  getType(dictId).then((response) => {
    Object.assign(form, response.data)
    open.value = true
    title.value = '修改字典类型'
  })
}

async function submitForm() {
  for (const [field, ruleList] of Object.entries(rules)) {
    for (const rule of ruleList) {
      if (rule.required && !form[field]) {
        toast.add({ title: rule.message, color: 'error' })
        return
      }
    }
  }
  if (form.dictId != undefined) {
    await updateType(form)
    toast.add({ title: '修改成功', color: 'success' })
  } else {
    await addType(form)
    toast.add({ title: '新增成功', color: 'success' })
  }
  open.value = false
  getList()
}

function handleDelete(row) {
  const dictIds = row?.dictId || ids.value
  if (!confirm(`是否确认删除字典编号为"${dictIds}"的数据项？`)) return
  delType(dictIds).then(() => {
    getList()
    toast.add({ title: '删除成功', color: 'success' })
  })
}

function handleExport() {
  proxy.download('system/dict/type/export', { ...queryParams.value }, `dict_${Date.now()}.xlsx`)
}

function handleRefreshCache() {
  refreshCache().then(() => {
    toast.add({ title: '刷新成功', color: 'success' })
  })
}

const dictLabel = (list, value) => list?.find?.((d) => d.value === value)?.label ?? value ?? ''

const columns = [
  {
    id: 'selection',
    header: ({ table }) =>
      h(UCheckbox, {
        modelValue: table.getIsAllRowsSelected() ? true : table.getIsSomeRowsSelected() ? 'indeterminate' : false,
        'onUpdate:modelValue': (value) => table.toggleAllRowsSelected(!!value),
        ariaLabel: '全选',
      }),
    cell: ({ row }) =>
      h(UCheckbox, {
        modelValue: row.getIsSelected(),
        'onUpdate:modelValue': (value) => row.toggleSelected(!!value),
        ariaLabel: '选择行',
        onClick: (event) => event.stopPropagation(),
        onDblclick: (event) => event.stopPropagation(),
      }),
    enableSorting: false,
    enableHiding: false,
    size: 40,
  },
  { accessorKey: 'dictId', header: '字典编号', cell: ({ row }) => h('span', String(row.original.dictId ?? '')) },
  { accessorKey: 'dictName', header: '字典名称', cell: ({ row }) => h('span', row.original.dictName ?? '') },
  {
    accessorKey: 'dictType',
    header: '字典类型',
    cell: ({ row }) => h('span', row.original.dictType ?? ''),
  },
  { accessorKey: 'status', header: '状态', cell: ({ row }) => h('span', dictLabel(sys_normal_disable.value, row.original.status)) },
  { accessorKey: 'remark', header: '备注', cell: ({ row }) => h('span', row.original.remark ?? '') },
  { accessorKey: 'createTime', header: '创建时间', size: 180, cell: ({ row }) => h('span', row.original.createTime ? parseTime(row.original.createTime) : '') },
  {
    id: 'actions',
    header: '操作',
    size: 160,
    enableSorting: false,
    cell: ({ row }) =>
      h('div', { class: 'flex gap-1 items-center' }, [
        h(UButton, { variant: 'link', color: 'primary', icon: 'i-lucide-edit', onClick: () => handleUpdate(row.original) }, () => '修改'),
        h(UButton, { variant: 'link', color: 'primary', icon: 'i-lucide-list-tree', onClick: () => goToDictData(row.original.dictId ?? ids.value) }, () => '数据'),
        h(UButton, { variant: 'link', color: 'primary', icon: 'i-lucide-trash', onClick: () => handleDelete(row.original) }, () => '删除'),
      ]),
  },
]

function goToDictData(dictId) {
  const id = Array.isArray(dictId) ? dictId[0] : dictId
  if (!id) {
    toast.add({ title: '请先选择一条字典类型', color: 'warning' })
    return
  }
  router.push(`/system/dict-data/index/${id}`)
}

onMounted(() => {
  getList()
})
</script>