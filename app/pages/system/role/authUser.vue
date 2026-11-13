<template>
  <div class="app-container absolute inset-0 flex min-h-0 flex-col overflow-hidden px-2 pt-2 pb-0 sm:px-3 sm:pt-3">
    <div v-show="showSearch" class="flex flex-wrap items-end gap-2 mb-4 shrink-0">
      <UInput v-model="queryParams.userName" placeholder="请输入用户名称" clearable class="w-60" @keyup.enter="handleQuery" />
      <UInput v-model="queryParams.phonenumber" placeholder="请输入手机号码" clearable class="w-60" @keyup.enter="handleQuery" />
      <UButton color="primary" icon="i-lucide-search" @click="handleQuery">搜索</UButton>
      <UButton variant="outline" icon="i-lucide-rotate-ccw" @click="resetQuery">重置</UButton>
    </div>

    <div class="flex items-center gap-2 mb-4 shrink-0">
      <UButton color="primary" variant="outline" icon="i-lucide-plus" @click="openSelectUser">添加用户</UButton>
      <UButton color="error" variant="outline" icon="i-lucide-x-circle" :disabled="multiple" @click="cancelAuthUserAll()">批量取消授权</UButton>
      <UButton color="warning" variant="outline" icon="i-lucide-x" @click="handleClose">关闭</UButton>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList" class="ml-auto" />
    </div>

    <div class="min-h-0 flex-1 overflow-hidden">
    <TkUTable
      :loading="loading"
      :data="userList"
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

    <select-user ref="selectRef" :roleId="queryParams.roleId" @ok="handleQuery" />
  </div>
</template>

<script setup name="AuthUser">
import { h, resolveComponent } from 'vue'
import selectUser from './selectUser'
import { allocatedUserList, authUserCancel, authUserCancelAll } from '@/api/system/role'
import { useDict } from '@/utils/dict'
import { TkUTable } from '@ctk-system/ui'
import { useTkListQuery } from '@ctk-system/composables'
import { parseTime } from '@/utils/helpers'
const toast = useToast();

const UButton = resolveComponent('UButton')

const route = useRoute()
const { proxy } = getCurrentInstance()
const { sys_normal_disable } = useDict('sys_normal_disable')

const showSearch = ref(true)
const multiple = ref(true)
const userIds = ref([])
const selectRef = ref(null)

const queryParams = ref({
  pageNum: 1,
  pageSize: 10,
  roleId: route.params?.roleId || route.query?.roleId,
  userName: undefined,
  phonenumber: undefined,
})

// 列表查询（分页 / loading / 并发守卫 / code!==200 判定）统一交给公共 composable
const {
  list: userList,
  loading,
  total,
  error: listError,
  getList,
  handleQuery,
  resetQuery,
} = useTkListQuery({
  queryParams,
  fetchList: () => allocatedUserList(queryParams.value),
  beforeReset: () => {
    queryParams.value.userName = undefined
    queryParams.value.phonenumber = undefined
  },
})
watch(listError, (msg) => {
  if (msg) toast.add({ title: '查询失败：' + msg, color: 'error' })
})

function handleClose() {
  const obj = { path: '/system/role' }
  proxy.$tab.closeOpenPage(obj)
}

function handleSelectionChange(selection) {
  userIds.value = selection.map((item) => item.userId)
  multiple.value = !selection.length
}

function openSelectUser() {
  selectRef.value?.show()
}

function cancelAuthUser(row) {
  if (!confirm(`确认要取消该用户"${row.userName}"角色吗？`)) return
  authUserCancel({ userId: row.userId, roleId: queryParams.value.roleId }).then(() => {
    getList()
    toast.add({ title: '取消授权成功', color: 'success' })
  })
}

function cancelAuthUserAll() {
  const roleId = queryParams.value.roleId
  const uIds = userIds.value.join(',')
  if (!confirm('是否取消选中用户授权数据项?')) return
  authUserCancelAll({ roleId, userIds: uIds }).then(() => {
    getList()
    toast.add({ title: '取消授权成功', color: 'success' })
  })
}

const dictLabel = (list, value) => list?.find?.((d) => d.value === value)?.label ?? value ?? ''

const columns = [
  { id: 'selection', header: () => h('span'), enableSorting: false, enableHiding: false },
  { accessorKey: 'userName', header: '用户名称', cell: ({ row }) => h('span', row.original.userName ?? '') },
  { accessorKey: 'nickName', header: '用户昵称', cell: ({ row }) => h('span', row.original.nickName ?? '') },
  { accessorKey: 'email', header: '邮箱', cell: ({ row }) => h('span', row.original.email ?? '') },
  { accessorKey: 'phonenumber', header: '手机', cell: ({ row }) => h('span', row.original.phonenumber ?? '') },
  { accessorKey: 'status', header: '状态', cell: ({ row }) => h('span', dictLabel(sys_normal_disable.value, row.original.status)) },
  { accessorKey: 'createTime', header: '创建时间', size: 180, cell: ({ row }) => h('span', row.original.createTime ? parseTime(row.original.createTime) : '') },
  {
    id: 'actions',
    header: '操作',
    enableSorting: false,
    cell: ({ row }) =>
      h(UButton, { variant: 'link', color: 'primary', icon: 'i-lucide-x-circle', onClick: () => cancelAuthUser(row.original) }, () => '取消授权'),
  },
]

onMounted(() => {
  getList()
})
</script>
