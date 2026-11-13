<template>
  <div class="app-container absolute inset-0 overflow-y-auto">
    <div class="flex flex-wrap items-end gap-2 mb-4">
      <UInput v-model="queryParams.deptName" placeholder="请输入部门名称" clearable class="w-52" @keyup.enter="handleQuery" />
      <USelect v-model="queryParams.status" :items="sys_normal_disable" placeholder="部门状态" clearable class="w-52" />
      <UButton color="primary" icon="i-lucide-search" @click="handleQuery">搜索</UButton>
      <UButton variant="outline" icon="i-lucide-rotate-ccw" @click="resetQuery">重置</UButton>
    </div>

    <div class="flex items-center gap-2 mb-4">
      <UButton color="primary" variant="outline" icon="i-lucide-plus" @click="handleAdd()">新增</UButton>
      <UButton color="info" variant="outline" icon="i-lucide-list-tree" @click="toggleExpandAll">展开/折叠</UButton>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList" class="ml-auto" />
    </div>

    <TkUTable
      :loading="loading"
      :data="deptList"
      :columns="columns"
      v-model:expanded="expandedRows"
      :expanded-options="expandedOptions"
      :get-sub-rows="getDeptSubRows"
      :get-row-id="getDeptRowId"
      @selection-change="handleSelectionChange"
      @row-dblclick="handleRowDblClick"
      :ui="{ tbody: '[&>tr:has(td[colspan])]:hidden', td: 'p-2 text-sm text-default whitespace-nowrap', th: 'px-3 py-2 text-sm text-highlighted text-left font-semibold' }"
    />

    <UModal v-model:open="open" :title="title" :ui="{ content: 'max-w-2xl' }">
      <template #body>
        <UForm ref="deptFormRef" :state="form" :rules="rules" class="space-y-4" @submit="submitForm">
          <UFormField v-if="form.parentId !== 0" label="上级部门" name="parentId" required class="w-full">
            <USelectMenu
              v-model="form.parentId"
              :items="flattenedDeptOptions"
              value-attribute="value"
              placeholder="选择上级部门"
              class="w-full"
            />
          </UFormField>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UFormField label="部门名称" name="deptName" required>
              <UInput v-model="form.deptName" placeholder="请输入部门名称" />
            </UFormField>
            <UFormField label="显示排序" name="orderNum" required>
              <UInputNumber v-model="form.orderNum" :min="0" />
            </UFormField>
            <UFormField label="负责人" name="leader">
              <UInput v-model="form.leader" placeholder="请输入负责人" :maxlength="20" />
            </UFormField>
            <UFormField label="联系电话" name="phone">
              <UInput v-model="form.phone" placeholder="请输入联系电话" :maxlength="11" />
            </UFormField>
            <UFormField label="邮箱" name="email">
              <UInput v-model="form.email" placeholder="请输入邮箱" :maxlength="50" />
            </UFormField>
            <UFormField label="部门状态">
              <URadioGroup v-model="form.status" :items="sys_normal_disable" />
            </UFormField>
          </div>
        </UForm>
      </template>
      <template #footer>
        <UButton color="neutral" @click="cancel">取 消</UButton>
        <UButton color="primary" @click="submitForm">确 定</UButton>
      </template>
    </UModal>
  </div>
</template>

<script setup name="Dept">
import { h, resolveComponent } from 'vue'
import { listDept, getDept, delDept, addDept, updateDept, listDeptExcludeChild } from '@/api/system/dept'
import { useDict } from '@/utils/dict'
import { TkUTable } from '@ctk-system/ui'
import { parseTime } from '@/utils/helpers'
const toast = useToast();

const UButton = resolveComponent('UButton')
const UCheckbox = resolveComponent('UCheckbox')

const { proxy } = getCurrentInstance()
const { sys_normal_disable } = useDict('sys_normal_disable')

const deptList = ref([])
const open = ref(false)
const loading = ref(true)
const showSearch = ref(true)
const currentRowId = ref(null)
const ids = ref([])
const title = ref('')
const deptOptions = ref([])
const expandedRows = ref(true)
const flattenedDeptOptions = computed(() => {
  const result = [];
  function flatten(nodes, depth = 0) {
    for (const node of nodes) {
      result.push({
        label: '　'.repeat(depth) + (depth > 0 ? '├─ ' : '') + node.deptName,
        value: node.deptId,
      });
      if (node.children && node.children.length > 0) {
        flatten(node.children, depth + 1);
      }
    }
  }
  flatten(deptOptions.value);
  return result;
});
const deptFormRef = ref(null)

const queryParams = reactive({
  deptName: undefined,
  status: undefined,
})
const form = reactive({})
const rules = {
  parentId: [{ required: true, message: '上级部门不能为空', trigger: 'blur' }],
  deptName: [{ required: true, message: '部门名称不能为空', trigger: 'blur' }],
  orderNum: [{ required: true, message: '显示排序不能为空', trigger: 'blur' }],
  email: [{ type: 'email', message: '请输入正确的邮箱地址', trigger: ['blur', 'change'] }],
  phone: [{ pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号码', trigger: 'blur' }],
}

function getList() {
  loading.value = true
  listDept(queryParams).then((response) => {
    deptList.value = proxy.handleTree(response.data, 'deptId')
    loading.value = false
  })
}

function cancel() {
  open.value = false
  reset()
}

function reset() {
  Object.assign(form, {
    deptId: undefined,
    parentId: undefined,
    deptName: undefined,
    orderNum: 0,
    leader: undefined,
    phone: undefined,
    email: undefined,
    status: '0',
  })
  deptFormRef.value?.clear?.()
}

function handleQuery() {
  getList()
}

function resetQuery() {
  queryParams.deptName = undefined
  queryParams.status = undefined
  handleQuery()
}

function getDeptSubRows(row) {
  return row.children || []
}

function getDeptRowId(row) {
  return String(row.deptId)
}

const expandedOptions = {
  getRowCanExpand: (row) => Boolean(row.original.children?.length),
}

function handleAdd(row) {
  reset()
  listDept().then((response) => {
    deptOptions.value = proxy.handleTree(response.data, 'deptId')
  })
  if (row != undefined) {
    form.parentId = row.deptId
  }
  open.value = true
  title.value = '添加部门'
}

function toggleExpandAll() {
  expandedRows.value = expandedRows.value === true ? {} : true
}

function handleUpdate(row) {
  reset()
  listDeptExcludeChild(row.deptId).then((response) => {
    deptOptions.value = proxy.handleTree(response.data, 'deptId')
  })
  getDept(row.deptId).then((response) => {
    Object.assign(form, response.data)
    open.value = true
    title.value = '修改部门'
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
  if (form.deptId != undefined) {
    await updateDept(form)
    toast.add({ title: '修改成功', color: 'success' })
  } else {
    await addDept(form)
    toast.add({ title: '新增成功', color: 'success' })
  }
  open.value = false
  getList()
}

function handleDelete(row) {
  if (!confirm(`是否确认删除名称为"${row.deptName}"的数据项?`)) return
  delDept(row.deptId).then(() => {
    getList()
    toast.add({ title: '删除成功', color: 'success' })
  })
}

function handleSelectionChange(selection) {
  ids.value = selection.map((item) => item.deptId)
  currentRowId.value = selection.length === 1 ? selection[0].deptId : null
}

function handleRowDblClick(row) {
  const data = row?.original ?? row
  if (!data?.deptId) return
  handleUpdate(data)
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
  {
    accessorKey: 'deptName',
    header: '部门名称',
    size: 260,
    cell: ({ row }) => {
      const canExpand = row.getCanExpand()
      const expanded = row.getIsExpanded()
      const toggleButton = canExpand
        ? h(UButton, {
            variant: 'ghost',
            color: 'neutral',
            size: 'xs',
            icon: expanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right',
            class: 'shrink-0',
            'aria-label': expanded ? '折叠部门' : '展开部门',
            onClick: (event) => {
              event.stopPropagation()
              row.toggleExpanded()
            },
          })
        : h('span', { class: 'inline-block size-6 shrink-0' })

      return h('div', {
        class: 'flex items-center gap-1',
        style: { paddingLeft: `${row.depth * 1.25}rem` },
      }, [
        toggleButton,
        h('span', { class: row.depth === 0 ? 'font-semibold' : '' }, row.original.deptName ?? ''),
      ])
    },
  },
  { accessorKey: 'orderNum', header: '排序', size: 200, cell: ({ row }) => h('span', String(row.original.orderNum ?? '')) },
  { accessorKey: 'status', header: '状态', size: 100, cell: ({ row }) => h('span', dictLabel(sys_normal_disable.value, row.original.status)) },
  { accessorKey: 'createTime', header: '创建时间', size: 200, cell: ({ row }) => h('span', row.original.createTime ? parseTime(row.original.createTime) : '') },
  {
    id: 'actions',
    header: '操作',
    enableSorting: false,
    cell: ({ row }) =>
      h('div', { class: 'flex gap-1 items-center' }, [
        h(UButton, { variant: 'link', color: 'primary', icon: 'i-lucide-edit', onClick: () => handleUpdate(row.original) }, () => '修改'),
        h(UButton, { variant: 'link', color: 'primary', icon: 'i-lucide-plus', onClick: () => handleAdd(row.original) }, () => '新增'),
        row.original.parentId != 0 ? h(UButton, { variant: 'link', color: 'primary', icon: 'i-lucide-trash', onClick: () => handleDelete(row.original) }, () => '删除') : null,
      ]),
  },
]

onMounted(() => {
  getList()
})
</script>
