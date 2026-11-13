<template>
  <div class="app-container absolute inset-0 flex min-h-0 flex-col gap-3 overflow-hidden p-4 lg:p-5 bg-[#f8fafc] dark:bg-gray-900">
    <div class="grid shrink-0 grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-8">
      <div v-for="card in summaryCards" :key="card.key" class="relative overflow-hidden rounded-xl border bg-white dark:bg-gray-800 p-3 shadow-sm">
        <div class="absolute left-0 top-0 bottom-0 w-1" :class="card.barClass"></div>
        <div class="flex items-start justify-between"><div class="text-[11px] font-medium tracking-widest text-slate-500">{{ card.label }}</div><div class="rounded-lg p-1.5" :class="card.iconBg"><i :class="card.icon" class="text-[14px]"></i></div></div>
        <div class="mt-1 text-2xl font-bold" :class="card.className">{{ summary[card.key] || 0 }}</div>
      </div>
    </div>

    <div class="shrink-0 rounded-xl border border-slate-200/70 dark:border-slate-700 bg-white dark:bg-gray-800 shadow-sm p-3 flex flex-wrap items-center gap-2.5">
      <UInput v-model="queryParams.keyword" class="w-56" placeholder="单号 / 供应商 / 联系人 / 物料" clearable icon="i-lucide-search" />
      <USelect v-model="statusFilterValue" :items="statusFilterItems" value-key="value" label-key="label" class="w-36" placeholder="状态" />
      <USelect v-model="finalResultFilterValue" :items="finalResultItems" value-key="value" label-key="label" placeholder="结论" class="w-28" />
      <div class="date-capsule flex w-fit shrink-0 items-center gap-2 rounded-md ring-1 ring-inset ring-accented bg-default px-3.5 h-8">
        <i class="i-lucide-calendar text-slate-400 text-sm shrink-0"></i>
        <UPopover v-model:open="dateFromOpen">
          <UButton variant="ghost" size="sm" class="capsule-btn shrink-0 font-normal">
            <span :class="queryParams.dateFrom ? '' : 'text-dimmed'">{{ queryParams.dateFrom || '起' }}</span>
          </UButton>
          <template #content>
            <div class="p-2"><UCalendar v-model="dateFromValue" locale="zh-CN" /></div>
          </template>
        </UPopover>
        <span class="text-slate-300 dark:text-slate-600 select-none">—</span>
        <UPopover v-model:open="dateToOpen">
          <UButton variant="ghost" size="sm" class="capsule-btn shrink-0 font-normal">
            <span :class="queryParams.dateTo ? '' : 'text-dimmed'">{{ queryParams.dateTo || '止' }}</span>
          </UButton>
          <template #content>
            <div class="p-2"><UCalendar v-model="dateToValue" locale="zh-CN" /></div>
          </template>
        </UPopover>
      </div>
      <UButton color="primary" icon="i-lucide-search" @click="handleQuery">搜索</UButton>
      <UButton color="neutral" variant="ghost" icon="i-lucide-rotate-ccw" @click="resetQuery">重置</UButton>
      <div class="ml-auto text-[11px] text-slate-500"><UBadge color="neutral" variant="soft" size="xs" class="font-mono">NPI-第一步</UBadge></div>
    </div>

    <div class="rounded-lg border border-blue-200 dark:border-slate-700 bg-blue-50/50 dark:bg-blue-950/20 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2 flex-wrap">
      <span class="font-semibold text-blue-700 dark:text-blue-300">流转说明：</span>
      <span class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-slate-400"></span>草稿</span><span class="text-slate-400">→</span>
      <span class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-amber-500"></span>待采购</span><span class="text-slate-400">→</span>
      <span class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-orange-500"></span>待品质</span><span class="text-slate-400">→</span>
      <span class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-sky-500"></span>待工程</span><span class="text-slate-400">→</span>
      <span class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-violet-500"></span>待总经理</span><span class="text-slate-400">→</span>
      <span class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-emerald-500"></span>已准入</span><span class="text-slate-400">/</span><span class="w-2 h-2 rounded-full bg-red-500"></span>已驳回
    </div>

    <div class="flex items-center gap-2 shrink-0">

      <UButton v-if="canRemove" color="error" variant="soft" icon="i-lucide-trash-2" :disabled="!selectedIds.length" @click="handleDeleteBatch">删除 {{ selectedIds.length? `(${selectedIds.length})`:'' }}</UButton>
      <UButton color="neutral" variant="outline" icon="i-lucide-refresh-cw" @click="getList">刷新</UButton>
      <span class="text-xs text-slate-500 ml-1">旧链已冻结：新申请请走 NPI统一申请，通过后自动纳入AVL</span>
    </div>

    <div class="table-container-premium min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-gray-800 shadow-sm">
      <table class="w-full text-[13px]">
        <thead class="sticky top-0 z-10 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur border-b">
          <tr class="text-[11px] tracking-widest font-semibold text-slate-600 dark:text-slate-300">
            <th class="px-2 py-2.5 w-9 text-center"><UCheckbox :model-value="allSelected" @update:model-value="toggleAll" /></th>
            <th class="px-3 py-2.5 text-left">准入单号</th>
            <th class="px-3 py-2.5 text-left">供应商</th>
            <th class="px-3 py-2.5 text-left">联系人</th>
            <th class="px-3 py-2.5 text-left">主营物料</th>
            <th class="px-3 py-2.5 text-left">申请日期</th>
            <th class="px-3 py-2.5 text-left">状态</th>
            <th class="px-3 py-2.5 text-left">结论</th>
            <th class="px-3 py-2.5 text-left">AVL</th>
            <th class="px-3 py-2.5 text-center">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
          <tr v-if="loading"><td colspan="10" class="px-4 py-12 text-center text-slate-500">加载中...</td></tr>
          <tr v-else-if="!list.length"><td colspan="10" class="px-4 py-12 text-center text-slate-400">暂无数据 — 点击“新增准入申请”</td></tr>
          <tr v-for="row in list" :key="row.id" class="hover:bg-blue-50/60 dark:hover:bg-slate-700/40 cursor-pointer group" :class="{ 'bg-blue-50 dark:bg-slate-700/60': selectedIds.includes(row.id) }" @dblclick="handleEdit(row)">
            <td class="px-2 py-2.5 text-center" @click.stop><UCheckbox :model-value="selectedIds.includes(row.id)" @update:model-value="v => toggleRow(row.id, v)" /></td>
            <td class="px-3 py-2.5 font-mono text-xs">{{ row.accessNo }}</td>
            <td class="px-3 py-2.5 font-medium max-w-[160px] truncate" :title="row.supplierName">{{ row.supplierName }}</td>
            <td class="px-3 py-2.5">{{ row.contactName }}<span class="text-slate-400 text-xs ml-1">{{ row.contactPhone }}</span></td>
            <td class="px-3 py-2.5 max-w-[180px] truncate text-slate-600" :title="row.mainMaterials">{{ row.mainMaterials || '—' }}</td>
            <td class="px-3 py-2.5">{{ row.applyDate || '—' }}</td>
            <td class="px-3 py-2.5"><div class="flex flex-col gap-0.5"><UBadge :color="statusColor(row.status)" variant="soft" size="xs" class="rounded-full w-fit">{{ statusLabel(row.status) }}</UBadge><span v-if="row.status!=='approved'&&row.status!=='rejected'" class="text-[11px] text-slate-500 leading-none">{{ currentAssignee(row.status) }}</span></div></td>
            <td class="px-3 py-2.5"><UBadge v-if="row.finalResult" :color="row.finalResult==='准入'?'success':row.finalResult==='不准入'?'error':'warning'" variant="soft" size="xs">{{ row.finalResult }}</UBadge><span v-else class="text-slate-400 text-xs">待定</span></td>
            <td class="px-3 py-2.5"><span v-if="row.isAvl" class="inline-flex items-center gap-1 text-emerald-600 text-xs"><i class="i-lucide-check"></i>已纳入</span><span v-else class="text-slate-400 text-xs">—</span></td>
            <td class="px-3 py-2.5 text-center"><div class="inline-flex gap-1.5">
              <UButton size="xs" variant="soft" color="neutral" icon="i-lucide-square-pen" :disabled="row.status==='approved'||row.status==='rejected'" @click.stop="handleEdit(row)">编辑</UButton>
              <UButton v-if="row.status!=='approved'&&row.status!=='rejected'" size="xs" color="primary" icon="i-lucide-pen-line" class="shadow-sm" @click.stop="handleSign(row)">评审</UButton>
              <UButton v-else size="xs" variant="ghost" color="neutral" disabled title="旧链已冻结，如需再准入请走 NPI统一申请">已终审</UButton>
            </div></td>
          </tr>
        </tbody>
      </table>
    </div>

    <pagination v-show="total > 0" :total="total" v-model:page="queryParams.pageNum" v-model:limit="queryParams.pageSize" class="shrink-0" @pagination="getList" />

    <UModal v-model:open="formOpen" :title="formTitle" :ui="{ content: 'max-w-3xl' }">
      <template #body>
        <UForm :state="form" class="space-y-5">
          <div class="rounded-xl border border-blue-200/60 bg-blue-50/40 dark:bg-blue-950/20 p-3.5">
            <div class="flex items-center gap-2 mb-3 text-sm font-semibold text-blue-900 dark:text-blue-200"><i class="i-lucide-building-2"></i> 供应商信息</div>
            <div class="grid grid-cols-2 gap-4">
              <UFormField label="供应商名称" required class="col-span-2"><UInput v-model="form.supplierName" placeholder="如 HHCK" class="w-full" /></UFormField>
              <UFormField label="联系人"><UInput v-model="form.contactName" placeholder="联系人" class="w-full" /></UFormField>
              <UFormField label="联系电话"><UInput v-model="form.contactPhone" placeholder="手机号/座机" class="w-full" /></UFormField>
              <UFormField label="邮箱" class="col-span-2"><UInput v-model="form.contactEmail" placeholder="email@..." class="w-full" /></UFormField>
              <UFormField label="地址" class="col-span-2"><UInput v-model="form.address" placeholder="详细地址" class="w-full" /></UFormField>
              <UFormField label="主营物料/类别" class="col-span-2"><UInput v-model="form.mainMaterials" placeholder="如 黑胶、芯片、PCB" class="w-full" /></UFormField>
              <UFormField label="营业执照号"><UInput v-model="form.businessLicenseNo" placeholder="统一社会信用代码" class="w-full" /></UFormField>
              <UFormField label="体系证书"><UInput v-model="form.certificates" placeholder="ISO9001 / IATF16949 等" class="w-full" /></UFormField>
              <UFormField label="产能/供货能力" class="col-span-2"><UInput v-model="form.supplyCapacity" placeholder="如 月产能 500KG，交期 7天" class="w-full" /></UFormField>
            </div>
            <div class="grid grid-cols-2 gap-4 mt-4">
              <UFormField label="申请日期" required>
                <UPopover v-model:open="applyDateOpen">
                  <UButton color="neutral" variant="outline" icon="i-lucide-calendar" class="w-full justify-start font-normal">
                    <span :class="form.applyDate ? '' : 'text-dimmed'">{{ form.applyDate || '选择日期' }}</span>
                  </UButton>
                  <template #content>
                    <div class="p-2"><UCalendar v-model="applyDateValue" locale="zh-CN" /></div>
                  </template>
                </UPopover>
              </UFormField>
              <UFormField label="申请人"><UInput v-model="form.applicant" placeholder="默认当前登录人" class="w-full" /></UFormField>
            </div>
          </div>
          <div class="rounded-xl border border-slate-200 bg-slate-50/50 dark:bg-slate-800/50 p-3.5">
            <div class="grid grid-cols-2 gap-4">
              <UFormField label="流转状态"><div class="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-sm font-medium border">{{ statusLabel(form.status) }}</div><div class="text-[11px] text-slate-500 mt-1">由评审流转自动更新，无需手动选</div></UFormField>
              <UFormField label="准入结论"><div class="px-3 py-2 rounded-lg border text-sm" :class="form.finalResult ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 text-slate-400'">{{ form.finalResult || '待评审' }}</div></UFormField>
              <UFormField label="是否纳入AVL" class="flex items-center gap-2"><UCheckbox :model-value="!!form.isAvl" disabled label="已纳入AVL（准入通过后自动勾选）" /></UFormField>
            </div>
            <UFormField label="附件"><FileUpload v-model="form.attachments" :limit="5" :fileSize="10" :fileType="['jpg','jpeg','png','pdf','doc','docx','xls','xlsx']" /></UFormField>
            <UFormField label="备注" class="mt-4"><UTextarea v-model="form.remark" :rows="3" placeholder="其他说明..." class="w-full" /></UFormField>
          </div>
        </UForm>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full"><UButton color="neutral" variant="ghost" @click="formOpen=false">取消</UButton><UButton color="primary" :loading="submitting" @click="submitForm" icon="i-lucide-check">保存</UButton></div>
      </template>
    </UModal>

    <UModal v-model:open="signOpen" title="准入评审" :ui="{ content: 'max-w-xl' }">
      <template #body>
        <div v-if="signRow" class="space-y-5">
          <div class="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white dark:from-slate-800 dark:to-slate-800 p-4 flex items-center justify-between shadow-sm">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center"><i class="i-lucide-handshake text-[18px]"></i></div>
              <div><div class="font-mono text-sm font-bold tracking-wide">{{ signRow.accessNo }}</div><div class="text-sm font-medium text-slate-700 dark:text-slate-200">{{ signRow.supplierName }}</div><div class="text-xs text-slate-500">当前：{{ statusLabel(signRow.status) }} ｜ 下一步：{{ nextStepLabel(signRow.status) }}</div></div>
            </div>
            <UBadge :color="statusColor(signRow.status)" variant="soft" size="lg" class="rounded-full px-3 py-1">{{ statusLabel(signRow.status) }}</UBadge>
          </div>
          <div class="flex gap-1.5">
            <div v-for="s in stepOrder" :key="s" class="flex-1 text-center"><div class="h-1.5 rounded-full" :class="isStepReached(s, signRow.status) ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-700'"></div><div class="text-[10px] mt-1.5" :class="isStepReached(s, signRow.status) ? 'text-primary font-semibold' : 'text-slate-400'">{{ statusLabel(s) }}</div></div>
          </div>
          <UFormField v-if="signRow.status==='manager_review'" label="准入结论" required><USelect v-model="signForm.finalResult" :items="finalResultSelectItems" value-key="value" label-key="label" class="w-full" /></UFormField>
          <UFormField label="评审意见" required><UTextarea v-model="signForm.opinion" :rows="5" :placeholder="signRow.status==='manager_review' ? '总经理请写明准入/不准入原因...' : '请填写评审意见，驳回请写明原因...'" class="w-full" /></UFormField>
          <div class="flex items-center gap-2 text-[11px] text-slate-500 bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 rounded-lg px-3 py-2"><i class="i-lucide-info text-amber-600"></i>点“通过”流转到下一环节，点“驳回”直接终结为已驳回</div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-between items-center w-full">
          <div class="text-xs text-slate-500">当前环节：{{ statusLabel(signRow?.status) }}</div>
          <div class="flex gap-2">
            <UButton color="neutral" variant="ghost" @click="signOpen=false">取消</UButton>
            <UButton color="error" variant="soft" :loading="signSubmitting" @click="submitSign('reject')" icon="i-lucide-x-circle">驳回</UButton>
            <UButton color="primary" :loading="signSubmitting" @click="submitSign('approve')" icon="i-lucide-check">通过</UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup>
import { hasStaticPermission } from '@/router/static-navigation'
import useUserStore from '@/store/modules/user'
import { listSupplierAccess, getSupplierAccess, addSupplierAccess, updateSupplierAccess, deleteSupplierAccess, signSupplierAccess, getSupplierAccessSummary } from '@/api/tk_custom/supplierAccess.js'
const toast = useToast()
const userStore = useUserStore()
const can = (p) => hasStaticPermission(userStore, p)
const canQuery = computed(() => can('tk_custom:supplierAccess:query'))
const canAdd = computed(() => can('tk_custom:supplierAccess:add'))
const canRemove = computed(() => can('tk_custom:supplierAccess:remove'))
const canApprove = computed(() => can('tk_custom:supplierAccess:approve'))
const loading = ref(false)
const list = ref([])
const total = ref(0)
const summary = reactive({ total:0, draft:0, purchaser_review:0, quality_review:0, engineer_review:0, manager_review:0, approved:0, rejected:0 })
const selectedIds = ref([])
const allSelected = computed(() => list.value.length>0 && selectedIds.value.length===list.value.length)
const queryParams = ref({ pageNum:1, pageSize:20, keyword:'', status:'', finalResult:'', dateFrom:'', dateTo:'' })

// UCalendar 日期选择（原生 type="date" 替换）：字符串 ⇄ CalendarDate 双向转换
import { parseDate } from '@internationalized/date'

const dateFromOpen = ref(false)
const dateToOpen = ref(false)
const applyDateOpen = ref(false)
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
const statusMap = { draft:'草稿', purchaser_review:'待采购', quality_review:'待品质', engineer_review:'待工程', manager_review:'待总经理', approved:'已准入', rejected:'已驳回' }
const statusLabel = (s) => statusMap[s]||s
const currentAssignee = (status) => ({ draft:'杨阳(发起)', purchaser_review:'杨阳(采购)', quality_review:'彭奇(品质)', engineer_review:'刘广金(工程)', manager_review:'钟平权(总经理)', approved:'—', rejected:'—' }[status] || '—')
const statusColor = (s) => ({ draft:'neutral', purchaser_review:'warning', quality_review:'warning', engineer_review:'warning', manager_review:'warning', approved:'success', rejected:'error' }[s]||'neutral')
const statusItems = Object.entries(statusMap).map(([value,label])=>({value,label}))
const statusFilterItems = [{label:'全部状态', value:'__all__'}, ...statusItems]
const statusFilterValue = computed({ get: () => queryParams.value.status ? queryParams.value.status : '__all__', set: (v) => queryParams.value.status = v==='__all__' ? '' : v })
const finalResultItems = [{label:'全部结论', value:'__all__'}, {label:'准入', value:'准入'}, {label:'不准入', value:'不准入'}, {label:'有条件准入', value:'有条件准入'}]
const finalResultFilterValue = computed({ get: () => queryParams.value.finalResult ? queryParams.value.finalResult : '__all__', set: (v) => queryParams.value.finalResult = v==='__all__' ? '' : v })
const finalResultSelectItems = [{label:'准入', value:'准入'}, {label:'不准入', value:'不准入'}, {label:'有条件准入', value:'有条件准入'}]

const stepOrder = ['purchaser_review','quality_review','engineer_review','manager_review']
const nextStepLabel = (status) => ({ draft:'采购评审', purchaser_review:'采购评审', quality_review:'品质评审', engineer_review:'工程评审', manager_review:'总经理评审', approved:'已准入', rejected:'已驳回' }[status] || '评审')
const isStepReached = (step, current) => {
  const order = ['draft','purchaser_review','quality_review','engineer_review','manager_review','approved','rejected']
  const idx = (s) => order.indexOf(s)
  // highlight up to current
  return idx(step) <= idx(current) || (current==='approved' && step==='manager_review')
}
const summaryCards = [
  { key:'total', label:'全部', className:'text-slate-900', barClass:'bg-slate-900', iconBg:'bg-slate-100 text-slate-600', icon:'i-lucide-layers' },
  { key:'draft', label:'草稿', className:'text-slate-600', barClass:'bg-slate-400', iconBg:'bg-slate-100 text-slate-500', icon:'i-lucide-file-edit' },
  { key:'purchaser_review', label:'待采购', className:'text-amber-600', barClass:'bg-amber-500', iconBg:'bg-amber-100 text-amber-600', icon:'i-lucide-shopping-bag' },
  { key:'quality_review', label:'待品质', className:'text-orange-600', barClass:'bg-orange-500', iconBg:'bg-orange-100 text-orange-600', icon:'i-lucide-shield-check' },
  { key:'engineer_review', label:'待工程', className:'text-sky-600', barClass:'bg-sky-500', iconBg:'bg-sky-100 text-sky-600', icon:'i-lucide-cpu' },
  { key:'manager_review', label:'待总经理', className:'text-violet-600', barClass:'bg-violet-500', iconBg:'bg-violet-100 text-violet-600', icon:'i-lucide-crown' },
  { key:'approved', label:'已准入', className:'text-emerald-600', barClass:'bg-emerald-500', iconBg:'bg-emerald-100 text-emerald-600', icon:'i-lucide-badge-check' },
  { key:'rejected', label:'已驳回', className:'text-red-600', barClass:'bg-red-500', iconBg:'bg-red-100 text-red-600', icon:'i-lucide-x-circle' },
]
const formOpen = ref(false)
const formTitle = ref('新增准入')
const submitting = ref(false)
const form = ref({ id:null, supplierName:'', contactName:'', contactPhone:'', contactEmail:'', mainMaterials:'', address:'', businessLicenseNo:'', certificates:'', supplyCapacity:'', applyDate:new Date().toISOString().slice(0,10), applicant:'', status:'draft', finalResult:'', isAvl:false, attachments:'', remark:'' })
const signOpen = ref(false)
const signRow = ref(null)
const signSubmitting = ref(false)
const signForm = ref({ opinion:'', finalResult:'准入' })


function toggleRow(id, v){ if(v){ if(!selectedIds.value.includes(id)) selectedIds.value.push(id)} else selectedIds.value = selectedIds.value.filter(x=>x!==id)}
function toggleAll(v){ selectedIds.value = v ? list.value.map(r=>r.id) : [] }
async function getList(){
  if(!canQuery.value){ toast.add({title:'无查询权限', color:'warning'}); return }
  loading.value=true
  try{ const res = await listSupplierAccess(queryParams.value); list.value=res.rows||[]; total.value=res.total||0 }catch(e){ toast.add({title:e?.message||'查询失败', color:'error'}) } finally{ loading.value=false }
}
async function loadSummary(){ try{ const res=await getSupplierAccessSummary(); Object.assign(summary, res.data||res||{}) }catch{} }
function handleQuery(){ queryParams.value.pageNum=1; getList(); loadSummary() }
function resetQuery(){ queryParams.value={ pageNum:1, pageSize:20, keyword:'', status:'', finalResult:'', dateFrom:'', dateTo:'' }; getList(); loadSummary() }
function handleAdd(){ toast.add({title:'旧链已冻结，新申请请走 NPI统一申请', color:'warning'}) }
function handleEdit(row){
  const _r=row||list.value.find(x=>selectedIds.value.includes(x.id))
  if(_r && (_r.status==='approved'||_r.status==='rejected')) return toast.add({title:'已终审不可编辑', color:'warning'})
  const r=row||list.value.find(x=>selectedIds.value.includes(x.id))
  if(!r) return toast.add({title:'请选择一条记录', color:'warning'})
  form.value={ id:r.id, supplierName:r.supplierName, contactName:r.contactName, contactPhone:r.contactPhone, contactEmail:r.contactEmail, mainMaterials:r.mainMaterials, address:r.address, businessLicenseNo:r.businessLicenseNo, certificates:r.certificates, supplyCapacity:r.supplyCapacity, applyDate:r.applyDate||new Date().toISOString().slice(0,10), applicant:r.applicant, status:r.status, finalResult:r.finalResult, isAvl:!!r.isAvl, attachments:r.attachments||'', remark:r.remark }
  formTitle.value='编辑准入'; formOpen.value=true
}

function handleSign(row){
  if(row.status==='approved'||row.status==='rejected') return toast.add({title:'已终审单据不能再评审', color:'warning'})
  if(!canApprove.value) return toast.add({title:'无审核权限', color:'warning'})
  signRow.value=row
  signForm.value={ opinion:'', finalResult: row.finalResult||'准入' }
  signOpen.value=true
}
async function submitForm(){
  if(!form.value.supplierName) return toast.add({title:'供应商名称不能为空', color:'warning'})
  submitting.value=true
  try{ const payload={ ...form.value }; if(payload.id) await updateSupplierAccess(payload); else await addSupplierAccess(payload); toast.add({title:'保存成功', color:'success'}); formOpen.value=false; await getList(); await loadSummary() }catch(e){ toast.add({title:e?.message||'保存失败', color:'error'}) } finally{ submitting.value=false }
}
async function submitSign(action){
  if(!signForm.value.opinion) return toast.add({title:'请输入意见', color:'warning'})
  if(action==='approve' && signRow.value.status==='manager_review' && !signForm.value.finalResult) return toast.add({title:'请选择准入结论', color:'warning'})
  signSubmitting.value=true
  try{
    const payload = { id: signRow.value.id, opinion: signForm.value.opinion, action }
    if(signRow.value.status==='manager_review') payload.finalResult = signForm.value.finalResult
    await signSupplierAccess(payload)
    toast.add({title: action==='approve' ? '已通过' : '已驳回', color: action==='approve' ? 'success':'warning'}); signOpen.value=false; await getList(); await loadSummary()
  }catch(e){ toast.add({title:e?.message||'评审失败', color:'error'}) } finally{ signSubmitting.value=false }
}
function handleReapply(row){ toast.add({title:'旧链已冻结，如需再准入请走 NPI统一申请', color:'warning'}) }
async function handleDeleteBatch(){
  if(!selectedIds.value.length) return
  if(!confirm(`确认删除 ${selectedIds.value.length} 条吗？`)) return
  try{ await deleteSupplierAccess(selectedIds.value); toast.add({title:'已删除', color:'success'}); selectedIds.value=[]; await getList(); await loadSummary() }catch(e){ toast.add({title:e?.message||'删除失败', color:'error'}) }
}

onMounted(()=>{ getList(); loadSummary() })
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
