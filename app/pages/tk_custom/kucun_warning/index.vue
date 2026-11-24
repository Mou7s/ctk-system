<template>
  <div class="app-container absolute inset-0 flex flex-col gap-2.5 overflow-y-auto bg-default p-3">
    <!-- 顶部标题与全局操作 -->
    <header class="flex shrink-0 flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2.5">
        <div class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <UIcon name="i-lucide-sliders-horizontal" class="size-5" />
        </div>
        <div>
          <h1 class="text-lg font-semibold leading-tight tracking-tight text-highlighted">
            金蝶库存预警中心
          </h1>
          <div class="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted">
            <span class="flex items-center gap-1.5">
              <span class="size-1.5 rounded-full bg-success" />
              从金蝶只读刷新 · 本地快照秒开
            </span>
            <span v-if="lastSyncTime" class="flex items-center gap-1 tabular-nums text-toned">
              <UIcon name="i-lucide-clock-3" class="size-3.5 text-muted" />
              最近同步：{{ lastSyncTime }}
            </span>
          </div>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-1.5">
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          icon="i-lucide-clock"
          @click="handleOpenJobDialog"
        >
          定时播报设置
        </UButton>
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          icon="i-lucide-send"
          @click="handleOpenPushDialog"
        >
          发送预警通知
        </UButton>
        <UButton
          size="sm"
          color="neutral"
          variant="outline"
          icon="i-lucide-download"
          :loading="exporting"
          @click="handleExportExcel"
        >
          导出 Excel
        </UButton>
        <UButton
          size="sm"
          color="neutral"
          variant="outline"
          icon="i-lucide-refresh-cw"
          :loading="syncing"
          @click="handleSyncFromKingdee"
        >
          从金蝶刷新
        </UButton>
      </div>
    </header>

    <!-- 紧凑统计条 -->
    <section
      aria-label="库存预警概览"
      class="flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-lg border border-default bg-elevated/30 px-3.5 py-2"
    >
      <div class="flex flex-wrap items-center gap-x-6 gap-y-1.5">
        <button
          type="button"
          class="flex items-center gap-2 text-left transition-opacity hover:opacity-80"
          @click="selectStatus('')"
        >
          <UIcon name="i-lucide-layers" class="size-4 text-primary" />
          <span class="text-xs text-muted">监控物料</span>
          <span class="text-base font-semibold tabular-nums text-highlighted">{{ warningList.length }}</span>
        </button>

        <div class="h-3.5 w-px bg-default" />

        <button
          type="button"
          class="flex items-center gap-2 text-left transition-opacity hover:opacity-80"
          @click="selectStatus('低于安全库存 (偏低)')"
        >
          <UIcon name="i-lucide-triangle-alert" class="size-4 text-warning" />
          <span class="text-xs text-muted">库存偏低（低于安全库存）</span>
          <span class="text-base font-semibold tabular-nums text-warning">{{ stats.belowSafe }}</span>
        </button>

        <div class="h-3.5 w-px bg-default" />

        <button
          type="button"
          class="flex items-center gap-2 text-left transition-opacity hover:opacity-80"
          @click="selectStatus('正常')"
        >
          <UIcon name="i-lucide-circle-check" class="size-4 text-success" />
          <span class="text-xs text-muted">库存状态正常</span>
          <span class="text-base font-semibold tabular-nums text-success">{{ stats.normal }}</span>
        </button>
      </div>

      <span class="hidden text-xs text-muted lg:inline">
        偏低项优先置顶 · 双击行快速调整安全库存
      </span>
    </section>

    <!-- 主数据区（筛选 + 行操作 + 表格） -->
    <section class="flex min-h-[380px] flex-1 flex-col overflow-hidden rounded-xl border border-default bg-default">
      <!-- 紧凑筛选与行操作栏 -->
      <div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-default px-3 py-2">
        <div class="flex flex-wrap items-center gap-2">
          <!-- 状态快速切换 -->
          <div class="flex items-center gap-0.5 rounded-lg bg-elevated/60 p-0.5">
            <UButton
              v-for="item in statusQuickFilters"
              :key="item.value || 'all'"
              size="xs"
              color="neutral"
              :variant="queryParams.status === item.value ? 'solid' : 'ghost'"
              @click="selectStatus(item.value)"
            >
              {{ item.label }}
            </UButton>
          </div>

          <UInput
            v-model="queryParams.keyword"
            size="sm"
            icon="i-lucide-search"
            placeholder="物料编码或名称"
            clearable
            class="w-48 sm:w-56"
            @keyup.enter="handleQuery"
          />

          <USelect
            v-model="queryParams.category"
            size="sm"
            placeholder="全部类别"
            clearable
            class="w-28 sm:w-32"
            :items="categoryOptions"
          />

          <UButton
            size="sm"
            color="neutral"
            variant="ghost"
            icon="i-lucide-list-restart"
            aria-label="重置筛选"
            title="重置筛选"
            @click="resetQuery"
          >
            重置
          </UButton>
        </div>

        <div class="flex flex-wrap items-center gap-1.5">
          <UButton
            size="sm"
            color="primary"
            icon="i-lucide-plus"
            @click="handleOpenEnableDialog"
          >
            新增预警
          </UButton>
          <UButton
            size="sm"
            color="neutral"
            variant="outline"
            icon="i-lucide-square-pen"
            :disabled="!selectedRow"
            @click="handleUpdate(selectedRow)"
          >
            修改安全库存
          </UButton>
          <UButton
            v-if="selectedRowsList.length > 1"
            size="sm"
            color="neutral"
            variant="subtle"
            icon="i-lucide-list-checks"
            :loading="batchLoading"
            @click="handleBatchSafeStock"
          >
            批量改安全库存（{{ selectedRowsList.length }}）
          </UButton>
          <UButton
            size="sm"
            color="error"
            variant="subtle"
            icon="i-lucide-trash-2"
            :disabled="!selectedRowsList.length"
            :loading="removing"
            @click="selectedRowsList.length > 1 ? handleBatchRemove() : handleRemoveWarning(selectedRow)"
          >
            {{ selectedRowsList.length > 1 ? `批量移除预警（${selectedRowsList.length}）` : '移除预警' }}
          </UButton>
        </div>
      </div>

      <!-- 主数据表格（只读；双击打开编辑） -->
      <TkUTable
        v-model:row-selection="selectedRows"
        sticky
        :loading="loading"
        :data="filteredList"
        :columns="kucunWarningColumns"
        class="min-h-0 flex-1"
        :ui="{
          th: 'bg-elevated/60 py-2 text-xs font-semibold text-highlighted',
          td: 'py-2 text-[13px]'
        }"
        @selection-change="handleSelectionChange"
        @row-open="handleUpdate"
      >
        <template #select-cell="{ row }">
          <UCheckbox
            :model-value="row.getIsSelected()"
            aria-label="选择行"
            @update:model-value="(value) => row.toggleSelected(!!value)"
            @click.stop
          />
        </template>
        <template #materialCode-cell="{ row }">
          <span class="font-mono font-medium text-highlighted">
            {{ row.original.materialCode || '—' }}
          </span>
        </template>
        <template #materialName-cell="{ row }">
          <span
            class="block max-w-xs truncate text-default"
            :title="row.original.materialName || ''"
          >
            {{ row.original.materialName || '—' }}
          </span>
        </template>
        <template #materialCategory-cell="{ row }">
          <UBadge
            size="sm"
            variant="subtle"
            :color="getCategoryBadgeColor(row.original.materialCode)"
          >
            {{ getMaterialCategory(row.original.materialCode) }}
          </UBadge>
        </template>
        <template #actualTotal-cell="{ row }">
          <span :class="getStockClass(row.original)" class="font-mono tabular-nums">
            {{ formatQty(row.original.actualTotal) }}
          </span>
        </template>
        <template #safeStock-cell="{ row }">
          <span class="font-mono tabular-nums text-toned">
            {{ formatQty(row.original.safeStock) }}
          </span>
        </template>
        <template #stockGap-cell="{ row }">
          <span :class="getStockGapClass(row.original)" class="font-mono tabular-nums">
            {{ formatStockGap(row.original) }}
          </span>
        </template>
        <template #warningStatus-cell="{ row }">
          <UBadge
            :color="getBadgeColor(row.original.warningStatus)"
            variant="subtle"
            size="sm"
            :icon="isBelowSafeStatus(row.original.warningStatus) ? 'i-lucide-triangle-alert' : 'i-lucide-circle-check'"
          >
            {{ row.original.warningStatus || '正常' }}
          </UBadge>
        </template>
        <template #stockOrgName-cell="{ row }">
          <span class="text-xs text-muted">
            {{ row.original.stockOrgName || row.original.stockOrgCode || '—' }}
          </span>
        </template>
        <template #empty>
          <div class="flex flex-col items-center justify-center py-12 text-center">
            <UIcon name="i-lucide-inbox" class="mb-2.5 size-9 text-muted" />
            <p class="text-sm font-medium text-highlighted">暂无符合条件的库存预警记录</p>
            <p class="mt-1 text-xs text-muted">可调整筛选条件，或点击「新增预警」/「从金蝶刷新」获取最新快照</p>
          </div>
        </template>
      </TkUTable>

      <!-- 表格底栏 -->
      <footer class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-default bg-elevated/20 px-3 py-1.5 text-xs text-muted">
        <div class="flex items-center gap-3 tabular-nums">
          <span>
            当前显示 <strong class="font-medium text-highlighted">{{ filteredList.length }}</strong> / {{ warningList.length }} 条
          </span>
          <span v-if="selectedRowsList.length" class="text-primary">
            已勾选 {{ selectedRowsList.length }} 条
          </span>
        </div>
        <span>库存差额 = 库存总量 − 安全库存（负值表示缺口）</span>
      </footer>
    </section>

    <!-- 修改安全库存 -->
    <UModal
      v-model:open="editOpen"
      title="修改金蝶安全库存"
      description="保存后将回写金蝶物料资料并刷新本地快照"
      :ui="{ content: 'sm:max-w-lg' }"
    >
      <template #body>
        <UForm :state="editForm" class="space-y-4">
          <div class="rounded-lg border border-default bg-elevated/40 p-3.5 space-y-3">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="font-mono text-sm font-semibold text-highlighted">
                  {{ editForm.materialCode || '—' }}
                </div>
                <div class="mt-0.5 truncate text-xs text-muted" :title="editForm.materialName">
                  {{ editForm.materialName || '—' }}
                </div>
              </div>
              <UBadge
                :color="getBadgeColor(editForm.warningStatus)"
                variant="subtle"
                size="sm"
                class="shrink-0"
              >
                {{ editForm.warningStatus || '—' }}
              </UBadge>
            </div>
            <div class="grid grid-cols-2 gap-2.5 border-t border-default pt-2.5 text-xs">
              <div>
                <div class="text-muted">库存组织</div>
                <div class="mt-0.5 font-medium text-default">
                  {{ editForm.stockOrgName || editForm.stockOrgCode || '—' }}
                </div>
              </div>
              <div>
                <div class="text-muted">当前库存总量</div>
                <div class="mt-0.5 font-mono text-sm font-semibold tabular-nums text-primary">
                  {{ formatQty(editForm.actualTotal) }}
                </div>
              </div>
            </div>
          </div>

          <UFormField label="安全库存" required>
            <UInput
              v-model="editForm.safeStock"
              type="number"
              step="any"
              min="0"
              class="w-full font-mono tabular-nums"
              placeholder="请输入安全库存（≥ 0）"
              @keyup.enter="submitEditForm"
            />
          </UFormField>

          <UAlert
            color="warning"
            variant="soft"
            icon="i-lucide-info"
            title="将回写金蝶物料资料库存计划（BD_MATERIAL.FSafeStock），并同步更新本地快照。"
          />
        </UForm>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" @click="editOpen = false">取消</UButton>
          <UButton color="primary" :loading="editSaving" @click="submitEditForm">保存到金蝶</UButton>
        </div>
      </template>
    </UModal>

    <!-- 推送消息 -->
    <UModal
      v-model:open="pushDialogVisible"
      title="手动推送库存预警"
      description="基于当前本地快照生成 Excel 报表附件并发送至企业微信"
      :ui="{ content: 'sm:max-w-lg' }"
    >
      <template #body>
        <UForm :state="pushForm" class="space-y-4">
          <UFormField
            label="接收对象"
            description="通过企业微信 UserID 发送（支持多选），列表来自本地 wxuser 表。"
          >
            <USelectMenu
              v-model="pushForm.selectedUsers"
              multiple
              filterable
              placeholder="请选择需要接收库存预警的企微成员"
              class="w-full"
              :items="wecomUserOptions"
            />
          </UFormField>

          <div class="rounded-lg border border-default bg-elevated/40 p-3.5 space-y-3">
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-semibold text-highlighted">
                推送报表预览（异常 {{ stats.belowSafe }} 项）
              </span>
              <UBadge color="success" variant="subtle" size="sm" icon="i-lucide-file-spreadsheet">
                Excel 附件
              </UBadge>
            </div>
            <div class="grid grid-cols-3 gap-2 text-center">
              <div class="rounded-md border border-default bg-default px-2.5 py-2">
                <div class="text-[11px] text-muted">监控总数</div>
                <div class="mt-0.5 text-base font-semibold tabular-nums text-highlighted">{{ warningList.length }}</div>
              </div>
              <div class="rounded-md border border-default bg-default px-2.5 py-2">
                <div class="text-[11px] text-muted">库存偏低</div>
                <div class="mt-0.5 text-base font-semibold tabular-nums text-warning">{{ stats.belowSafe }}</div>
              </div>
              <div class="rounded-md border border-default bg-default px-2.5 py-2">
                <div class="text-[11px] text-muted">状态正常</div>
                <div class="mt-0.5 text-base font-semibold tabular-nums text-success">{{ stats.normal }}</div>
              </div>
            </div>
            <p class="text-xs text-muted">
              附件包含「全部监控物料」与「偏低明细」两个工作表。
            </p>
          </div>
        </UForm>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" @click="pushDialogVisible = false">取消</UButton>
          <UButton color="primary" icon="i-lucide-send" :loading="pushing" @click="submitPushForm">立即推送</UButton>
        </div>
      </template>
    </UModal>

    <!-- 定时播报 -->
    <UModal
      v-model:open="jobDialogVisible"
      title="每日定时播报设置"
      description="按设定时间自动将库存预警报表发送至指定企微成员"
      :ui="{ content: 'sm:max-w-md' }"
    >
      <template #body>
        <UForm :state="jobForm" class="space-y-4">
          <div class="flex items-center justify-between rounded-lg border border-default bg-elevated/40 px-3.5 py-2.5">
            <div>
              <div class="text-sm font-medium text-highlighted">每日定时播报</div>
              <div class="text-xs text-muted">开启后系统将每日自动推送预警报表</div>
            </div>
            <div class="flex items-center gap-2.5">
              <UBadge :color="jobForm.enabled ? 'success' : 'neutral'" variant="subtle" size="sm">
                {{ jobForm.enabled ? '已开启' : '已关闭' }}
              </UBadge>
              <USwitch v-model="jobForm.enabled" />
            </div>
          </div>

          <UFormField v-if="jobForm.enabled" label="播报时间" required>
            <UInput v-model="jobForm.time" type="time" icon="i-lucide-clock" class="w-full font-mono tabular-nums" />
          </UFormField>

          <UFormField label="接收对象" description="支持多选企微成员。">
            <USelectMenu
              v-model="jobForm.selectedUsers"
              multiple
              filterable
              placeholder="请选择接收库存预警的企微成员"
              class="w-full"
              :items="wecomUserOptions"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" @click="jobDialogVisible = false">取消</UButton>
          <UButton color="primary" :loading="jobSaving" @click="submitJobForm">保存设置</UButton>
        </div>
      </template>
    </UModal>

    <!-- 新增预警 -->
    <UModal
      v-model:open="enableDialogVisible"
      title="新增物料预警"
      description="检索金蝶已审核未禁用物料，开启安全库存预警并设置阈值"
      :ui="{ content: 'sm:max-w-lg' }"
    >
      <template #body>
        <UForm :state="enableForm" class="space-y-4">
          <UFormField label="金蝶物料" required>
            <div class="relative">
              <UInput
                v-model="materialSearch"
                placeholder="输入物料编码或名称搜索（已审核未禁用）"
                class="w-full"
                icon="i-lucide-search"
                clearable
                @update:model-value="handleMaterialSearchInput"
              />
              <div
                v-if="materialOptions.length"
                class="absolute z-30 mt-1 max-h-60 w-full divide-y divide-default overflow-auto rounded-lg border border-default bg-default shadow-lg"
              >
                <button
                  v-for="item in materialOptions"
                  :key="item.id || item.value"
                  type="button"
                  class="block w-full px-3 py-2 text-left transition-colors hover:bg-elevated/70"
                  @click="onMaterialSelect(item)"
                >
                  <div class="flex items-center justify-between gap-2">
                    <span class="font-mono text-sm font-medium text-highlighted">{{ item.value }}</span>
                    <UBadge v-if="item.enableSafeStock" color="warning" variant="subtle" size="xs">
                      已开启 · 安全库存 {{ formatQty(item.safeStock) }}
                    </UBadge>
                  </div>
                  <div class="mt-0.5 truncate text-xs text-muted">
                    {{ item.name || '—' }}<span v-if="item.spec"> / {{ item.spec }}</span><span v-if="item.unitName">（{{ item.unitName }}）</span>
                  </div>
                </button>
              </div>
              <div
                v-else-if="materialSearching"
                class="mt-1.5 flex items-center gap-1.5 text-xs text-muted"
              >
                <UIcon name="i-lucide-loader-circle" class="size-3.5 animate-spin" />
                正在搜索金蝶物料…
              </div>
              <div
                v-else-if="materialSearchEmpty"
                class="mt-1.5 text-xs text-muted"
              >
                未找到匹配的已审核未禁用物料
              </div>
            </div>

            <!-- 已选物料摘要 -->
            <div
              v-if="enableForm.material"
              class="mt-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="font-mono font-semibold text-highlighted">{{ enableForm.material.value }}</span>
                <UBadge v-if="enableForm.material.enableSafeStock" color="warning" variant="subtle" size="xs">
                  原安全库存 {{ formatQty(enableForm.material.safeStock) }}
                </UBadge>
                <UBadge v-else color="primary" variant="subtle" size="xs">
                  已选中
                </UBadge>
              </div>
              <div class="mt-0.5 truncate text-muted">
                {{ enableForm.material.name || '—' }}<span v-if="enableForm.material.spec"> / {{ enableForm.material.spec }}</span><span v-if="enableForm.material.unitName">（{{ enableForm.material.unitName }}）</span>
              </div>
            </div>
          </UFormField>

          <UFormField label="安全库存" required>
            <UInput
              v-model="enableForm.safeStock"
              type="number"
              step="any"
              min="0"
              class="w-full font-mono tabular-nums"
              placeholder="请输入安全库存（≥ 0）"
              @keyup.enter="submitEnableForm"
            />
          </UFormField>

          <UAlert
            color="warning"
            variant="soft"
            icon="i-lucide-info"
            title="将在金蝶开启该物料的安全库存预警开关并写入安全库存（回读校验），随后物料将出现在本列表。"
          />
        </UForm>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" @click="enableDialogVisible = false">取消</UButton>
          <UButton color="primary" :loading="enableSaving" :disabled="!enableForm.material" @click="submitEnableForm">
            保存并开启预警
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- 批量改安全库存 -->
    <UModal
      v-model:open="batchDialogVisible"
      title="批量修改安全库存"
      description="统一设置已选物料的安全库存并逐条写回金蝶"
      :ui="{ content: 'sm:max-w-md' }"
    >
      <template #body>
        <UForm :state="batchForm" class="space-y-4">
          <div class="rounded-lg border border-default bg-elevated/40 p-3.5 space-y-2">
            <div class="flex items-center justify-between text-xs">
              <span class="text-muted">待修改物料范围</span>
              <UBadge color="primary" variant="subtle" size="xs">
                共 {{ selectedRowsList.length }} 项
              </UBadge>
            </div>
            <div class="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto pt-0.5">
              <span
                v-for="r in selectedRowsList"
                :key="rowKey(r)"
                class="rounded border border-default bg-default px-1.5 py-0.5 font-mono text-[11px] text-default"
              >
                {{ r.materialCode }}
              </span>
            </div>
          </div>

          <UFormField label="统一安全库存" required>
            <UInput
              v-model="batchForm.safeStock"
              type="number"
              step="any"
              min="0"
              class="w-full font-mono tabular-nums"
              placeholder="请输入安全库存（≥ 0）"
              @keyup.enter="submitBatchSafeStock"
            />
          </UFormField>

          <UAlert
            color="warning"
            variant="soft"
            icon="i-lucide-info"
            title="每条独立写金蝶并回读校验；失败项不影响其他条目，完成后逐条反馈结果。"
          />
        </UForm>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" @click="batchDialogVisible = false">取消</UButton>
          <UButton color="primary" :loading="batchLoading" @click="submitBatchSafeStock">批量保存</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script>
function nuxtMsg(message, color = 'neutral') {
  const t = typeof window !== 'undefined' ? window.__nuxt_ui_toast__ : null
  if (t) t.add({ title: String(message), color, duration: 4000 })
}
</script>

<script setup name="kucun_warning">
import { TkUTable } from '@ctk-system/ui'
import { h, resolveComponent } from 'vue'

const { proxy } = getCurrentInstance()

const loading = ref(false)
const syncing = ref(false)
const exporting = ref(false)
const removing = ref(false)
const pushing = ref(false)
const pushDialogVisible = ref(false)
const lastSyncTime = ref('')
const selectedRows = ref({})
const selectedRow = ref(null)

const editOpen = ref(false)
const editSaving = ref(false)
const editForm = reactive({
  materialCode: '',
  materialName: '',
  stockOrgCode: '',
  stockOrgName: '',
  actualTotal: 0,
  warningStatus: '',
  safeStock: 0
})

const jobDialogVisible = ref(false)
const jobSaving = ref(false)
const jobForm = reactive({
  enabled: true,
  time: '09:00',
  selectedUsers: []
})

const warningList = ref([])
const wecomUsers = ref([])

const queryParams = reactive({
  keyword: '',
  status: '',
  category: ''
})

const stats = reactive({
  belowSafe: 0,
  normal: 0
})

const pushForm = reactive({
  selectedUsers: []
})

const statusQuickFilters = [
  { label: '全部', value: '' },
  { label: '偏低预警', value: '低于安全库存 (偏低)' },
  { label: '正常', value: '正常' }
]

const categoryOptions = [
  { label: '黑胶', value: '黑胶' },
  { label: '框架', value: '框架' },
  { label: '其他', value: '其他' }
]

const wecomUserOptions = computed(() =>
  wecomUsers.value.map((u) => ({ label: `${u.name} (${u.userid})`, value: u.userid }))
)

const UCheckbox = resolveComponent('UCheckbox')

const kucunWarningColumns = [
  {
    id: 'select',
    header: ({ table }) =>
      h(UCheckbox, {
        modelValue: table.getIsAllPageRowsSelected(),
        'onUpdate:modelValue': (value) => table.toggleAllPageRowsSelected(!!value),
        onClick: (e) => e.stopPropagation(),
        ariaLabel: '全选'
      }),
    cell: ({ row }) =>
      h(UCheckbox, {
        modelValue: row.getIsSelected(),
        'onUpdate:modelValue': (value) => row.toggleSelected(!!value),
        onClick: (e) => e.stopPropagation(),
        ariaLabel: '选择行'
      }),
    enableSorting: false,
    enableHiding: false,
    meta: { class: { td: 'w-10', th: 'w-10' } }
  },
  { accessorKey: 'materialCode', header: '物料编码' },
  { accessorKey: 'materialName', header: '物料名称' },
  { accessorKey: 'materialCategory', header: '类别' },
  {
    accessorKey: 'actualTotal',
    header: '库存总量',
    meta: { class: { th: 'text-right', td: 'text-right' } }
  },
  {
    accessorKey: 'safeStock',
    header: '安全库存',
    meta: { class: { th: 'text-right', td: 'text-right' } }
  },
  {
    id: 'stockGap',
    header: '库存差额',
    meta: { class: { th: 'text-right', td: 'text-right' } }
  },
  { accessorKey: 'warningStatus', header: '预警状态' },
  { accessorKey: 'stockOrgName', header: '库存组织' }
]

const filteredList = computed(() => {
  return warningList.value
    .filter((item) => {
      const keyword = queryParams.keyword.trim().toLowerCase()
      const keywordMatch =
        !keyword ||
        String(item.materialCode || '').toLowerCase().includes(keyword) ||
        String(item.materialName || '').toLowerCase().includes(keyword)
      const statusMatch = !queryParams.status || item.warningStatus === queryParams.status
      const categoryMatch = !queryParams.category || getMaterialCategory(item.materialCode) === queryParams.category
      return keywordMatch && statusMatch && categoryMatch
    })
    .slice()
    .sort((a, b) => {
      const aAbnormal = String(a.warningStatus || '') !== '正常' ? 0 : 1
      const bAbnormal = String(b.warningStatus || '') !== '正常' ? 0 : 1
      if (aAbnormal !== bAbnormal) return aAbnormal - bAbnormal
      return String(a.materialCode || '').localeCompare(String(b.materialCode || ''))
    })
})

function rowKey(row) {
  return `${row?.materialCode || ''}__${row?.stockOrgCode || ''}`
}

function handleSelectionChange(selection) {
  // 复选列支持多选；工具栏按钮（修改/移除）只对恰好一行时可用，语义与旧单选一致
  selectedRow.value = selection?.length === 1 ? selection[0] : null
  selectedRowsList.value = selection || []
}

// ---- 新增预警 ----
const enableDialogVisible = ref(false)
const enableSaving = ref(false)
const enableForm = reactive({ material: null, safeStock: '' })
const materialOptions = ref([])
const materialSearch = ref('')
const materialSearching = ref(false)
const materialSearchEmpty = ref(false)
let materialSearchSeq = 0
let materialSearchTimer = null

async function loadMaterialOptions(keyword) {
  const seq = ++materialSearchSeq
  materialSearching.value = true
  materialSearchEmpty.value = false
  try {
    const res = await searchWarningMaterials({ keyword, limit: 50 })
    if (seq !== materialSearchSeq) return
    if (res.code !== 200) {
      materialOptions.value = []
      materialSearchEmpty.value = true
      return
    }
    materialOptions.value = (res.data || []).map((item) => ({
      id: item.id,
      label: `${item.number} ${item.name}`.trim(),
      value: item.number,
      name: item.name,
      spec: item.spec,
      unitName: item.unitName || '',
      safeStock: item.safeStock ?? 0,
      enableSafeStock: Boolean(item.enableSafeStock),
    })).filter((item) => item.value)
    materialSearchEmpty.value = materialOptions.value.length === 0
  } catch {
    if (seq === materialSearchSeq) {
      materialOptions.value = []
      materialSearchEmpty.value = true
    }
  } finally {
    if (seq === materialSearchSeq) materialSearching.value = false
  }
}

function handleMaterialSearchInput(value) {
  const keyword = String(value || '').trim()
  if (keyword === enableForm.material?.value) {
    materialOptions.value = []
    materialSearchEmpty.value = false
    return
  }
  enableForm.material = null
  materialOptions.value = []
  materialSearchEmpty.value = false
  clearTimeout(materialSearchTimer)
  if (!keyword) {
    materialSearching.value = false
    return
  }
  materialSearchTimer = setTimeout(() => loadMaterialOptions(keyword), 250)
}

function onMaterialSelect(item) {
  enableForm.material = item
  materialSearch.value = item.value
  materialOptions.value = []
  materialSearchEmpty.value = false
  if (item.enableSafeStock && (enableForm.safeStock === '' || enableForm.safeStock === null)) {
    enableForm.safeStock = String(item.safeStock ?? '')
  }
}

function handleOpenEnableDialog() {
  enableForm.material = null
  enableForm.safeStock = ''
  materialSearch.value = ''
  materialOptions.value = []
  materialSearching.value = false
  materialSearchEmpty.value = false
  enableDialogVisible.value = true
}

const selectedRowsList = ref([])
const batchDialogVisible = ref(false)
const batchLoading = ref(false)
const batchForm = reactive({ safeStock: '' })

async function submitEnableForm() {
  if (!enableForm.material?.value) {
    nuxtMsg('请先选择金蝶物料', 'warning')
    return
  }
  const next = Number(enableForm.safeStock)
  if (Number.isNaN(next) || next < 0) {
    nuxtMsg('请输入有效的安全库存（≥0）', 'warning')
    return
  }
  enableSaving.value = true
  try {
    const res = await enableWarning({
      materialCode: enableForm.material.value,
      stockOrgCode: '100',
      safeStock: next,
    })
    if (res.code === 200) {
      nuxtMsg(`已开启 ${enableForm.material.value} 的库存预警（安全库存 ${next}）`, 'success')
      enableDialogVisible.value = false
      await getWarningList()
    } else {
      nuxtMsg(res.msg || '新增预警失败', 'error')
    }
  } catch (err) {
    nuxtMsg(err?.message || '新增预警请求失败', 'error')
  } finally {
    enableSaving.value = false
  }
}

// ---- 批量操作 ----
function handleBatchSafeStock() {
  if (selectedRowsList.value.length < 2) return
  batchForm.safeStock = ''
  batchDialogVisible.value = true
}

async function submitBatchSafeStock() {
  const next = Number(batchForm.safeStock)
  if (Number.isNaN(next) || next < 0) {
    nuxtMsg('请输入有效的安全库存（≥0）', 'warning')
    return
  }
  batchLoading.value = true
  try {
    const res = await batchWarning({
      action: 'safeStock',
      items: selectedRowsList.value.map((row) => ({
        materialCode: row.materialCode,
        stockOrgCode: row.stockOrgCode || '100',
        safeStock: next,
      })),
    })
    if (res.code === 200) {
      const fails = (res.data?.results || []).filter((r) => !r.ok)
      if (fails.length) {
        nuxtMsg(`${res.data?.summary || '批量完成'}；失败：${fails.map((f) => `${f.materialCode}（${f.error}）`).join('、')}`, 'warning')
      } else {
        nuxtMsg(res.data?.summary || '批量保存成功', 'success')
      }
      batchDialogVisible.value = false
      await getWarningList()
    } else {
      nuxtMsg(res.msg || '批量保存失败', 'error')
    }
  } catch (err) {
    nuxtMsg(err?.message || '批量保存请求失败', 'error')
  } finally {
    batchLoading.value = false
  }
}

async function handleBatchRemove() {
  const rows = selectedRowsList.value
  if (rows.length < 2) return
  try {
    await useModalConfirm().confirm(
      `确认移除以下 ${rows.length} 个物料的库存预警？\n将关闭金蝶安全库存预警开关并从本列表删除。\n${rows.map((r) => r.materialCode).join('、')}`,
      '批量移除预警',
      { confirmButtonText: '确认移除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  removing.value = true
  try {
    const res = await batchWarning({
      action: 'remove',
      items: rows.map((row) => ({
        materialCode: row.materialCode,
        stockOrgCode: row.stockOrgCode || '100',
      })),
    })
    if (res.code === 200) {
      const fails = (res.data?.results || []).filter((r) => !r.ok)
      if (fails.length) {
        nuxtMsg(`${res.data?.summary || '批量完成'}；失败：${fails.map((f) => `${f.materialCode}（${f.error}）`).join('、')}`, 'warning')
      } else {
        nuxtMsg(res.data?.summary || '批量移除成功', 'success')
      }
      await getWarningList()
    } else {
      nuxtMsg(res.msg || '批量移除失败', 'error')
    }
  } catch (err) {
    nuxtMsg(err?.message || '批量移除请求失败', 'error')
  } finally {
    removing.value = false
  }
}

function isBelowSafeStatus(status) {
  if (!status) return false
  const text = String(status)
  return text.includes('安全') || text.includes('偏低')
}

function getBadgeColor(status) {
  return isBelowSafeStatus(status) ? 'warning' : 'success'
}

function getMaterialCategory(materialCode) {
  const code = String(materialCode || '').trim().toUpperCase()
  if (code.startsWith('N103')) return '黑胶'
  if (code.startsWith('N105')) return '框架'
  return '其他'
}

function getCategoryBadgeColor(materialCode) {
  const cat = getMaterialCategory(materialCode)
  if (cat === '黑胶') return 'primary'
  if (cat === '框架') return 'info'
  return 'neutral'
}

function getStockClass(row) {
  if (!row?.warningStatus) return 'text-highlighted'
  if (isBelowSafeStatus(row.warningStatus)) {
    return 'text-warning font-semibold'
  }
  return 'text-highlighted font-medium'
}

function getStockGap(row) {
  if (row?.actualTotal === null || row?.actualTotal === undefined || row?.actualTotal === '') return null
  if (row?.safeStock === null || row?.safeStock === undefined || row?.safeStock === '') return null
  const actual = Number(row.actualTotal)
  const safe = Number(row.safeStock)
  if (Number.isNaN(actual) || Number.isNaN(safe)) return null
  return actual - safe
}

function formatStockGap(row) {
  const gap = getStockGap(row)
  if (gap === null) return '—'
  if (gap === 0) return '0'
  const sign = gap > 0 ? '+' : '-'
  return `${sign}${formatQty(Math.abs(gap))}`
}

function getStockGapClass(row) {
  const gap = getStockGap(row)
  if (gap === null) return 'text-muted'
  if (gap < 0) return 'text-error font-semibold'
  if (gap > 0) return 'text-success font-medium'
  return 'text-muted'
}

function selectStatus(value) {
  queryParams.status = value
}

function formatQty(value) {
  if (value === null || value === undefined || value === '') return '-'
  const n = Number(value)
  if (Number.isNaN(n)) return String(value)
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 })
}

function formatSyncTime(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function handleQuery() {
  // filteredList 响应式过滤
}

function resetQuery() {
  queryParams.keyword = ''
  queryParams.status = ''
  queryParams.category = ''
}

async function getWarningList() {
  loading.value = true
  try {
    const res = await listWarnings()
    if (res.code === 200) {
      warningList.value = res.data || []
      selectedRows.value = {}
      selectedRow.value = null
      const first = warningList.value[0]
      if (first?.syncTime) {
        lastSyncTime.value = formatSyncTime(first.syncTime)
      } else {
        await loadSyncTime()
      }
      calculateStats()
    } else {
      nuxtMsg(res.msg || '获取库存预警数据失败', 'error')
    }
  } catch (_) {
    nuxtMsg('请求接口异常', 'error')
  } finally {
    loading.value = false
  }
}

async function loadSyncTime() {
  try {
    const res = await getWarningSyncTime()
    if (res.code === 200 && res.data) {
      lastSyncTime.value = formatSyncTime(res.data)
    }
  } catch (_) { /* ignore */ }
}

function calculateStats() {
  stats.belowSafe = 0
  stats.normal = 0
  warningList.value.forEach((item) => {
    const status = String(item.warningStatus || '')
    if (status.includes('安全') || status.includes('偏低')) stats.belowSafe++
    else stats.normal++
  })
}

/** 双击行 / 工具栏修改：打开编辑弹窗（保存时写金蝶并回读校验）。 */
function handleUpdate(row) {
  const target = row || selectedRow.value
  if (!target) {
    nuxtMsg('请先选择一条记录', 'warning')
    return
  }
  editForm.materialCode = target.materialCode || ''
  editForm.materialName = target.materialName || ''
  editForm.stockOrgCode = target.stockOrgCode || ''
  editForm.stockOrgName = target.stockOrgName || ''
  editForm.actualTotal = target.actualTotal ?? 0
  editForm.warningStatus = target.warningStatus || ''
  editForm.safeStock = target.safeStock ?? 0
  editOpen.value = true
}

async function submitEditForm() {
  const next = Number(editForm.safeStock)
  if (Number.isNaN(next) || next < 0) {
    nuxtMsg('请输入有效的安全库存（≥0）', 'warning')
    return
  }
  if (!editForm.materialCode || !editForm.stockOrgCode) {
    nuxtMsg('物料或库存组织缺失，无法回写金蝶', 'error')
    return
  }
  editSaving.value = true
  try {
    const res = await updateWarningSafeStock({
      materialCode: editForm.materialCode,
      stockOrgCode: editForm.stockOrgCode,
      safeStock: next
    })
    if (res.code === 200) {
      const data = res.data || {}
      const key = rowKey(editForm)
      const idx = warningList.value.findIndex((x) => rowKey(x) === key)
      if (idx >= 0) {
        warningList.value[idx] = {
          ...warningList.value[idx],
          safeStock: data.safeStock ?? next,
          warningStatus: data.warningStatus || warningList.value[idx].warningStatus,
          safeWarningEnabled: data.safeWarningEnabled ?? true
        }
        warningList.value = warningList.value.slice()
      }
      calculateStats()
      editOpen.value = false
      nuxtMsg('已写入金蝶安全库存', 'success')
    } else {
      nuxtMsg(res.msg || '修改失败', 'error')
    }
  } catch (err) {
    nuxtMsg(err?.message || '修改安全库存请求失败', 'error')
  } finally {
    editSaving.value = false
  }
}

/** 移除预警：关闭金蝶安全库存预警开关 + 删除本地快照，后续同步不再出现 */
async function handleRemoveWarning(row) {
  const target = row || selectedRow.value
  if (!target) {
    nuxtMsg('请先选择一条记录', 'warning')
    return
  }
  if (!target.materialCode || !target.stockOrgCode) {
    nuxtMsg('物料或库存组织缺失，无法移除', 'error')
    return
  }
  try {
    await useModalConfirm().confirm(
      `确认移除物料「${target.materialCode}」的库存预警？\n将关闭金蝶安全库存预警开关，并从本列表删除（不再采购可用）。`,
      '移除库存预警',
      { confirmButtonText: '确认移除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  removing.value = true
  try {
    const res = await removeWarning({
      materialCode: target.materialCode,
      stockOrgCode: target.stockOrgCode
    })
    if (res.code === 200) {
      const key = rowKey(target)
      warningList.value = warningList.value.filter((x) => rowKey(x) !== key)
      selectedRows.value = {}
      selectedRow.value = null
      calculateStats()
      nuxtMsg(`已移除 ${target.materialCode} 的库存预警`, 'success')
    } else {
      nuxtMsg(res.msg || '移除失败', 'error')
    }
  } catch (err) {
    nuxtMsg(err?.message || '移除库存预警请求失败', 'error')
  } finally {
    removing.value = false
  }
}

function handleExportExcel() {
  exporting.value = true
  const date = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const name = `金蝶库存预警报表_${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.xlsx`
  proxy.download('tk_custom/kucun/warnings/export', {}, name)
    .catch(() => nuxtMsg('导出失败', 'error'))
    .finally(() => { exporting.value = false })
}

async function handleSyncFromKingdee() {
  syncing.value = true
  try {
    const res = await syncWarnings()
    if (res.code === 200) {
      nuxtMsg(`已从金蝶同步 ${res.data?.rows ?? 0} 条`, 'success')
      if (res.data?.syncTime) lastSyncTime.value = formatSyncTime(res.data.syncTime)
      await getWarningList()
    } else {
      nuxtMsg(res.msg || '同步失败', 'error')
    }
  } catch (_) {
    nuxtMsg('同步请求异常（金蝶可能超时）', 'error')
  } finally {
    syncing.value = false
  }
}

async function loadWecomUsers() {
  try {
    const res = await getWecomUsers()
    if (res.code === 200) wecomUsers.value = res.data || []
  } catch (err) {
    console.error('获取企微成员失败', err)
  }
}

function handleOpenPushDialog() {
  const savedUsers = localStorage.getItem('tk_kucun_push_selectedUsers')
  pushForm.selectedUsers = savedUsers ? JSON.parse(savedUsers) : []
  pushDialogVisible.value = true
}

function submitPushForm() {
  if (!pushForm.selectedUsers?.length) {
    nuxtMsg('请选择至少一个企微接收人', 'warning')
    return
  }
  pushing.value = true
  sendWarningMsg({ receiverIds: pushForm.selectedUsers.join(',') })
    .then((res) => {
      if (res.code === 200) {
        const data = res.data || {}
        if (data.skipped) {
          nuxtMsg(data.skipped, 'warning')
        } else {
          nuxtMsg(data.message || '消息推送成功！', 'success')
          localStorage.setItem('tk_kucun_push_selectedUsers', JSON.stringify(pushForm.selectedUsers))
          pushDialogVisible.value = false
        }
      } else {
        nuxtMsg(res.msg || '消息发送失败', 'error')
      }
    })
    .catch(() => nuxtMsg('发送请求失败', 'error'))
    .finally(() => { pushing.value = false })
}

async function handleOpenJobDialog() {
  loading.value = true
  try {
    const res = await getWarningJob()
    if (res.code === 200) {
      jobForm.enabled = Boolean(res.data.enabled)
      const h = String(res.data.hour ?? 8).padStart(2, '0')
      const m = String(res.data.minute ?? 0).padStart(2, '0')
      jobForm.time = `${h}:${m}`
      jobForm.selectedUsers = res.data.receivers ? res.data.receivers.split(',').filter(Boolean) : []
      jobDialogVisible.value = true
    } else {
      nuxtMsg(res.msg || '获取定时播报配置失败', 'error')
    }
  } catch (_) {
    nuxtMsg('获取定时播报配置出错', 'error')
  } finally {
    loading.value = false
  }
}

async function submitJobForm() {
  if (jobForm.enabled && !jobForm.time) {
    nuxtMsg('请选择播报时间', 'warning')
    return
  }
  jobSaving.value = true
  try {
    const timeParts = jobForm.time ? jobForm.time.split(':') : ['08', '00']
    const res = await saveWarningJob({
      enabled: jobForm.enabled,
      hour: parseInt(timeParts[0], 10),
      minute: parseInt(timeParts[1], 10),
      receivers: jobForm.selectedUsers.join(',')
    })
    if (res.code === 200) {
      nuxtMsg('定时播报设置保存成功', 'success')
      jobDialogVisible.value = false
    } else {
      nuxtMsg(res.msg || '保存定时播报配置失败', 'error')
    }
  } catch (_) {
    nuxtMsg('保存定时播报配置请求出错', 'error')
  } finally {
    jobSaving.value = false
  }
}

onMounted(() => {
  getWarningList()
  loadWecomUsers()
})
</script>
