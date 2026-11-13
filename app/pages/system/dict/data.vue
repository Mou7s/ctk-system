<template>
  <div class="app-container absolute inset-0 flex min-h-0 flex-col overflow-hidden px-2 pt-2 pb-0 sm:px-3 sm:pt-3">
    <div class="flex flex-wrap items-end gap-2 mb-4 shrink-0">
      <USelect v-model="queryParams.dictType" :items="typeOptions" placeholder="字典名称" class="w-52" />
      <UInput v-model="queryParams.dictLabel" placeholder="请输入字典标签" clearable class="w-52" @keyup.enter="handleQuery" />
      <USelect v-model="queryParams.status" :items="sys_normal_disable" placeholder="数据状态" clearable class="w-52" />
      <UButton color="primary" icon="i-lucide-search" @click="handleQuery">搜索</UButton>
      <UButton variant="outline" icon="i-lucide-rotate-ccw" @click="resetQuery">重置</UButton>
    </div>

    <div class="flex items-center gap-2 mb-4 shrink-0">
      <UButton color="primary" variant="outline" icon="i-lucide-plus" @click="handleAdd">新增</UButton>
      <UButton color="success" variant="outline" icon="i-lucide-edit" :disabled="single" @click="handleUpdate">修改</UButton>
      <UButton color="error" variant="outline" icon="i-lucide-trash" :disabled="multiple" @click="handleDelete">删除</UButton>
      <UButton color="warning" variant="outline" icon="i-lucide-download" @click="handleExport">导出</UButton>
      <UButton color="warning" variant="outline" icon="i-lucide-x" @click="handleClose">关闭</UButton>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList" class="ml-auto" />
    </div>

    <div class="min-h-0 flex-1 overflow-hidden">
      <TkUTable
        :loading="loading"
        :data="dataList"
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

    <UModal v-model:open="open" :title="title" :ui="{ content: 'max-w-lg' }">
      <template #body>
        <UForm ref="dataFormRef" :state="form" class="space-y-4">
          <UFormField label="字典类型">
            <UInput v-model="form.dictType" disabled />
          </UFormField>
          <UFormField label="数据标签" name="dictLabel" required>
            <UInput v-model="form.dictLabel" placeholder="请输入数据标签" />
          </UFormField>
          <UFormField label="数据键值" name="dictValue" required>
            <UInput v-model="form.dictValue" placeholder="请输入数据键值" />
          </UFormField>
          <UFormField label="样式属性" name="cssClass">
            <UInput v-model="form.cssClass" placeholder="请输入样式属性" />
          </UFormField>
          <UFormField label="显示排序" name="dictSort" required>
            <UInputNumber v-model="form.dictSort" :min="0" />
          </UFormField>
          <UFormField label="回显样式" name="listClass">
            <USelect v-model="form.listClass" :items="listClassOptions" />
          </UFormField>
          <UFormField label="状态" name="status">
            <URadioGroup v-model="form.status" :items="sys_normal_disable" />
          </UFormField>
          <UFormField label="备注" name="remark">
            <UTextarea v-model="form.remark" placeholder="请输入内容" />
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

<script setup name="Data">
import { h, resolveComponent } from 'vue'
import useDictStore from '@/store/modules/dict'
import { optionselect as getDictOptionselect, getType } from '@/api/system/dict/type'
import { listData, getData, delData, addData, updateData } from '@/api/system/dict/data'
import { useDict } from '@/utils/dict'
import { TkUTable } from '@ctk-system/ui'
import { useTkListQuery } from '@ctk-system/composables'
import { parseTime } from '@/utils/helpers'
const toast = useToast();

const { proxy } = getCurrentInstance()
const { sys_normal_disable } = useDict('sys_normal_disable')

const open = ref(false)
const showSearch = ref(true)
const currentRowId = ref(null)
const ids = ref([])
const single = ref(true)
const multiple = ref(true)
const title = ref('')
const defaultDictType = ref('')
const typeOptions = ref([])
const route = useRoute()

const listClassOptions = [
  { value: 'default', label: '默认' },
  { value: 'primary', label: '主要' },
  { value: 'success', label: '成功' },
  { value: 'info', label: '信息' },
  { value: 'warning', label: '警告' },
  { value: 'danger', label: '危险' },
]

const queryParams = ref({
  pageNum: 1,
  pageSize: 50,
  dictType: undefined,
  dictLabel: undefined,
  status: undefined,
})

// 列表查询（分页 / loading / 并发守卫 / code!==200 判定）统一交给公共 composable
const {
  list: dataList,
  loading,
  total,
  error: listError,
  getList,
  handleQuery,
  resetQuery,
} = useTkListQuery({
  queryParams,
  fetchList: () => listData(queryParams.value),
  // 重置只把字典类型还原为当前字典，其余条件由模板自身的清空负责
  beforeReset: () => {
    queryParams.value.dictType = defaultDictType.value
  },
})
watch(listError, (msg) => {
  if (msg) toast.add({ title: '查询失败：' + msg, color: 'error' })
})
const form = reactive({})
const rules = {
  dictLabel: [{ required: true, message: '数据标签不能为空', trigger: 'blur' }],
  dictValue: [{ required: true, message: '数据键值不能为空', trigger: 'blur' }],
  dictSort: [{ required: true, message: '数据顺序不能为空', trigger: 'blur' }],
}
const dataFormRef = ref(null)

function getTypes(dictId) {
  getType(dictId).then((response) => {
    queryParams.value.dictType = response.data.dictType
    defaultDictType.value = response.data.dictType
    getList()
  })
}

function getTypeList() {
  getDictOptionselect().then((response) => {
    typeOptions.value = response.data
  })
}

function cancel() {
  open.value = false
  reset()
}

function reset() {
  Object.assign(form, {
    dictCode: undefined,
    dictLabel: undefined,
    dictValue: undefined,
    cssClass: undefined,
    listClass: 'default',
    dictSort: 0,
    status: '0',
    remark: undefined,
  })
  dataFormRef.value?.clear?.()
}

function handleClose() {
  const obj = { path: '/system/dict' }
  proxy.$tab.closeOpenPage(obj)
}

function handleAdd() {
  reset()
  open.value = true
  title.value = '添加字典数据'
  form.dictType = queryParams.value.dictType
}

function handleSelectionChange(selection) {
  ids.value = selection.map((item) => item.dictCode)
  currentRowId.value = selection.length === 1 ? selection[0].dictCode : null
  single.value = selection.length != 1
  multiple.value = !selection.length
}

function handleRowDblClick(row) {
  const data = row?.original ?? row
  if (!data?.dictCode) return
  handleUpdate(data)
}

function handleUpdate(row) {
  reset()
  const dictCode = row?.dictCode || ids.value
  getData(dictCode).then((response) => {
    Object.assign(form, response.data)
    open.value = true
    title.value = '修改字典数据'
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
  if (form.dictCode != undefined) {
    await updateData(form)
    toast.add({ title: '修改成功', color: 'success' })
  } else {
    await addData(form)
    toast.add({ title: '新增成功', color: 'success' })
  }
  useDictStore().removeDict(queryParams.value.dictType)
  open.value = false
  getList()
}

function handleDelete() {
  const dictCodes = ids.value
  if (!confirm(`是否确认删除字典编码为"${dictCodes}"的数据项？`)) return
  delData(dictCodes).then(() => {
    getList()
    toast.add({ title: '删除成功', color: 'success' })
    useDictStore().removeDict(queryParams.value.dictType)
  })
}

function handleExport() {
  proxy.download('system/dict/data/export', { ...queryParams.value }, `dict_data_${Date.now()}.xlsx`)
}

const dictLabel = (list, value) => list?.find?.((d) => d.value === value)?.label ?? value ?? ''

const columns = [
  {
    id: 'selection',
    header: ({ table }) =>
      h(resolveComponent('UCheckbox'), {
        modelValue: table.getIsAllRowsSelected() ? true : table.getIsSomeRowsSelected() ? 'indeterminate' : false,
        'onUpdate:modelValue': (value) => table.toggleAllRowsSelected(!!value),
        ariaLabel: '全选',
      }),
    cell: ({ row }) =>
      h(resolveComponent('UCheckbox'), {
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
  { accessorKey: 'dictCode', header: '字典编码', cell: ({ row }) => h('span', String(row.original.dictCode ?? '')) },
  {
    accessorKey: 'dictLabel',
    header: '字典标签',
    cell: ({ row }) => {
      const listClass = row.original.listClass
      const cssClass = row.original.cssClass
      const label = row.original.dictLabel ?? ''
      if ((!listClass || listClass === 'default') && (!cssClass)) {
        return h('span', label)
      }
      const color = listClass === 'primary' ? 'primary' : (listClass || 'neutral')
      return h('span', { class: `inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-${color}/10 text-${color} ${cssClass || ''}` }, label)
    },
  },
  { accessorKey: 'dictValue', header: '字典键值', cell: ({ row }) => h('span', row.original.dictValue ?? '') },
  { accessorKey: 'dictSort', header: '字典排序', cell: ({ row }) => h('span', String(row.original.dictSort ?? '')) },
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
        h('button', { class: 'text-primary text-sm hover:underline', onClick: () => handleUpdate(row.original) }, '修改'),
        h('button', { class: 'text-primary text-sm hover:underline ml-2', onClick: () => handleDelete() }, '删除'),
      ]),
  },
]

onMounted(() => {
  getTypes(route.params?.dictId || route.query?.dictId)
  getTypeList()
})
</script>
