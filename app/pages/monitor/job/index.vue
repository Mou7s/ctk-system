<template>
  <div class="app-container absolute inset-0 flex min-h-0 flex-col overflow-hidden">
    <div class="shrink-0 flex flex-wrap items-end gap-2 mb-4">
      <UInput v-model="queryParams.jobName" placeholder="请输入任务名称" clearable class="w-52" @keyup.enter="handleQuery" />
      <USelect v-model="queryParams.jobGroup" :items="sys_job_group" placeholder="请选择任务组名" clearable class="w-52" />
      <USelect v-model="queryParams.status" :items="sys_job_status" placeholder="请选择任务状态" clearable class="w-52" />
      <UButton color="primary" icon="i-lucide-search" @click="handleQuery">搜索</UButton>
      <UButton variant="outline" icon="i-lucide-rotate-ccw" @click="resetQuery">重置</UButton>
    </div>

    <div class="shrink-0 flex items-center gap-2 mb-4">
      <UButton color="primary" variant="outline" icon="i-lucide-plus" @click="handleAdd">新增</UButton>
      <UButton color="success" variant="outline" icon="i-lucide-edit" :disabled="single" @click="handleUpdate">修改</UButton>
      <UButton color="error" variant="outline" icon="i-lucide-trash" :disabled="multiple" @click="handleDelete">删除</UButton>
      <UButton color="warning" variant="outline" icon="i-lucide-download" @click="handleExport">导出</UButton>
      <UButton color="info" variant="outline" icon="i-lucide-logs" @click="handleJobLog()">日志</UButton>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList" class="ml-auto" />
    </div>

    <div class="min-h-0 flex-1 overflow-hidden">
      <TkUTable
        :loading="loading"
        :data="jobList"
        :columns="columns"
        wrapper-class="h-full"
        style="height: 100%"
        :ui="{ td: 'p-2 text-sm text-default whitespace-nowrap', th: 'px-3 py-2 text-sm text-highlighted text-left font-semibold' }"
        @selection-change="handleSelectionChange"
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
        <UForm ref="jobFormRef" :state="form" class="space-y-4" @submit="submitForm">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UFormField label="任务名称" name="jobName" required>
              <UInput v-model="form.jobName" placeholder="请输入任务名称" />
            </UFormField>
            <UFormField label="任务分组" name="jobGroup" required>
              <USelect v-model="form.jobGroup" :items="sys_job_group" placeholder="请选择" />
            </UFormField>
            <UFormField name="invokeTarget" required>
              <template #label>
                <span class="inline-flex items-center gap-1">
                  调用方法
                  <UTooltip
                    placement="top"
                    text="旧Java Bean调用示例：ryTask.ryParams('ry')；Nitro约定：Nitro.<key>()，如 Nitro.productionOrderClose()（见db/sql/20260903_jobs_nitro_target.sql）"
                  >
                    <UIcon name="i-lucide-help-circle" class="size-4" />
                  </UTooltip>
                </span>
              </template>
              <UInput v-model="form.invokeTarget" placeholder="请输入调用目标字符串" />
            </UFormField>
            <UFormField label="cron表达式" name="cronExpression" required>
              <UInput v-model="form.cronExpression" placeholder="请输入cron执行表达式">
                <template #trailing>
                  <UButton color="primary" @click="handleShowCron">生成表达式</UButton>
                </template>
              </UInput>
            </UFormField>
            <UFormField v-if="form.jobId !== undefined" label="状态" name="status" class="col-span-2">
              <URadioGroup v-model="form.status" :items="sys_job_status" />
            </UFormField>
            <UFormField label="执行策略" name="misfirePolicy">
              <URadioGroup v-model="form.misfirePolicy" :items="[{ label: '立即执行', value: '1' }, { label: '执行一次', value: '2' }, { label: '放弃执行', value: '3' }]" />
            </UFormField>
            <UFormField label="是否并发" name="concurrent">
              <URadioGroup v-model="form.concurrent" :items="[{ label: '允许', value: '0' }, { label: '禁止', value: '1' }]" />
            </UFormField>
          </div>
        </UForm>
      </template>
      <template #footer>
        <UButton color="neutral" @click="cancel">取 消</UButton>
        <UButton color="primary" @click="submitForm">确 定</UButton>
      </template>
    </UModal>

    <UModal v-model:open="openCron" title="Cron表达式生成器" :ui="{ content: 'max-w-2xl' }">
      <template #body>
        <crontab ref="crontabRef" @hide="openCron = false" @fill="crontabFill" :expression="expression" />
      </template>
    </UModal>

    <UModal v-model:open="openView" title="任务详细" :ui="{ content: 'max-w-2xl' }">
      <template #body>
        <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt class="text-muted">任务编号：</dt><dd>{{ form.jobId }}</dd>
          <dt class="text-muted">任务名称：</dt><dd>{{ form.jobName }}</dd>
          <dt class="text-muted">任务分组：</dt><dd>{{ jobGroupFormat(form) }}</dd>
          <dt class="text-muted">创建时间：</dt><dd>{{ form.createTime }}</dd>
          <dt class="text-muted">cron表达式：</dt><dd>{{ form.cronExpression }}</dd>
          <dt class="text-muted">下次执行时间：</dt><dd>{{ parseTime(form.nextValidTime) }}</dd>
          <dt class="text-muted col-span-2">调用目标方法：</dt><dd class="col-span-2">{{ form.invokeTarget }}</dd>
          <dt class="text-muted">任务状态：</dt>
          <dd>
            <span v-if="form.status == 0">正常</span>
            <span v-else-if="form.status == 1">暂停</span>
          </dd>
          <dt class="text-muted">是否并发：</dt>
          <dd>
            <span v-if="form.concurrent == 0">允许</span>
            <span v-else-if="form.concurrent == 1">禁止</span>
          </dd>
          <dt class="text-muted">执行策略：</dt>
          <dd>
            <span v-if="form.misfirePolicy == 0">默认策略</span>
            <span v-else-if="form.misfirePolicy == 1">立即执行</span>
            <span v-else-if="form.misfirePolicy == 2">执行一次</span>
            <span v-else-if="form.misfirePolicy == 3">放弃执行</span>
          </dd>
        </dl>
      </template>
      <template #footer>
        <UButton @click="openView = false">关 闭</UButton>
      </template>
    </UModal>
  </div>
</template>

<script setup name="Job">
import { h, resolveComponent } from 'vue'
import { listJob, getJob, delJob, addJob, updateJob, runJob, changeJobStatus } from '@/api/monitor/job'
import Crontab from '@/components/Crontab'
import { useDict } from '@/utils/dict'
import { TkUTable } from '@ctk-system/ui'
import { useTkListQuery } from '@ctk-system/composables'
import { parseTime } from '@/utils/helpers'
const toast = useToast();

const UButton = resolveComponent('UButton')

const router = useRouter()
const { proxy } = getCurrentInstance()
const { sys_job_group, sys_job_status } = useDict('sys_job_group', 'sys_job_status')

const open = ref(false)
const showSearch = ref(true)
const ids = ref([])
const single = ref(true)
const multiple = ref(true)
const title = ref('')
const openView = ref(false)
const openCron = ref(false)
const expression = ref('')
const jobFormRef = ref(null)
const crontabRef = ref(null)

const queryParams = ref({
  pageNum: 1,
  pageSize: 50,
  jobName: undefined,
  jobGroup: undefined,
  status: undefined,
})

// 列表查询（分页 / loading / 并发守卫 / code!==200 判定）统一交给公共 composable
const {
  list: jobList,
  loading,
  total,
  error: listError,
  getList,
  handleQuery,
  resetQuery,
} = useTkListQuery({
  queryParams,
  fetchList: () => listJob(queryParams.value),
  beforeReset: () => {
    Object.assign(queryParams.value, { jobName: undefined, jobGroup: undefined, status: undefined })
  },
})
watch(listError, (msg) => {
  if (msg) toast.add({ title: '查询失败：' + msg, color: 'error' })
})
const form = reactive({})
const rules = {
  jobName: [{ required: true, message: '任务名称不能为空', trigger: 'blur' }],
  invokeTarget: [{ required: true, message: '调用目标字符串不能为空', trigger: 'blur' }],
  cronExpression: [{ required: true, message: 'cron执行表达式不能为空', trigger: 'change' }],
}

function jobGroupFormat(row) {
  return sys_job_group.value?.find?.((d) => d.value === row.jobGroup)?.label ?? row.jobGroup
}

function cancel() {
  open.value = false
  reset()
}

function reset() {
  Object.assign(form, {
    jobId: undefined,
    jobName: undefined,
    jobGroup: undefined,
    invokeTarget: undefined,
    cronExpression: undefined,
    misfirePolicy: 1,
    concurrent: 1,
    status: '0',
  })
  jobFormRef.value?.clear?.()
}

function handleSelectionChange(selection) {
  ids.value = selection.map((item) => item.jobId)
  single.value = selection.length != 1
  multiple.value = !selection.length
}

function handleStatusChange(row) {
  const text = row.status === '0' ? '启用' : '停用'
  if (!confirm(`确认要"${text}""${row.jobName}"任务吗?`)) {
    row.status = row.status === '0' ? '1' : '0'
    return
  }
  changeJobStatus(row.jobId, row.status).then(() => {
    toast.add({ title: `${text}成功`, color: 'success' })
  }).catch(() => {
    row.status = row.status === '0' ? '1' : '0'
  })
}

function handleRun(row) {
  if (!confirm(`确认要预览一次"${row.jobName}"任务吗？（只看不写）`)) return
  runJob(row.jobId, row.jobGroup).then((response) => {
    toast.add({ title: response?.data?.summary || '执行成功', color: 'success' })
  })
}

function handleView(row) {
  getJob(row.jobId).then((response) => {
    Object.assign(form, response.data)
    openView.value = true
  })
}

function handleShowCron() {
  expression.value = form.cronExpression
  openCron.value = true
}

function crontabFill(value) {
  form.cronExpression = value
}

function handleJobLog(row) {
  const jobId = row?.jobId || 0
  router.push('/monitor/job-log/index/' + jobId)
}

function handleAdd() {
  reset()
  open.value = true
  title.value = '添加任务'
}

function handleUpdate(row) {
  reset()
  const jobId = row?.jobId || ids.value
  getJob(jobId).then((response) => {
    Object.assign(form, response.data)
    open.value = true
    title.value = '修改任务'
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
  if (form.jobId != undefined) {
    await updateJob(form)
    toast.add({ title: '修改成功', color: 'success' })
  } else {
    await addJob(form)
    toast.add({ title: '新增成功', color: 'success' })
  }
  open.value = false
  getList()
}

function handleDelete() {
  const jobIds = ids.value
  if (!confirm(`是否确认删除定时任务编号为"${jobIds}"的数据项?`)) return
  delJob(jobIds).then(() => {
    getList()
    toast.add({ title: '删除成功', color: 'success' })
  })
}

function handleExport() {
  proxy.download('monitor/job/export', { ...queryParams.value }, `job_${Date.now()}.xlsx`)
}

const dictLabel = (list, value) => list?.find?.((d) => d.value === value)?.label ?? value ?? ''

// cron表达式翻成人话（Quartz 6段：秒 分 时 日 月 周），解析不了就原样返回
const cronHuman = (cron = '') => {
  const p = String(cron || '').trim().split(/\s+/)
  if (p.length < 6) return ''
  const [s, m, h] = p
  const num = (v) => { const n = Number(String(v).split('/').pop()); return Number.isFinite(n) ? n : null }
  if (s.includes('/')) return `每${num(s)}秒`
  if (/^\*\/\d+$/.test(m) || /^0\/\d+$/.test(m)) return `每${num(m)}分钟`
  if (m === '*' && h === '*') return '每分钟'
  if (h.includes('/')) return `每${num(h)}小时`
  if (/^\d+$/.test(h) && /^\d+$/.test(m)) return `每天${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  return ''
}
// 映射与 server/utils/nitro-jobs/registry.ts 保持一致
const NITRO_TARGET_MAP = {
  'TkTask.ShengChanJieAn()': 'Nitro.productionOrderClose()',
  'TkTask.syncWXUsers()': 'Nitro.wecomAutoSync()',
  'TkTask.syncWXDept()': 'Nitro.wecomAutoSync()',
  'TkTask.updateAllKucun()': 'Nitro.kucunFullSync()',
  'TkTask.updatePartKucun()': 'Nitro.kucunDiffSync()',
  'TkTask.sendSuggestMsg()': 'Nitro.suggestPush()',
  'TkTask.saveApproveData()': 'Nitro.approveSync()',
  'TkTask.saveApproveDataBySecond()': 'Nitro.approveSync7d()',
  'TkTask.sendKucunWarningTask()': 'Nitro.kucunWarningPush()',
  'TkTask.syncMusicBroadcastPlan': 'Nitro.broadcastSync()',
  'TkTask.autoFreezeOverdueCustomers': 'Nitro.overdueAutoFreeze()',
  'TkTask.syncKucunWarningSnapshot': 'Nitro.kucunWarningSnapshot()',
}
const nitroTarget = (invokeTarget = '') => {
  const t = String(invokeTarget || '').trim()
  return NITRO_TARGET_MAP[t] || t
}
const nitroBadge = (invokeTarget = '') => {
  const t = String(invokeTarget || '')
  if (t.startsWith('Nitro.')) return { label: 'Nitro已迁移', color: 'success' }
  if (t.includes('syncWXUsers') || t.includes('syncWXDept')) return { label: 'Nitro已接管', color: 'success' }
  if (t.includes('ShengChanJieAn') || t.includes('syncMusicBroadcastPlan')) return { label: 'Nitro已迁移·关闭', color: 'info' }
  if (t.trim() in NITRO_TARGET_MAP) return { label: 'Nitro占位·待确认', color: 'warning' }
  if (t.startsWith('TkTask.')) return { label: '未迁移·旧Java', color: 'error' }
  return null
}

const columns = [
  { id: 'selection', header: () => h('span'), enableSorting: false, enableHiding: false },
  { accessorKey: 'jobId', header: '任务编号', size: 100, cell: ({ row }) => h('span', String(row.original.jobId ?? '')) },
  { accessorKey: 'jobName', header: '任务名称', cell: ({ row }) => h('span', row.original.jobName ?? '') },
  { accessorKey: 'jobGroup', header: '任务组名', cell: ({ row }) => h('span', dictLabel(sys_job_group.value, row.original.jobGroup)) },
  { accessorKey: 'invokeTarget', header: '调用目标字符串', cell: ({ row }) => {
    const raw = String(row.original.invokeTarget ?? '')
    const mapped = nitroTarget(raw)
    if (mapped === raw) return h('span', raw)
    return h('div', { class: 'flex flex-col gap-0.5' }, [
      h('span', { class: 'text-primary font-medium' }, mapped),
      h('span', { class: 'text-xs text-muted' }, `原：${raw}`),
    ])
  } },
  { accessorKey: 'cronExpression', header: 'cron执行表达式', cell: ({ row }) => {
    const raw = String(row.original.cronExpression ?? '')
    const human = cronHuman(raw)
    if (!human) return h('span', raw)
    return h('div', { class: 'flex flex-col gap-0.5' }, [
      h('span', raw),
      h('span', { class: 'text-xs text-muted' }, human),
    ])
  } },
  {
    id: 'nitro',
    header: 'Nitro',
    cell: ({ row }) => {
      const b = nitroBadge(row.original.invokeTarget)
      if (!b) return h('span', { class: 'text-muted' }, '-')
      return h(resolveComponent('UBadge'), { color: b.color, variant: 'soft', size: 'xs' }, () => b.label)
    },
  },
  {
    id: 'status',
    header: '状态',
    cell: ({ row }) => h(resolveComponent('USwitch'), {
      modelValue: row.original.status,
      'onUpdate:modelValue': (v) => { row.original.status = v; handleStatusChange(row.original) },
      'true-value': '0',
      'false-value': '1',
    }),
  },
  {
    id: 'actions',
    header: '操作',
    size: 200,
    enableSorting: false,
    cell: ({ row }) =>
      h('div', { class: 'flex gap-1 items-center' }, [
        h(UButton, { variant: 'link', color: 'primary', icon: 'i-lucide-edit', onClick: () => handleUpdate(row.original) }, () => ''),
        h(UButton, { variant: 'link', color: 'primary', icon: 'i-lucide-trash', onClick: () => handleDelete(row.original) }, () => ''),
        h(UButton, { variant: 'link', color: 'primary', icon: 'i-lucide-play', onClick: () => handleRun(row.original) }, () => ''),
        h(UButton, { variant: 'link', color: 'primary', icon: 'i-lucide-eye', onClick: () => handleView(row.original) }, () => ''),
        h(UButton, { variant: 'link', color: 'primary', icon: 'i-lucide-logs', onClick: () => handleJobLog(row.original) }, () => ''),
      ]),
  },
]

onMounted(() => {
  getList()
})
</script>
