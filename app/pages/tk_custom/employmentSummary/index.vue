<template>
  <div class="absolute inset-0 overflow-y-auto bg-slate-50 p-4 text-slate-950 dark:bg-slate-950 dark:text-white sm:p-6">
    <div class="mx-auto flex min-h-full max-w-[1600px] flex-col gap-4 pb-6">
      <header class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-xl font-bold">{{ reportTitle }}</h1>
          <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">企业微信通讯录变化观察记录</p>
        </div>
      </header>

      <section class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div class="flex flex-wrap items-end gap-3">
          <UFormField label="开始日期">
            <UPopover v-model:open="startDateOpen">
              <UButton color="neutral" variant="outline" icon="i-lucide-calendar" class="w-44 justify-start font-normal">
                <span :class="filters.startDate ? '' : 'text-dimmed'">{{ filters.startDate || '选择日期' }}</span>
              </UButton>
              <template #content>
                <div class="p-2"><UCalendar v-model="startDateValue" locale="zh-CN" /></div>
              </template>
            </UPopover>
          </UFormField>
          <UFormField label="结束日期">
            <UPopover v-model:open="endDateOpen">
              <UButton color="neutral" variant="outline" icon="i-lucide-calendar" class="w-44 justify-start font-normal">
                <span :class="filters.endDate ? '' : 'text-dimmed'">{{ filters.endDate || '选择日期' }}</span>
              </UButton>
              <template #content>
                <div class="p-2"><UCalendar v-model="endDateValue" locale="zh-CN" /></div>
              </template>
            </UPopover>
          </UFormField>
          <UFormField label="事件类型">
            <USelect v-model="filters.eventType" :items="eventTypeItems" class="w-36" />
          </UFormField>
          <div class="flex items-center gap-2">
            <UButton color="primary" icon="i-lucide-search" :loading="loading" @click="loadSummary">查询</UButton>
            <UButton color="neutral" variant="outline" @click="resetFilters">重置</UButton>
            <UButton color="success" variant="soft" icon="i-lucide-file-spreadsheet" :loading="exporting" @click="handleExport">
              导出表格
            </UButton>
          </div>
        </div>
        <p class="mt-3 text-xs text-slate-400">入职/离职日期为系统首次观察到通讯录变化的时间，不代表 HR 实际日期。</p>
        <p v-if="summary.leaveRateMessage" class="mt-1 text-xs text-amber-600 dark:text-amber-400">{{ summary.leaveRateMessage }}</p>
      </section>

      <section class="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 class="font-semibold">入职部门分布</h2>
          <p class="mt-0.5 text-xs text-slate-400">共 {{ departmentTotal.hireCount }} 人 · 末级部门口径</p>
          <div v-if="hirePieData.length" ref="hirePieRef" class="mt-2 h-[280px] w-full" />
          <p v-else class="mt-2 flex h-[280px] items-center justify-center text-sm text-slate-400">暂无入职数据</p>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 class="font-semibold">离职部门分布</h2>
          <p class="mt-0.5 text-xs text-slate-400">共 {{ departmentTotal.leaveCount }} 人 · 末级部门口径</p>
          <div v-if="leavePieData.length" ref="leavePieRef" class="mt-2 h-[280px] w-full" />
          <p v-else class="mt-2 flex h-[280px] items-center justify-center text-sm text-slate-400">暂无离职数据</p>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div class="flex items-center justify-between gap-2">
            <h2 class="font-semibold">{{ selectedLeaveDept ? `${selectedLeaveDept}离职原因` : '离职原因归类' }}</h2>
            <UButton v-if="selectedLeaveDept" size="xs" color="neutral" variant="soft" @click="selectedLeaveDept = ''">看总体</UButton>
          </div>
          <p class="mt-0.5 text-xs text-slate-400">{{ selectedLeaveDept ? `共 ${selectedDeptReasonTotal} 人次 · 含未填写 · 点左图其他扇区切换` : `共 ${summary.reasonLeaveTotal || 0} 人次 · 含未填写 · 点左图扇区看分部门` }}</p>
          <div v-if="reasonBarData.length" ref="reasonBarRef" class="mt-2 h-[280px] w-full" />
          <p v-else class="mt-2 flex h-[280px] items-center justify-center text-sm text-slate-400">暂无离职数据</p>
        </div>
      </section>

      <section class="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div>
            <h2 class="font-semibold">离职原因补录</h2>
            <p class="mt-0.5 text-xs text-slate-400">人事按离职人次逐条填写原因，保存后上方统计自动更新</p>
          </div>
          <span class="text-xs text-slate-400">待填 {{ unfilledReasonCount }} 人次</span>
        </div>
        <div v-if="!leaveEvents.length" class="px-4 py-10 text-center text-sm text-slate-400">
          当前筛选范围内没有离职记录
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full min-w-[720px] border-collapse text-sm">
            <thead class="bg-slate-50 text-center text-xs text-slate-600 dark:bg-slate-950 dark:text-slate-300">
              <tr>
                <th class="w-16 border-b border-slate-200 px-3 py-3 font-semibold dark:border-slate-800">序号</th>
                <th class="w-28 border-b border-slate-200 px-3 py-3 font-semibold dark:border-slate-800">姓名</th>
                <th class="w-36 border-b border-slate-200 px-3 py-3 font-semibold dark:border-slate-800">部门</th>
                <th class="w-28 border-b border-slate-200 px-3 py-3 font-semibold dark:border-slate-800">离职日期</th>
                <th class="w-56 border-b border-slate-200 px-3 py-3 font-semibold dark:border-slate-800">离职原因</th>
                <th class="w-24 border-b border-slate-200 px-3 py-3 font-semibold dark:border-slate-800">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in leaveEvents" :key="item.eventId" class="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                <td class="border-b border-slate-100 px-3 py-2 text-center text-slate-500 dark:border-slate-800">{{ index + 1 }}</td>
                <td class="border-b border-slate-100 px-3 py-2 text-center dark:border-slate-800">{{ item.name || '-' }}</td>
                <td class="border-b border-slate-100 px-3 py-2 text-center dark:border-slate-800">{{ item.dept || '-' }}</td>
                <td class="border-b border-slate-100 px-3 py-2 text-center dark:border-slate-800">{{ formatDateOnly(item.eventAt) }}</td>
                <td class="border-b border-slate-100 px-3 py-2 dark:border-slate-800">
                  <select
                    v-model="reasonDrafts[item.eventId].code"
                    class="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-800"
                  >
                    <option value="">未填写</option>
                    <option
                      v-for="option in LEAVE_REASON_OPTIONS"
                      :key="option.code"
                      :value="option.code"
                      :title="option.fullText"
                    >
                      {{ option.label }}（{{ option.fullText }}）
                    </option>
                  </select>
                </td>
                <td class="border-b border-slate-100 px-3 py-2 text-center dark:border-slate-800">
                  <UButton
                    size="xs"
                    color="primary"
                    variant="soft"
                    :loading="savingReasonIds.has(item.eventId)"
                    @click="saveReason(item)"
                  >
                    保存
                  </UButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div>
            <h2 class="font-semibold">部门入离职汇总</h2>
            <p class="mt-0.5 text-xs text-slate-400">末级部门口径，同一人只出现在所属末级部门行</p>
          </div>
          <div class="flex items-center gap-2">
            <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="loading" @click="loadSummary">
              刷新
            </UButton>
          </div>
        </div>

        <div v-if="loading" class="space-y-3 p-4">
          <USkeleton v-for="index in 8" :key="index" class="h-10 w-full" />
        </div>
        <div v-else-if="errorMessage" class="p-8 text-center text-sm text-red-600 dark:text-red-300">
          <p>{{ errorMessage }}</p>
          <UButton class="mt-3" color="error" variant="soft" @click="loadSummary">重试</UButton>
        </div>
        <div v-else class="overflow-x-auto">
          <table class="min-w-[1200px] w-full border-collapse text-sm">
            <thead class="bg-slate-50 text-center text-xs text-slate-600 dark:bg-slate-950 dark:text-slate-300">
              <tr>
                <th class="w-16 border-b border-r border-slate-200 px-3 py-3 font-semibold dark:border-slate-800">序号</th>
                <th class="w-40 border-b border-r border-slate-200 px-3 py-3 font-semibold dark:border-slate-800">部门</th>
                <th class="w-24 border-b border-r border-slate-200 px-3 py-3 font-semibold dark:border-slate-800">入职人数</th>
                <th class="min-w-64 border-b border-r border-slate-200 px-3 py-3 font-semibold dark:border-slate-800">入职名单</th>
                <th class="w-24 border-b border-r border-slate-200 px-3 py-3 font-semibold dark:border-slate-800">离职人数</th>
                <th class="min-w-64 border-b border-r border-slate-200 px-3 py-3 font-semibold dark:border-slate-800">离职名单</th>
                <th class="w-24 border-b border-slate-200 px-3 py-3 font-semibold dark:border-slate-800">离职率</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, index) in departmentRows" :key="row.departmentId ?? row.department" class="align-top hover:bg-slate-50 dark:hover:bg-slate-800/60">
                <td class="border-b border-r border-slate-100 px-3 py-3 text-center text-slate-500 dark:border-slate-800">{{ index + 1 }}</td>
                <td class="border-b border-r border-slate-100 px-3 py-3 font-normal whitespace-nowrap dark:border-slate-800">
                  {{ row.department }}
                </td>
                <td class="border-b border-r border-slate-100 px-3 py-3 text-center text-emerald-600 dark:border-slate-800 dark:text-emerald-400">{{ row.hireCount }}</td>
                <td class="border-b border-r border-slate-100 px-3 py-3 leading-6 dark:border-slate-800">
                  <span v-if="row.hireNames.length" class="text-emerald-600 dark:text-emerald-400">{{ row.hireNames.join('、') }}</span>
                  <span v-else class="text-slate-400">-</span>
                </td>
                <td class="border-b border-r border-slate-100 px-3 py-3 text-center text-rose-600 dark:border-slate-800 dark:text-rose-400">{{ row.leaveCount }}</td>
                <td class="border-b border-r border-slate-100 px-3 py-3 leading-6 dark:border-slate-800">
                  <span v-if="row.leaveNames.length" class="text-rose-600 dark:text-rose-400">{{ row.leaveNames.join('、') }}</span>
                  <span v-else class="text-slate-400">-</span>
                </td>
                <td class="border-b border-slate-100 px-3 py-3 text-center dark:border-slate-800">{{ formatRate(row.leaveRate) }}</td>
              </tr>
              <tr v-if="departmentRows.length" class="bg-slate-50 font-semibold dark:bg-slate-950">
                <td class="border-r border-slate-200 px-3 py-3 text-center dark:border-slate-800">-</td>
                <td class="border-r border-slate-200 px-3 py-3 dark:border-slate-800">合计</td>
                <td class="border-r border-slate-200 px-3 py-3 text-center text-emerald-600 dark:border-slate-800 dark:text-emerald-400">{{ departmentTotal.hireCount }}</td>
                <td class="border-r border-slate-200 px-3 py-3 dark:border-slate-800">{{ departmentTotal.hireNameCount }} 人</td>
                <td class="border-r border-slate-200 px-3 py-3 text-center text-rose-600 dark:border-slate-800 dark:text-rose-400">{{ departmentTotal.leaveCount }}</td>
                <td class="border-r border-slate-200 px-3 py-3 dark:border-slate-800">{{ departmentTotal.leaveNameCount }} 人</td>
                <td class="px-3 py-3 text-center">{{ formatRate(summary.leaveRate) }}</td>
              </tr>
              <tr v-if="!departmentRows.length">
                <td colspan="7" class="px-4 py-14 text-center text-slate-400">当前筛选范围内没有入离职记录</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { download } from '@/utils/request'
import useSettingsStore from '@/store/modules/settings'
import * as echarts from 'echarts/core'
import { BarChart, PieChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { chartTooltip, getChartTheme } from '@/utils/chartTheme'

echarts.use([BarChart, PieChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

// 与服务端 LEAVE_REASON_OPTIONS 保持一致：编码 R01-R10，空字符串表示未填写
// 与服务端 DEPARTMENT_GROUPS 保持一致：离职明细行的人事部门名归并到饼图扇区名
const DEPARTMENT_GROUPS = {
  '国际一部': '国际部',
  '国际二部': '国际部',
  '国际1部': '国际部',
  '国际2部': '国际部',
  '销售1部': '营销部',
  '销售2部': '营销部',
  '销售3部': '营销部',
  '销售4部': '营销部',
  '销售5部': '营销部',
  '销售一部': '营销部',
  '销售二部': '营销部',
  '销售三部': '营销部',
  '销售四部': '营销部',
  '销售五部': '营销部',
}
const LEAVE_REASON_OPTIONS = [
  { code: 'R01', label: '站立劳累', fullText: '站得脚痛，做不了' },
  { code: 'R02', label: '家庭原因', fullText: '家庭原因，家里有事，回家照顾老人、小孩' },
  { code: 'R03', label: '身体原因', fullText: '身体不舒服，生病，身体扛不住' },
  { code: 'R04', label: '个人发展', fullText: '个人发展规划' },
  { code: 'R05', label: '薪资偏低', fullText: '工资太低' },
  { code: 'R06', label: '工作量大', fullText: '工作量大，内容繁重，无法适应' },
  { code: 'R07', label: '试用不通过', fullText: '试用不通过，工作散漫，纪律性差，请假多' },
  { code: 'R08', label: '不适应环境', fullText: '个人原因，不适应工作环境' },
  { code: 'R09', label: '不适应夜班', fullText: '不适应夜班' },
  { code: 'R10', label: '环境炎热劳累', fullText: '工作环境太热、太累' },
]

function formatDateInput(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function lastWeekRange(baseDate = new Date()) {
  const current = new Date(baseDate)
  current.setHours(0, 0, 0, 0)
  const weekday = current.getDay() || 7
  const thisMonday = new Date(current)
  thisMonday.setDate(current.getDate() - weekday + 1)

  const lastMonday = new Date(thisMonday)
  lastMonday.setDate(thisMonday.getDate() - 7)
  const lastSunday = new Date(thisMonday)
  lastSunday.setDate(thisMonday.getDate() - 1)

  return {
    startDate: formatDateInput(lastMonday),
    endDate: formatDateInput(lastSunday),
  }
}

const loading = ref(false)
const exporting = ref(false)
const errorMessage = ref('')
const rows = ref([])
const summary = ref({
  hireCount: 0,
  leaveCount: 0,
  leaveRate: null,
  leaveRateAvailable: false,
  leaveRateMessage: '',
  activeCount: 0,
  inactiveCount: 0,
  departmentRows: [],
  reasonStats: [],
  reasonLeaveTotal: 0,
})
const reasonDrafts = ref({})
const savingReasonIds = ref(new Set())
const toast = useToast()
const hirePieRef = ref(null)
const leavePieRef = ref(null)
const reasonBarRef = ref(null)
const chartInstances = []
let reasonChartInstance = null
const settingsStore = useSettingsStore()
const filters = reactive({ ...lastWeekRange(), eventType: 'all' })

// UCalendar 日期选择（原生 type="date" 替换）：字符串 ⇄ CalendarDate 双向转换
import { parseDate } from '@internationalized/date'

const startDateOpen = ref(false)
const endDateOpen = ref(false)
const startDateValue = computed({
  get() {
    if (!filters.startDate) return null
    try { return parseDate(String(filters.startDate).slice(0, 10)) } catch { return null }
  },
  set(val) {
    filters.startDate = val ? val.toString() : ''
    startDateOpen.value = false
  }
})
const endDateValue = computed({
  get() {
    if (!filters.endDate) return null
    try { return parseDate(String(filters.endDate).slice(0, 10)) } catch { return null }
  },
  set(val) {
    filters.endDate = val ? val.toString() : ''
    endDateOpen.value = false
  }
})
const eventTypeItems = [
  { label: '全部', value: 'all' },
  { label: '新发现入职', value: 'hire' },
  { label: '观察离职', value: 'leave' },
]

const reportTitle = computed(() => {
  const start = filters.startDate.replaceAll('-', '.')
  const end = filters.endDate.replaceAll('-', '.')
  return `（${start}–${end}）入离职汇总`
})

function formatRate(value) {
  return value == null ? '-' : `${Number(value).toFixed(2)}%`
}

const departmentRows = computed(() => summary.value.departmentRows || [])
const departmentTotal = computed(() => {
  const total = departmentRows.value.reduce((result, row) => ({
    hireCount: result.hireCount + Number(row.hireCount || 0),
    leaveCount: result.leaveCount + Number(row.leaveCount || 0),
    hireNameCount: result.hireNameCount + (row.hireNames || []).length,
    leaveNameCount: result.leaveNameCount + (row.leaveNames || []).length,
  }), {
    hireCount: 0,
    leaveCount: 0,
    hireNameCount: 0,
    leaveNameCount: 0,
  })
  return total
})

const hirePieData = computed(() => departmentRows.value
  .filter((row) => Number(row.hireCount || 0) > 0)
  .map((row) => ({ name: row.department, value: Number(row.hireCount || 0) })))

const leavePieData = computed(() => departmentRows.value
  .filter((row) => Number(row.leaveCount || 0) > 0)
  .map((row) => ({ name: row.department, value: Number(row.leaveCount || 0) })))

const reasonBarData = computed(() => {
  // 点左图扇区后：右图从总体切换成该部门的原因分布（明细现算）
  if (selectedDeptReasonCounts.value) {
    const counts = selectedDeptReasonCounts.value
    const total = selectedDeptReasonTotal.value
    if (!total) return []
    const rate = (count) => (total > 0 ? Math.round((count / total) * 10000) / 100 : null)
    return [...LEAVE_REASON_OPTIONS.map((option) => option.code), '']
      .map((code) => {
        const option = LEAVE_REASON_OPTIONS.find((item) => item.code === code)
        const count = counts.get(code) || 0
        return {
          code,
          name: code ? (option?.label || code) : '未填写',
          value: count,
          fullText: code ? (option?.fullText || '') : '人事尚未补录离职原因',
          rate: rate(count),
        }
      })
      .filter((item) => item.value > 0)
  }
  if (!(summary.value.reasonLeaveTotal > 0)) return []
  return (summary.value.reasonStats || [])
    .filter((item) => Number(item.count || 0) > 0 || !item.code)
    .map((item) => ({
      code: item.code || '',
      name: item.label,
      value: Number(item.count || 0),
      fullText: item.fullText,
      rate: item.rate,
    }))
})

const leaveEvents = computed(() => (rows.value || []).filter((row) => row.eventType === 'leave'))

// 左图点扇区 → 右图切换成该部门的原因分布；明细行部门名做同样归并后匹配扇区名
const selectedLeaveDept = ref('')

function normalizeDeptName(value) {
  const text = String(value || '').trim()
  return DEPARTMENT_GROUPS[text] || text
}

function deptNamesOf(value) {
  return [...new Set(
    String(value || '')
      .split('、')
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => !/^\d+$/.test(item))
      .map(normalizeDeptName),
  )]
}

const selectedDeptReasonCounts = computed(() => {
  if (!selectedLeaveDept.value) return null
  const counts = new Map()
  for (const row of leaveEvents.value) {
    if (!deptNamesOf(row.dept).includes(selectedLeaveDept.value)) continue
    const code = row.reasonCode || ''
    counts.set(code, (counts.get(code) || 0) + 1)
  }
  return counts
})

const selectedDeptReasonTotal = computed(() => {
  if (!selectedDeptReasonCounts.value) return 0
  return [...selectedDeptReasonCounts.value.values()].reduce((sum, count) => sum + count, 0)
})

function handleLeaveSliceClick(name) {
  selectedLeaveDept.value = selectedLeaveDept.value === name ? '' : name
}

const unfilledReasonCount = computed(() => {
  const unfilled = (summary.value.reasonStats || []).find((item) => !item.code)
  return Number(unfilled?.count || 0)
})

function formatDateOnly(value) {
  return value ? String(value).replace('T', ' ').slice(0, 10) : '-'
}

function reasonLabel(code) {
  if (!code) return '未填写'
  return LEAVE_REASON_OPTIONS.find((option) => option.code === code)?.label || '未填写'
}

function resetCharts() {
  while (chartInstances.length) {
    const chart = chartInstances.pop()
    try { chart?.dispose() } catch { /* 已销毁的实例忽略 */ }
  }
  reasonChartInstance = null
}

function resizeCharts() {
  chartInstances.forEach((chart) => {
    try { chart?.resize() } catch { /* 忽略 */ }
  })
}

function renderPieChart(el, data, name, onSliceClick) {
  if (!el) return
  const theme = getChartTheme()
  const chart = echarts.init(el)
  chartInstances.push(chart)
  if (onSliceClick) chart.on('click', (params) => params?.name && onSliceClick(params.name))
  chart.setOption({
    color: ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#64748b'],
    tooltip: { trigger: 'item', ...chartTooltip(theme), formatter: '{b}: {c} 人 ({d}%)' },
    legend: { type: 'scroll', bottom: 0, left: 'center', textStyle: { color: theme.legendText, fontSize: 11 } },
    series: [{
      name,
      type: 'pie',
      radius: ['38%', '64%'],
      center: ['50%', '43%'],
      itemStyle: { borderColor: theme.itemBorder, borderWidth: 2, borderRadius: 4 },
      label: { color: theme.labelText, fontSize: 11, formatter: '{b} {d}%' },
      labelLayout: { hideOverlap: true },
      data,
    }],
  })
}

function renderReasonChart() {
  // 只重画右边这张：先销毁旧实例，左右两张饼图不动
  if (reasonChartInstance) {
    const index = chartInstances.indexOf(reasonChartInstance)
    if (index >= 0) chartInstances.splice(index, 1)
    try { reasonChartInstance.dispose() } catch { /* 已销毁的实例忽略 */ }
    reasonChartInstance = null
  }
  if (!reasonBarRef.value || !reasonBarData.value.length) return
  const theme = getChartTheme()
  const chart = echarts.init(reasonBarRef.value)
  reasonChartInstance = chart
  chartInstances.push(chart)
  const data = [...reasonBarData.value].reverse()
  chart.setOption({
    grid: { left: '2%', right: '12%', top: 8, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      ...chartTooltip(theme),
      formatter: (params) => {
        const item = params?.[0]
        const row = data[item?.dataIndex]
        if (!row) return ''
        const rate = row.rate == null ? '-' : `${row.rate}%`
        return `${row.name}<br/>${row.fullText}<br/>${row.value} 人次（${rate}）`
      },
    },
    xAxis: { type: 'value', minInterval: 1, axisLabel: { color: theme.axisText, fontSize: 10 }, splitLine: { lineStyle: { color: theme.splitLine, type: 'dashed' } } },
    yAxis: { type: 'category', data: data.map((item) => item.name), axisLabel: { color: theme.labelText, fontSize: 11 }, axisTick: { show: false } },
    series: [{
      name: '离职人次',
      type: 'bar',
      barWidth: 14,
      data: data.map((item) => ({
        value: item.value,
        itemStyle: { color: item.code ? '#3b82f6' : '#ef4444', borderRadius: [0, 4, 4, 0] },
      })),
      label: { show: true, position: 'right', color: theme.labelText, fontSize: 10 },
    }],
  })
}

function renderCharts() {
  resetCharts()
  if (hirePieData.value.length) renderPieChart(hirePieRef.value, hirePieData.value, '入职')
  if (leavePieData.value.length) renderPieChart(leavePieRef.value, leavePieData.value, '离职', handleLeaveSliceClick)
  renderReasonChart()
}

async function handleExport() {
  if (exporting.value) return
  exporting.value = true
  try {
    const range = `${filters.startDate || '全部'}_${filters.endDate || '全部'}`
    await download(
      'tk_custom/wxuser/employmentSummary/export',
      {
        startDate: filters.startDate,
        endDate: filters.endDate,
        eventType: filters.eventType === 'all' ? '' : filters.eventType,
      },
      `入离职汇总_${range}.xlsx`,
    )
  } catch (error) {
    toast.add({ title: error?.message || '导出表格失败', color: 'error' })
  } finally {
    exporting.value = false
  }
}

function initReasonDrafts(eventRows) {
  const drafts = {}
  for (const row of eventRows || []) {
    if (row.eventType !== 'leave') continue
    drafts[row.eventId] = { code: row.reasonCode || '' }
  }
  reasonDrafts.value = drafts
}

function shiftReasonStat(fromCode, toCode) {
  const stats = summary.value.reasonStats || []
  if (!stats.length) return false
  const total = Number(summary.value.reasonLeaveTotal || 0)
  const from = stats.find((item) => (item.code || '') === (fromCode || ''))
  const to = stats.find((item) => (item.code || '') === (toCode || ''))
  if (!from || !to) return false
  from.count = Math.max(0, Number(from.count || 0) - 1)
  to.count = Number(to.count || 0) + 1
  from.rate = total > 0 ? Math.round((from.count / total) * 10000) / 100 : null
  to.rate = total > 0 ? Math.round((to.count / total) * 10000) / 100 : null
  return true
}

async function saveReason(item) {
  const draft = reasonDrafts.value[item.eventId]
  if (!draft) return
  const nextCode = draft.code || ''
  if ((item.reasonCode || '') === nextCode) {
    toast.add({ title: '原因未改动，无需保存', color: 'neutral' })
    return
  }
  const next = new Set(savingReasonIds.value)
  next.add(item.eventId)
  savingReasonIds.value = next
  try {
    const response = await updateWxuserEmploymentLeaveReason({
      eventId: item.eventId,
      reasonCode: nextCode,
      reasonRemark: '',
    })
    if (response?.code !== 200) throw new Error(response?.msg || '保存离职原因失败')
    const prevCode = item.reasonCode || ''
    item.reasonCode = response.reasonCode ?? (nextCode || null)
    item.reasonRemark = response.reasonRemark ?? null
    if (!shiftReasonStat(prevCode, item.reasonCode || '')) await loadSummary()
    else renderReasonChart()
    toast.add({ title: `已保存：${item.name || ''}（${reasonLabel(item.reasonCode)}）`, color: 'success' })
  } catch (error) {
    toast.add({ title: error?.message || '保存离职原因失败', color: 'error' })
  } finally {
    const done = new Set(savingReasonIds.value)
    done.delete(item.eventId)
    savingReasonIds.value = done
  }
}

async function loadSummary() {
  loading.value = true
  errorMessage.value = ''
  try {
    const response = await getWxuserEmploymentSummary({
      startDate: filters.startDate,
      endDate: filters.endDate,
      eventType: filters.eventType === 'all' ? '' : filters.eventType,
    })
    if (response?.code !== 200) throw new Error(response?.msg || '获取入离职汇总失败')
    summary.value = response.summary || { hireCount: 0, leaveCount: 0, activeCount: 0, inactiveCount: 0 }
    rows.value = response.rows || []
    initReasonDrafts(rows.value)
    if (selectedLeaveDept.value && !leavePieData.value.some((item) => item.name === selectedLeaveDept.value)) {
      selectedLeaveDept.value = ''
    }
    await nextTick()
    renderCharts()
  } catch (error) {
    errorMessage.value = error?.message || '获取入离职汇总失败'
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  Object.assign(filters, lastWeekRange())
  filters.eventType = 'all'
  loadSummary()
}

watch(() => settingsStore.isDark, () => renderCharts())

watch(selectedLeaveDept, async () => {
  await nextTick()
  renderReasonChart()
})

onMounted(() => {
  loadSummary()
  window.addEventListener('resize', resizeCharts)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeCharts)
  resetCharts()
})
</script>
