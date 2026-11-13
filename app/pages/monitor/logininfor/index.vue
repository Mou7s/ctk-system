<template>
  <div class="app-container absolute inset-0 flex min-h-0 flex-col overflow-hidden px-2 pt-2 pb-0 sm:px-3 sm:pt-3">
    <div v-show="showSearch" class="flex flex-wrap items-end gap-2 mb-4 shrink-0">
      <UInput v-model="queryParams.ipaddr" placeholder="请输入登录地址" clearable class="w-60" @keyup.enter="handleQuery" />
      <UInput v-model="queryParams.userName" placeholder="请输入用户名称" clearable class="w-60" @keyup.enter="handleQuery" />
      <USelect v-model="queryParams.status" :items="sys_common_status" placeholder="登录状态" clearable class="w-60" />
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
      <UButton variant="outline" icon="i-lucide-rotate-ccw" @click="resetQuery">重置</UButton>
    </div>

    <div class="flex items-center gap-2 mb-4 shrink-0">
      <UButton color="error" variant="outline" icon="i-lucide-trash" :disabled="multiple" @click="handleDelete">删除</UButton>
      <UButton color="error" variant="outline" icon="i-lucide-eraser" @click="handleClean">清空</UButton>
      <UButton color="primary" variant="outline" icon="i-lucide-unlock" :disabled="single" @click="handleUnlock">解锁</UButton>
      <UButton color="warning" variant="outline" icon="i-lucide-download" @click="handleExport">导出</UButton>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList" class="ml-auto" />
    </div>

    <div class="min-h-0 flex-1 overflow-hidden">
      <TkUTable
        ref="logininforTableRef"
        :loading="loading"
        :data="logininforList"
        :columns="columns"
        :ui="{ td: 'p-2 text-sm text-default whitespace-nowrap', th: 'px-3 py-2 text-sm text-highlighted text-left font-semibold' }"
        style="height: 100%"
        :default-sort="defaultSort"
        @selection-change="handleSelectionChange"
        @sort-change="handleSortChange"
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
  </div>
</template>

<script setup name="Logininfor">
import { h } from 'vue'
import { list, delLogininfor, cleanLogininfor, unlockLogininfor } from '@/api/monitor/logininfor'
import { useDict } from '@/utils/dict'
import { TkUTable } from '@ctk-system/ui'
import { parseTime } from '@/utils/helpers'
const toast = useToast();

const { proxy } = getCurrentInstance()
const { sys_common_status } = useDict('sys_common_status')

const loading = ref(true)
const showSearch = ref(true)
const ids = ref([])
const single = ref(true)
const multiple = ref(true)
const selectName = ref('')
const total = ref(0)
const dateRange = ref([])
import { DATE_RANGE_PRESETS, calendarToArray, isPresetSelected, presetToArray, rangeArrayToCalendar, rangeDisplayText, useCalendarMonths } from '@/packages/shared/dateRange'
// 日期范围：原生 UPopover + UCalendar range（原生 range，值格式不变）
const dateRangeOpen = ref(false);
  const calendarMonths = useCalendarMonths();
function ondateRangePick(range) {
  if (!range?.start || !range?.end) return
  dateRange.value = calendarToArray(range, 'datetime')
  dateRangeOpen.value = false
}
function applydateRangePreset(preset) {
  dateRange.value = presetToArray(preset, 'datetime')
  dateRangeOpen.value = false
}
function cleardateRange() {
  dateRange.value = []
  dateRangeOpen.value = false
}
const defaultSort = ref({ prop: 'loginTime', order: 'descending' })

const queryParams = ref({
  pageNum: 1,
  pageSize: 50,
  ipaddr: undefined,
  userName: undefined,
  status: undefined,
  orderByColumn: undefined,
  isAsc: undefined,
})

const logininforList = ref([])
const logininforTableRef = ref(null)

function getList() {
  loading.value = true
  list(proxy.addDateRange(queryParams.value, dateRange.value)).then((response) => {
    logininforList.value = response.rows
    total.value = response.total
    loading.value = false
  })
}

function handleQuery() {
  queryParams.value.pageNum = 1
  getList()
}

function resetQuery() {
  dateRange.value = []
  queryParams.value.pageNum = 1
}

function handleSelectionChange(selection) {
  ids.value = selection.map((item) => item.infoId)
  multiple.value = !selection.length
  single.value = selection.length != 1
  selectName.value = selection[0]?.userName ?? ''
}

function handleSortChange(column) {
  queryParams.value.orderByColumn = column.prop
  queryParams.value.isAsc = column.order
  getList()
}

function handleDelete() {
  const infoIds = ids.value
  if (!confirm(`是否确认删除访问编号为"${infoIds}"的数据项?`)) return
  delLogininfor(infoIds).then(() => {
    getList()
    toast.add({ title: '删除成功', color: 'success' })
  })
}

function handleClean() {
  if (!confirm('是否确认清空所有登录日志数据项?')) return
  cleanLogininfor().then(() => {
    getList()
    toast.add({ title: '清空成功', color: 'success' })
  })
}

function handleUnlock() {
  const username = selectName.value
  if (!username) return
  if (!confirm(`是否确认解锁用户"${username}"数据项?`)) return
  unlockLogininfor(username).then(() => {
    toast.add({ title: `用户${username}解锁成功`, color: 'success' })
  })
}

function handleExport() {
  proxy.download('monitor/logininfor/export', { ...queryParams.value }, `config_${Date.now()}.xlsx`)
}

const dictLabel = (list, value) => list?.find?.((d) => d.value === value)?.label ?? value ?? ''

const columns = [
  { id: 'selection', header: () => h('span'), enableSorting: false, enableHiding: false },
  { accessorKey: 'infoId', header: '访问编号', cell: ({ row }) => h('span', String(row.original.infoId ?? '')) },
  { accessorKey: 'userName', header: '用户名称', cell: ({ row }) => h('span', row.original.userName ?? ''), enableSorting: true },
  { accessorKey: 'ipaddr', header: '地址', cell: ({ row }) => h('span', row.original.ipaddr ?? '') },
  { accessorKey: 'loginLocation', header: '登录地点', cell: ({ row }) => h('span', row.original.loginLocation ?? '') },
  { accessorKey: 'os', header: '操作系统', cell: ({ row }) => h('span', row.original.os ?? '') },
  { accessorKey: 'browser', header: '浏览器', cell: ({ row }) => h('span', row.original.browser ?? '') },
  { accessorKey: 'status', header: '登录状态', cell: ({ row }) => h('span', dictLabel(sys_common_status.value, row.original.status)) },
  { accessorKey: 'msg', header: '描述', cell: ({ row }) => h('span', row.original.msg ?? '') },
  { accessorKey: 'loginTime', header: '访问时间', size: 180, cell: ({ row }) => h('span', row.original.loginTime ? parseTime(row.original.loginTime) : ''), enableSorting: true },
]

onMounted(() => {
  getList()
})
</script>