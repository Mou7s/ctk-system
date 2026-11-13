<template>
  <div class="app-container absolute inset-0 flex min-h-0 flex-col overflow-hidden px-2 pt-2 pb-0 sm:px-3 sm:pt-3">
    <div v-show="showSearch" class="flex flex-wrap items-end gap-2 mb-4 shrink-0">
      <UInput v-model="queryParams.configName" placeholder="请输入参数名称" clearable class="w-60" @keyup.enter="handleQuery" />
      <UInput v-model="queryParams.configKey" placeholder="请输入参数键名" clearable class="w-60" @keyup.enter="handleQuery" />
      <USelect v-model="queryParams.configType" :items="sys_yes_no" placeholder="系统内置" clearable />
      <UPopover v-model:open="dateRangeOpen" :content="{ align: 'center' }">
        <UButton color="neutral" variant="outline" icon="i-lucide-calendar" class="w-full min-w-[280px] font-normal">
          <span :class="dateRange?.length === 2 ? '' : 'text-dimmed'">{{ rangeDisplayText(dateRange) || '选择日期范围' }}</span>
        </UButton>
        <template #content>
          <div class="flex items-stretch divide-x divide-default">
            <div class="hidden sm:flex flex-col justify-center py-2">
              <UButton
                v-for="p in DATE_RANGE_PRESETS"
                :key="p.label"
                :label="p.label"
                color="neutral"
                variant="ghost"
                class="rounded-none px-4"
                :class="isPresetSelected(dateRange, p, 'date') ? 'bg-elevated' : 'hover:bg-elevated/50'"
                truncate
                @click="applydateRangePreset(p)"
              />
              <UButton
                v-if="dateRange?.length"
                label="清除"
                color="neutral"
                variant="ghost"
                class="rounded-none px-4 text-error hover:bg-elevated/50"
                truncate
                @click="cleardateRange"
              />
            </div>
            <UCalendar
              :default-value="rangeArrayToCalendar(dateRange)"
              range
              :number-of-months="calendarMonths"
              locale="zh-CN"
              class="p-2"
              @update:model-value="ondateRangePick"
            />
          </div>
        </template>
      </UPopover>
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
        :data="configList"
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
        <UForm ref="configFormRef" :state="form" :rules="rules" class="space-y-4" @submit="submitForm">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UFormField label="参数名称" name="configName" required>
              <UInput v-model="form.configName" placeholder="请输入参数名称" class="w-full" />
            </UFormField>
            <UFormField label="参数键名" name="configKey" required>
              <UInput v-model="form.configKey" placeholder="请输入参数键名" class="w-full" />
            </UFormField>
            <UFormField label="参数键值" name="configValue" required>
              <UInput v-model="form.configValue" placeholder="请输入参数键值" class="w-full" />
            </UFormField>
            <UFormField label="系统内置" name="configType">
              <URadioGroup v-model="form.configType" :items="sys_yes_no" />
            </UFormField>
          </div>
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

<script setup name="Config">
import { h, resolveComponent } from 'vue'
import { listConfig, getConfig, delConfig, addConfig, updateConfig, refreshCache } from '@/api/system/config'
import { useDict } from '@/utils/dict'
import { TkUTable } from '@ctk-system/ui'
import { useTkListQuery } from '@ctk-system/composables'
import { parseTime } from '@/utils/helpers'
const toast = useToast();

const UButton = resolveComponent('UButton')
const UCheckbox = resolveComponent('UCheckbox')

const { proxy } = getCurrentInstance()
const { sys_yes_no } = useDict('sys_yes_no')

const open = ref(false)
const showSearch = ref(true)
const currentRowId = ref(null)
const ids = ref([])
const single = ref(true)
const multiple = ref(true)
const title = ref('')
const dateRange = ref([])
import { DATE_RANGE_PRESETS, calendarToArray, isPresetSelected, presetToArray, rangeArrayToCalendar, rangeDisplayText, useCalendarMonths } from '@/packages/shared/dateRange'
// 日期范围：原生 UPopover + UCalendar range（原生 range，值格式不变）
const dateRangeOpen = ref(false);
  const calendarMonths = useCalendarMonths();
function ondateRangePick(range) {
  if (!range?.start || !range?.end) return
  dateRange.value = calendarToArray(range, 'date')
  dateRangeOpen.value = false
}
function applydateRangePreset(preset) {
  dateRange.value = presetToArray(preset, 'date')
  dateRangeOpen.value = false
}
function cleardateRange() {
  dateRange.value = []
  dateRangeOpen.value = false
}
const configFormRef = ref(null)

const queryParams = ref({
  pageNum: 1,
  pageSize: 50,
  configName: undefined,
  configKey: undefined,
  configType: undefined,
})

// 列表查询（分页 / loading / 并发守卫 / code!==200 判定）统一交给公共 composable
const {
  list: configList,
  loading,
  total,
  error: listError,
  getList,
  handleQuery,
  resetQuery,
} = useTkListQuery({
  queryParams,
  fetchList: () => listConfig(proxy.addDateRange(queryParams.value, dateRange.value)),
  beforeReset: () => {
    dateRange.value = []
  },
})
watch(listError, (msg) => {
  if (msg) toast.add({ title: '查询失败：' + msg, color: 'error' })
})
const form = reactive({})
const rules = {
  configName: [{ required: true, message: '参数名称不能为空', trigger: 'blur' }],
  configKey: [{ required: true, message: '参数键名不能为空', trigger: 'blur' }],
  configValue: [{ required: true, message: '参数键值不能为空', trigger: 'blur' }],
}

function cancel() {
  open.value = false
  reset()
}

function reset() {
  Object.assign(form, {
    configId: undefined,
    configName: undefined,
    configKey: undefined,
    configValue: undefined,
    configType: 'Y',
    remark: undefined,
  })
  configFormRef.value?.clear?.()
}

function handleSelectionChange(selection) {
  ids.value = selection.map((item) => item.configId)
  currentRowId.value = selection.length === 1 ? selection[0].configId : null
  single.value = selection.length != 1
  multiple.value = !selection.length
}

function handleRowDblClick(row) {
  const data = row?.original ?? row
  if (!data?.configId) return
  handleUpdate(data)
}

function handleAdd() {
  reset()
  open.value = true
  title.value = '添加参数'
}

function handleUpdate(row) {
  reset()
  const configId = row?.configId || ids.value
  getConfig(configId).then((response) => {
    Object.assign(form, response.data)
    open.value = true
    title.value = '修改参数'
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
  if (form.configId != undefined) {
    await updateConfig(form)
    toast.add({ title: '修改成功', color: 'success' })
  } else {
    await addConfig(form)
    toast.add({ title: '新增成功', color: 'success' })
  }
  open.value = false
  getList()
}

function handleDelete(row) {
  const configIds = row?.configId || ids.value
  if (!confirm(`是否确认删除参数编号为"${configIds}"的数据项？`)) return
  delConfig(configIds).then(() => {
    getList()
    toast.add({ title: '删除成功', color: 'success' })
  })
}

function handleExport() {
  proxy.download('system/config/export', { ...queryParams.value }, `config_${Date.now()}.xlsx`)
}

function handleRefreshCache() {
  refreshCache().then(() => {
    toast.add({ title: '刷新缓存成功', color: 'success' })
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
  { accessorKey: 'configId', header: '参数主键', cell: ({ row }) => h('span', String(row.original.configId ?? '')) },
  { accessorKey: 'configName', header: '参数名称', cell: ({ row }) => h('span', row.original.configName ?? '') },
  { accessorKey: 'configKey', header: '参数键名', cell: ({ row }) => h('span', row.original.configKey ?? '') },
  { accessorKey: 'configValue', header: '参数键值', cell: ({ row }) => h('span', row.original.configValue ?? '') },
  { accessorKey: 'configType', header: '系统内置', cell: ({ row }) => h('span', dictLabel(sys_yes_no.value, row.original.configType)) },
  { accessorKey: 'remark', header: '备注', cell: ({ row }) => h('span', row.original.remark ?? '') },
  { accessorKey: 'createTime', header: '创建时间', size: 180, cell: ({ row }) => h('span', row.original.createTime ? parseTime(row.original.createTime) : '') },
  {
    id: 'actions',
    header: '操作',
    size: 150,
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