<template>
  <div class="app-container absolute inset-0 flex min-h-0 flex-col overflow-hidden px-2 pt-2 pb-0 sm:px-3 sm:pt-3">
    <div v-show="showSearch" class="flex flex-wrap items-end gap-2 mb-4 shrink-0">
      <UInput v-model="queryParams.ipaddr" placeholder="请输入登录地址" clearable class="w-52" @keyup.enter="handleQuery" />
      <UInput v-model="queryParams.userName" placeholder="请输入用户名称" clearable class="w-52" @keyup.enter="handleQuery" />
      <UButton color="primary" icon="i-lucide-search" @click="handleQuery">搜索</UButton>
      <UButton variant="outline" icon="i-lucide-rotate-ccw" @click="resetQuery">重置</UButton>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList" class="ml-auto" />
    </div>

    <div class="min-h-0 flex-1 overflow-hidden">
      <TkUTable
        :loading="loading"
        :data="onlineList"
        :columns="columns"
        :ui="{ td: 'p-2 text-sm text-default whitespace-nowrap', th: 'px-3 py-2 text-sm text-highlighted text-left font-semibold' }"
        style="height: 100%"
      />
    </div>

    <pagination v-show="total > 0" class="shrink-0" :total="total" v-model:page="pageNum" v-model:limit="pageSize" @pagination="handlePage" />
  </div>
</template>

<script setup name="Online">
import { h, resolveComponent } from 'vue'
import { forceLogout, list as initData } from '@/api/monitor/online'
import { TkUTable } from '@ctk-system/ui'
import { parseTime } from '@/utils/helpers'
const toast = useToast();

const UButton = resolveComponent('UButton')
const { proxy } = getCurrentInstance()

const onlineList = ref([])
const onlineAll = ref([])
const loading = ref(true)
const showSearch = ref(true)
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(50)
const queryParams = ref({
  ipaddr: undefined,
  userName: undefined,
})

function getList() {
  loading.value = true
  // 后端返回全量在线会话，分页在前端切片
  initData({ ...queryParams.value }).then((response) => {
    onlineAll.value = response.rows || []
    total.value = response.total ?? onlineAll.value.length
    applyPage()
    loading.value = false
  })
}

function applyPage() {
  const start = (pageNum.value - 1) * pageSize.value
  onlineList.value = onlineAll.value.slice(start, start + pageSize.value)
}

function handlePage() {
  applyPage()
}

function handleQuery() {
  pageNum.value = 1
  getList()
}

function resetQuery() {
  queryParams.value = { ipaddr: undefined, userName: undefined }
  handleQuery()
}

function handleForceLogout(row) {
  if (!confirm(`是否确认强退名称为"${row.userName}"的用户?`)) return
  forceLogout(row.tokenId).then(() => {
    getList()
    toast.add({ title: '删除成功', color: 'success' })
  })
}

const columns = [
  { id: 'index', header: '序号', size: 50, cell: ({ row }) => h('span', String(row.index + 1)) },
  { accessorKey: 'tokenId', header: '会话编号', cell: ({ row }) => h('span', row.original.tokenId ?? '') },
  { accessorKey: 'userName', header: '登录名称', cell: ({ row }) => h('span', row.original.userName ?? '') },
  { accessorKey: 'deptName', header: '所属部门', cell: ({ row }) => h('span', row.original.deptName ?? '') },
  { accessorKey: 'ipaddr', header: '主机', cell: ({ row }) => h('span', row.original.ipaddr ?? '') },
  { accessorKey: 'loginLocation', header: '登录地点', cell: ({ row }) => h('span', row.original.loginLocation ?? '') },
  { accessorKey: 'os', header: '操作系统', cell: ({ row }) => h('span', row.original.os ?? '') },
  { accessorKey: 'browser', header: '浏览器', cell: ({ row }) => h('span', row.original.browser ?? '') },
  { accessorKey: 'loginTime', header: '登录时间', size: 180, cell: ({ row }) => h('span', row.original.loginTime ? parseTime(row.original.loginTime) : '') },
  {
    id: 'actions',
    header: '操作',
    enableSorting: false,
    cell: ({ row }) =>
      h(UButton, { variant: 'link', color: 'primary', icon: 'i-lucide-log-out', onClick: () => handleForceLogout(row.original) }, () => '强退'),
  },
]

onMounted(() => {
  getList()
})
</script>