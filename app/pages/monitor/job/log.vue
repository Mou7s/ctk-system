<template>
  <div class="app-container absolute inset-0 flex min-h-0 flex-col overflow-hidden px-2 pt-2 pb-0 sm:px-3 sm:pt-3">
    <div v-show="showSearch" class="flex flex-wrap items-end gap-2 mb-4 shrink-0">
      <UInput v-model="queryParams.jobName" placeholder="请输入任务名称" clearable class="w-60" @keyup.enter="handleQuery" />
      <USelect v-model="queryParams.jobGroup" :items="sys_job_group" placeholder="请选择任务组名" clearable class="w-60" />
      <USelect v-model="queryParams.status" :items="sys_common_status" placeholder="请选择执行状态" clearable class="w-60" />
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
                      :class="isPresetSelected(dateRange, p, 'datetime') ? 'bg-elevated' : 'hover:bg-elevated/50'"
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
      <UButton icon="i-lucide-rotate-ccw" @click="resetQuery">重置</UButton>
    </div>

    <div class="flex items-center gap-2 mb-4 shrink-0">
      <UButton color="error" variant="outline" icon="i-lucide-trash" :disabled="multiple" @click="handleDelete">删除</UButton>
      <UButton color="error" variant="outline" icon="i-lucide-eraser" @click="handleClean">清空</UButton>
      <UButton color="warning" variant="outline" icon="i-lucide-download" @click="handleExport">导出</UButton>
      <UButton color="warning" variant="outline" icon="i-lucide-x" @click="handleClose">关闭</UButton>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList" class="ml-auto" />
    </div>

    <div class="min-h-0 flex-1 overflow-hidden">
    <TkUTable
      :loading="loading"
      :data="jobLogList"
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

    <UModal v-model:open="open" title="调度日志详细" :ui="{ content: 'max-w-2xl' }">
      <template #body>
        <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt class="text-muted">日志序号：</dt><dd>{{ form.jobLogId }}</dd>
          <dt class="text-muted">任务名称：</dt><dd>{{ form.jobName }}</dd>
          <dt class="text-muted">任务分组：</dt><dd>{{ form.jobGroup }}</dd>
          <dt class="text-muted">执行时间：</dt><dd>{{ form.createTime }}</dd>
          <dt class="text-muted col-span-2">调用方法：</dt><dd class="col-span-2">{{ form.invokeTarget }}</dd>
          <dt class="text-muted col-span-2">日志信息：</dt><dd class="col-span-2">{{ form.jobMessage }}</dd>
          <dt class="text-muted col-span-2">执行状态：</dt>
          <dd class="col-span-2">
            <span v-if="form.status == 0">正常</span>
            <span v-else-if="form.status == 1">失败</span>
          </dd>
          <template v-if="form.status == 1">
            <dt class="text-muted col-span-2">异常信息：</dt><dd class="col-span-2">{{ form.exceptionInfo }}</dd>
          </template>
        </dl>
      </template>
      <template #footer>
        <UButton color="neutral" @click="open = false">关 闭</UButton>
      </template>
    </UModal>
  </div>
</template>

<script setup name="JobLog">
import { h, resolveComponent } from 'vue'
import { getJob } from '@/api/monitor/job'
import { listJobLog, delJobLog, cleanJobLog } from '@/api/monitor/jobLog'
import { useDict } from '@/utils/dict'
import { TkUTable } from '@ctk-system/ui'
import { useTkListQuery } from '@ctk-system/composables'
import { parseTime } from '@/utils/helpers'
const toast = useToast();

const UButton = resolveComponent('UButton')

const { proxy } = getCurrentInstance()
const { sys_common_status, sys_job_group } = useDict('sys_common_status', 'sys_job_group')

const open = ref(false)
const showSearch = ref(true)
const ids = ref([])
const multiple = ref(true)
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
const route = useRoute()

const queryParams = ref({
  pageNum: 1,
  pageSize: 10,
  dictName: undefined,
  dictType: undefined,
  status: undefined,
})

// 列表查询（分页 / loading / 并发守卫 / code!==200 判定）统一交给公共 composable
const {
  list: jobLogList,
  loading,
  total,
  error: listError,
  getList,
  handleQuery,
  resetQuery,
} = useTkListQuery({
  queryParams,
  fetchList: () => listJobLog(proxy.addDateRange(queryParams.value, dateRange.value)),
  beforeReset: () => {
    dateRange.value = []
  },
})
watch(listError, (msg) => {
  if (msg) toast.add({ title: '查询失败：' + msg, color: 'error' })
})
const form = ref({})

function handleClose() {
  const obj = { path: '/monitor/job' }
  proxy.$tab.closeOpenPage(obj)
}

function handleSelectionChange(selection) {
  ids.value = selection.map((item) => item.jobLogId)
  multiple.value = !selection.length
}

function handleView(row) {
  open.value = true
  form.value = row
}

function handleDelete() {
  if (!confirm(`是否确认删除调度日志编号为"${ids.value}"的数据项?`)) return
  delJobLog(ids.value).then(() => {
    getList()
    toast.add({ title: '删除成功', color: 'success' })
  })
}

function handleClean() {
  if (!confirm('是否确认清空所有调度日志数据项?')) return
  cleanJobLog().then(() => {
    getList()
    toast.add({ title: '清空成功', color: 'success' })
  })
}

function handleExport() {
  proxy.download('monitor/jobLog/export', { ...queryParams.value }, `job_log_${Date.now()}.xlsx`)
}

const dictLabel = (list, value) => list?.find?.((d) => d.value === value)?.label ?? value ?? ''

const columns = [
  { id: 'selection', header: () => h('span'), enableSorting: false, enableHiding: false },
  { accessorKey: 'jobLogId', header: '日志编号', size: 80, cell: ({ row }) => h('span', String(row.original.jobLogId ?? '')) },
  { accessorKey: 'jobName', header: '任务名称', cell: ({ row }) => h('span', row.original.jobName ?? '') },
  { accessorKey: 'jobGroup', header: '任务组名', cell: ({ row }) => h('span', dictLabel(sys_job_group.value, row.original.jobGroup)) },
  { accessorKey: 'invokeTarget', header: '调用目标字符串', cell: ({ row }) => h('span', row.original.invokeTarget ?? '') },
  { accessorKey: 'jobMessage', header: '日志信息', cell: ({ row }) => h('span', row.original.jobMessage ?? '') },
  { accessorKey: 'status', header: '执行状态', cell: ({ row }) => h('span', dictLabel(sys_common_status.value, row.original.status)) },
  { accessorKey: 'createTime', header: '执行时间', size: 180, cell: ({ row }) => h('span', row.original.createTime ? parseTime(row.original.createTime) : '') },
  {
    id: 'actions',
    header: '操作',
    enableSorting: false,
    cell: ({ row }) =>
      h(UButton, { variant: 'link', color: 'primary', icon: 'i-lucide-eye', onClick: () => handleView(row.original) }, () => '详细'),
  },
]

onMounted(() => {
  const jobId = route.params?.jobId || route.query?.jobId
  if (jobId !== undefined && jobId != 0) {
    getJob(jobId).then((response) => {
      queryParams.value.jobName = response.data.jobName
      queryParams.value.jobGroup = response.data.jobGroup
      getList()
    })
  } else {
    getList()
  }
})
</script>
