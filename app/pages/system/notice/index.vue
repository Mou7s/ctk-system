<template>
  <div class="app-container">
    <div class="flex flex-wrap items-end gap-2 mb-4">
      <UInput v-model="queryParams.noticeTitle" placeholder="请输入公告标题" clearable class="w-52" @keyup.enter="handleQuery" />
      <UInput v-model="queryParams.createBy" placeholder="请输入操作人员" clearable class="w-52" @keyup.enter="handleQuery" />
      <USelect v-model="queryParams.noticeType" :items="sys_notice_type" placeholder="公告类型" clearable class="w-52" />
      <USelect v-model="queryParams.status" :items="sys_notice_status" placeholder="状态" clearable class="w-52" />
      <UButton color="primary" icon="i-lucide-search" @click="handleQuery">搜索</UButton>
      <UButton variant="outline" icon="i-lucide-rotate-ccw" @click="resetQuery">重置</UButton>
    </div>

    <div class="flex items-center gap-2 mb-4">
      <UButton color="primary" variant="outline" icon="i-lucide-plus" @click="handleAdd">新增</UButton>
      <UButton color="success" variant="outline" icon="i-lucide-edit" :disabled="single" @click="handleUpdate">修改</UButton>
      <UButton color="error" variant="outline" icon="i-lucide-trash" :disabled="multiple" @click="handleDelete">删除</UButton>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList" class="ml-auto" />
    </div>

    <TkUTable
      :loading="loading"
      :data="noticeList"
      :columns="columns"
      :ui="{ td: 'p-2 text-sm text-default whitespace-nowrap', th: 'px-3 py-2 text-sm text-highlighted text-left font-semibold' }"
      @selection-change="handleSelectionChange"
      @row-dblclick="handleRowDblClick"
    />

    <pagination
      v-show="total > 0"
      :total="total"
      v-model:page="queryParams.pageNum"
      v-model:limit="queryParams.pageSize"
      @pagination="getList"
    />

    <UModal v-model:open="open" :title="title" :ui="{ content: 'max-w-3xl' }">
      <template #body>
        <UForm ref="noticeFormRef" :state="form" :rules="rules" class="space-y-4" @submit="submitForm">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UFormField label="公告标题" name="noticeTitle" required>
              <UInput v-model="form.noticeTitle" placeholder="请输入公告标题" />
            </UFormField>
            <UFormField label="公告类型" name="noticeType" required>
              <USelect v-model="form.noticeType" :items="sys_notice_type" placeholder="请选择" />
            </UFormField>
          </div>
          <UFormField label="状态" class="col-span-2">
            <URadioGroup v-model="form.status" :items="sys_notice_status" />
          </UFormField>
          <UFormField label="内容" class="col-span-2">
            <editor v-model="form.noticeContent" :min-height="192" />
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

<script setup name="Notice">
import { h, resolveComponent } from 'vue'
import { listNotice, getNotice, delNotice, addNotice, updateNotice } from '@/api/system/notice'
import { useDict } from '@/utils/dict'
import { TkUTable } from '@ctk-system/ui'
import { useTkListQuery } from '@ctk-system/composables'
import { parseTime } from '@/utils/helpers'
const toast = useToast();

const UButton = resolveComponent('UButton')
const UCheckbox = resolveComponent('UCheckbox')

const { proxy } = getCurrentInstance()
const { sys_notice_status, sys_notice_type } = useDict('sys_notice_status', 'sys_notice_type')

const open = ref(false)
const showSearch = ref(true)
const currentRowId = ref(null)
const ids = ref([])
const single = ref(true)
const multiple = ref(true)
const title = ref('')
const noticeFormRef = ref(null)

const queryParams = ref({
  pageNum: 1,
  pageSize: 10,
  noticeTitle: undefined,
  createBy: undefined,
  noticeType: undefined,
  status: undefined,
})

// 列表查询（分页 / loading / 并发守卫 / code!==200 判定）统一交给公共 composable
const {
  list: noticeList,
  loading,
  total,
  error: listError,
  getList,
  handleQuery,
  resetQuery,
} = useTkListQuery({
  queryParams,
  fetchList: () => listNotice(queryParams.value),
  beforeReset: () => {
    queryParams.value.noticeTitle = undefined
    queryParams.value.createBy = undefined
    queryParams.value.noticeType = undefined
    queryParams.value.status = undefined
  },
})
watch(listError, (msg) => {
  if (msg) toast.add({ title: '查询失败：' + msg, color: 'error' })
})
const form = reactive({})
const rules = {
  noticeTitle: [{ required: true, message: '公告标题不能为空', trigger: 'blur' }],
  noticeType: [{ required: true, message: '公告类型不能为空', trigger: 'change' }],
}

function cancel() {
  open.value = false
  reset()
}

function reset() {
  Object.assign(form, {
    noticeId: undefined,
    noticeTitle: undefined,
    noticeType: undefined,
    noticeContent: undefined,
    status: '0',
  })
  noticeFormRef.value?.clear?.()
}

function handleSelectionChange(selection) {
  ids.value = selection.map((item) => item.noticeId)
  currentRowId.value = selection.length === 1 ? selection[0].noticeId : null
  single.value = selection.length != 1
  multiple.value = !selection.length
}

function handleRowDblClick(row) {
  const data = row?.original ?? row
  if (!data?.noticeId) return
  handleUpdate(data)
}

function handleAdd() {
  reset()
  open.value = true
  title.value = '添加公告'
}

function handleUpdate(row) {
  reset()
  const noticeId = row?.noticeId || ids.value
  getNotice(noticeId).then((response) => {
    Object.assign(form, response.data)
    open.value = true
    title.value = '修改公告'
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
  if (form.noticeId != undefined) {
    await updateNotice(form)
    toast.add({ title: '修改成功', color: 'success' })
  } else {
    await addNotice(form)
    toast.add({ title: '新增成功', color: 'success' })
  }
  open.value = false
  getList()
}

function handleDelete(row) {
  const noticeIds = row?.noticeId || ids.value
  if (!confirm(`是否确认删除公告编号为"${noticeIds}"的数据项？`)) return
  delNotice(noticeIds).then(() => {
    getList()
    toast.add({ title: '删除成功', color: 'success' })
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
  { accessorKey: 'noticeId', header: '序号', size: 100, cell: ({ row }) => h('span', String(row.original.noticeId ?? '')) },
  { accessorKey: 'noticeTitle', header: '公告标题', cell: ({ row }) => h('span', row.original.noticeTitle ?? '') },
  { accessorKey: 'noticeType', header: '公告类型', size: 100, cell: ({ row }) => h('span', dictLabel(sys_notice_type.value, row.original.noticeType)) },
  { accessorKey: 'status', header: '状态', size: 100, cell: ({ row }) => h('span', dictLabel(sys_notice_status.value, row.original.status)) },
  { accessorKey: 'createBy', header: '创建者', size: 100, cell: ({ row }) => h('span', row.original.createBy ?? '') },
  { accessorKey: 'createTime', header: '创建时间', size: 100, cell: ({ row }) => h('span', row.original.createTime ? parseTime(row.original.createTime, '{y}-{m}-{d}') : '') },
  {
    id: 'actions',
    header: '操作',
    enableSorting: false,
    cell: ({ row }) =>
      h('div', { class: 'flex gap-1 items-center' }, [
        h(UButton, { variant: 'link', color: 'primary', icon: 'i-lucide-edit', onClick: () => handleUpdate(row.original) }, () => '修改'),
        h(UButton, { variant: 'link', color: 'primary', icon: 'i-lucide-trash', onClick: () => handleDelete(row.original) }, () => '删除'),
      ]),
  },
]

onMounted(() => {
  getList()
})
</script>