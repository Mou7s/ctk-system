<template>
  <div class="app-container absolute inset-0 flex min-h-0 flex-col gap-4 overflow-y-auto px-2 pt-2 pb-4 sm:px-3 sm:pt-3">
    <h4 class="text-base font-semibold shrink-0">基本信息</h4>
    <UForm :state="form" label-width="80px" class="space-y-3">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <UFormField label="用户姓名" name="nickName">
          <UInput v-model="form.nickName" disabled />
        </UFormField>
        <UFormField label="登录账号" name="userName">
          <UInput v-model="form.userName" disabled />
        </UFormField>
      </div>
    </UForm>

    <h4 class="text-base font-semibold shrink-0">角色信息</h4>
    <div class="min-h-[240px] shrink-0">
    <TkUTable
      :loading="loading"
      :data="roles"
      :columns="columns"
      :ui="{ td: 'p-2 text-sm text-default whitespace-nowrap', th: 'px-3 py-2 text-sm text-highlighted text-left font-semibold' }"
      :row-key="getRowKey"
      @selection-change="handleSelectionChange"
    />
    </div>

    <pagination v-show="total > 0" class="shrink-0" :total="total" v-model:page="pageNum" v-model:limit="pageSize" />

    <div class="text-center shrink-0">
      <UButton color="primary" @click="submitForm()">提交</UButton>
      <UButton color="neutral" @click="close()">返回</UButton>
    </div>
  </div>
</template>

<script setup name="AuthRole">
import { h } from 'vue'
import { getAuthRole, updateAuthRole } from '@/api/system/user'
import { TkUTable } from '@ctk-system/ui'
import { parseTime } from '@/utils/helpers'
const toast = useToast();

const route = useRoute()
const { proxy } = getCurrentInstance()

const loading = ref(true)
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const roleIds = ref([])
const roles = ref([])
const form = ref({
  nickName: undefined,
  userName: undefined,
  userId: undefined,
})

const columns = [
  { id: 'index', header: '序号', size: 55, cell: ({ row }) => h('span', String((pageNum.value - 1) * pageSize.value + row.index + 1)) },
  { id: 'selection', header: () => h('span'), size: 55, cell: ({ row }) => h('span') },
  { accessorKey: 'roleId', header: '角色编号', cell: ({ row }) => h('span', String(row.original.roleId ?? '')) },
  { accessorKey: 'roleName', header: '角色名称', cell: ({ row }) => h('span', row.original.roleName ?? '') },
  { accessorKey: 'roleKey', header: '权限字符', cell: ({ row }) => h('span', row.original.roleKey ?? '') },
  { accessorKey: 'createTime', header: '创建时间', size: 180, cell: ({ row }) => h('span', row.original.createTime ? parseTime(row.original.createTime) : '') },
]

function handleSelectionChange(selection) {
  roleIds.value = selection.map((item) => item.roleId)
}

function getRowKey(row) {
  return row.roleId
}

function close() {
  const obj = { path: '/system/user' }
  proxy.$tab.closeOpenPage(obj)
}

function submitForm() {
  const userId = form.value.userId
  const rIds = roleIds.value.join(',')
  updateAuthRole({ userId, roleIds: rIds }).then(() => {
    toast.add({ title: '授权成功', color: 'success' })
    close()
  })
}

onMounted(() => {
  const userId = route.params?.userId || route.query?.userId
  if (userId) {
    loading.value = true
    getAuthRole(userId).then((response) => {
      form.value = response.user
      roles.value = response.roles
      total.value = roles.value.length
      nextTick(() => {
        roles.value.forEach((row) => {
          if (row.flag) {
            proxy.$refs['roleRef'].toggleRowSelection(row)
          }
        })
      })
      loading.value = false
    })
  }
})
</script>
