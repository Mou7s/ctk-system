<template>
  <div
    class="mo-page flex h-full min-h-0 flex-col overflow-hidden p-1.5 bg-app-bg text-app-text transition-colors duration-350 ease-in-out md:py-1.5 md:px-2"
  >
    <!-- Search Panel -->
    <UForm
      v-show="showSearch"
      :state="queryParams"
      class="shrink-0 p-2.5 mb-3 border border-[var(--app-border)] rounded-xl bg-[var(--app-surface)] shadow-sm animate-fade-in relative overflow-hidden"
    >
      <div class="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-primary-500/50 via-blue-500/50 to-emerald-500/50"></div>
      
      <div
        class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 items-center"
      >
        <UInput
          v-model="queryParams.FNUMBER"
          placeholder="物料编码"
          icon="i-lucide-hash"
          clearable
          class="w-full"
          @keyup.enter="handleQuery"
        />
        <UInput
          v-model="queryParams.FNAME"
          placeholder="物料名称"
          icon="i-lucide-tag"
          clearable
          class="w-full"
          @keyup.enter="handleQuery"
        />
        <UInput
          v-model="queryParams.FBillNo"
          placeholder="流程单号"
          icon="i-lucide-file-text"
          clearable
          class="w-full"
          @keyup.enter="handleQuery"
        />
        <!-- Production Order Group (takes 2 grid columns) -->
        <div class="col-span-1 sm:col-span-2 flex gap-2">
          <UInput
            v-model="queryParams.FMONumber"
            placeholder="生产订单号"
            icon="i-lucide-clipboard-list"
            clearable
            class="flex-1"
            @keyup.enter="handleQuery"
          />
          <UInput
            v-model="queryParams.FMOEntrySeq"
            placeholder="行号"
            icon="i-lucide-list-ordered"
            clearable
            class="w-24"
            @keyup.enter="handleQuery"
          />
        </div>
        <!-- Actions Button Cell -->
        <div class="flex gap-2">
          <UButton
            variant="outline"
            icon="i-lucide-rotate-ccw"
            class="flex-1 justify-center hover:bg-default/5 text-muted hover:text-default"
            @click="resetQuery"
          >
            重置
          </UButton>
          <UButton
            color="primary"
            icon="i-lucide-search"
            :loading="loading"
            class="flex-1 justify-center shadow-sm font-medium"
            @click="handleQuery"
          >
            搜索
          </UButton>
        </div>
      </div>
    </UForm>

    <!-- Table Wrapper -->
    <div class="flex flex-col flex-1 min-h-0 bg-[var(--app-surface)] border border-[var(--app-border)] rounded-xl overflow-hidden mb-0">
      <div class="flex justify-end shrink-0 p-2 border-b border-[var(--app-border)]">
        <UButton icon="i-lucide-download" variant="outline" :loading="exporting" :disabled="loading" @click="handleExport">
          导出 XLSX
        </UButton>
      </div>
      <UTable
        :loading="loading"
        :data="moList"
        :columns="moColumns"
        class="flex-1 min-h-0"
      >
        <template #empty>
          <UEmpty description="暂无生产进度数据" />
        </template>

        <!-- Order Basic Info Custom Cell -->
        <template #orderInfo-cell="{ row }">
          <div class="flex flex-col gap-1.5 text-[11px] text-left">
            <!-- Material Name & Number Badge -->
            <div class="flex items-center justify-between gap-2.5">
              <div class="font-bold text-xs text-default truncate" :title="row.original.FNAME">
                {{ row.original.FNAME }}
              </div>
              <span class="shrink-0 inline-flex items-center px-1 py-0.5 rounded text-[9px] font-mono bg-primary-500/10 text-primary-600 dark:text-primary-400">
                {{ row.original.FNUMBER }}
              </span>
            </div>

            <!-- Details Grid -->
            <div class="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-muted border-t border-[var(--app-border)]/40 pt-1.5 leading-normal">
              <div class="flex items-center min-w-0">
                <span class="text-muted/70 shrink-0">订单:</span>
                <span class="font-semibold text-default ml-0.5 truncate">{{ row.original.FMONumber }}_{{ row.original.FMOEntrySeq }}</span>
                <span class="text-primary-500 font-bold ml-1">({{ row.original.FOperQty }})</span>
              </div>
              <div class="flex items-center min-w-0">
                <span class="text-muted/70 shrink-0">流程:</span>
                <span class="font-semibold text-default ml-0.5 font-mono truncate">{{ row.original.FBillNo }}</span>
              </div>
              <div class="col-span-2 flex items-center min-w-0">
                <span class="text-muted/70 shrink-0">封装:</span>
                <span class="font-semibold text-default ml-0.5 truncate" :title="row.original.FSPECIFICATION">
                  {{ row.original.FSPECIFICATION || '—' }}
                </span>
              </div>
              <div class="flex items-center min-w-0">
                <span class="text-muted/70 shrink-0">工艺:</span>
                <span class="font-semibold text-default ml-0.5 truncate" :title="row.original.gongyiluxian">
                  {{ row.original.gongyiluxian || '—' }}
                </span>
              </div>
              <div class="flex items-center min-w-0 justify-end text-[9px] text-muted/40 font-mono">
                {{ row.original.reportDate ? row.original.reportDate.substring(5, 16) : '—' }}
              </div>
            </div>
          </div>
        </template>

        <!-- Progress List Custom Cell：只渲染本单自己的工序（各单工艺路线不同，不做跨行并集） -->
        <template #progress-cell="{ row }">
          <div
            v-if="row.original.details?.length"
            class="grid gap-1.5 overflow-x-auto overflow-y-visible py-0.5"
            :style="{ gridTemplateColumns: 'repeat(' + row.original.details.length + ', minmax(112px, 1fr))' }"
          >
            <div
              v-for="(item, idx) in row.original.details"
              :key="`${row.original._key}-${item.FOperNumber}-${idx}`"
              :class="[
                'flex flex-col justify-between min-w-0 min-h-[76px] p-2 rounded-lg text-left transition-all duration-200',
                item.FQualifiedQty > 0
                  ? 'border border-[var(--mo-process-active-border)] bg-[var(--mo-process-active-bg)] text-[var(--mo-process-active-text)] shadow-[inset_0_3px_0_var(--mo-process-active-bar)]'
                  : 'border border-dashed border-[var(--app-border)] bg-[var(--app-bg)]/20 text-muted opacity-60'
              ]"
            >
              <div class="min-w-0 font-bold text-xs overflow-hidden text-ellipsis whitespace-nowrap text-inherit" :title="item.zuoye">
                {{ item.zuoye || '—' }}
              </div>
              <div
                :class="[
                  'mt-0.5 text-[11px]',
                  item.FQualifiedQty > 0 ? 'text-[var(--mo-process-active-subtext)]' : 'text-muted'
                ]"
              >
                工序 {{ item.FOperNumber }}
              </div>
              <div class="flex flex-col gap-0.5 mt-1.5 text-[11px] leading-tight font-mono">
                <span>
                  合格
                  <span :class="['font-semibold ml-0.5', item.FQualifiedQty > 0 ? 'text-emerald-500 font-bold' : 'text-muted']">
                    {{ item.FQualifiedQty }}
                  </span>
                </span>
                <span>
                  不良
                  <span :class="['font-semibold ml-0.5', Number(item.FUnqualifiedQty) > 0 ? 'text-rose-500 font-bold' : 'text-muted']">
                    {{ item.FUnqualifiedQty }}
                  </span>
                </span>
                <span class="text-[10px] text-muted/70">
                  {{ shortReportDate(item.reportDate) }}
                </span>
              </div>
            </div>
          </div>
          <div v-else class="py-6 text-center text-xs text-muted">暂无工序数据</div>
        </template>
      </UTable>

      <Pagination
        v-show="total > 0"
        v-model:page="pageNum"
        v-model:limit="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        :auto-scroll="false"
        class="border-t border-[var(--app-border)]"
        @pagination="getList"
      />

      <!-- Bottom Summary Bar（本页工序汇总） -->
      <div
        v-if="moSumList.length"
        class="flex items-stretch shrink-0 border-t border-[var(--app-border)] bg-[color-mix(in_srgb,var(--app-bg)_50%,var(--app-surface))] shadow-[0_-6px_16px_rgba(0,0,0,0.03)] dark:shadow-none"
      >
        <div class="flex-none w-[200px] md:w-[460px] flex flex-col justify-center gap-1 p-3 border-r border-[var(--app-border)]">
          <div class="text-sm font-bold text-default">工序汇总（本页）</div>
          <div class="text-xs text-muted">
            共 {{ total }} 张单 · 本页 {{ moList.length }} 张 · {{ moSumList.length }} 道工序
          </div>
        </div>
        <div class="flex-1 min-w-0 overflow-x-auto overflow-y-hidden p-2.5">
          <div
            class="grid gap-1.5 py-0.5"
            :style="{ gridTemplateColumns: 'repeat(' + (moSumList.length || 1) + ', minmax(118px, 1fr))' }"
          >
            <div
              v-for="item in moSumList"
              :key="`sum-${item.FOperNumber}`"
              :class="[
                'flex flex-col justify-between min-w-0 min-h-[88px] p-2 rounded-lg text-left transition-all duration-200',
                item.isActive
                  ? 'border border-[var(--mo-process-active-border)] bg-[var(--mo-process-active-bg)] text-[var(--mo-process-active-text)] shadow-[inset_0_3px_0_var(--mo-process-active-bar)]'
                  : 'border border-dashed border-[var(--app-border)] bg-[var(--app-bg)]/20 text-muted opacity-60'
              ]"
            >
              <div class="min-w-0 font-bold text-xs overflow-hidden text-ellipsis whitespace-nowrap text-inherit">
                {{ item.zuoye }}
              </div>
              <div
                :class="[
                  'mt-0.5 text-[11px]',
                  item.isActive ? 'text-[var(--mo-process-active-subtext)]' : 'text-muted'
                ]"
              >
                工序 {{ item.FOperNumber }}
              </div>
              <div class="flex flex-col gap-0.5 mt-1.5 text-[11px] leading-tight font-mono">
                <span>
                  合格
                  <span :class="['font-semibold ml-0.5', item.isActive ? 'text-emerald-500 font-bold' : 'text-muted']">
                    {{ item.FQualifiedQty }}
                  </span>
                </span>
                <span>
                  不良
                  <span :class="['font-semibold ml-0.5', Number(item.FUnqualifiedQty) > 0 ? 'text-rose-500 font-bold' : 'text-muted']">
                    {{ item.FUnqualifiedQty }}
                  </span>
                </span>
                <span>
                  良率
                  <span :class="['font-semibold ml-0.5', item.isActive ? 'text-primary-500 font-bold' : 'text-muted']">
                    {{ item.yieldRate || '—' }}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup name="mo">
import { collectMoExportRows, createMoWorkbook } from '@/utils/mo-export';

const exporting = ref(false);
const showSearch = ref(true);
const loading = ref(false);
const moList = ref([]);
const moSumList = ref([]);
const pageNum = ref(1);
const pageSize = ref(10);
const total = ref(0);
const toast = useToast();

const moColumns = [
  {
    accessorKey: "orderInfo",
    header: "订单基本信息",
    meta: {
      class: {
        th: "w-[480px] min-w-[420px] whitespace-nowrap bg-[var(--app-surface)] text-xs font-bold py-2.5 px-4 text-default border-b border-[var(--app-border)]",
        td: "w-[480px] min-w-[420px] align-top p-2 border-r border-[var(--app-border)]/30 border-b border-[var(--app-border)]/50",
      },
    },
  },
  {
    accessorKey: "progress",
    header: "生产进度状况",
    meta: {
      class: {
        th: "whitespace-nowrap bg-[var(--app-surface)] text-xs font-bold py-2.5 px-4 text-default border-b border-[var(--app-border)]",
        td: "align-top p-2 border-b border-[var(--app-border)]/50",
      },
    },
  },
];

function createEmptyQueryParams() {
  return {
    FMONumber: "",
    FMOEntrySeq: "",
    FBillNo: "",
    FNAME: "",
    FNUMBER: "",
  };
}

const queryParams = ref(createEmptyQueryParams());

async function handleExport() {
  if (exporting.value) return;
  exporting.value = true;
  try {
    const rows = await collectMoExportRows(getData, queryParams.value);
    if (!rows.length) {
      toast.add({ title: '当前筛选条件下没有可导出的数据', color: 'warning' });
      return;
    }
    const XLSX = await import('xlsx/xlsx.mjs');
    const workbook = createMoWorkbook(XLSX, rows);
    const now = new Date();
    const stamp = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map(value => String(value).padStart(2, '0')).join('-');
    XLSX.writeFile(workbook, `生产进度_${stamp}.xlsx`, { compression: true });
  } catch (error) {
    toast.add({ title: '导出失败', description: error?.message || '请稍后重试', color: 'error' });
  } finally {
    exporting.value = false;
  }
}

function handleQuery() {
  pageNum.value = 1;
  getList();
}

function resetQuery() {
  queryParams.value = createEmptyQueryParams();
  pageNum.value = 1;
  getList();
}

function normalizeQuantity(value) {
  return Number(value || 0);
}

function formatQuantity(value) {
  return normalizeQuantity(value).toFixed(3);
}

function formatYieldRate(qualified, unqualified) {
  const q = normalizeQuantity(qualified);
  const u = normalizeQuantity(unqualified);
  const total = q + u;
  if (total <= 0) return "";
  return `${((q / total) * 100).toFixed(1)}%`;
}

function operSortValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.MAX_SAFE_INTEGER;
}

function shortReportDate(value) {
  if (!value) return '—';
  return String(value).substring(5, 16) || '—';
}

function assignRowKeys() {
  for (const row of moList.value) {
    row._key = `${row.FMONumber ?? ''}|${row.FMOEntrySeq ?? ''}|${row.FBillNo ?? ''}`;
  }
}

function getSumList() {
  const summaryMap = new Map();

  for (const row of moList.value) {
    const details = row.details || [];

    for (const detail of details) {
      const key = String(detail.FOperNumber ?? '');

      if (!summaryMap.has(key)) {
        summaryMap.set(key, {
          key,
          zuoye: detail.zuoye,
          FQualifiedQty: 0,
          FUnqualifiedQty: 0,
          FOperNumber: detail.FOperNumber,
        });
      }

      const summary = summaryMap.get(key);
      if (!summary.zuoye && detail.zuoye) summary.zuoye = detail.zuoye;
      summary.FQualifiedQty += normalizeQuantity(detail.FQualifiedQty);
      summary.FUnqualifiedQty += normalizeQuantity(detail.FUnqualifiedQty);
    }
  }

  const summaryList = Array.from(summaryMap.values());
  summaryList.sort((a, b) => operSortValue(a.FOperNumber) - operSortValue(b.FOperNumber));

  for (const item of summaryList) {
    const qualified = item.FQualifiedQty;
    const unqualified = item.FUnqualifiedQty;
    item.isActive = qualified > 0;
    item.yieldRate = formatYieldRate(qualified, unqualified);
    item.FQualifiedQty = formatQuantity(qualified);
    item.FUnqualifiedQty = formatQuantity(unqualified);
  }

  moSumList.value = summaryList;
}

async function getList() {
  loading.value = true;

  try {
    const response = await getData({
      ...queryParams.value,
      pageNum: pageNum.value,
      pageSize: pageSize.value,
    });
    if (!response || response.code !== 200 || !response.data) {
      throw new Error(response?.msg || '查询生产进度数据失败');
    }
    const data = response.data;
    moList.value = Array.isArray(data.rows) ? data.rows : [];
    total.value = Number(data.total || 0);
    if (Number.isInteger(data.pageNum) && data.pageNum > 0) pageNum.value = data.pageNum;
  } catch (error) {
    moList.value = [];
    total.value = 0;
    toast.add({
      title: '查询生产进度数据失败',
      description: error?.data?.msg || error?.message || '请检查 SQL Server 连接',
      color: 'error',
      duration: 4000
    });
  } finally {
    loading.value = false;
    assignRowKeys();
    getSumList();
  }
}

getList();
</script>

<style scoped>
.mo-page {
  --mo-process-active-bg: #eff6ff;
  --mo-process-active-border: #bfdbfe;
  --mo-process-active-text: #1e3a8a;
  --mo-process-active-subtext: #1d4ed8;
  --mo-process-active-bar: #3b82f6;
  --mo-metric-qualified: #1d4ed8;
}
.dark .mo-page {
  --mo-process-active-bg: #1e2a5a;
  --mo-process-active-border: #3b5bdb;
  --mo-process-active-text: #dbeafe;
  --mo-process-active-subtext: #93c5f5;
  --mo-process-active-bar: #60a5fa;
  --mo-metric-qualified: #93c5f5;
}
</style>
