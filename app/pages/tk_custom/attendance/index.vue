<template>
  <div class="app-container absolute inset-0 flex min-h-0 flex-col gap-3 overflow-hidden p-4 lg:p-5 bg-[#f8fafc] dark:bg-gray-900">
    <!-- 汇总卡片 -->
    <div class="grid shrink-0 grid-cols-2 gap-2.5 sm:grid-cols-3">
      <div v-for="card in summaryCards" :key="card.key" class="relative overflow-hidden rounded-xl border bg-white dark:bg-gray-800 p-3 shadow-sm">
        <div class="absolute left-0 top-0 bottom-0 w-1" :class="card.barClass"></div>
        <div class="flex items-start justify-between">
          <div class="text-[11px] font-medium tracking-widest text-slate-500 dark:text-slate-400">{{ card.label }}</div>
          <div class="rounded-lg p-1.5" :class="card.iconBg"><i :class="card.icon" class="text-[14px]"></i></div>
        </div>
        <div class="mt-1 text-2xl font-bold tracking-tight" :class="card.className">{{ summary[card.key] ?? '—' }}</div>
      </div>
    </div>

    <!-- 筛选 -->
    <div class="shrink-0 rounded-xl border border-slate-200/70 dark:border-slate-700 bg-white dark:bg-gray-800 shadow-sm p-3 flex flex-wrap items-center gap-2.5">
      <UInput v-model="recordParams.keyword" class="w-52" placeholder="姓名 / 工号 / 卡号" clearable icon="i-lucide-search" @keyup.enter="handleRecordQuery" />
      <TkDateRangePicker v-model="recordRange" class="w-full sm:w-64" />
      <USelect v-model="recordParams.year" :items="yearItems" value-key="value" label-key="label" class="w-28" />
      <USelect v-model="deviceFilterValue" :items="deviceItems" value-key="value" label-key="label" class="w-32" placeholder="设备" />
      <UButton color="primary" variant="solid" icon="i-lucide-search" class="shadow-sm" @click="handleRecordQuery">搜索</UButton>
      <UButton color="neutral" variant="ghost" icon="i-lucide-rotate-ccw" @click="resetRecordQuery">重置</UButton>
      <UButton color="neutral" variant="outline" icon="i-lucide-refresh-cw" @click="getRecords">刷新</UButton>
    </div>

    <!-- 刷卡记录表 -->
    <div class="table-container-premium min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-gray-800 shadow-sm">
      <table class="w-full text-[13px]">
        <thead class="sticky top-0 z-10 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur border-b">
          <tr class="text-[11px] tracking-widest font-semibold text-slate-600 dark:text-slate-300">
            <th class="px-3 py-2.5 text-left">刷卡时间</th>
            <th class="px-3 py-2.5 text-left">姓名</th>
            <th class="px-3 py-2.5 text-left">工号</th>
            <th class="px-3 py-2.5 text-left">卡号</th>
            <th class="px-3 py-2.5 text-left">部门</th>
            <th class="px-3 py-2.5 text-left">设备</th>
            <th class="px-3 py-2.5 text-left">位置</th>
            <th class="px-3 py-2.5 text-left">结果</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
          <tr v-if="recordLoading"><td colspan="8" class="px-4 py-12 text-center"><div class="inline-flex items-center gap-2 text-slate-500"><span class="animate-spin i-lucide-loader-2"></span>加载中...</div></td></tr>
          <tr v-else-if="!records.length"><td colspan="8" class="px-4 py-12 text-center text-slate-400">暂无数据 — 换个日期或关键字试试</td></tr>
          <tr v-for="row in records" :key="row.id" class="hover:bg-blue-50/60 dark:hover:bg-slate-700/40 transition-colors">
            <td class="px-3 py-2.5 font-mono text-xs">{{ row.date }}</td>
            <td class="px-3 py-2.5 font-medium">{{ row.userName || '—' }}</td>
            <td class="px-3 py-2.5 font-mono text-xs">{{ row.userID || '—' }}</td>
            <td class="px-3 py-2.5 font-mono text-xs text-slate-500">{{ row.cardID || '—' }}</td>
            <td class="px-3 py-2.5">{{ row.deptName || '—' }}</td>
            <td class="px-3 py-2.5 font-mono text-xs">{{ row.deviceID || '—' }}</td>
            <td class="px-3 py-2.5">{{ row.position || '—' }}</td>
            <td class="px-3 py-2.5"><UBadge :color="row.testResult === '100' ? 'success' : 'neutral'" variant="soft" size="xs" class="rounded-full font-mono">{{ row.testResult ?? '—' }}</UBadge></td>
          </tr>
        </tbody>
      </table>
    </div>

    <pagination v-show="recordTotal > 0" :total="recordTotal" v-model:page="recordParams.pageNum" v-model:limit="recordParams.pageSize" class="shrink-0" @pagination="getRecords" />
  </div>
</template>

<script setup>
import { hasStaticPermission } from '@/router/static-navigation'
import useUserStore from '@/store/modules/user'
import { listAttendanceRecords, getAttendanceSummary } from '@/api/tk_custom/attendance.js'

const toast = useToast()
const userStore = useUserStore()
const canQuery = computed(() => hasStaticPermission(userStore, 'tk_custom:attendance:query'))

const todayYmd = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
const today = todayYmd()
const thisYear = new Date().getFullYear()

const summary = reactive({ punchToday: null, headsToday: null, staffTotal: null })

const summaryCards = [
  { key: 'punchToday', label: '今日刷卡', className: 'text-slate-900 dark:text-white', barClass: 'bg-slate-900', iconBg: 'bg-slate-100 text-slate-600', icon: 'i-lucide-fingerprint' },
  { key: 'headsToday', label: '今日人数', className: 'text-sky-600', barClass: 'bg-sky-500', iconBg: 'bg-sky-100 text-sky-600', icon: 'i-lucide-users' },
  { key: 'staffTotal', label: '在册人员', className: 'text-emerald-600', barClass: 'bg-emerald-500', iconBg: 'bg-emerald-100 text-emerald-600', icon: 'i-lucide-id-card' },
]

const yearItems = Array.from({ length: thisYear - 2021 + 1 }, (_, i) => ({ label: `${2021 + i} 年`, value: 2021 + i })).reverse()
const deviceItems = [{ label: '全部设备', value: '__all__' }, ...['001', '002', '003', '004', '005'].map((v) => ({ label: `${v} 号机`, value: v }))]
const deviceFilterValue = computed({
  get: () => recordParams.value.deviceId || '__all__',
  set: (v) => { recordParams.value.deviceId = v === '__all__' ? '' : v },
})

const records = ref([])
const recordTotal = ref(0)
const recordLoading = ref(false)
const recordParams = ref({ pageNum: 1, pageSize: 20, keyword: '', year: thisYear, deviceId: '' })
const recordRange = ref([today, today])

function guard() {
  if (!canQuery.value) {
    toast.add({ title: '无考勤查询权限', color: 'warning' })
    return false
  }
  return true
}

async function loadSummary() {
  try {
    const res = await getAttendanceSummary()
    const data = res.data || res || {}
    Object.assign(summary, data)
  } catch { /* 汇总失败不挡列表 */ }
}

async function getRecords() {
  if (!guard()) return
  recordLoading.value = true
  try {
    const res = await listAttendanceRecords({
      ...recordParams.value,
      dateFrom: recordRange.value?.[0] || today,
      dateTo: recordRange.value?.[1] || today,
    })
    records.value = res.rows || []
    recordTotal.value = res.total || 0
  } catch (e) {
    toast.add({ title: e?.message || '查询考勤记录失败', color: 'error' })
  } finally {
    recordLoading.value = false
  }
}

function handleRecordQuery() {
  recordParams.value.pageNum = 1
  getRecords()
}
function resetRecordQuery() {
  recordParams.value = { pageNum: 1, pageSize: 20, keyword: '', year: thisYear, deviceId: '' }
  recordRange.value = [today, today]
  getRecords()
}

onMounted(() => {
  loadSummary()
  getRecords()
})
</script>
