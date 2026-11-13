<template>
  <div class="app-container absolute inset-0 flex min-h-0 flex-col gap-3 overflow-hidden p-4 lg:p-5 bg-[#f8fafc] dark:bg-gray-900">
    <!-- 汇总条：紧凑单行，点击按状态过滤 -->
    <div class="shrink-0 rounded-xl border border-slate-200/70 dark:border-slate-700 bg-white dark:bg-gray-800 shadow-sm px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
      <button v-for="card in summaryCards" :key="card.key" class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-700" :class="{ 'bg-blue-50 dark:bg-blue-950/40': queryParams.status===(card.key==='total'?'':card.key) }" @click="filterByStatus(card.key)">
        <span class="w-2 h-2 rounded-full" :class="card.dotClass"></span>
        <span class="text-slate-500">{{ card.label }}</span>
        <b :class="card.className">{{ summary[card.key] || 0 }}</b>
      </button>
    </div>

    <div class="shrink-0 rounded-xl border border-slate-200/70 dark:border-slate-700 bg-white dark:bg-gray-800 shadow-sm p-3 flex flex-wrap items-center gap-2.5">
      <UInput v-model="queryParams.keyword" class="w-56" placeholder="单号 / 供应商 / 产品 / 料号" clearable icon="i-lucide-search" />
      <USelect v-model="statusFilterValue" :items="statusFilterItems" value-key="value" label-key="label" class="w-36" placeholder="状态" />
      <USelect v-model="accessResultFilterValue" :items="accessResultItems" value-key="value" label-key="label" placeholder="准入结论" class="w-36" />
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
      <UButton color="primary" variant="solid" icon="i-lucide-search" class="shadow-sm" @click="handleQuery">搜索</UButton>
      <UButton color="neutral" variant="ghost" icon="i-lucide-rotate-ccw" @click="resetQuery">重置</UButton>
    </div>

    <div class="rounded-lg border border-blue-200 dark:border-slate-700 bg-blue-50/50 dark:bg-blue-950/20 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2 flex-wrap">
      <span class="font-semibold text-blue-700 dark:text-blue-300">流转说明：</span>
      <span class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-slate-400"></span>采购填写</span><span class="text-slate-400">→</span>
      <span class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-amber-500"></span>待测试</span><span class="text-slate-400">→</span>
      <span class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-orange-500"></span>待IPQC</span><span class="text-slate-400">→</span>
      <span class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-sky-500"></span>待组长</span><span class="text-slate-400">→</span>
      <span class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-violet-500"></span>待主管</span><span class="text-slate-400">→</span>
      <span class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-cyan-500"></span>待总经理助理</span><span class="text-slate-400">→</span>
      <span class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-indigo-500"></span>待总经理</span><span class="text-slate-400">→</span>
      <span class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-emerald-500"></span>已准入</span><span class="text-slate-400">/</span><span class="w-2 h-2 rounded-full bg-red-500"></span>已驳回
    </div>

    <div class="flex items-center gap-2 shrink-0">
      <UButton v-if="canAdd" color="primary" icon="i-lucide-plus" class="shadow-sm" @click="handleAdd">新增NPI申请</UButton>
      <UButton v-if="canRemove" color="error" variant="soft" icon="i-lucide-trash-2" :disabled="!selectedIds.length" @click="handleDeleteBatch">删除 {{ selectedIds.length? `(${selectedIds.length})`:'' }}</UButton>
      <UButton color="neutral" variant="outline" icon="i-lucide-refresh-cw" @click="getList">刷新</UButton>
    </div>

    <div class="table-container-premium min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-gray-800 shadow-sm">
      <table class="w-full text-[13px]">
        <thead class="sticky top-0 z-10 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur border-b">
          <tr class="text-[11px] tracking-widest font-semibold text-slate-600 dark:text-slate-300">
            <th class="px-2 py-2.5 w-9 text-center"><UCheckbox :model-value="allSelected" @update:model-value="toggleAll" /></th>
            <th class="px-3 py-2.5 text-left">NPI单号</th>
            <th class="px-3 py-2.5 text-left">供应商</th>
            <th class="px-3 py-2.5 text-left">名称</th>
            <th class="px-3 py-2.5 text-left">规格</th>
            <th class="px-3 py-2.5 text-left">物料编码</th>
            <th class="px-3 py-2.5 text-left">申请日期</th>
            <th class="px-3 py-2.5 text-left">状态</th>
            <th class="px-3 py-2.5 text-left">准入结论</th>
            <th class="px-3 py-2.5 text-left">AVL</th>
            <th class="px-3 py-2.5 text-center">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
          <tr v-if="loading"><td colspan="11" class="px-4 py-12 text-center"><div class="inline-flex items-center gap-2 text-slate-500"><span class="animate-spin i-lucide-loader-2"></span>加载中...</div></td></tr>
          <tr v-else-if="!list.length"><td colspan="11" class="px-4 py-12 text-center text-slate-400">暂无数据 — 点击“新增NPI申请”创建第一条</td></tr>
          <tr v-for="row in list" :key="row.id" class="hover:bg-blue-50/60 dark:hover:bg-slate-700/40 cursor-pointer transition-colors group" :class="{ 'bg-blue-50 dark:bg-slate-700/60': selectedIds.includes(row.id) }" @dblclick="handleEdit(row)">
            <td class="px-2 py-2.5 text-center" @click.stop><UCheckbox :model-value="selectedIds.includes(row.id)" @update:model-value="v => toggleRow(row.id, v)" /></td>
            <td class="px-3 py-2.5 font-mono text-xs font-medium text-slate-700 dark:text-slate-200">{{ row.npiNo }}</td>
            <td class="px-3 py-2.5 max-w-[150px] truncate font-medium" :title="row.supplierName">{{ row.supplierName }}</td>
            <td class="px-3 py-2.5 max-w-[150px] truncate" :title="row.materialName">{{ row.materialName || row.productName || '—' }}</td>
            <td class="px-3 py-2.5 max-w-[170px] truncate text-slate-600 dark:text-slate-300" :title="row.materialSpec">{{ row.materialSpec || '—' }}</td>
            <td class="px-3 py-2.5 font-mono text-xs" :title="row.materialNumber">{{ row.materialNumber || '—' }}</td>
            <td class="px-3 py-2.5 text-slate-600 dark:text-slate-300">{{ row.applyDate || '—' }}</td>
            <td class="px-3 py-2.5"><div class="flex items-center gap-1.5 whitespace-nowrap"><UBadge :color="statusColor(row.status)" variant="soft" size="xs" class="rounded-full px-2.5 py-0.5">{{ statusLabel(row.status) }}</UBadge><span v-if="row.status!=='approved'&&row.status!=='rejected'" class="text-[11px] text-slate-500">{{ assignee(row.status) }}</span></div></td>
            <td class="px-3 py-2.5"><UBadge v-if="row.accessResult" :color="row.accessResult==='准入'?'success':row.accessResult==='不准入'?'error':'warning'" variant="soft" size="xs" class="rounded-full">{{ row.accessResult }}</UBadge><span v-else class="text-slate-400 text-xs">待定</span></td>
            <td class="px-3 py-2.5"><span v-if="row.accessId" class="inline-flex items-center gap-1 text-emerald-600 text-xs"><i class="i-lucide-check"></i>已纳入</span><span v-else class="text-slate-400 text-xs">—</span></td>
            <td class="px-3 py-2.5 text-center">
              <div class="inline-flex items-center gap-0.5 opacity-80 group-hover:opacity-100">
                <UButton v-if="row.status==='draft'" size="xs" variant="soft" color="neutral" icon="i-lucide-square-pen" @click.stop="handleEdit(row)">编辑</UButton>
                <UButton v-if="row.status==='draft' && canEdit" size="xs" color="success" variant="soft" icon="i-lucide-send" @click.stop="handleSubmit(row)">提交送测</UButton>
                <UButton v-if="row.status!=='draft'&&row.status!=='approved'&&row.status!=='rejected'" size="xs" color="primary" icon="i-lucide-pen-line" class="shadow-sm" @click.stop="handleSign(row)">签批</UButton>
                <UButton v-if="row.status==='approved'||row.status==='rejected'" size="xs" color="primary" icon="i-lucide-copy" class="shadow-sm" @click.stop="handleReapply(row)">重新发起</UButton>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <pagination v-show="total > 0" :total="total" v-model:page="queryParams.pageNum" v-model:limit="queryParams.pageSize" class="shrink-0" @pagination="getList" />

    <!-- 新增/编辑：供应商信息 + 送样信息一次填完 -->
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
          </div>
          <div class="rounded-xl border border-emerald-200/60 bg-emerald-50/40 dark:bg-emerald-950/20 p-3.5">
            <div class="flex items-center gap-2 mb-3 text-sm font-semibold text-emerald-900 dark:text-emerald-200"><i class="i-lucide-file-text"></i> 送样信息</div>
            <div class="grid grid-cols-4 gap-3">
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
              <UFormField label="送试日期" required class="col-span-2">
                <UPopover v-model:open="applyDateOpen">
                  <UButton color="neutral" variant="outline" icon="i-lucide-calendar" class="font-normal">
                    <span :class="form.applyDate ? '' : 'text-dimmed'">{{ form.applyDate || '选择日期' }}</span>
                  </UButton>
                  <template #content>
                    <div class="p-2"><UCalendar v-model="applyDateValue" locale="zh-CN" /></div>
                  </template>
                </UPopover>
              </UFormField>
              <UFormField label="回复报告日期" class="col-span-2">
                <UPopover v-model:open="replyDateOpen">
                  <UButton color="neutral" variant="outline" icon="i-lucide-calendar" class="font-normal">
                    <span :class="form.replyDate ? '' : 'text-dimmed'">{{ form.replyDate || '选择日期' }}</span>
                  </UButton>
                  <template #content>
                    <div class="p-2"><UCalendar v-model="replyDateValue" locale="zh-CN" /></div>
                  </template>
                </UPopover>
              </UFormField>
              <UFormField label="测试部门"><UInput v-model="form.testDept" placeholder="工程/品质/生产" /></UFormField>
              <UFormField label="测试数量"><UInput v-model="form.testQty" placeholder="3KG" /></UFormField>
              <UFormField label="测试人"><UInput v-model="form.testerName" placeholder="测试人姓名" /></UFormField>
              <UFormField label="制单人（采购）"><UInput v-model="form.applicant" placeholder="默认当前登录人" /></UFormField>
            </div>
            <UFormField label="测试情况 / 备注" class="mt-3"><UTextarea v-model="form.testerRemark" :rows="3" placeholder="采购可预填送样说明..." class="w-full" /></UFormField>
          </div>
          <div class="rounded-xl border border-slate-200 bg-slate-50/50 dark:bg-slate-800/50 p-3.5">
            <div class="grid grid-cols-2 gap-4">
              <UFormField label="流转状态"><div class="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-sm font-medium border">{{ statusLabel(form.status) }}</div></UFormField>
              <UFormField label="准入结论"><div class="px-3 py-2 rounded-lg border text-sm" :class="form.accessResult ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 text-slate-400'">{{ form.accessResult || '待总经理终审' }}</div></UFormField>
            </div>
            <UFormField label="附件"><FileUpload v-model="form.attachments" :limit="5" :fileSize="10" :fileType="['jpg','jpeg','png','pdf','doc','docx','xls','xlsx']" /></UFormField>
            <UFormField label="备注" class="mt-4"><UTextarea v-model="form.remark" :rows="3" placeholder="其他说明..." class="w-full" /></UFormField>
          </div>
        </UForm>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="formOpen=false">取消</UButton>
          <UButton color="neutral" variant="outline" :loading="submitting" @click="submitForm(false)" icon="i-lucide-save">存草稿</UButton>
          <UButton color="primary" :loading="submitting" @click="submitForm(true)" icon="i-lucide-send">保存并提交送测</UButton>
        </div>
      </template>
    </UModal>

    <!-- 签批：环节由状态决定，总经理终审一次定双结论 -->
    <UModal v-model:open="signOpen" title="NPI签批" :ui="{ content: 'max-w-xl' }">
      <template #body>
        <div v-if="signRow" class="space-y-5">
          <div class="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white dark:from-slate-800 dark:to-slate-800 p-4 flex items-center justify-between shadow-sm">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center"><i class="i-lucide-git-branch text-[18px]"></i></div>
              <div><div class="font-mono text-sm font-bold tracking-wide">{{ signRow.npiNo }}</div><div class="text-sm font-medium text-slate-700 dark:text-slate-200">{{ signRow.supplierName }} · {{ signRow.productName }}</div><div class="text-xs text-slate-500">当前：{{ statusLabel(signRow.status) }} ｜ 本步：{{ stepLabel(signStep) }}</div></div>
            </div>
            <UBadge :color="statusColor(signRow.status)" variant="soft" size="lg" class="rounded-full px-3 py-1">{{ statusLabel(signRow.status) }}</UBadge>
          </div>
          <div class="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
            <div class="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">申请信息</div>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <div class="truncate" :title="signRow.supplierName"><span class="text-slate-400">供应商：</span>{{ signRow.supplierName || '—' }}</div>
              <div class="truncate"><span class="text-slate-400">联系人：</span>{{ signRow.contactName || '—' }}<span v-if="signRow.contactPhone"> {{ signRow.contactPhone }}</span></div>
              <div class="truncate" :title="signRow.materialName"><span class="text-slate-400">物料：</span>{{ signRow.materialName || signRow.productName || '—' }}</div>
              <div class="truncate" :title="signRow.materialSpec"><span class="text-slate-400">规格：</span>{{ signRow.materialSpec || '—' }}</div>
              <div class="truncate" :title="signRow.materialNumber"><span class="text-slate-400">物料编码：</span>{{ signRow.materialNumber || '—' }}</div>
              <div><span class="text-slate-400">测试数量：</span>{{ signRow.testQty || '—' }}{{ signRow.testQtyUnit || '' }}</div>
              <div><span class="text-slate-400">送试日期：</span>{{ signRow.applyDate || '—' }}</div>
              <div><span class="text-slate-400">申请人：</span>{{ signRow.applicant || '—' }}</div>
              <div v-if="signRow.testerTargetQty || signRow.testerActualQty" class="col-span-2"><span class="text-slate-400">目标/实际产量：</span>{{ signRow.testerTargetQty || '—' }} / {{ signRow.testerActualQty || '—' }}</div>
              <div v-if="signRow.testerRemark" class="col-span-2"><span class="text-slate-400">测试情况：</span>{{ signRow.testerRemark }}</div>
            </div>
          </div>
          <div class="flex gap-1.5">
            <div v-for="s in chainSteps" :key="s.value" class="flex-1 text-center">
              <div class="h-1.5 rounded-full" :class="isStepReached(s.value) ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-700'"></div>
              <div class="text-[10px] mt-1.5" :class="isStepReached(s.value) ? 'text-primary font-semibold' : 'text-slate-400'">{{ s.label }}</div>
            </div>
          </div>
          <div v-if="signHistory.length" class="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60 p-3">
            <div class="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">上游意见</div>
            <div class="space-y-2">
              <div v-for="h in signHistory" :key="h.label" class="flex gap-2.5 text-xs">
                <div class="w-16 shrink-0 text-slate-500">{{ h.label }}</div>
                <div class="flex-1 min-w-0">
                  <div class="text-slate-700 dark:text-slate-200 break-words">{{ h.opinion || '—' }}</div>
                  <div class="text-[11px] text-slate-400 mt-0.5">{{ h.by }}<span v-if="h.at"> · {{ h.at }}</span></div>
                </div>
              </div>
            </div>
          </div>
          <div v-if="signStep==='approve' && !signForm.accessResult" class="grid grid-cols-2 gap-3">
            <UButton color="success" size="lg" icon="i-lucide-check-circle" class="py-6 text-base" @click="signForm.accessResult='准入'">准入</UButton>
            <UButton color="error" variant="soft" size="lg" icon="i-lucide-x-circle" class="py-6 text-base" @click="signForm.accessResult='不准入'">不准入</UButton>
          </div>
          <template v-if="signStep!=='approve' || signForm.accessResult">
            <div v-if="signStep==='approve'" class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <span>已选结论：</span>
              <UBadge :color="signForm.accessResult==='准入'?'success':'error'" variant="soft">{{ signForm.accessResult }}</UBadge>
              <UButton variant="ghost" size="xs" @click="signForm.accessResult=''">重新选择</UButton>
            </div>
            <UFormField label="意见" required><UTextarea v-model="signForm.opinion" :rows="5" :placeholder="signStep==='approve' ? '请写明结论依据...' : '请填写本环节意见...'" class="w-full" /></UFormField>
          </template>
          <div v-if="signStep==='tester'" class="grid grid-cols-3 gap-3 p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/40">
            <UFormField label="目标产量"><UInput v-model="signForm.testerTargetQty" /></UFormField>
            <UFormField label="实际产量"><UInput v-model="signForm.testerActualQty" /></UFormField>
            <UFormField label="测试数量"><UInput v-model="signForm.testerUsage" /></UFormField>
          </div>
        </div>
      </template>
      <template #footer>
        <div v-if="signStep==='approve'" class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="signOpen=false">取消</UButton>
          <UButton v-if="signForm.accessResult" :color="signForm.accessResult==='准入'?'primary':'error'" :variant="signForm.accessResult==='准入'?'solid':'soft'" :loading="signSubmitting" @click="submitSign(signForm.accessResult==='准入'?'approve':'reject')" icon="i-lucide-check">确认提交</UButton>
        </div>
        <div v-else class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="signOpen=false">取消</UButton>
          <UButton color="primary" :loading="signSubmitting" @click="submitSign('approve')" icon="i-lucide-send">提交</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup>
import { hasStaticPermission } from '@/router/static-navigation'
import useUserStore from '@/store/modules/user'
import { listNpi, addNpi, updateNpi, deleteNpi, signNpi, getNpiSummary } from '@/api/tk_custom/npi.js'
import request from '@/utils/request'

const toast = useToast()
const userStore = useUserStore()

const can = (p) => hasStaticPermission(userStore, p)
const canQuery = computed(() => can('tk_custom:npi:query'))
const canAdd = computed(() => can('tk_custom:npi:add'))
const canEdit = computed(() => can('tk_custom:npi:edit'))
const canRemove = computed(() => can('tk_custom:npi:remove'))
const canApprove = computed(() => can('tk_custom:npi:approve'))

const loading = ref(false)
const list = ref([])
const total = ref(0)
const summary = reactive({ total:0, draft:0, testing:0, ipqc_review:0, leader_review:0, supervisor_review:0, assistant_review:0, manager_review:0, approved:0, rejected:0 })
const selectedIds = ref([])
const allSelected = computed(() => list.value.length>0 && selectedIds.value.length===list.value.length)

const queryParams = ref({ pageNum:1, pageSize:20, keyword:'', status:'', accessResult:'', dateFrom:'', dateTo:'' })

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

const statusMap = { draft:'草稿·采购填写', testing:'待测试', ipqc_review:'待IPQC', leader_review:'待组长', supervisor_review:'待主管', assistant_review:'待总经理助理', manager_review:'待总经理', approved:'已准入', rejected:'已驳回' }
const statusLabel = (s) => statusMap[s]||s
const assignee = (s) => ({ draft:'采购填写', testing:'测试员', ipqc_review:'IPQC', leader_review:'组长', supervisor_review:'部门主管', assistant_review:'总经理助理', manager_review:'总经理', approved:'—', rejected:'—' }[s]||'—')
const statusColor = (s) => ({ draft:'neutral', testing:'warning', ipqc_review:'warning', leader_review:'warning', supervisor_review:'warning', assistant_review:'warning', manager_review:'warning', approved:'success', rejected:'error' }[s]||'neutral')
const statusItems = Object.entries(statusMap).map(([value,label])=>({value,label}))
const statusFilterItems = [{label:'全部状态', value:'__all__'}, ...statusItems]
const statusFilterValue = computed({
  get: () => queryParams.value.status ? queryParams.value.status : '__all__',
  set: (v) => queryParams.value.status = v==='__all__' ? '' : v
})
const accessResultItems = [{label:'全部准入结论', value:'__all__'}, {label:'准入', value:'准入'}, {label:'有条件准入', value:'有条件准入'}, {label:'不准入', value:'不准入'}]
const accessResultFilterValue = computed({
  get: () => queryParams.value.accessResult ? queryParams.value.accessResult : '__all__',
  set: (v) => queryParams.value.accessResult = v==='__all__' ? '' : v
})


const chainSteps = [
  {label:'采购提交', value:'purchaser'},
  {label:'测试员', value:'tester'},
  {label:'IPQC', value:'ipqc'},
  {label:'组长', value:'leader'},
  {label:'主管', value:'supervisor'},
  {label:'总经理助理', value:'assistant'},
  {label:'总经理', value:'approve'},
]
const stepLabel = (step) => ({ tester:'测试员签', ipqc:'IPQC签', leader:'组长签', supervisor:'主管签', assistant:'总经理助理签', approve:'总经理终审（定准入结论）' }[step]||'签批')
const stepFromStatus = (status) => ({ testing:'tester', ipqc_review:'ipqc', leader_review:'leader', supervisor_review:'supervisor', assistant_review:'assistant', manager_review:'approve' }[status]||'')

const summaryCards = [
  { key:'total', label:'全部', className:'text-slate-900 dark:text-white', dotClass:'bg-slate-900' },
  { key:'draft', label:'草稿', className:'text-slate-600', dotClass:'bg-slate-400' },
  { key:'testing', label:'待测试', className:'text-amber-600', dotClass:'bg-amber-500' },
  { key:'ipqc_review', label:'待IPQC', className:'text-orange-600', dotClass:'bg-orange-500' },
  { key:'leader_review', label:'待组长', className:'text-sky-600', dotClass:'bg-sky-500' },
  { key:'supervisor_review', label:'待主管', className:'text-violet-600', dotClass:'bg-violet-500' },
  { key:'assistant_review', label:'待总经理助理', className:'text-cyan-600', dotClass:'bg-cyan-500' },
  { key:'manager_review', label:'待总经理', className:'text-indigo-600', dotClass:'bg-indigo-500' },
  { key:'approved', label:'已准入', className:'text-emerald-600', dotClass:'bg-emerald-500' },
  { key:'rejected', label:'已驳回', className:'text-red-600', dotClass:'bg-red-500' },
]
function filterByStatus(key){
  queryParams.value.status = key==='total' ? '' : key
  queryParams.value.pageNum=1; getList()
}

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

const formOpen = ref(false)
const formTitle = ref('新增NPI申请')
const submitting = ref(false)
const blankForm = () => ({ id:null, npiNo:'', supplierName:'', contactName:'', contactPhone:'', contactEmail:'', mainMaterials:'', address:'', businessLicenseNo:'', certificates:'', supplyCapacity:'', productName:'', materialNameSpec:'', materialId:null, materialNumber:'', materialName:'', materialSpec:'', materialModel:'', testQty:'', testQtyUnit:'KG', testDept:'工程/品质/生产', applyDate:new Date().toISOString().slice(0,10), replyDate:'', applicant:userStore.nickName||userStore.name||'', testerName:'', testerTargetQty:'', testerActualQty:'', testerUsage:'', testerRemark:'', status:'draft', accessResult:'', attachments:'', remark:'' })
const form = ref(blankForm())

const signOpen = ref(false)
const signRow = ref(null)
const signStep = ref('')
const signSubmitting = ref(false)
const signForm = ref({ opinion:'', accessResult:'', testerTargetQty:'', testerActualQty:'', testerUsage:'' })

const fmtTime = (v) => String(v || '').slice(0, 16).replace('T', ' ')
// 签批时展示已走完环节的意见，供下游参考
const signHistory = computed(() => {
  const r = signRow.value
  if(!r) return []
  const items = []
  if(r.applicant) items.push({ label:'采购提交', by:r.applicant, at:r.applyDate || '', opinion:'' })
  if(r.testerBy || r.testerAt || r.testerRemark) items.push({ label:'测试员', by:r.testerBy || r.testerName || '', at:fmtTime(r.testerAt), opinion:r.testerRemark || '' })
  if(r.ipqcBy || r.ipqcAt || r.ipqcOpinion) items.push({ label:'IPQC', by:r.ipqcBy || '', at:fmtTime(r.ipqcAt), opinion:r.ipqcOpinion || '' })
  if(r.teamLeaderBy || r.teamLeaderAt || r.teamLeaderOpinion) items.push({ label:'组长', by:r.teamLeaderBy || '', at:fmtTime(r.teamLeaderAt), opinion:r.teamLeaderOpinion || '' })
  if(r.supervisorBy || r.supervisorAt || r.supervisorOpinion) items.push({ label:'主管', by:r.supervisorBy || '', at:fmtTime(r.supervisorAt), opinion:r.supervisorOpinion || '' })
  if(r.assistantBy || r.assistantAt || r.assistantOpinion) items.push({ label:'总经理助理', by:r.assistantBy || '', at:fmtTime(r.assistantAt), opinion:r.assistantOpinion || '' })
  return items
})

function toggleRow(id, v){ if(v){ if(!selectedIds.value.includes(id)) selectedIds.value.push(id)} else selectedIds.value = selectedIds.value.filter(x=>x!==id)}
function toggleAll(v){ selectedIds.value = v ? list.value.map(r=>r.id) : [] }

async function getList(){
  if(!canQuery.value){ toast.add({title:'无查询权限', color:'warning'}); return }
  loading.value=true
  try{
    const res = await listNpi(queryParams.value)
    list.value = res.rows||[]
    total.value = res.total||0
  }catch(e){ toast.add({title:e?.message||'查询失败', color:'error'}) } finally{ loading.value=false }
}
async function loadSummary(){
  try{ const res = await getNpiSummary(); Object.assign(summary, res.data||res||{}) }catch{}
}
function handleQuery(){ queryParams.value.pageNum=1; getList(); loadSummary() }
function resetQuery(){ queryParams.value={ pageNum:1, pageSize:20, keyword:'', status:'', accessResult:'', dateFrom:'', dateTo:'' }; getList(); loadSummary() }

function handleAdd(){
  materialSearch.value=''
  materialOptions.value=[]
  form.value = blankForm()
  formTitle.value='新增NPI申请'; formOpen.value=true
}
function handleEdit(row){
  const r=row||list.value.find(x=>selectedIds.value.includes(x.id))
  if(!r) return toast.add({title:'请选择一条记录', color:'warning'})
  if(r.status!=='draft') return toast.add({title:'已提交送测的单据只能走签批，不能再编辑', color:'warning'})
  materialSearch.value=r.materialNumber||''
  materialOptions.value=[]
  form.value={ id:r.id, npiNo:r.npiNo, supplierName:r.supplierName, contactName:r.contactName, contactPhone:r.contactPhone, contactEmail:r.contactEmail, mainMaterials:r.mainMaterials, address:r.address, businessLicenseNo:r.businessLicenseNo, certificates:r.certificates, supplyCapacity:r.supplyCapacity, productName:r.productName, materialNameSpec:r.materialNameSpec, materialId:r.materialId||null, materialNumber:r.materialNumber||'', materialName:r.materialName||'', materialSpec:r.materialSpec||'', materialModel:r.materialModel, testQty:r.testQty, testQtyUnit:r.testQtyUnit, testDept:r.testDept, applyDate:r.applyDate||new Date().toISOString().slice(0,10), replyDate:r.replyDate||'', applicant:r.applicant, testerName:r.testerName||'', testerTargetQty:r.testerTargetQty, testerActualQty:r.testerActualQty, testerUsage:r.testerUsage, testerRemark:r.testerRemark, status:r.status, accessResult:r.accessResult, attachments:r.attachments||'', remark:r.remark }
  formTitle.value='编辑NPI申请'; formOpen.value=true
}
async function submitForm(submit){
  if(!form.value.supplierName) return toast.add({title:'供应商名称不能为空', color:'warning'})
  if(!form.value.materialId) return toast.add({title:'请选择金蝶物料（输入料号、名称或规格后点选）', color:'warning'})
  submitting.value=true
  try{
    const payload={ ...form.value, submit }
    if(payload.id){
      await updateNpi(payload)
    } else {
      // 后端 addNpi 已支持 submit:true 建单直达待测试，无需二次 update
      await addNpi(payload)
    }
    toast.add({title: submit ? '已提交送测' : '保存成功', color:'success'})
    formOpen.value=false; await getList(); await loadSummary()
  }catch(e){ toast.add({title:e?.message||'保存失败', color:'error'}) } finally{ submitting.value=false }
}
async function handleSubmit(row){
  if(row.status!=='draft') return
  if(!canEdit.value) return toast.add({title:'无编辑权限', color:'warning'})
  if(!confirm(`确认提交 ${row.npiNo} 送测吗？提交后进入测试链，只能走签批。`)) return
  try{ await updateNpi({ ...row, submit:true }); toast.add({title:'已提交送测', color:'success'}); await getList(); await loadSummary() }
  catch(e){ toast.add({title:e?.message||'提交失败', color:'error'}) }
}
function isStepReached(stepVal){
  const order=['purchaser','tester','ipqc','leader','supervisor','assistant','approve']
  const curMap={draft:'purchaser',testing:'tester',ipqc_review:'ipqc',leader_review:'leader',supervisor_review:'supervisor',assistant_review:'assistant',manager_review:'approve',approved:'approve',rejected:'approve'}
  const cur=curMap[signRow.value?.status]||'purchaser'
  return order.indexOf(stepVal) <= order.indexOf(cur)
}
function handleSign(row){
  if(row.status==='draft') return toast.add({title:'请先提交送测', color:'warning'})
  if(row.status==='approved'||row.status==='rejected') return toast.add({title:'已终审单据不能再签批，请重新发起', color:'warning'})
  if(!canApprove.value) return toast.add({title:'无签批权限', color:'warning'})
  signRow.value=row
  signStep.value=stepFromStatus(row.status)
  if(!signStep.value) return toast.add({title:'当前状态不可签批', color:'warning'})
  signForm.value={ opinion:'', accessResult:'', testerTargetQty:row.testerTargetQty||'', testerActualQty:row.testerActualQty||'', testerUsage:row.testerUsage||'' }
  signOpen.value=true
}
async function submitSign(action){
  if(!signForm.value.opinion) return toast.add({title:'请输入意见', color:'warning'})
  signSubmitting.value=true
  try{
    const payload={ id:signRow.value.id, opinion:signForm.value.opinion, testerTargetQty:signForm.value.testerTargetQty, testerActualQty:signForm.value.testerActualQty, testerUsage:signForm.value.testerUsage }
    if(action==='reject'){
      payload.step='reject'
      if(signStep.value==='approve'){ payload.accessResult='不准入' }
    } else {
      payload.step=signStep.value
      if(signStep.value==='approve'){ payload.accessResult=signForm.value.accessResult }
    }
    await signNpi(payload)
    toast.add({title: action==='approve' ? (signStep.value==='approve' ? '已准入（自动纳入AVL）' : '已提交到下一环节') : '已驳回', color: action==='approve' ? 'success':'warning'})
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
function handleReapply(row){
  materialSearch.value=row.materialNumber||''
  materialOptions.value=[]
  const fresh = blankForm()
  form.value={ ...fresh, supplierName:row.supplierName, contactName:row.contactName, contactPhone:row.contactPhone, contactEmail:row.contactEmail, mainMaterials:row.mainMaterials, address:row.address, businessLicenseNo:row.businessLicenseNo, certificates:row.certificates, supplyCapacity:row.supplyCapacity, productName:row.productName, materialId:row.materialId||null, materialNumber:row.materialNumber||'', materialName:row.materialName||'', materialSpec:row.materialSpec||'', materialModel:row.materialModel, materialNameSpec:row.materialNameSpec, testQty:row.testQty, testQtyUnit:row.testQtyUnit, testDept:row.testDept, remark:row.remark||'' }
  formTitle.value='重新发起NPI申请'; formOpen.value=true
}
async function handleDeleteBatch(){
  if(!selectedIds.value.length) return
  if(!confirm(`确认删除 ${selectedIds.value.length} 条吗？`)) return
  try{ await deleteNpi(selectedIds.value); toast.add({title:'已删除', color:'success'}); selectedIds.value=[]; await getList(); await loadSummary() }catch(e){ toast.add({title:e?.message||'删除失败', color:'error'}) }
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
