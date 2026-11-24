<template>
  <div class="app-container wf-export-page">
    <UCard shadow="never" class="export-card">
      <template #header>
        <div class="card-header">
          <div>
            <h2 class="page-title">外发上锡导出</h2>
            <p class="page-desc">输入外发单号后自动预检，一键导出上锡明细 Excel</p>
          </div>
        </div>
      </template>

      <div class="export-panel">
        <label class="field-label" for="wf-bill-input">外发单号</label>
        <UTextarea
          id="wf-bill-input"
          v-model="inputRaw"
          :rows="5"
          placeholder="支持 &、换行、空格、逗号分隔。例如：&#10;WWFC1301&WWFC1302&#10;或粘贴：WWFC1301 WWFC1302"
          class="bill-input"
          @input="handleInputChange"
        />

        <div v-if="parsedBills.length" class="bill-tags">
          <span class="bill-tags__label">已识别 {{ parsedBills.length }} 个单号</span>
          <span v-if="previewLoading" class="preview-status">正在查询金蝶…</span>
          <span v-else-if="isPreviewFresh" class="preview-status preview-status--ready">
            可导出 {{ previewData.rowCount }} 行
          </span>
          <span v-else-if="previewError" class="preview-status preview-status--error">
            {{ previewError }}
          </span>
          <UBadge
            v-for="bill in parsedBills"
            :key="bill"
            size="small"
            :color="bill.startsWith('WWJS') ? 'warning' : 'neutral'"
            variant="outline"
          >
            {{ bill }}
          </UBadge>
        </div>
        <UAlert
          v-if="invalidBills.length"
          color="error"
          :close="false"
          show-icon
          class="field-alert"
          :title="`以下单号格式不正确：${invalidBills.join('、')}`"
        />

        <div class="export-actions">
          <UButton
            color="primary"
            :loading="previewLoading || exportLoading"
            :disabled="!canPreview"
            @click="handleExport"
          >
            {{ previewLoading && !isPreviewFresh ? "查询中…" : "导出 Excel" }}
          </UButton>
          <UButton
            v-if="canPreview"
            :loading="previewLoading"
            :disabled="exportLoading"
            @click="runPreview({ silent: false, force: true })"
          >
            重新查询
          </UButton>
          <UButton :disabled="!inputRaw || previewLoading || exportLoading" @click="resetInput">清空</UButton>
        </div>

        <details class="help-collapse" :open="helpOpen">
          <summary class="help-summary" style="cursor: pointer; font-weight: bold; margin-bottom: 8px;">使用说明</summary>
          <ul class="help-list">
            <li><strong>WWFC 等发出单</strong>：直接查询外发工序发出明细。</li>
            <li><strong>WWJS 接收单</strong>：系统会先反查对应的发出单，再汇总导出。</li>
            <li>支持从 Excel / 微信粘贴，换行或空格会自动识别为多个单号。</li>
            <li>输入有效单号后会自动预检；确认下方结果无误后，点「导出 Excel」即可。</li>
            <li>需要账号具备 <code>plating_clerk</code> 角色权限。</li>
          </ul>
        </details>
      </div>
    </UCard>

    <UCard v-if="previewData" shadow="never" class="preview-card">
      <template #header>
        <div class="preview-header">
          <span>预检结果</span>
          <UBadge color="success" variant="outline">可导出 {{ previewData.rowCount }} 行</UBadge>
        </div>
      </template>

      <UAlert
        v-for="(warning, idx) in previewData.warnings || []"
        :key="idx"
        color="warning"
        :close="false"
        show-icon
        class="field-alert"
        :title="warning"
      />

      <div class="preview-stats">
        <div class="stat-item">
          <span class="stat-label">输入单号</span>
          <strong>{{ previewData.inputCount }}</strong>
        </div>
        <div class="stat-item">
          <span class="stat-label">发出单号</span>
          <strong>{{ previewData.sendBillCount }}</strong>
        </div>
        <div class="stat-item">
          <span class="stat-label">明细行数</span>
          <strong>{{ previewData.rowCount }}</strong>
        </div>
        <div class="stat-item" v-if="previewData.supplier">
          <span class="stat-label">供应商</span>
          <strong>{{ previewData.supplier }}</strong>
        </div>
      </div>

      <div v-if="previewData.mappings?.length" class="mapping-block">
        <div class="block-title">单号解析</div>
        <div v-for="item in previewData.mappings" :key="item.inputBill" class="mapping-row">
          <UBadge size="small" :color="item.type === 'RECEIVE' ? 'warning' : 'neutral'" variant="outline">
            {{ item.inputBill }}
          </UBadge>
          <UIcon name="i-lucide-arrow-right" class="size-4" />
          <span class="mapping-target">
            {{ item.resolvedBills?.length ? item.resolvedBills.join("、") : "未反查到发出单" }}
          </span>
        </div>
      </div>

      <div v-if="previewData.samples?.length" class="sample-block">
        <div class="block-title">数据样例（前 {{ previewData.samples.length }} 行）</div>
        <TkUTable :data="previewData.samples" :columns="columns" :interactive="false" class="sample-table" />
      </div>
    </UCard>

    <UCard v-if="historyList.length" shadow="never" class="history-card">
      <template #header>
        <div class="history-header">
          <span>导出记录</span>
          <UButton variant="ghost" size="sm" @click="clearHistory">清空</UButton>
        </div>
      </template>
      <div class="relative border-l border-gray-200 dark:border-gray-800 ml-4 space-y-6">
        <div
          v-for="(item, idx) in historyList"
          :key="idx"
          class="relative pl-6"
        >
          <!-- Timeline dot -->
          <span
            class="absolute -left-2 top-1.5 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-[var(--ui-bg)]"
            :class="item.success ? 'bg-emerald-500' : 'bg-red-500'"
          >
          </span>
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div>
              <div class="text-xs text-(--ui-text-dimmed)">{{ item.time }}</div>
              <div class="text-sm mt-1 text-(--ui-text-highlighted) font-medium break-all pr-4">{{ item.billNos }}</div>
              <div class="mt-1 flex items-center gap-1.5">
                <span
                  class="inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset"
                  :class="item.success ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20' : 'bg-red-500/10 text-red-400 ring-red-500/20'"
                >
                  {{ item.success ? "成功" : "失败" }}
                </span>
              </div>
            </div>
            <div class="flex items-center shrink-0">
              <UButton
                v-if="item.billNos"
                variant="ghost"
                color="primary"
                size="sm"
                @click="reuseHistory(item.billNos)"
              >
                回填
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </UCard>

  </div>
</template>

<script setup name="wfExport">
import {
  normalizeBillInput,
  findInvalidBillNos,
  joinBillNos,
  loadWfExportHistory,
  saveWfExportHistory,
  clearWfExportHistory as clearWfHistoryStorage
} from "@/utils/wfExport";
const toast = useToast();

const { proxy } = getCurrentInstance();

const inputRaw = ref("");
const parsedBills = ref([]);
const invalidBills = ref([]);
const previewLoading = ref(false);
const exportLoading = ref(false);
const previewData = ref(null);
const previewError = ref("");
const previewBillKey = ref("");
const helpOpen = ref([]);
const historyList = ref(loadWfExportHistory());

let previewTimer = null;
const PREVIEW_DEBOUNCE_MS = 600;

const canPreview = computed(() => parsedBills.value.length > 0 && invalidBills.value.length === 0);
const currentBillKey = computed(() => (canPreview.value ? joinBillNos(parsedBills.value) : ""));
const isPreviewFresh = computed(
  () => !!previewData.value?.rowCount && previewBillKey.value === currentBillKey.value
);

function syncParsedBills() {
  parsedBills.value = normalizeBillInput(inputRaw.value);
  invalidBills.value = findInvalidBillNos(parsedBills.value);
  previewData.value = null;
  previewError.value = "";
  previewBillKey.value = "";
  scheduleAutoPreview();
}

function handleInputChange() {
  syncParsedBills();
}

function scheduleAutoPreview() {
  if (previewTimer) {
    clearTimeout(previewTimer);
    previewTimer = null;
  }
  if (!canPreview.value) {
    return;
  }
  previewTimer = setTimeout(() => {
    previewTimer = null;
    runPreview({ silent: true });
  }, PREVIEW_DEBOUNCE_MS);
}

function resetInput() {
  inputRaw.value = "";
  syncParsedBills();
}

function reuseHistory(billNos) {
  inputRaw.value = billNos;
  syncParsedBills();
}

function addHistory(billNos, success) {
  saveWfExportHistory({
    billNos,
    success,
    time: new Date().toLocaleString("zh-CN")
  });
  historyList.value = loadWfExportHistory();
}

function clearHistory() {
  clearWfHistoryStorage();
  historyList.value = [];
}

async function runPreview({ silent = false, force = false } = {}) {
  if (!canPreview.value) {
    return false;
  }
  const billKey = currentBillKey.value;
  if (!force && isPreviewFresh.value) {
    return true;
  }
  previewLoading.value = true;
  previewError.value = "";
  try {
    const res = await previewWfExport(billKey);
    if (res.code === 200 && res.data?.rowCount) {
      previewData.value = res.data;
      previewBillKey.value = billKey;
      if (!silent) {
        toast.add({ title: `查询成功，共 ${res.data.rowCount} 行明细`, color: "success" });
      }
      return true;
    }
    previewData.value = null;
    previewBillKey.value = "";
    previewError.value = res.msg || "未查询到可导出数据";
    if (!silent) {
      toast.add({ title: previewError.value, color: "error" });
    }
    return false;
  } catch (error) {
    previewData.value = null;
    previewBillKey.value = "";
    previewError.value = error?.message || "查询请求失败";
    if (!silent) {
      toast.add({ title: previewError.value, color: "error" });
    }
    return false;
  } finally {
    previewLoading.value = false;
  }
}

async function handleExport() {
  if (!canPreview.value) {
    toast.add({ title: "请先输入有效单号", color: "error" });
    return;
  }
  if (!isPreviewFresh.value) {
    const ok = await runPreview({ silent: false });
    if (!ok) {
      return;
    }
  }
  const billNos = joinBillNos(parsedBills.value);
  exportLoading.value = true;
  proxy.download(
    "kingdee/exportWFData",
    { billNos },
    `外发上锡_${new Date().getTime()}.xlsx`
  ).then(() => {
    addHistory(billNos, true);
    toast.add({ title: "导出成功，文件已开始下载", color: "success" });
  }).catch(() => {
    addHistory(billNos, false);
  }).finally(() => {
    exportLoading.value = false;
  });
}

onBeforeUnmount(() => {
  if (previewTimer) {
    clearTimeout(previewTimer);
  }
});

const columns = [
  { accessorKey: 'billNo', header: '单号', size: 120, cell: ({ row }) => h('span', row.original.billNo ?? '') },
  { accessorKey: 'materialName', header: '物料名称', size: 140, cell: ({ row }) => h('span', row.original.materialName ?? '') },
  { accessorKey: 'materialSpec', header: '规格', size: 120, cell: ({ row }) => h('span', row.original.materialSpec ?? '') },
  { accessorKey: 'planInfo', header: '工序计划', size: 140, cell: ({ row }) => h('span', row.original.planInfo ?? '') },
  { accessorKey: 'qty', header: '外发数量', size: 100, cell: ({ row }) => h('span', String(row.original.qty ?? '')) },
];
</script>

<style scoped>
.wf-export-page {
  --esql-success: #16a34a;
  --esql-danger: #dc2626;

  padding: 16px;
  background: var(--app-bg);
  color: var(--app-text);
  min-height: calc(100vh - 84px);
}

.export-card,
.preview-card,
.history-card {
  max-width: 980px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
}

.export-card,
.preview-card {
  margin-bottom: 16px;
}

.export-card :deep(.nuxt-card-header),
.preview-card :deep(.nuxt-card-header),
.history-card :deep(.nuxt-card-header) {
  padding: 16px 20px;
  border-bottom: 1px solid var(--app-border);
  background: linear-gradient(180deg, var(--app-surface) 0%, var(--app-page-hover) 100%);
}

.export-card :deep(.nuxt-card-body),
.preview-card :deep(.nuxt-card-body),
.history-card :deep(.nuxt-card-body) {
  padding: 20px;
}

.page-title {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 600;
  color: var(--app-text);
}

.page-desc {
  margin: 0;
  font-size: 13px;
  color: var(--app-page-text-muted);
}

.export-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text-secondary);
}

.bill-input :deep(.nuxt-textarea__inner) {
  background-color: var(--app-surface);
  color: var(--app-text);
  border-radius: 8px;
  box-shadow: 0 0 0 1px var(--app-border) inset;
  font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
  line-height: 1.55;
}

.bill-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.bill-tags__label {
  font-size: 12px;
  color: var(--app-page-text-muted);
}

.preview-status {
  font-size: 12px;
  color: var(--app-page-text-muted);
}

.preview-status--ready {
  color: var(--esql-success);
  font-weight: 600;
}

.preview-status--error {
  color: var(--esql-danger);
}

.field-alert {
  margin: 0;
}

.export-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.help-collapse {
  border: none;
}

.help-collapse :deep(.nuxt-collapse-item__header) {
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 13px;
  border: none;
  height: 36px;
}

.help-collapse :deep(.nuxt-collapse-item__wrap) {
  border: none;
  background: transparent;
}

.help-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: var(--app-page-text-muted);
  line-height: 1.7;
}

.help-list code {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--app-page-hover);
  color: var(--app-link-color);
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-weight: 600;
  color: var(--app-text);
}

.preview-stats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}

.stat-item {
  padding: 12px 14px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
}

.stat-label {
  display: block;
  font-size: 12px;
  color: var(--app-page-text-muted);
  margin-bottom: 4px;
}

.stat-item strong {
  font-size: 18px;
  color: var(--app-text);
}

.block-title {
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text-secondary);
}

.mapping-block {
  margin-bottom: 16px;
}

.mapping-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.mapping-arrow {
  color: var(--app-page-text-muted);
}

.mapping-target {
  font-size: 13px;
  color: var(--app-text);
  font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
}

.sample-table {
  width: 100%;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
  color: var(--app-text);
}

.history-bills {
  margin-right: 8px;
  font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
  font-size: 12px;
}

.history-reuse {
  margin-left: 8px;
}

.text-success {
  color: var(--esql-success);
}

.text-danger {
  color: var(--esql-danger);
}

@media (max-width: 767px) {
  .wf-export-page {
    padding: 12px;
  }

}
</style>
