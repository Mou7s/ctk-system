<template>
  <div class="app-container absolute inset-0 flex min-h-0 flex-col gap-3 overflow-hidden p-4 lg:p-5 bg-[#f8fafc] dark:bg-gray-900">
    <!-- 汇总卡片 -->
    <div class="grid shrink-0 grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-9">
      <div v-for="card in summaryCards" :key="card.key" class="relative overflow-hidden rounded-xl border bg-white dark:bg-gray-800 p-3 shadow-sm hover:shadow-md transition-shadow">
        <div class="absolute left-0 top-0 bottom-0 w-1" :class="card.barClass"></div>
        <div class="flex items-start justify-between">
          <div class="text-[11px] font-medium tracking-widest text-slate-500 dark:text-slate-400">{{ card.label }}</div>
          <div class="rounded-lg p-1.5" :class="card.iconBg"><i :class="card.icon" class="text-[14px]"></i></div>
        </div>
        <div class="mt-1 text-2xl font-bold tracking-tight" :class="card.className">{{ summary[card.key] || 0 }}</div>
        <div class="mt-1 h-1 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden"><div class="h-full rounded-full transition-all" :class="card.barClass" :style="{width: (summary.total? Math.round(summary[card.key]/summary.total*100):0)+'%' }"></div></div>
      </div>
    </div>

    <div class="shrink-0 rounded-xl border border-slate-200/70 dark:border-slate-700 bg-white dark:bg-gray-800 shadow-sm p-3 flex flex-wrap items-center gap-2.5">
      <div class="relative">
        <UInput v-model="queryParams.keyword" class="w-56" placeholder="单号 / 产品 / 物料 / 供应商" clearable icon="i-lucide-search" />
      </div>
      <USelect v-model="statusFilterValue" :items="statusFilterItems" value-key="value" label-key="label" class="w-36" placeholder="状态" />
      <USelect v-model="finalResultFilterValue" :items="finalResultItems" value-key="value" label-key="label" placeholder="结论" class="w-28" />
      <div class="date-capsule flex w-fit shrink-0 items-center gap-2 rounded-md ring-1 ring-inset ring-accented bg-default px-3.5 h-8">
        <i class="i-lucide-calendar text-slate-400 text-sm shrink-0"></i>
        <UPopover v-model:open="dateFromOpen">
          <UButton variant="ghost" size="sm" class="capsule-btn shrink-0 font-normal">
            <span :class="queryParams.dateFrom ? '' : 'text-dimmed'">{{ queryParams.dateFrom || '申请起' }}</span>
          </UButton>
          <template #content>
            <div class="p-2"><UCalendar v-model="dateFromValue" locale="zh-CN" /></div>
          </template>
        </UPopover>
        <span class="text-slate-300 dark:text-slate-600 select-none">—</span>
        <UPopover v-model:open="dateToOpen">
          <UButton variant="ghost" size="sm" class="capsule-btn shrink-0 font-normal">
            <span :class="queryParams.dateTo ? '' : 'text-dimmed'">{{ queryParams.dateTo || '申请止' }}</span>
          </UButton>
          <template #content>
            <div class="p-2"><UCalendar v-model="dateToValue" locale="zh-CN" /></div>
          </template>
        </UPopover>
      </div>
      <UButton color="primary" variant="solid" icon="i-lucide-search" class="shadow-sm" @click="handleQuery">搜索</UButton>
      <UButton color="neutral" variant="ghost" icon="i-lucide-rotate-ccw" @click="resetQuery">重置</UButton>
      <div class="ml-auto flex items-center gap-1 text-[11px] text-slate-500">
        <span class="hidden sm:inline">双击行编辑</span>
        <UBadge color="neutral" variant="soft" size="xs" class="font-mono">TK-FM-CG011</UBadge>
      </div>
    </div>

    <div class="rounded-lg border border-blue-200 dark:border-slate-700 bg-blue-50/50 dark:bg-blue-950/20 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2 flex-wrap">
      <span class="font-semibold text-blue-700 dark:text-blue-300">流转说明：</span>
      <span class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-slate-400"></span>草稿</span><span class="text-slate-400">→</span>
      <span class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-amber-500"></span>待测试</span><span class="text-slate-400">→</span>
      <span class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-orange-500"></span>待IPQC</span><span class="text-slate-400">→</span>
      <span class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-sky-500"></span>待组长</span><span class="text-slate-400">→</span>
      <span class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-violet-500"></span>待主管</span><span class="text-slate-400">→</span>
      <span class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-indigo-500"></span>待总经理助理</span><span class="text-slate-400">→</span>
      <span class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-emerald-500"></span>已核准</span><span class="text-slate-400">/</span><span class="w-2 h-2 rounded-full bg-red-500"></span>已驳回
    </div>

    <div class="flex items-center gap-2 shrink-0">

      <UButton v-if="canRemove" color="error" variant="soft" icon="i-lucide-trash-2" :disabled="!selectedIds.length" @click="handleDeleteBatch">删除 {{ selectedIds.length? `(${selectedIds.length})`:'' }}</UButton>
      <UButton color="neutral" variant="outline" icon="i-lucide-refresh-cw" @click="getList">刷新</UButton>
      <span class="text-xs text-slate-500 ml-1 hidden lg:inline">旧链已冻结，新申请请走 NPI统一申请</span>
    </div>

    <div class="table-container-premium min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-gray-800 shadow-sm">
      <table class="w-full text-[13px]">
        <thead class="sticky top-0 z-10 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur border-b">
          <tr class="text-[11px] tracking-widest font-semibold text-slate-600 dark:text-slate-300">
            <th class="px-2 py-2.5 w-9 text-center"><UCheckbox :model-value="allSelected" @update:model-value="toggleAll" /></th>
            <th class="px-3 py-2.5 text-left">试验单号</th>
            <th class="px-3 py-2.5 text-left">产品名称</th>
            <th class="px-3 py-2.5 text-left">物料名称</th>
            <th class="px-3 py-2.5 text-left">供应商</th>
            <th class="px-3 py-2.5 text-left">料号</th>
            <th class="px-3 py-2.5 text-left">规格型号</th>
            <th class="px-3 py-2.5 text-left">试验数量</th>
            <th class="px-3 py-2.5 text-left">申请日期</th>
            <th class="px-3 py-2.5 text-left">状态</th>
            <th class="px-3 py-2.5 text-left">结论</th>
            <th class="px-3 py-2.5 text-center">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
          <tr v-if="loading"><td colspan="12" class="px-4 py-12 text-center"><div class="inline-flex items-center gap-2 text-slate-500"><span class="animate-spin i-lucide-loader-2"></span>加载中...</div></td></tr>
          <tr v-else-if="!list.length"><td colspan="12" class="px-4 py-12 text-center text-slate-400">暂无数据 — 点击“新增试验单”创建第一条</td></tr>
          <tr v-for="row in list" :key="row.id" class="hover:bg-blue-50/60 dark:hover:bg-slate-700/40 cursor-pointer transition-colors group" :class="{ 'bg-blue-50 dark:bg-slate-700/60': selectedIds.includes(row.id) }" @dblclick="handleEdit(row)">
            <td class="px-2 py-2.5 text-center" @click.stop><UCheckbox :model-value="selectedIds.includes(row.id)" @update:model-value="v => toggleRow(row.id, v)" /></td>
            <td class="px-3 py-2.5 font-mono text-xs font-medium text-slate-700 dark:text-slate-200">{{ row.testNo }}</td>
            <td class="px-3 py-2.5 max-w-[160px] truncate font-medium" :title="row.productName">{{ row.productName }}</td>
            <td class="px-3 py-2.5 max-w-[160px] truncate text-slate-600 dark:text-slate-300" :title="row.materialName">{{ row.materialName || row.materialNameSpec || '—' }}</td>
            <td class="px-3 py-2.5"><span class="inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>{{ row.supplierName }}</span></td>
            <td class="px-3 py-2.5 font-mono text-xs">{{ row.materialNumber || row.materialModel || '—' }}</td>
            <td class="px-3 py-2.5 max-w-[180px] truncate text-slate-600 dark:text-slate-300" :title="row.materialSpec">{{ row.materialSpec || '—' }}</td>
            <td class="px-3 py-2.5"><span class="font-medium">{{ row.testQty || '—' }}</span> <span class="text-slate-400 text-xs">{{ row.testQtyUnit }}</span></td>
            <td class="px-3 py-2.5 text-slate-600 dark:text-slate-300">{{ row.applyDate || '—' }}</td>
            <td class="px-3 py-2.5"><div class="flex flex-col gap-0.5"><UBadge :color="statusColor(row.status)" variant="soft" size="xs" class="rounded-full w-fit px-2.5 py-0.5">{{ statusLabel(row.status) }}</UBadge><span v-if="row.status!=='approved'&&row.status!=='rejected'" class="text-[11px] text-slate-500 leading-none">{{ sampleAssignee(row.status) }}</span></div></td>
            <td class="px-3 py-2.5"><UBadge v-if="row.finalResult" :color="row.finalResult==='合格'?'success':row.finalResult==='不合格'?'error':'warning'" variant="soft" size="xs" class="rounded-full">{{ row.finalResult }}</UBadge><span v-else class="text-slate-400 text-xs">待定</span></td>
            <td class="px-3 py-2.5 text-center">
              <div class="inline-flex items-center gap-0.5 opacity-80 group-hover:opacity-100">
                <UButton size="xs" variant="soft" color="neutral" icon="i-lucide-square-pen" :disabled="row.status==='approved'||row.status==='rejected'" @click.stop="handleEdit(row)">编辑</UButton>
                <UButton v-if="row.status!=='approved'&&row.status!=='rejected'" size="xs" color="primary" icon="i-lucide-pen-line" class="shadow-sm" @click.stop="handleSign(row)">评审</UButton>
                <UButton v-else size="xs" variant="ghost" color="neutral" disabled>已终审</UButton>
                
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <pagination v-show="total > 0" :total="total" v-model:page="queryParams.pageNum" v-model:limit="queryParams.pageSize" class="shrink-0" @pagination="getList" />

    <!-- 新增/编辑 -->
    <UModal v-model:open="formOpen" :title="formTitle" :ui="{ content: 'max-w-3xl' }">
      <template #body>
        <UForm :state="form" class="space-y-5">
          <div class="rounded-xl border border-blue-200/60 bg-blue-50/40 dark:bg-blue-950/20 p-3.5">
            <div class="flex items-center gap-2 mb-3 text-sm font-semibold text-blue-900 dark:text-blue-200"><i class="i-lucide-file-text"></i> 基础信息 <span class="text-xs font-normal text-slate-500">TK-FM-CG011 对应</span></div>
            <div class="grid grid-cols-4 gap-3">
              <UFormField label="产品名称" required><UInput v-model="form.productName" placeholder="黑胶PDFN 3*3" /></UFormField>
              <UFormField label="供应商" required><USelect v-model="form.supplierId" :items="avlOptions" value-key="value" label-key="label" placeholder="仅可选已准入(AVL)供应商" class="w-full" @update:model-value="v => { const opt = avlOptions.find(o=>String(o.value)===String(v)); if(opt) form.supplierName = opt.label }" /></UFormField>
              <UFormField label="送试日期" required>
                <UPopover v-model:open="applyDateOpen">
                  <UButton color="neutral" variant="outline" icon="i-lucide-calendar" class="font-normal">
                    <span :class="form.applyDate ? '' : 'text-dimmed'">{{ form.applyDate || '选择日期' }}</span>
                  </UButton>
                  <template #content>
                    <div class="p-2"><UCalendar v-model="applyDateValue" locale="zh-CN" /></div>
                  </template>
                </UPopover>
              </UFormField>
              <UFormField label="回复报告日期">
                <UPopover v-model:open="replyDateOpen">
                  <UButton color="neutral" variant="outline" icon="i-lucide-calendar" class="font-normal">
                    <span :class="form.replyDate ? '' : 'text-dimmed'">{{ form.replyDate || '选择日期' }}</span>
                  </UButton>
                  <template #content>
                    <div class="p-2"><UCalendar v-model="replyDateValue" locale="zh-CN" /></div>
                  </template>
                </UPopover>
              </UFormField>
              <UFormField label="料号（金蝶）" required class="col-span-4">
                <div class="relative">
                  <UInput v-model="materialSearch" placeholder="输入料号、名称或规格搜索已审核且已启用物料" class="w-full" clearable icon="i-lucide-search" @update:model-value="handleMaterialSearchInput" />
                  <div v-if="materialOptions.length" class="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 shadow-xl">
                    <div class="sticky top-0 grid grid-cols-[140px_minmax(180px,1fr)_minmax(220px,1.2fr)] gap-3 border-b bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500 dark:bg-slate-900">
                      <span>料号</span><span>物料名称</span><span>规格型号</span>
                    </div>
                    <button v-for="opt in materialOptions" :key="opt.id" type="button" class="grid w-full grid-cols-[140px_minmax(180px,1fr)_minmax(220px,1.2fr)] gap-3 border-b border-slate-100 px-3 py-2.5 text-left text-sm last:border-0 hover:bg-blue-50 dark:border-slate-700 dark:hover:bg-slate-700" @click="onMaterialSelect(opt)">
                      <span class="font-mono text-xs text-slate-700 dark:text-slate-200">{{ opt.value }}</span>
                      <span>{{ opt.name || '—' }}</span>
                      <span class="text-slate-500 dark:text-slate-300">{{ opt.spec || '—' }}</span>
                    </button>
                  </div>
                </div>
              </UFormField>
              <UFormField label="物料名称" class="col-span-2"><UInput :model-value="form.materialName" readonly placeholder="选择金蝶物料后自动带出" class="w-full" icon="i-lucide-lock-keyhole" /></UFormField>
              <UFormField label="规格型号" class="col-span-2"><UInput :model-value="form.materialSpec" readonly placeholder="选择金蝶物料后自动带出" class="w-full" icon="i-lucide-lock-keyhole" /></UFormField>
              <UFormField label="测试部门"><UInput v-model="form.testDept" placeholder="工程/品质/生产" /></UFormField>
              <UFormField label="测试数量"><UInput v-model="form.testQty" placeholder="3KG" /></UFormField>

              <UFormField label="测试人"><UInput v-model="form.testerName" placeholder="测试人姓名" /></UFormField>
              <UFormField label="制单人"><UInput v-model="form.applicant" placeholder="杨阳" /></UFormField>
            </div>
          </div>
          <div class="rounded-xl border border-amber-200/60 bg-amber-50/40 dark:bg-amber-950/20 p-3.5">
            <div class="flex items-center gap-2 mb-3 text-sm font-semibold text-amber-900 dark:text-amber-200"><i class="i-lucide-flask-conical"></i> 测试员填写</div>
            <div class="grid grid-cols-3 gap-3">
              <UFormField label="目标产量"><UInput v-model="form.testerTargetQty" placeholder="—" /></UFormField>
              <UFormField label="实际产量"><UInput v-model="form.testerActualQty" placeholder="—" /></UFormField>
              <UFormField label="用量"><UInput v-model="form.testerUsage" placeholder="—" /></UFormField>
            </div>
            <UFormField label="测试情况 / 备注" class="mt-3"><UTextarea v-model="form.testerRemark" :rows="4" placeholder="描述测试现象、异常、不良..." class="w-full" /></UFormField>
          </div>
          <div class="rounded-xl border border-slate-200 bg-slate-50/50 dark:bg-slate-800/50 p-3.5">
            <div class="grid grid-cols-2 gap-4">
              <UFormField label="流转状态"><div class="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-sm font-medium border">{{ statusLabel(form.status) }}</div><div class="text-[11px] text-slate-500 mt-1">由签批流转自动更新</div></UFormField>
              <UFormField label="最终结论"><div class="px-3 py-2 rounded-lg border text-sm" :class="form.finalResult ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 text-slate-400'">{{ form.finalResult || '待签批' }}</div></UFormField>
            </div>
            <UFormField label="附件"><FileUpload v-model="form.attachments" :limit="5" :fileSize="10" :fileType="['jpg','jpeg','png','pdf','doc','docx','xls','xlsx']" /></UFormField>
            <UFormField label="备注" class="mt-4"><UTextarea v-model="form.remark" :rows="3" placeholder="其他说明..." class="w-full" /></UFormField>
          </div>
        </UForm>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="formOpen=false">取消</UButton>
          <UButton color="primary" :loading="submitting" @click="submitForm" icon="i-lucide-check">保存</UButton>
        </div>
      </template>
    </UModal>

    <!-- 签批 统一样式：对齐供应商准入 -->
    <UModal v-model:open="signOpen" title="签批流转" :ui="{ content: 'max-w-xl' }">
      <template #body>
        <div v-if="signRow" class="space-y-5">
          <div class="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white dark:from-slate-800 dark:to-slate-800 p-4 flex items-center justify-between shadow-sm">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center"><i class="i-lucide-flask-conical text-[18px]"></i></div>
              <div><div class="font-mono text-sm font-bold tracking-wide">{{ signRow.testNo }}</div><div class="text-sm font-medium text-slate-700 dark:text-slate-200">{{ signRow.productName }} · {{ signRow.supplierName }}</div><div class="text-xs text-slate-500">当前：{{ statusLabel(signRow.status) }}</div></div>
            </div>
            <UBadge :color="statusColor(signRow.status)" variant="soft" size="lg" class="rounded-full px-3 py-1">{{ statusLabel(signRow.status) }}</UBadge>
          </div>
          <div class="flex gap-1.5">
            <div v-for="s in signStepItems" :key="s.value" class="flex-1 text-center">
              <div class="h-1.5 rounded-full" :class="isStepReached(s.value) ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-700'"></div>
              <div class="text-[10px] mt-1.5" :class="isStepReached(s.value) ? 'text-primary font-semibold' : 'text-slate-400'">{{ s.label }}</div>
            </div>
          </div>
          <UFormField label="签批步骤"><div class="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-sm font-medium border">{{ (signStepItems.find(o=>o.value===signForm.step)||{}).label || signForm.step }}</div><div class="text-[11px] text-slate-500 mt-1">由单据当前状态决定，不可自选</div></UFormField>
          <UFormField v-if="signForm.step==='approve'" label="最终结论" required><USelect v-model="signForm.finalResult" :items="finalResultSelectItems" value-key="value" label-key="label" class="w-full" /></UFormField>
          <UFormField label="意见 / 备注" required><UTextarea v-model="signForm.opinion" :rows="5" placeholder="请填写意见，驳回请写明原因..." class="w-full" /></UFormField>
          <div v-if="signForm.step==='tester'" class="grid grid-cols-3 gap-3 p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/40">
            <UFormField label="目标产量"><UInput v-model="signForm.testerTargetQty" /></UFormField>
            <UFormField label="实际产量"><UInput v-model="signForm.testerActualQty" /></UFormField>
            <UFormField label="用量"><UInput v-model="signForm.testerUsage" /></UFormField>
          </div>
          <div class="flex items-center gap-2 text-[11px] text-slate-500 bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 rounded-lg px-3 py-2"><i class="i-lucide-info text-amber-600"></i> 签批人自动记录为当前账号，时间自动写入；中间环节点通过往下走，只有总经理助理能驳回终结</div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-between items-center w-full">
          <div class="text-xs text-slate-500">当前：{{ statusLabel(signRow?.status) }}</div>
          <div class="flex gap-2">
            <UButton color="neutral" variant="ghost" @click="signOpen=false">取消</UButton>
            <UButton v-if="signForm.step==='approve'" color="error" variant="soft" :loading="signSubmitting" @click="submitSignWith('reject')" icon="i-lucide-x-circle">驳回</UButton>
            <UButton color="primary" :loading="signSubmitting" @click="submitSignWith('approveOrNext')" icon="i-lucide-check">通过 / 提交</UButton>
          </div>
        </div>
      </template>
    </UModal>

    
  </div>
</template>

<script setup>
import { hasStaticPermission } from '@/router/static-navigation'
import useUserStore from '@/store/modules/user'
import { listSampleTest, addSampleTest, updateSampleTest, deleteSampleTest, signSampleTest, getSampleTestSummary } from '@/api/tk_custom/sampleTest.js'
import request from '@/utils/request'
import { getAvlSuppliers } from '@/api/tk_custom/supplierAccess.js'

const toast = useToast()
const userStore = useUserStore()

const can = (p) => hasStaticPermission(userStore, p)
const canQuery = computed(() => can('tk_custom:sampleTest:query'))
const canAdd = computed(() => can('tk_custom:sampleTest:add'))
const canEdit = computed(() => can('tk_custom:sampleTest:edit'))
const canRemove = computed(() => can('tk_custom:sampleTest:remove'))
const canApprove = computed(() => can('tk_custom:sampleTest:approve'))

const loading = ref(false)
const list = ref([])
const total = ref(0)
const summary = reactive({ total:0, draft:0, testing:0, ipqc_review:0, leader_review:0, supervisor_review:0, ren_review:0, approved:0, rejected:0 })
const selectedIds = ref([])
const allSelected = computed(() => list.value.length>0 && selectedIds.value.length===list.value.length)

const queryParams = ref({ pageNum:1, pageSize:20, keyword:'', status:'', finalResult:'', dateFrom:'', dateTo:'' })

// UCalendar 日期选择（原生 type="date" 替换）：字符串 ⇄ CalendarDate 双向转换
import { parseDate } from '@internationalized/date'

const dateFromOpen = ref(false)
const dateToOpen = ref(false)
const applyDateOpen = ref(false)
const replyDateOpen = ref(false)
const dateFromValue = computed({
  get() {
    if (!queryParams.value.dateFrom) return null
    try { return parseDate(String(queryParams.value.dateFrom).slice(0, 10)) } catch { return null }
  },
  set(val) {
    queryParams.value.dateFrom = val ? val.toString() : ''
    dateFromOpen.value = false
  }
})
const dateToValue = computed({
  get() {
    if (!queryParams.value.dateTo) return null
    try { return parseDate(String(queryParams.value.dateTo).slice(0, 10)) } catch { return null }
  },
  set(val) {
    queryParams.value.dateTo = val ? val.toString() : ''
    dateToOpen.value = false
  }
})
const applyDateValue = computed({
  get() {
    if (!form.value.applyDate) return null
    try { return parseDate(String(form.value.applyDate).slice(0, 10)) } catch { return null }
  },
  set(val) {
    form.value.applyDate = val ? val.toString() : ''
    applyDateOpen.value = false
  }
})
const replyDateValue = computed({
  get() {
    if (!form.value.replyDate) return null
    try { return parseDate(String(form.value.replyDate).slice(0, 10)) } catch { return null }
  },
  set(val) {
    form.value.replyDate = val ? val.toString() : ''
    replyDateOpen.value = false
  }
})

const statusMap = { draft:'草稿', testing:'待测试', ipqc_review:'待IPQC', leader_review:'待组长', supervisor_review:'待主管', ren_review:'待总经理助理', approved:'已核准', rejected:'已驳回' }
const statusLabel = (s) => statusMap[s]||s
const sampleAssignee = (s) => ({ draft:'发起人', testing:'测试员', ipqc_review:'IPQC', leader_review:'组长', supervisor_review:'部门主管', ren_review:'总经理助理', approved:'—', rejected:'—' }[s]||'—')
const statusColor = (s) => ({ draft:'neutral', testing:'warning', ipqc_review:'warning', leader_review:'warning', supervisor_review:'warning', ren_review:'warning', approved:'success', rejected:'error' }[s]||'neutral')
const statusItems = Object.entries(statusMap).map(([value,label])=>({value,label}))
const statusFilterItems = [{label:'全部状态', value:'__all__'}, ...statusItems]
const statusFilterValue = computed({
  get: () => queryParams.value.status ? queryParams.value.status : '__all__',
  set: (v) => queryParams.value.status = v==='__all__' ? '' : v
})
const finalResultItems = [{label:'全部结论', value:'__all__'}, {label:'合格', value:'合格'}, {label:'不合格', value:'不合格'}, {label:'特采', value:'特采'}]
const finalResultFilterValue = computed({
  get: () => queryParams.value.finalResult ? queryParams.value.finalResult : '__all__',
  set: (v) => queryParams.value.finalResult = v==='__all__' ? '' : v
})
const finalResultSelectItems = [{label:'合格', value:'合格'}, {label:'不合格', value:'不合格'}, {label:'特采', value:'特采'}]
const deptItems = ['工程','品质','车间','工程,品质','工程,车间','品质,车间','工程,品质,车间']
const deptSelectItems = deptItems.map(v=>({label:v, value:v}))

const avlOptions = ref([])
const materialOptions = ref([])
const materialSearch = ref('')
async function loadMaterialOptions(keyword=''){
  const kw = String(keyword||'').trim()
  if(!kw){ materialOptions.value=[]; return }
  try{
    const res = await request({ url: '/tk_custom/material/options', method: 'get', params: { keyword: kw, limit: 50 } })
    const rows = res.data || res.rows || res || []
    materialOptions.value = (Array.isArray(rows) ? rows : []).map((r)=>({ label: r.label || (r.number + ' ' + (r.name||'')), value: r.number || r.value, id: r.id, name: r.name, spec: r.spec }))
  } catch { materialOptions.value=[] }
}
async function loadAvlOptions(){
  try{
    const res = await getAvlSuppliers()
    const rows = res.data || res || []
    avlOptions.value = rows.map(r=>({ label: r.label || r.value, value: r.value })).filter(r=>r.value)
    if(!avlOptions.value.length) avlOptions.value = [{label:'暂无已准入供应商，请先准入', value:'__none__', disabled:true}]
  }catch{ avlOptions.value = [] }
}
const signStepItems = [
  {label:'测试员签', value:'tester'},
  {label:'IPQC签', value:'ipqc'},
  {label:'组长签', value:'leader'},
  {label:'部门主管签', value:'supervisor'},
  {label:'总经理助理签(核准·定结论)', value:'approve'},
]

const summaryCards = [
  { key:'total', label:'全部', className:'text-slate-900 dark:text-white', barClass:'bg-slate-900', iconBg:'bg-slate-100 text-slate-600', icon:'i-lucide-layers' },
  { key:'draft', label:'草稿', className:'text-slate-600', barClass:'bg-slate-400', iconBg:'bg-slate-100 text-slate-500', icon:'i-lucide-file-edit' },
  { key:'testing', label:'待测试', className:'text-amber-600', barClass:'bg-amber-500', iconBg:'bg-amber-100 text-amber-600', icon:'i-lucide-flask-conical' },
  { key:'ipqc_review', label:'待IPQC', className:'text-orange-600', barClass:'bg-orange-500', iconBg:'bg-orange-100 text-orange-600', icon:'i-lucide-shield-check' },
  { key:'leader_review', label:'待组长', className:'text-sky-600', barClass:'bg-sky-500', iconBg:'bg-sky-100 text-sky-600', icon:'i-lucide-users' },
  { key:'supervisor_review', label:'待主管', className:'text-violet-600', barClass:'bg-violet-500', iconBg:'bg-violet-100 text-violet-600', icon:'i-lucide-user-check' },
  { key:'ren_review', label:'待总经理助理', className:'text-indigo-600', barClass:'bg-indigo-500', iconBg:'bg-indigo-100 text-indigo-600', icon:'i-lucide-badge-check' },
  { key:'approved', label:'已核准', className:'text-emerald-600', barClass:'bg-emerald-500', iconBg:'bg-emerald-100 text-emerald-600', icon:'i-lucide-badge-check' },
  { key:'rejected', label:'已驳回', className:'text-red-600', barClass:'bg-red-500', iconBg:'bg-red-100 text-red-600', icon:'i-lucide-x-circle' },
]

const formOpen = ref(false)
const formTitle = ref('新增试验单')
const submitting = ref(false)
const form = ref({ id:null, testNo:'', productName:'', materialNameSpec:'', supplierId:null, supplierName:'', materialId:null, materialNumber:'', materialName:'', materialSpec:'', materialModel:'', testQty:'', testQtyUnit:'KG', testDept:'工程/品质/生产', applyDate:new Date().toISOString().slice(0,10), replyDate:'', applicant:'', testerName:'', testerTargetQty:'', testerActualQty:'', testerUsage:'', testerRemark:'', status:'draft', finalResult:'', attachments:'', remark:'' })

const signOpen = ref(false)
const signRow = ref(null)
const signSubmitting = ref(false)
const signForm = ref({ step:'tester', opinion:'', finalResult:'合格', testerTargetQty:'', testerActualQty:'', testerUsage:'' })

function toggleRow(id, v){ if(v){ if(!selectedIds.value.includes(id)) selectedIds.value.push(id)} else selectedIds.value = selectedIds.value.filter(x=>x!==id)}
function toggleAll(v){ selectedIds.value = v ? list.value.map(r=>r.id) : [] }

async function getList(){
  if(!canQuery.value){ toast.add({title:'无查询权限', color:'warning'}); return }
  loading.value=true
  try{
    const res = await listSampleTest(queryParams.value)
    list.value = res.rows||[]
    total.value = res.total||0
  }catch(e){ toast.add({title:e?.message||'查询失败', color:'error'}) } finally{ loading.value=false }
}
async function loadSummary(){
  try{ const res = await getSampleTestSummary(); Object.assign(summary, res.data||res||{}) }catch{}
}
function handleQuery(){ queryParams.value.pageNum=1; getList(); loadSummary() }
function resetQuery(){ queryParams.value={ pageNum:1, pageSize:20, keyword:'', status:'', finalResult:'', dateFrom:'', dateTo:'' }; getList(); loadSummary() }

function handleAdd(){ toast.add({title:'旧链已冻结，新申请请走 NPI统一申请', color:'warning'}) }
function handleEdit(row){
  const _r=row||list.value.find(x=>selectedIds.value.includes(x.id))
  if(_r && (_r.status==='approved'||_r.status==='rejected')) return toast.add({title:'已终审不可编辑', color:'warning'})
  const r=row||list.value.find(x=>selectedIds.value.includes(x.id))
  if(!r) return toast.add({title:'请选择一条记录', color:'warning'})
  materialSearch.value=r.materialNumber||r.materialModel||''
  materialOptions.value=[]
  form.value={ id:r.id, testNo:r.testNo, productName:r.productName, materialNameSpec:r.materialNameSpec, supplierId:r.supplierId||null, supplierName:r.supplierName, materialId:r.materialId||null, materialNumber:r.materialNumber||'', materialName:r.materialName||'', materialSpec:r.materialSpec||'', materialModel:r.materialModel, testQty:r.testQty, testQtyUnit:r.testQtyUnit, testDept:r.testDept, applyDate:r.applyDate||new Date().toISOString().slice(0,10), replyDate:r.replyDate||'', applicant:r.applicant, testerName:r.testerName||'', testerTargetQty:r.testerTargetQty, testerActualQty:r.testerActualQty, testerUsage:r.testerUsage, testerRemark:r.testerRemark, status:r.status, finalResult:r.finalResult, attachments:r.attachments||'', remark:r.remark, ipqcOpinion:r.ipqcOpinion, teamLeaderOpinion:r.teamLeaderOpinion, supervisorOpinion:r.supervisorOpinion, approverOpinion:r.approverOpinion }
  formTitle.value='编辑试验单'; formOpen.value=true
}
function handleSign(row){
  if(row.status==='approved'||row.status==='rejected') return toast.add({title:'已终审单据不能再签批', color:'warning'})
  if(!canApprove.value) return toast.add({title:'无签批权限', color:'warning'})
  signRow.value=row
  const next={ draft:'tester', testing:'tester', ipqc_review:'ipqc', leader_review:'leader', supervisor_review:'supervisor', ren_review:'approve', approved:'approve', rejected:'tester' }[row.status]||'tester'
  signForm.value={ step:next, opinion:'', finalResult: row.finalResult||'合格', testerTargetQty:row.testerTargetQty||'', testerActualQty:row.testerActualQty||'', testerUsage:row.testerUsage||'' }
  signOpen.value=true
}
async function submitForm(){
  if(!form.value.productName) return toast.add({title:'产品名称不能为空', color:'warning'})
  if(!form.value.materialId) return toast.add({title:'请选择金蝶物料（输入料号、名称或规格后点选）', color:'warning'})
  submitting.value=true
  try{
    const payload={ ...form.value }
    if(payload.id) await updateSampleTest(payload)
    else await addSampleTest(payload)
    toast.add({title:'保存成功', color:'success'})
    formOpen.value=false; await getList(); await loadSummary()
  }catch(e){ toast.add({title:e?.message||'保存失败', color:'error'}) } finally{ submitting.value=false }
}
function isStepReached(stepVal){ const order=['tester','ipqc','leader','supervisor','approve']; const curMap={draft:'tester',testing:'tester',ipqc_review:'ipqc',leader_review:'leader',supervisor_review:'supervisor',ren_review:'approve',approved:'approve',rejected:'approve'}; const cur=curMap[signRow.value?.status]||'tester'; return order.indexOf(stepVal) <= order.indexOf(cur) }
async function submitSignWith(action){ if(action==='reject'){ signForm.value.step='reject'; await submitSign(); } else { await submitSign(); } }
async function submitSign(){
  if(!signForm.value.opinion) return toast.add({title:'请输入意见', color:'warning'})
  signSubmitting.value=true
  try{
    await signSampleTest({ id:signRow.value.id, step:signForm.value.step, opinion:signForm.value.opinion, finalResult:signForm.value.finalResult, testerTargetQty:signForm.value.testerTargetQty, testerActualQty:signForm.value.testerActualQty, testerUsage:signForm.value.testerUsage })
    toast.add({title:'签批成功', color:'success'})
    signOpen.value=false; await getList(); await loadSummary()
  }catch(e){ toast.add({title:e?.message||'签批失败', color:'error'}) } finally{ signSubmitting.value=false }
}
function clearMaterialSelection(){ Object.assign(form.value, { materialId:null, materialNumber:'', materialName:'', materialSpec:'', materialNameSpec:'', materialModel:'' }) }
function handleMaterialSearchInput(value){
  const keyword=String(value||'').trim()
  if(keyword!==form.value.materialNumber) clearMaterialSelection()
  loadMaterialOptions(keyword)
}
function onMaterialSelect(opt){
  Object.assign(form.value, { materialId:opt.id, materialNumber:opt.value, materialName:opt.name||'', materialSpec:opt.spec||'', materialNameSpec:`${opt.name||''}${opt.spec ? ` ${opt.spec}` : ''}`.trim(), materialModel:opt.value })
  materialSearch.value=opt.value
  materialOptions.value=[]
}
function handleReapply(row){ toast.add({title:'旧链已冻结，如需再试请走 NPI统一申请', color:'warning'}) }
async function handleDeleteBatch(){
  if(!selectedIds.value.length) return
  if(!confirm(`确认删除 ${selectedIds.value.length} 条吗？`)) return
  try{ await deleteSampleTest(selectedIds.value); toast.add({title:'已删除', color:'success'}); selectedIds.value=[]; await getList(); await loadSummary() }catch(e){ toast.add({title:e?.message||'删除失败', color:'error'}) }
}
onMounted(()=>{ getList(); loadSummary(); loadAvlOptions(); loadMaterialOptions() })
</script>

<style scoped>
.date-capsule { color: #334155; color-scheme: light; font-size: 14px; }
.dark .date-capsule { color: #f1f5f9; color-scheme: dark; }
/* 胶囊内的日期触发按钮（UCalendar 弹层）：沿用原生输入框的 132px 定宽与行高 */
.date-capsule :deep(.capsule-btn) {
  width: 132px;
  height: 30px;
  padding: 0 4px;
  justify-content: flex-start;
  font-size: 14px;
  line-height: 20px;
  font-variant-numeric: tabular-nums;
}
.date-capsule:focus-within {
  --tw-ring-color: var(--ui-primary, #3b82f6);
}
</style>
