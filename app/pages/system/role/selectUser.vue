<template>
  <UModal v-model:open="visible" title="选择用户" :ui="{ content: 'max-w-3xl' }">
    <template #body>
      <div class="flex flex-wrap items-end gap-2 mb-3">
        <UInput v-model="queryParams.userName" placeholder="请输入用户名称" clearable class="w-44" @keyup.enter="handleQuery" />
        <UInput v-model="queryParams.phonenumber" placeholder="请输入手机号码" clearable class="w-44" @keyup.enter="handleQuery" />
        <UButton color="primary" icon="i-lucide-search" @click="handleQuery">搜索</UButton>
        <UButton variant="outline" icon="i-lucide-rotate-ccw" @click="resetQuery">重置</UButton>
      </div>

      <TkUTable
        :data="userList"
        :columns="columns"
        :ui="{ td: 'p-2 text-sm text-default whitespace-nowrap', th: 'px-3 py-2 text-sm text-highlighted text-left font-semibold' }"
        style="height: 260px"
        @selection-change="handleSelectionChange"
      />

      <pagination
        v-show="total > 0"
        :total="total"
        v-model:page="queryParams.pageNum"
        v-model:limit="queryParams.pageSize"
        @pagination="getList"
      />
    </template>
    <template #footer>
      <UButton color="primary" @click="handleSelectUser">确 定</UButton>
      <UButton color="neutral" @click="visible = false">取 消</UButton>
    </template>
  </UModal>
</template>

<script setup name="SelectUser">
import { h } from 'vue'
import { authUserSelectAll, unallocatedUserList } from '@/api/system/role'
import { useDict } from '@/utils/dict'
import { TkUTable } from '@ctk-system/ui'
import { useTkListQuery } from '@ctk-system/composables'
import { parseTime } from '@/utils/helpers'
const toast = useToast();

const props = defineProps({
  roleId: { type: [Number, String] },
})

const { proxy } = getCurrentInstance()
const { sys_normal_disable } = useDict('sys_normal_disable')

const visible = ref(false)
const userIds = ref([])

const queryParams = ref({
  pageNum: 1,
  pageSize: 10,
  roleId: undefined,
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
  fetchList: () => unallocatedUserList(queryParams.value),
  beforeReset: () => {
    queryParams.value.userName = undefined
    queryParams.value.phonenumber = undefined
  },
})
watch(listError, (msg) => {
  if (msg) toast.add({ title: '查询失败：' + msg, color: 'error' })
})

const dictLabel = (list, value) => list?.find?.((d) => d.value === value)?.label ?? value ?? ''

const columns = [
  { id: 'selection', header: () => h('span'), enableSorting: false, enableHiding: false },
  { accessorKey: 'userName', header: '用户名称', cell: ({ row }) => h('span', row.original.userName ?? '') },
  { accessorKey: 'nickName', header: '用户昵称', cell: ({ row }) => h('span', row.original.nickName ?? '') },
  { accessorKey: 'email', header: '邮箱', cell: ({ row }) => h('span', row.original.email ?? '') },
  { accessorKey: 'phonenumber', header: '手机', cell: ({ row }) => h('span', row.original.phonenumber ?? '') },
  { accessorKey: 'status', header: '状态', cell: ({ row }) => h('span', dictLabel(sys_normal_disable.value, row.original.status)) },
  { accessorKey: 'createTime', header: '创建时间', size: 180, cell: ({ row }) => h('span', row.original.createTime ? parseTime(row.original.createTime) : '') },
]

function show() {
  queryParams.value.roleId = props.roleId
  getList()
  visible.value = true
}

function handleSelectionChange(selection) {
  userIds.value = selection.map((item) => item.userId)
}

const emit = defineEmits(['ok'])

function handleSelectUser() {
  const roleId = queryParams.value.roleId
  const uIds = userIds.value.join(',')
  if (uIds === '') {
    toast.add({ title: '请选择要分配的用户', color: 'error' })
    return
  }
  authUserSelectAll({ roleId, userIds: uIds }).then((res) => {
    toast.add({ title: res.msg, color: 'success' })
    visible.value = false
    emit('ok')
  })
}

defineExpose({ show })
</script>