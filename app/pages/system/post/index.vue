<template>
  <div class="app-container absolute inset-0 flex min-h-0 flex-col overflow-hidden px-2 pt-2 pb-0 sm:px-3 sm:pt-3">
    <div v-show="showSearch" class="flex flex-wrap items-end gap-2 mb-4 shrink-0">
      <UInput v-model="queryParams.postCode" placeholder="请输入岗位编码" clearable class="w-52" @keyup.enter="handleQuery" />
      <UInput v-model="queryParams.postName" placeholder="请输入岗位名称" clearable class="w-52" @keyup.enter="handleQuery" />
      <USelect v-model="queryParams.status" :items="sys_normal_disable" placeholder="岗位状态" clearable class="w-52" />
      <UButton color="primary" icon="i-lucide-search" @click="handleQuery">搜索</UButton>
      <UButton variant="outline" icon="i-lucide-rotate-ccw" @click="resetQuery">重置</UButton>
    </div>

    <div class="flex items-center gap-2 mb-4 shrink-0">
      <UButton color="primary" variant="outline" icon="i-lucide-plus" @click="handleAdd">新增</UButton>
      <UButton color="success" variant="outline" icon="i-lucide-edit" :disabled="single" @click="handleUpdate">修改</UButton>
      <UButton color="error" variant="outline" icon="i-lucide-trash" :disabled="multiple" @click="handleDelete">删除</UButton>
      <UButton color="warning" variant="outline" icon="i-lucide-download" @click="handleExport">导出</UButton>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList" class="ml-auto" />
    </div>

    <div
      v-if="listError"
      class="mb-2 shrink-0 rounded-xl border border-error-200 bg-error-50 px-3 py-2 text-sm text-error-700 dark:border-error-900/50 dark:bg-error-950/30 dark:text-error-300"
    >
      {{ listError }}
    </div>

    <div class="min-h-0 flex-1 overflow-hidden">
    <TkUTable
      :loading="loading"
      :data="postList"
      :columns="columns"
      :ui="{ td: 'p-2 text-sm text-default whitespace-nowrap', th: 'px-3 py-2 text-sm text-highlighted text-left font-semibold' }"
      @selection-change="handleSelectionChange"
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

    <UModal v-model:open="open" :title="title" :ui="{ content: 'max-w-xl' }">
      <template #body>
        <UForm ref="postFormRef" :state="form" :rules="rules" class="space-y-4" @submit="submitForm">
          <UFormField label="岗位名称" name="postName" required>
            <UInput v-model="form.postName" placeholder="请输入岗位名称" />
          </UFormField>
          <UFormField label="岗位编码" name="postCode" required>
            <UInput v-model="form.postCode" placeholder="请输入编码名称" />
          </UFormField>
          <UFormField label="岗位顺序" name="postSort" required>
            <UInputNumber v-model="form.postSort" :min="0" />
          </UFormField>
          <UFormField label="岗位状态" name="status">
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

<script setup name="Post">
import { h, resolveComponent } from 'vue'
import { listPost, addPost, delPost, getPost, updatePost } from '@/api/system/post'
import { useDict } from '@/utils/dict'
import { TkUTable } from '@ctk-system/ui'
import { useTkListQuery } from '@ctk-system/composables'
import { parseTime } from '@/utils/helpers'
const toast = useToast();

const UButton = resolveComponent('UButton')

const { proxy } = getCurrentInstance()
const { sys_normal_disable } = useDict('sys_normal_disable')

const open = ref(false)
const showSearch = ref(true)
const ids = ref([])
const single = ref(true)
const multiple = ref(true)
const title = ref('')
const postFormRef = ref(null)

const queryParams = ref({
  pageNum: 1,
  pageSize: 10,
  postCode: undefined,
  postName: undefined,
  status: undefined,
})

// 列表查询（分页 / loading / 并发守卫 / code!==200 判定）统一交给公共 composable
const { list: postList, loading, total, error: listError, getList, handleQuery, resetQuery } = useTkListQuery({
  queryParams,
  fetchList: () => listPost(queryParams.value),
  beforeReset: () => {
    queryParams.value.postCode = undefined
    queryParams.value.postName = undefined
    queryParams.value.status = undefined
  },
})
const form = reactive({})
const rules = {
  postName: [{ required: true, message: '岗位名称不能为空', trigger: 'blur' }],
  postCode: [{ required: true, message: '岗位编码不能为空', trigger: 'blur' }],
  postSort: [{ required: true, message: '岗位顺序不能为空', trigger: 'blur' }],
}

function cancel() {
  open.value = false
  reset()
}

function reset() {
  Object.assign(form, {
    postId: undefined,
    postCode: undefined,
    postName: undefined,
    postSort: 0,
    status: '0',
    remark: undefined,
  })
  postFormRef.value?.clear?.()
}

function handleSelectionChange(selection) {
  ids.value = selection.map((item) => item.postId)
  single.value = selection.length != 1
  multiple.value = !selection.length
}

function handleAdd() {
  reset()
  open.value = true
  title.value = '添加岗位'
}

function handleUpdate(row) {
  reset()
  const postId = row?.postId || ids.value
  getPost(postId).then((response) => {
    Object.assign(form, response.data)
    open.value = true
    title.value = '修改岗位'
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
  if (form.postId != undefined) {
    await updatePost(form)
    toast.add({ title: '修改成功', color: 'success' })
  } else {
    await addPost(form)
    toast.add({ title: '新增成功', color: 'success' })
  }
  open.value = false
  getList()
}

function handleDelete(row) {
  const postIds = row?.postId || ids.value
  if (!confirm(`是否确认删除岗位编号为"${postIds}"的数据项？`)) return
  delPost(postIds).then(() => {
    getList()
    toast.add({ title: '删除成功', color: 'success' })
  })
}

function handleExport() {
  proxy.download('system/post/export', { ...queryParams.value }, `post_${Date.now()}.xlsx`)
}

const dictLabel = (list, value) => list?.find?.((d) => d.value === value)?.label ?? value ?? ''

const columns = [
  { id: 'selection', header: () => h('span'), enableSorting: false, enableHiding: false },
  { accessorKey: 'postId', header: '岗位编号', cell: ({ row }) => h('span', String(row.original.postId ?? '')) },
  { accessorKey: 'postCode', header: '岗位编码', cell: ({ row }) => h('span', row.original.postCode ?? '') },
  { accessorKey: 'postName', header: '岗位名称', cell: ({ row }) => h('span', row.original.postName ?? '') },
  { accessorKey: 'postSort', header: '岗位排序', cell: ({ row }) => h('span', String(row.original.postSort ?? '')) },
  { accessorKey: 'status', header: '状态', cell: ({ row }) => h('span', dictLabel(sys_normal_disable.value, row.original.status)) },
  { accessorKey: 'createTime', header: '创建时间', size: 180, cell: ({ row }) => h('span', row.original.createTime ? parseTime(row.original.createTime) : '') },
  {
    id: 'actions',
    header: '操作',
    size: 180,
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