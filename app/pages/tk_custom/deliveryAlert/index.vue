<template>
  <div class="absolute inset-0 flex flex-col gap-2 overflow-y-auto bg-default p-3">
    <header class="flex shrink-0 flex-wrap justify-between items-center gap-2">
      <div class="flex items-center gap-3">
        <div class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><UIcon name="i-lucide-calendar-clock" class="size-6" /></div>
        <div>
          <h1 class="text-xl font-semibold tracking-tight text-highlighted">销售交期预警</h1>
          <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span>{{ capabilities.canViewAll ? '全部未交订单' : '本人负责订单' }}</span>
            <span class="flex items-center gap-1"><UIcon name="i-lucide-clock-3" />每日提醒 08:00</span>
            <span v-if="fetchedAt">更新于 {{ formatTime(fetchedAt) }}</span>
          </div>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UButton v-if="capabilities.canViewAll" icon="i-lucide-send" color="neutral" variant="ghost" @click="openPreview">发送预览</UButton>
        <UButton v-if="capabilities.canViewAll" icon="i-lucide-history" color="neutral" variant="ghost" @click="openLogs">记录</UButton>
        <UButton v-if="capabilities.canConfigure" icon="i-lucide-settings-2" color="neutral" variant="ghost" @click="openSettings">设置</UButton>
        <UButton icon="i-lucide-download" :loading="exporting" @click="download()">导出 Excel</UButton>
      </div>
    </header>
    <UAlert v-if="error" color="error" title="刷新失败，保留上次结果" :description="String(error)" />
    <section aria-label="当前筛选统计" class="flex shrink-0 flex-wrap gap-x-5 gap-y-2 rounded-lg border border-default px-3 py-2">
      <div v-for="stat in statistics" :key="stat.label" class="flex items-center gap-2">
        <UIcon :name="stat.icon" class="size-4" :class="stat.color" /><span class="text-xs text-muted">{{ stat.label }}</span>
        <span class="text-lg font-semibold tabular-nums" :class="stat.color">{{ loading && !fetchedAt ? '—' : stat.value.toLocaleString() }}</span>
      </div>
    </section>
    <section class="flex min-h-[360px] flex-1 flex-col overflow-hidden rounded-xl border border-default bg-default">
      <div class="flex shrink-0 flex-col gap-2 border-b border-default p-2 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-1 rounded-lg bg-elevated/60 p-1">
            <UButton v-for="item in quickFilters" :key="item.value" size="sm" color="neutral" :variant="queryParams.status === item.value ? 'solid' : 'ghost'" @click="selectStatus(item.value)">{{ item.label }}</UButton>
          </div>
          <div class="flex items-center gap-2"><span class="flex items-center gap-1.5 text-xs text-muted"><UIcon name="i-lucide-arrow-up-narrow-wide" />交期从早到晚 · 逾期优先</span><UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="loading" aria-label="刷新数据" title="刷新数据" @click="getList" /></div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <USelect v-model="queryParams.production" :items="productionFilters" value-key="value" class="w-44" aria-label="生产状态" @update:model-value="handleQuery" />
          <UInput v-model="queryParams.keyword" icon="i-lucide-search" placeholder="搜索客户、订单、物料或规格" class="w-full sm:w-72" @keyup.enter="handleQuery" />
          <UInput v-model="queryParams.owner" icon="i-lucide-user-round" placeholder="业务员 / 跟单员" class="w-full sm:w-44" @keyup.enter="handleQuery" />
          <UButton icon="i-lucide-search" :loading="loading" @click="handleQuery">查询</UButton>
          <UButton color="neutral" variant="ghost" icon="i-lucide-list-restart" aria-label="重置筛选" title="重置筛选" @click="resetFilters" />
        </div>
      </div>
      <UTable :data="list" :columns="tableColumns" :loading="loading" :on-select="onSelect" :get-row-id="row => String(row.entryId)" :row-selection="rowSelection" sticky class="min-h-0 flex-1" :ui="{ base: 'min-w-[960px] w-full', th: 'bg-elevated/60 px-3 py-3 text-xs font-medium', td: 'px-3 py-3 align-top', tr: 'data-[selected=true]:bg-primary/5' }">
        <template #dueDate-cell="{ row }">
          <div class="min-w-32 space-y-1.5">
            <div class="font-medium tabular-nums text-highlighted">{{ row.original.dueDate || '尚未回复交期' }}</div>
            <UBadge :color="urgencyColor(row.original.urgency)" size="sm" variant="subtle">{{ row.original.daysLeft == null ? '待确认' : row.original.daysLeft < 0 ? `逾期 ${-row.original.daysLeft} 天` : row.original.daysLeft === 0 ? '今天到期' : `还有 ${row.original.daysLeft} 天` }}</UBadge>
          </div>
        </template>
        <template #billNo-cell="{ row }">
          <div class="max-w-56 min-w-40"><div class="whitespace-normal font-medium text-highlighted">{{ row.original.customer }}</div><div class="mt-1 text-xs text-muted">{{ row.original.billNo }}<span class="ml-2">第 {{ row.original.seq }} 行</span></div></div>
        </template>
        <template #materialCode-cell="{ row }">
          <div class="max-w-64 min-w-44"><div class="font-medium text-highlighted">{{ row.original.materialCode }}</div><div class="mt-1 line-clamp-2 whitespace-normal text-xs leading-5 text-muted" :title="row.original.materialName">{{ row.original.materialName }}</div><div class="mt-1 whitespace-normal text-xs leading-5 text-muted" :title="row.original.specification">规格：{{ row.original.specification || '未维护' }}</div></div>
        </template>
        <template #remainingQty-cell="{ row }">
          <div class="min-w-40 max-w-48"><div class="flex items-baseline gap-1.5"><span class="text-lg font-semibold tabular-nums text-highlighted">{{ formatQty(row.original.remainingQty) }}</span><span class="text-xs text-muted">{{ row.original.unit }} 未交</span></div><UProgress :model-value="deliveryProgress(row.original)" size="xs" color="primary" class="mt-2" :aria-label="`交付进度 ${deliveryProgress(row.original)}%`" /><div class="mt-1.5 flex justify-between gap-2 text-xs tabular-nums text-muted"><span>已出 {{ formatQty(row.original.shippedQty) }}</span><span>订单 {{ formatQty(row.original.qty) }}</span></div><div v-if="row.original.returnedQty > 0" class="mt-1 text-xs text-warning">退货 {{ formatQty(row.original.returnedQty) }} {{ row.original.unit }}</div></div>
        </template>
        <template #seller-cell="{ row }">
          <div class="min-w-32 space-y-1 text-xs"><div><span class="text-muted">业务</span><span class="ml-2 text-highlighted">{{ row.original.seller || '未填写' }}</span></div><div><span class="text-muted">跟单</span><span class="ml-2 text-highlighted">{{ [row.original.follow1, row.original.follow2].filter(Boolean).join(' / ') || '未填写' }}</span></div></div>
        </template>
        <template #productionStatus-cell="{ row }">
          <div class="min-w-40 space-y-1.5 text-xs">
            <UBadge :color="row.original.productionGroup === '已入库待发货' ? 'success' : row.original.productionGroup === '待核实' ? 'neutral' : 'warning'" variant="subtle">{{ row.original.productionStatus }}</UBadge>
            <div class="max-w-64 whitespace-normal break-words text-muted">生产订单号：{{ row.original.productionOrderNos || '无关联' }}</div>
            <template v-if="row.original.instockedQty != null">
              <div class="text-muted">累计入库 {{ formatQty(row.original.instockedQty) }} {{ row.original.unit }}</div>
              <div class="text-muted">待发 {{ formatQty(row.original.readyQty) }} · 未完成 {{ formatQty(row.original.unfinishedQty) }}</div>
            </template>
            <div v-else class="text-muted">需核对生产关联或数量</div>
          </div>
        </template>
        <template #issues-cell="{ row }">
          <UPopover v-if="row.original.issues.length">
            <UButton color="warning" variant="subtle" size="xs" icon="i-lucide-circle-alert" @click.stop>{{ row.original.issues.length }} 项</UButton>
            <template #content><ul class="max-w-72 space-y-2 p-3 text-xs leading-5 text-muted"><li v-for="issue in row.original.issues" :key="issue">{{ issue }}</li></ul></template>
          </UPopover>
          <span v-else class="text-muted">—</span>
        </template>
        <template #empty><div class="py-12"><UIcon name="i-lucide-inbox" class="mb-3 size-9 text-muted" /><p class="font-medium text-highlighted">当前筛选下没有未交订单</p><p class="mt-1 text-xs text-muted">可调整状态或搜索条件后重试</p></div></template>
      </UTable>
      <footer class="flex shrink-0 flex-wrap justify-between items-center gap-2 border-t border-default px-3 py-2">
        <span class="text-xs text-muted">共 {{ total.toLocaleString() }} 条{{ currentRowId ? ' · 已选中一条' : '' }}</span>
        <UPagination v-model:page="queryParams.pageNum" :total="total" :items-per-page="queryParams.pageSize" size="sm" @update:page="getList" />
      </footer>
    </section>
    <p class="shrink-0 text-xs text-muted">未交量以金蝶台账为准；生产状态按关联订单的合格入库量扣除已出货量判断，数量统一为销售单位，不代表实时可用库存。无关联、退货或数量异常列为待核实。已关闭、已终止和已交完明细不纳入。</p>

    <UModal v-model:open="previewOpen" title="每日发送预览" description="只读预览，不发送消息。个人只收到负责的明细，总表接收人收到全部。" :ui="{ content: 'max-w-3xl' }">
      <template #body>
        <UAlert v-if="preview.invalidTotal?.length" color="error" title="总表接收人失效，请重新设置" class="mb-3" />
        <UAlert v-if="!preview.recipients?.some(r => r.total)" color="warning" title="尚未设置有效总表接收人，定时发送不会执行" class="mb-3" />
        <UTable :data="preview.recipients || []" :columns="previewColumns">
          <template #total-cell="{ row }">{{ row.original.total ? '总表' : '个人表' }}</template>
          <template #download-cell="{ row }"><UButton size="xs" variant="outline" :loading="exporting" @click="download(row.original)">下载样表</UButton></template>
        </UTable>
      </template>
    </UModal>
    <UModal v-model:open="settingsOpen" title="每日提醒设置" description="每天北京时间 08:00；每人一份表。同人兼任多个角色时合并，不重复发送。">
      <template #body>
        <div class="space-y-5">
          <UFormField label="开启每日提醒"><USwitch v-model="settings.enabled" /></UFormField>
          <UFormField label="总表接收人" description="个人接收人从金蝶负责人自动分配，这里只设置总表。">
            <USelectMenu v-model="settings.totalReceivers" multiple :items="memberOptions" value-key="value" placeholder="选择企微成员" class="w-full" />
          </UFormField>
          <UAlert color="warning" title="当天发送过或结果不明时，不自动重发" description="开启后若已过 08:00 且当天未运行，会补发当天一份。请先在发送预览中核对接收范围。" />
        </div>
      </template>
      <template #footer><UButton :loading="saving" @click="saveSettings">保存设置</UButton><UButton variant="ghost" @click="settingsOpen = false">取消</UButton></template>
    </UModal>
    <UModal v-model:open="logsOpen" title="最近 30 天发送记录" description="结果不明表示发送可能已完成，需核对企业微信，系统不会自动重发。" :ui="{ content: 'max-w-5xl' }">
      <template #body>
        <UTable :data="logs.runs || []" :columns="runColumns" class="mb-5" />
        <UTable :data="logs.deliveries || []" :columns="logColumns" />
      </template>
    </UModal>
    </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { saveAs } from 'file-saver'
import { useTkListQuery, useTkRowInteraction } from '@ctk-system/composables'
import { listDeliveryAlerts, exportDeliveryAlerts, previewDeliveryAlerts, getDeliveryAlertSettings, saveDeliveryAlertSettings, getDeliveryAlertLogs } from '@/api/tk_custom/deliveryAlert'
import { readBlobErrorMessage } from '@/utils/blob-download'

definePageMeta({ title: '销售交期预警', permission: 'tk_custom:deliveryAlert:list', roles: ['sales_manager'] })

const toast = useToast()
const queryParams = ref({ pageNum: 1, pageSize: 100, keyword: '', owner: '', status: 'all', production: 'all' })
const summary = ref({})
const fetchedAt = ref('')
const capabilities = ref({ canViewAll: false, canConfigure: false })
let fetchSequence = 0
const { loading, list, total, error, getList, handleQuery } = useTkListQuery({ queryParams, fetchList: async () => {
  const sequence = ++fetchSequence
  const response = await listDeliveryAlerts(queryParams.value)
  if (sequence === fetchSequence && response.code === 200) {
    summary.value = response.summary
    fetchedAt.value = response.fetchedAt
    capabilities.value = response
  }
  return response
} })
const statistics = computed(() => [
  { label: '未交明细', value: total.value, color: 'text-highlighted', icon: 'i-lucide-clipboard-list' },
  { label: '已逾期', value: summary.value.overdue || 0, color: 'text-error', icon: 'i-lucide-circle-alert' },
  { label: '逾期 · 已入库待发货', value: summary.value.overdueReady || 0, color: 'text-success', icon: 'i-lucide-package-check' },
  { label: '逾期 · 生产未完成', value: summary.value.overdueUnfinished || 0, color: 'text-warning', icon: 'i-lucide-factory' },
  { label: '逾期 · 待核实', value: summary.value.overdueUnknown || 0, color: 'text-muted', icon: 'i-lucide-circle-help' },
  { label: '今天到期', value: summary.value.dueToday || 0, color: 'text-warning', icon: 'i-lucide-calendar-clock' },
  { label: '部分出货', value: summary.value.partial || 0, color: 'text-primary', icon: 'i-lucide-truck' },
  { label: '未回复交期', value: summary.value.noDate || 0, color: 'text-muted', icon: 'i-lucide-calendar-question' },
])
const quickFilters = [{ label: '全部', value: 'all' }, ...['逾期','今天到期','待交付','未回复交期','异常'].map(value => ({ label: value, value }))]
const productionFilters = [{ label: '全部生产状态', value: 'all' }, ...['已入库待发货', '生产未完成', '待核实'].map(value => ({ label: value, value }))]
const tableColumns = [['dueDate','交期'],['billNo','客户 / 销售订单'],['materialCode','产品'],['remainingQty','交付数量'],['productionStatus','生产 / 入库'],['seller','负责人'],['issues','需关注']].map(([accessorKey, header]) => ({ accessorKey, header }))
const previewColumns = [['name','接收人'],['total','报表'],['count','明细数'],['overdue','逾期数'],['issues','异常数']].map(([accessorKey, header]) => ({ accessorKey, header })).concat({ id: 'download', header: '样表' })
const statusNames = { running: '运行中 / 中断待核对', preparing: '准备中', sending: '发送中 / 中断待核对', sent: '已发送', failed: '失败', partial: '部分失败', uncertain: '结果不明' }
const runColumns = [['run_date','日期'],['status','状态'],['summary','结果']].map(([accessorKey, header]) => ({ accessorKey, header }))
const logColumns = [['run_date','日期'],['recipient_name','接收人'],['row_count','明细数'],['status','状态'],['error_message','失败原因']].map(([accessorKey, header]) => ({ accessorKey, header }))
const previewOpen = ref(false), settingsOpen = ref(false), logsOpen = ref(false)
const preview = ref({}), settings = ref({ enabled: false, totalReceivers: [], members: [] }), logs = ref({})
const exporting = ref(false), saving = ref(false)
const memberOptions = computed(() => settings.value.members.map(m => ({ label: m.name, value: m.userid })))
const currentRowId = ref(null), ids = ref([]), single = ref(true), multiple = ref(true)
const rowSelection = computed(() => currentRowId.value == null ? {} : { [String(currentRowId.value)]: true })
watch(list, () => { currentRowId.value = null })
const interactions = useTkRowInteraction({ getTableRef: () => undefined, currentRowId, ids, single, multiple, getRowId: row => row.entryId })
function onSelect(event, row) {
  const column = { label: '明细' }
  if (event.detail > 1) return
  interactions.handleRowClick(row.original, column, event)
}
function urgencyColor(value) { return value === '逾期' ? 'error' : value === '今天到期' || value === '未回复交期' ? 'warning' : 'neutral' }
function formatTime(value) { return new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) }
function formatQty(value) { return Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 6 }) }
function deliveryProgress(row) { return row.qty > 0 ? Math.min(row.remainingQty > 0 ? 99 : 100, Math.round(Math.max(0, (row.qty - row.remainingQty) / row.qty * 100))) : 0 }
function selectStatus(value) { queryParams.value.status = value; handleQuery() }
function resetFilters() { Object.assign(queryParams.value, { keyword: '', owner: '', status: 'all', production: 'all' }); handleQuery() }
function reportError(error) { toast.add({ title: error.message || '操作失败', color: 'error' }) }
async function checked(call) { const response = await call; if (response.code !== 200) throw new Error(response.msg || '操作失败'); return response.data }
async function openPreview() { try { preview.value = await checked(previewDeliveryAlerts()); previewOpen.value = true } catch (error) { reportError(error) } }
async function openSettings() { try { settings.value = await checked(getDeliveryAlertSettings()); settingsOpen.value = true } catch (error) { reportError(error) } }
async function openLogs() {
  try {
    const result = await checked(getDeliveryAlertLogs())
    for (const key of ['runs','deliveries']) result[key] = result[key].map(r => ({ ...r, run_date: String(r.run_date).slice(0,10), status: statusNames[r.status] || r.status }))
    logs.value = result; logsOpen.value = true
  } catch (error) { reportError(error) }
}
async function saveSettings() {
  saving.value = true
  try { await checked(saveDeliveryAlertSettings({ enabled: settings.value.enabled, totalReceivers: settings.value.totalReceivers })); settingsOpen.value = false; toast.add({ title: '已保存每日 08:00 提醒设置', color: 'success' }) }
  catch (error) { reportError(error) } finally { saving.value = false }
}
async function download(recipient) {
  exporting.value = true
  try {
    const blob = await exportDeliveryAlerts(recipient ? { recipient: recipient.userid } : queryParams.value)
    const message = await readBlobErrorMessage(blob)
    if (message) throw new Error(message)
    saveAs(blob, `${recipient?.name || '销售交期预警'}_${new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })}.xlsx`)
  } catch (error) { reportError(error) } finally { exporting.value = false }
}
onMounted(getList)
</script>
