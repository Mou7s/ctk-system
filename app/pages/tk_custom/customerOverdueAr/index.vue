<template>
  <div class="absolute inset-0 overflow-y-auto bg-app-bg p-3 text-app-text md:overflow-hidden">
    <div class="flex w-full flex-col gap-3 md:h-full md:min-h-0">
      <header class="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="text-lg font-bold">客户逾期应收</h1>
            <UBadge color="primary" variant="soft">应收分析</UBadge>
            <UBadge color="success" variant="soft">
              <span class="mr-1 inline-block size-1.5 rounded-full bg-emerald-500" />
              金蝶实时数据
            </UBadge>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <UButton v-if="canConfigureAlert" color="neutral" variant="outline" icon="i-lucide-bell" @click="openAlertSettings">周五提醒</UButton>
          <UButton icon="i-lucide-refresh-cw" :loading="loading" @click="handleQuery">
            刷新
          </UButton>
        </div>
      </header>

      <section class="grid shrink-0 grid-cols-2 gap-2 lg:grid-cols-4">
        <div v-for="item in summaryCards" :key="item.label" :title="item.help" class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-app-border bg-app-surface px-3 py-2">
          <div class="flex items-center gap-2 text-xs text-app-muted">
            <span>{{ item.label }}</span>
            <UIcon :name="item.icon" class="size-4" :class="item.color" />
          </div>
          <div v-if="item.amounts?.length" class="flex flex-wrap justify-end gap-x-3 gap-y-1 text-lg font-bold tabular-nums">
            <span v-for="amount in item.amounts" :key="amount.currencyCode || amount.currencyName" class="inline-flex items-baseline gap-1.5">
              <span class="text-xs font-normal text-muted">{{ currencyLabel(amount) }}</span>
              <span>{{ formatMoney(amount.openAmt) }}</span>
            </span>
          </div>
          <div v-else class="text-lg font-bold tabular-nums">{{ item.value }}</div>
        </div>
      </section>

      <section class="flex flex-col overflow-hidden rounded-xl border border-app-border bg-app-surface shadow-sm md:min-h-0 md:flex-1">
        <div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-app-border px-3 py-2">
          <div>
            <span class="font-semibold">逾期客户汇总</span>
            <span class="ml-2 text-xs text-app-muted">
              共 {{ summary.customerCount || 0 }} 家 · 第 {{ pageNum }} 页 · 截止 {{ asOfDate || '-' }}
            </span>
          </div>
          <span class="text-xs text-app-muted">数据源：{{ source }}</span>
        </div>

        <div class="shrink-0 border-b border-app-border p-3">
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-8">
            <UInput
              v-model="query.keyword"
              icon="i-lucide-search"
              placeholder="客户 / 跟单员 / 销售员"
              class="w-full xl:col-span-2"
              @keyup.enter="handleQuery"
            />
            <UInput
              v-model="query.minOverdueDays"
              type="number"
              min="0"
              placeholder="最少逾期天数"
              class="w-full"
              @keyup.enter="handleQuery"
            />
            <UInput
              v-model="query.minOpenAmt"
              type="number"
              min="0"
              placeholder="最低未收金额"
              class="w-full"
              @keyup.enter="handleQuery"
            />
            <USelect
              v-model="query.termCodes"
              :items="termOptions"
              value-key="value"
              label-key="label"
              multiple
              placeholder="账期（可多选，空=全部）"
              class="w-full xl:col-span-2"
              :ui="{ itemTrailingIcon: 'hidden' }"
            >
              <template #content-top>
                <div
                  class="flex cursor-pointer items-center gap-2 border-b border-app-border px-2.5 py-2 text-sm hover:bg-elevated/50"
                  @mousedown.prevent
                  @click="toggleAllTerms"
                >
                  <UCheckbox
                    :model-value="termSelectAllState"
                    tabindex="-1"
                    class="pointer-events-none"
                  />
                  <span>全选</span>
                </div>
              </template>
              <template #item-leading="{ item }">
                <UCheckbox
                  :model-value="query.termCodes.includes(item.value)"
                  tabindex="-1"
                  class="pointer-events-none"
                />
              </template>
            </USelect>
            <div class="flex flex-wrap items-center gap-2 xl:col-span-2">
              <UCheckbox v-model="query.excludeInternal" label="排除内部户" />
              <UButton icon="i-lucide-search" class="flex-1 justify-center" @click="handleQuery">查询</UButton>
              <UButton color="neutral" variant="outline" icon="i-lucide-rotate-ccw" @click="resetQuery" />
            </div>
          </div>
        </div>

        <TkUTable
          v-model:sorting="sorting"
          sticky
          :data="pagedRows"
          :columns="columns"
          :loading="loading"
          class="min-h-[420px] md:min-h-0 md:flex-1"
          @row-open="openBills"
        >
          <template #custName-cell="{ row }">
            <div class="min-w-[220px]">
              <div class="font-medium">{{ row.original.custName || '-' }}</div>
              <div class="mt-1 font-mono text-xs text-primary">{{ row.original.custCode || '-' }}</div>
              <div v-if="row.original.shortName" class="mt-1 text-xs text-app-muted">{{ row.original.shortName }}</div>
            </div>
          </template>
          <template #termName-cell="{ row }">
            <UBadge color="neutral" variant="soft">{{ row.original.termName || '未维护账期' }}</UBadge>
          </template>
          <template #merchandiserName-cell="{ row }">
            <div class="min-w-[72px]">
              <div>{{ row.original.merchandiserName || '-' }}</div>
              <div v-if="row.original.merchandiser1Name" class="mt-0.5 text-xs text-app-muted">
                跟单员1：{{ row.original.merchandiser1Name }}
              </div>
              <div v-if="row.original.merchandiser2Name" class="mt-0.5 text-xs text-app-muted">
                跟单员2：{{ row.original.merchandiser2Name }}
              </div>
            </div>
          </template>
          <template #sellerName-cell="{ row }">
            <span>{{ row.original.sellerName || '-' }}</span>
          </template>
          <template #freezeOutStock-cell="{ row }">
            <div class="min-w-[100px]">
              <UBadge
                :color="row.original.freezeOutStock ? 'error' : 'success'"
                variant="soft"
              >
                {{ row.original.freezeLabel || (row.original.freezeOutStock ? '已冻结出库' : '未冻结') }}
              </UBadge>
              <div v-if="row.original.freezeOutStock && row.original.freezeDate" class="mt-1 text-xs text-app-muted">
                {{ row.original.freezeDate }}
              </div>
            </div>
          </template>
          <template #openAmt-cell="{ row }">
            <span class="inline-flex items-baseline gap-1.5 tabular-nums">
              <span class="text-xs font-normal text-muted">{{ currencyLabel(row.original) }}</span>
              <span class="font-semibold text-rose-600 dark:text-rose-400">{{ formatMoney(row.original.openAmt) }}</span>
            </span>
          </template>
          <template #maxOverdueDays-cell="{ row }">
            <div class="min-w-[120px]">
              <div class="font-semibold tabular-nums" :class="daysClass(row.original.maxOverdueDays)">
                {{ row.original.maxOverdueDays }} 天
              </div>
              <div class="mt-1 text-xs text-app-muted">均 {{ row.original.avgOverdueDays || 0 }} 天</div>
            </div>
          </template>
          <template #billCnt-cell="{ row }">
            <div class="text-sm">
              <div class="font-medium tabular-nums">{{ row.original.billCnt }} 张</div>
              <div class="mt-1 text-xs text-app-muted">最早到期 {{ row.original.earliestDue || '-' }}</div>
            </div>
          </template>
          <template #action-cell="{ row }">
            <div class="flex flex-wrap items-center gap-1.5">
              <UButton size="sm" variant="soft" icon="i-lucide-list" @click.stop="openBills(row.original)">
                明细
              </UButton>
            </div>
          </template>
          <template #empty>
            <div class="flex min-h-[220px] flex-col items-center justify-center text-app-muted">
              <UIcon name="i-lucide-circle-check-big" class="mb-3 size-10 opacity-40" />
              <p>当前条件下没有逾期未付款客户</p>
            </div>
          </template>
        </TkUTable>

        <Pagination
          v-show="total > 0"
          v-model:page="pageNum"
          v-model:limit="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100, 200]"
          :auto-scroll="false"
          class="shrink-0 border-t border-app-border bg-transparent"
        />
      </section>
    </div>

    <UModal v-model:open="alertOpen" title="客户逾期应收周提醒" :ui="{ content: 'sm:max-w-3xl' }">
      <template #body>
        <div class="space-y-4">
          <p class="text-sm text-muted">每周五北京时间08:00，由企业微信应用发送个人Excel。跟单员和销售员只收到自己负责的客户，无逾期客户不发送。</p>
          <USelectMenu v-model="alertTotalReceiver" multiple :items="alertMembers" value-key="userid" label-key="name" placeholder="总表接收人" class="w-full" />
          <p class="text-xs text-muted">总表接收人收到全部逾期客户，其余人只收个人表；系统配置中的跳过人员按约定跳过。</p>
          <p v-if="alertError" class="text-sm text-error">{{ alertError }}</p>
          <div class="flex items-center gap-3">
            <UCheckbox v-model="alertEnabled" label="启用每周提醒" :disabled="alertBusy" />
            <UButton :loading="alertBusy" @click="saveAlertSettings">保存设置</UButton>
            <UButton color="neutral" variant="outline" :loading="alertBusy" @click="refreshAlertPreview">刷新预览</UButton>
          </div>
          <div v-if="alertUnmatched.length" class="rounded-lg bg-warning/10 p-3 text-sm">
            <p class="font-medium">以下负责人未唯一匹配企业微信账号，不能启用：</p>
            <p v-for="(item, index) in alertUnmatched" :key="index">{{ item.customer }}：{{ item.owner }}</p>
          </div>
          <div class="max-h-64 overflow-auto">
            <table class="w-full text-sm">
              <thead><tr class="text-left"><th class="p-2">接收人</th><th class="p-2">客户数</th><th class="p-2">个人表格</th></tr></thead>
              <tbody><tr v-for="person in alertRecipients" :key="person.userid" class="border-t border-default">
                <td class="p-2">{{ person.name }}<UBadge v-if="person.total" class="ml-2" size="xs">总表</UBadge></td><td class="p-2">{{ person.count }}</td>
                <td class="p-2"><UButton size="xs" variant="soft" @click="downloadAlertPreview(person)">下载预览</UButton></td>
              </tr></tbody>
            </table>
            <p v-if="!alertBusy && !alertRecipients.length" class="p-3 text-muted">暂无可发送的个人表格</p>
          </div>
          <UButton color="neutral" variant="outline" @click="loadAlertLogs">查看发送记录</UButton>
          <div v-if="alertLogs !== null" class="max-h-40 overflow-auto text-sm">
            <p v-for="(run,index) in alertLogs" :key="index" class="py-1">{{ String(run.run_date).slice(0,10) }} · {{ run.status }} · {{ run.summary }}</p>
            <p v-if="!alertLogs.length" class="text-muted">暂无发送记录</p>
          </div>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="billOpen"
      :ui="{ content: 'sm:max-w-5xl max-h-[85vh] flex flex-col overflow-hidden' }"
    >
      <template #content>
        <div class="flex max-h-[85vh] flex-col overflow-hidden p-5">
          <div class="mb-4 flex shrink-0 items-start justify-between gap-3">
            <div>
              <h2 class="text-lg font-bold">逾期应收明细</h2>
              <p class="mt-1 text-sm text-app-muted">
                {{ activeCustomer?.custName || '-' }}
                <span class="ml-2 font-mono text-primary">{{ activeCustomer?.custCode || '' }}</span>
                <span v-if="billRows.length" class="ml-2">· {{ billRows.length }} 张</span>
              </p>
            </div>
            <UButton color="neutral" variant="ghost" icon="i-lucide-x" @click="billOpen = false" />
          </div>

          <div class="min-h-0 flex-1 overflow-hidden">
            <TkUTable
              v-model:sorting="billSorting"
              sticky
              :interactive="false"
              :data="sortedBillRows"
              :columns="billColumns"
              :loading="billLoading"
              class="h-full min-h-[200px]"
              wrapper-class="h-full max-h-[calc(85vh-7rem)]"
            >
              <template #billNo-cell="{ row }">
                <span class="font-mono font-semibold text-primary">{{ row.original.billNo }}</span>
              </template>
              <template #billAmt-cell="{ row }">
                <span class="inline-flex items-baseline gap-1.5 tabular-nums"><span class="text-xs font-normal text-muted">{{ currencyLabel(row.original) }}</span><span>{{ formatMoney(row.original.billAmt) }}</span></span>
              </template>
              <template #writtenAmt-cell="{ row }">
                <span class="inline-flex items-baseline gap-1.5 tabular-nums"><span class="text-xs font-normal text-muted">{{ currencyLabel(row.original) }}</span><span>{{ formatMoney(row.original.writtenAmt) }}</span></span>
              </template>
              <template #openAmt-cell="{ row }">
                <span class="inline-flex items-baseline gap-1.5 tabular-nums">
                  <span class="text-xs font-normal text-muted">{{ currencyLabel(row.original) }}</span>
                  <span class="font-semibold text-rose-600 dark:text-rose-400">{{ formatMoney(row.original.openAmt) }}</span>
                </span>
              </template>
              <template #openStatusLabel-cell="{ row }">
                <UBadge :color="row.original.openStatus === 'B' ? 'warning' : 'error'" variant="soft">
                  {{ row.original.openStatusLabel || row.original.openStatus }}
                </UBadge>
              </template>
              <template #overdueDays-cell="{ row }">
                <span class="font-semibold tabular-nums" :class="daysClass(row.original.overdueDays)">
                  {{ row.original.overdueDays }} 天
                </span>
              </template>
              <template #empty>
                <div class="flex min-h-[180px] items-center justify-center text-app-muted">暂无明细</div>
              </template>
            </TkUTable>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup>
import { h, resolveComponent } from 'vue'
import {
  listCustomerOverdueAr,
  listCustomerOverdueArBills,
  getOverdueAlertSettings, saveOverdueAlertSettings, previewOverdueAlert, getOverdueAlertLogs, exportOverdueAlert,
} from '@/api/tk_custom/customerOverdueAr.js'

const UButton = resolveComponent('UButton')
const toast = useToast()
const canConfigureAlert = ref(false)
const alertOpen = ref(false)
const alertEnabled = ref(false)
const alertTotalReceiver = ref([])
const alertMembers = ref([])
const alertBusy = ref(false)
const alertError = ref('')
const alertRecipients = ref([])
const alertUnmatched = ref([])
const alertLogs = ref(null)

function alertData(response) {
  if (response?.code !== 200) throw new Error(response?.msg || '查询失败')
  return response.data
}
async function refreshAlertPreview() {
  alertBusy.value = true
  alertError.value = ''
  try {
    const data = alertData(await previewOverdueAlert())
    alertRecipients.value = data.recipients || []
    alertUnmatched.value = data.unmatched || []
  } catch (error) { alertError.value = error?.message || '预览失败' }
  finally { alertBusy.value = false }
}
async function openAlertSettings() {
  alertOpen.value = true
  alertError.value = ''
  alertLogs.value = null
  try {
    const settings = alertData(await getOverdueAlertSettings())
    alertEnabled.value = settings.enabled
    alertTotalReceiver.value = (settings.totalReceiver || '').split(',').map(id => id.trim()).filter(Boolean)
    alertMembers.value = settings.members || []
    await refreshAlertPreview()
  } catch (error) { alertError.value = error?.message || '读取设置失败' }
}
async function saveAlertSettings() {
  alertBusy.value = true
  alertError.value = ''
  try {
    alertData(await saveOverdueAlertSettings({ enabled: alertEnabled.value, totalReceiver: alertTotalReceiver.value.join(',') }))
    toast.add({ title: '提醒设置已保存', color: 'success' })
    await refreshAlertPreview()
  } catch (error) { alertError.value = error?.data?.msg || error?.message || '保存失败' }
  finally { alertBusy.value = false }
}
async function loadAlertLogs() {
  try { alertLogs.value = alertData(await getOverdueAlertLogs()).runs }
  catch (error) { alertError.value = error?.message || '记录查询失败' }
}
async function downloadAlertPreview(person) {
  try {
    const blob = await exportOverdueAlert({ recipient: person.userid })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${person.name}的客户逾期应收.xlsx`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (error) { alertError.value = error?.message || '下载失败' }
}

const loading = ref(false)
const billLoading = ref(false)
const allRows = ref([])
const billRows = ref([])
const pageNum = ref(1)
const pageSize = ref(20)
const source = ref('K3 SQL / T_AR_RECEIVABLE')
const asOfDate = ref('')
const summary = ref({})
const appliedMinOverdueDays = ref(undefined)
const billOpen = ref(false)
const activeCustomer = ref(null)
const sorting = ref([{ id: 'openAmt', desc: true }])
const billSorting = ref([{ id: 'overdueDays', desc: true }])

// 001 款到发货、003 月结0天由后端固定排除，不在此筛选；选项与 K3 T_BD_RECCONDITION 全集对齐
const termOptions = [
  { label: '货到7天付款', value: '002' },
  { label: '月结30天', value: '004' },
  { label: '月结40天', value: '005' },
  { label: '月结45天', value: '006' },
  { label: '月结50天', value: '007' },
  { label: '月结60天', value: '008' },
  { label: '月结75天', value: '009' },
  { label: '月结90天', value: '010' },
  { label: '预收订金20%', value: '011' },
  { label: '月结80天', value: '012' },
  { label: '月结120天', value: '013' },
  { label: '货到收款', value: 'SKTJ01_SYS' },
  { label: '30天后收款', value: 'SKTJ02_SYS' },
  { label: '月结30天', value: 'SKTJ03_SYS' },
  { label: '多到期日（按金额）', value: 'SKTJ04_SYS' },
]

function defaultQuery() {
  return {
    keyword: '',
    minOverdueDays: '',
    minOpenAmt: '',
    termCodes: [],
    excludeInternal: true,
  }
}

const query = reactive(defaultQuery())

const allTermValues = computed(() => termOptions.map((item) => item.value))

const termSelectAllState = computed(() => {
  const selected = Array.isArray(query.termCodes) ? query.termCodes : []
  if (!selected.length) return false
  if (selected.length >= allTermValues.value.length
    && allTermValues.value.every((v) => selected.includes(v))) {
    return true
  }
  return 'indeterminate'
})

function toggleAllTerms() {
  const selected = Array.isArray(query.termCodes) ? query.termCodes : []
  const allSelected = selected.length >= allTermValues.value.length
    && allTermValues.value.every((v) => selected.includes(v))
  query.termCodes = allSelected ? [] : [...allTermValues.value]
}

const total = computed(() => allRows.value.length)

const sortedRows = computed(() => sortRows(allRows.value, sorting.value))

const pagedRows = computed(() => {
  const start = (pageNum.value - 1) * pageSize.value
  return sortedRows.value.slice(start, start + pageSize.value)
})

const sortedBillRows = computed(() => sortRows(billRows.value, billSorting.value))

const summaryCards = computed(() => [
  {
    label: '逾期客户数',
    value: Number(summary.value.customerCount || 0).toLocaleString('zh-CN'),
    help: '当前筛选结果',
    icon: 'i-lucide-users',
    color: 'text-sky-500',
  },
  {
    label: '逾期单据数',
    value: Number(summary.value.billCount || 0).toLocaleString('zh-CN'),
    help: '未结清应收单',
    icon: 'i-lucide-file-warning',
    color: 'text-amber-500',
  },
  {
    label: '逾期未收合计',
    value: '—',
    amounts: summary.value.amountsByCurrency || [],
    help: '原币金额，按币种分别合计',
    icon: 'i-lucide-banknote',
    color: 'text-rose-500',
  },
  {
    label: '最长逾期',
    value: `${Number(summary.value.maxOverdueDays || 0)} 天`,
    help: asOfDate.value ? `截止 ${asOfDate.value}` : '相对今天',
    icon: 'i-lucide-timer',
    color: 'text-orange-500',
  },
])

function getHeader(column, label) {
  const isSorted = column.getIsSorted()
  // 点击循环：无排序 → 升序 → 降序 → 无排序
  return h(UButton, {
    color: 'neutral',
    variant: 'ghost',
    label,
    icon: isSorted
      ? (isSorted === 'asc' ? 'i-lucide-arrow-up-narrow-wide' : 'i-lucide-arrow-down-wide-narrow')
      : 'i-lucide-arrow-up-down',
    class: '-mx-2.5',
    'aria-label': `${label}排序`,
    onClick: () => {
      if (!isSorted) column.toggleSorting(false)
      else if (isSorted === 'asc') column.toggleSorting(true)
      else column.clearSorting()
    },
  })
}

const columns = [
  {
    accessorKey: 'custName',
    header: ({ column }) => getHeader(column, '客户'),
    enableSorting: true,
  },
  {
    accessorKey: 'termName',
    header: '账期',
    enableSorting: false,
  },
  {
    accessorKey: 'merchandiserName',
    header: ({ column }) => getHeader(column, '跟单员'),
    enableSorting: true,
  },
  {
    accessorKey: 'sellerName',
    header: ({ column }) => getHeader(column, '销售员'),
    enableSorting: true,
  },
  {
    accessorKey: 'freezeOutStock',
    header: ({ column }) => getHeader(column, '出库冻结'),
    enableSorting: true,
  },
  {
    accessorKey: 'openAmt',
    header: ({ column }) => getHeader(column, '未收金额'),
    enableSorting: true,
  },
  {
    accessorKey: 'maxOverdueDays',
    header: ({ column }) => getHeader(column, '逾期天数'),
    enableSorting: true,
  },
  {
    accessorKey: 'billCnt',
    header: ({ column }) => getHeader(column, '单据'),
    enableSorting: true,
  },
  {
    id: 'action',
    accessorKey: 'action',
    header: '操作',
    enableSorting: false,
  },
]

const billColumns = [
  {
    accessorKey: 'billNo',
    header: ({ column }) => getHeader(column, '应收单号'),
    enableSorting: true,
  },
  {
    accessorKey: 'billDate',
    header: ({ column }) => getHeader(column, '业务日期'),
    enableSorting: true,
  },
  {
    accessorKey: 'dueDate',
    header: ({ column }) => getHeader(column, '到期日'),
    enableSorting: true,
  },
  {
    accessorKey: 'billAmt',
    header: ({ column }) => getHeader(column, '单据金额'),
    enableSorting: true,
  },
  {
    accessorKey: 'writtenAmt',
    header: ({ column }) => getHeader(column, '已核销'),
    enableSorting: true,
  },
  {
    accessorKey: 'openAmt',
    header: ({ column }) => getHeader(column, '未收金额'),
    enableSorting: true,
  },
  {
    accessorKey: 'openStatusLabel',
    header: ({ column }) => getHeader(column, '结算状态'),
    enableSorting: true,
  },
  {
    accessorKey: 'overdueDays',
    header: ({ column }) => getHeader(column, '逾期'),
    enableSorting: true,
  },
]

function sortRows(list, sortingState) {
  const rows = Array.isArray(list) ? [...list] : []
  const rule = Array.isArray(sortingState) ? sortingState[0] : null
  if (!rule?.id) return rows
  const key = rule.id
  const dir = rule.desc ? -1 : 1
  return rows.sort((a, b) => {
    const va = a?.[key]
    const vb = b?.[key]
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    if (typeof va === 'boolean' || typeof vb === 'boolean'
      || typeof va === 'number' || typeof vb === 'number') {
      return (Number(va) - Number(vb)) * dir
    }
    return String(va).localeCompare(String(vb), 'zh-CN') * dir
  })
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function currencyLabel(row) {
  const labels = { 美元: 'USD', 人民币: 'CNY', 欧元: 'EUR', 港币: 'HKD', 英镑: 'GBP', 日元: 'JPY' }
  return labels[row.currencyName] || row.currencyName || row.currencyCode || '币种未维护'
}

function daysClass(days) {
  const n = Number(days || 0)
  if (n >= 90) return 'text-rose-600 dark:text-rose-400'
  if (n >= 30) return 'text-orange-600 dark:text-orange-400'
  return 'text-amber-600 dark:text-amber-400'
}

function buildParams() {
  const termCodes = Array.isArray(query.termCodes)
    ? query.termCodes.filter(Boolean)
    : []
  return {
    keyword: query.keyword || undefined,
    minOverdueDays: query.minOverdueDays === '' || query.minOverdueDays == null
      ? undefined
      : Number(query.minOverdueDays),
    minOpenAmt: query.minOpenAmt === '' || query.minOpenAmt == null
      ? undefined
      : Number(query.minOpenAmt),
    termCodes: termCodes.length ? termCodes.join(',') : undefined,
    excludeInternal: query.excludeInternal,
  }
}

async function loadData() {
  loading.value = true
  try {
    const params = buildParams()
    const response = await listCustomerOverdueAr(params)
    if (response?.code !== 200) {
      throw new Error(response?.msg || '查询返回异常')
    }
    const data = response?.data || {}
    canConfigureAlert.value = data.canConfigureAlert === true
    allRows.value = Array.isArray(data.rows) ? data.rows : []
    source.value = data.source || source.value
    asOfDate.value = data.asOfDate || ''
    summary.value = data.summary || {}
    appliedMinOverdueDays.value = params.minOverdueDays
    pageNum.value = 1
  } catch (error) {
    allRows.value = []
    summary.value = {}
    asOfDate.value = ''
    toast.add({
      title: '逾期未付款查询失败',
      description: error?.data?.msg || error?.message || '请检查金蝶数据库连接',
      color: 'error',
    })
  } finally {
    loading.value = false
  }
}

function handleQuery() {
  loadData()
}

function resetQuery() {
  Object.assign(query, defaultQuery())
  handleQuery()
}

async function openBills(customer) {
  if (!customer?.custCode) return
  activeCustomer.value = customer
  billOpen.value = true
  billLoading.value = true
  billRows.value = []
  try {
    const response = await listCustomerOverdueArBills({
      custCode: customer.custCode,
      minOverdueDays: appliedMinOverdueDays.value,
      currencyCode: customer.currencyCode || undefined,
    })
    if (response?.code !== 200) {
      throw new Error(response?.msg || '明细查询返回异常')
    }
    const data = response?.data || {}
    billRows.value = Array.isArray(data.rows) ? data.rows : []
  } catch (error) {
    toast.add({
      title: '明细查询失败',
      description: error?.data?.msg || error?.message || '请稍后重试',
      color: 'error',
    })
  } finally {
    billLoading.value = false
  }
}

watch(sorting, () => {
  pageNum.value = 1
}, { deep: true })

watch(pageSize, () => {
  pageNum.value = 1
})

onMounted(() => {
  loadData()
})
</script>
