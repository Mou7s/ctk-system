<!--
  Converted: el-form → div (search), el-form-item → removed, CSS .nuxt-form-field/.nuxt-card-body → cleaned
-->
<template>
  <div
    class="app-container flex h-full min-h-0 flex-col overflow-auto p-1.5 bg-app-bg text-app-text transition-colors duration-350 ease-in-out md:overflow-hidden md:py-1.5 md:px-2"
  >
    <!-- Header Section -->
    <div
      class="shrink-0 flex flex-col gap-3 mb-4 md:flex-row md:items-center md:justify-between"
    >
      <div>
        <h1
          class="m-0 text-xl font-bold tracking-tight text-default flex items-center gap-2"
        >
          <UIcon name="i-lucide-warehouse" class="w-6 h-6 text-primary-500" />
          D栋库存
        </h1>
        <div class="text-xs text-muted mt-0.5 flex items-center gap-1.5">
          <span :class="syncDotClass"></span>
          数据来自金蝶销售出库与销售退货同步
          <span
            v-if="lastSyncTime && !syncStale"
            class="text-default font-medium ml-1"
          >
            (同步时间: {{ parseTime(lastSyncTime) }})
          </span>
          <span
            v-else-if="syncStale && lastSyncTime"
            class="text-amber-600 font-medium ml-1"
          >
            (同步时间: {{ parseTime(lastSyncTime) }}，超过24小时未同步)
          </span>
          <span v-else-if="syncFailed" class="text-amber-600 font-medium ml-1">
            (同步时间获取失败)
          </span>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <UButton
          size="sm"
          color="neutral"
          variant="outline"
          icon="i-lucide-refresh-cw"
          :loading="loading"
          class="hover:bg-default/5"
          @click="getList"
        >
          刷新
        </UButton>
        <UButton
          size="sm"
          color="primary"
          icon="i-lucide-download"
          :loading="exportLoading"
          :disabled="total === 0"
          @click="handleExport"
        >
          导出 Excel
        </UButton>
      </div>
    </div>

    <!-- Statistics Overview Row -->
    <div class="shrink-0 flex flex-wrap items-center gap-2 mb-3">
      <!-- Inbound Badge -->
      <div
        class="flex items-center gap-1.5 py-1 px-2.5 rounded-lg border border-emerald-200/60 bg-emerald-500/[0.03] text-xs dark:border-emerald-500/20 dark:bg-emerald-500/[0.02]"
      >
        <UIcon
          name="i-lucide-arrow-down-circle"
          class="w-3.5 h-3.5 text-emerald-500"
        />
        <span class="text-muted">入库:</span>
        <strong
          class="font-bold tabular-nums text-emerald-700 dark:text-emerald-400"
        >
          {{ formatNumber(statData.inbound) }}K
        </strong>
      </div>
      <!-- Outbound Badge -->
      <div
        class="flex items-center gap-1.5 py-1 px-2.5 rounded-lg border border-rose-200/60 bg-rose-500/[0.03] text-xs dark:border-rose-500/20 dark:bg-rose-500/[0.02]"
      >
        <UIcon
          name="i-lucide-arrow-up-circle"
          class="w-3.5 h-3.5 text-rose-500"
        />
        <span class="text-muted">出库:</span>
        <strong class="font-bold tabular-nums text-rose-700 dark:text-rose-400">
          {{ formatNumber(statData.outbound) }}K
        </strong>
      </div>
      <!-- Stock Badge -->
      <div
        class="flex items-center gap-1.5 py-1 px-2.5 rounded-lg border border-blue-200/60 bg-blue-500/[0.03] text-xs dark:border-blue-500/20 dark:bg-blue-500/[0.02]"
      >
        <UIcon name="i-lucide-warehouse" class="w-3.5 h-3.5 text-blue-500" />
        <span class="text-muted">库存:</span>
        <strong class="font-bold tabular-nums text-blue-700 dark:text-blue-400">
          {{ formatNumber(statData.stock) }}K
        </strong>
      </div>
      <!-- Count Badge -->
      <div
        class="flex items-center gap-1.5 py-1 px-2.5 rounded-lg border border-zinc-200 bg-zinc-500/[0.03] text-xs dark:border-zinc-500/20 dark:bg-zinc-500/[0.02]"
      >
        <UIcon name="i-lucide-list" class="w-3.5 h-3.5 text-zinc-500" />
        <span class="text-muted">明细:</span>
        <strong class="font-bold tabular-nums text-zinc-700 dark:text-zinc-300">
          {{ total }}条
        </strong>
      </div>
      <span class="text-xs text-muted ml-auto hidden md:inline">
        双击行查看出入库流水（双击仓库 / 库位 / 库存列可缩小范围）
      </span>
    </div>
    <div class="shrink-0 text-xs text-muted mb-3 -mt-1">
      口径：入库 = 累计销售出库（进入客户库存），出库 =
      累计销售退货绝对值，库存 = 入库 − 出库；库存为负（红色）表示退货大于出库
      <span v-if="statFailed" class="text-amber-600 font-medium">
        （顶部统计获取失败，请重试）
      </span>
    </div>

    <!-- Search Panel（常显） -->
    <div
      class="shrink-0 p-2.5 mb-3 border border-[var(--app-border)] rounded-xl bg-[var(--app-surface)] shadow-sm animate-fade-in relative overflow-hidden"
    >
      <div
        class="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-primary-500/50 via-blue-500/50 to-emerald-500/50"
      ></div>

      <div
        class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5"
      >
        <UInput
          v-model="queryParams.kdWlbm"
          placeholder="物料编码"
          icon="i-lucide-hash"
          clearable
          class="w-full"
          @keyup.enter="handleQuery"
        />
        <UInput
          v-model="queryParams.kdWumc"
          placeholder="物料名称"
          icon="i-lucide-tag"
          clearable
          class="w-full"
          @keyup.enter="handleQuery"
        />
        <UInput
          v-model="queryParams.kdGgxh"
          placeholder="规格型号"
          icon="i-lucide-layers"
          clearable
          class="w-full"
          @keyup.enter="handleQuery"
        />
        <UInput
          v-model="queryParams.kdCangkuName"
          placeholder="仓库名称"
          icon="i-lucide-warehouse"
          clearable
          class="w-full"
          @keyup.enter="handleQuery"
        />
        <UInput
          v-model="queryParams.kdKuweiName"
          placeholder="库位名称"
          icon="i-lucide-map-pin"
          clearable
          class="w-full"
          @keyup.enter="handleQuery"
        />
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
    </div>

    <div
      v-if="listError"
      class="mb-2 shrink-0 rounded-xl border border-error-200 bg-error-50 px-3 py-2 text-sm text-error-700 dark:border-error-900/50 dark:bg-error-950/30 dark:text-error-300"
    >
      {{ listError }}
    </div>

    <div
      class="flex-none min-h-[420px] flex flex-col overflow-hidden mb-0 rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] md:flex-1 md:min-h-0"
    >
      <div class="flex-1 min-h-0 overflow-auto">
        <TkUTable
          :loading="loading"
          :columns="columns"
          :data="kucunList"
          @row-open="handleRowOpen"
          class="inventory-table flex-1"
        >
          <template #empty>
            <UEmpty
              description="暂无D栋库存数据，请调整筛选条件后重试"
              :image-size="88"
            />
          </template>
        </TkUTable>
      </div>
    </div>

    <UModal
      v-model:open="detailOpen"
      :title="detailModalTitle"
      :ui="{ content: 'max-w-4xl' }"
    >
      <template #body>
        <div class="mb-4 text-sm text-default flex flex-wrap gap-x-4 gap-y-2">
          <div>
            物料编码: <strong>{{ currentWlbm }}</strong>
          </div>
          <div>
            物料名称: <strong>{{ currentWumc }}</strong>
          </div>
          <div
            v-if="
              currentFilterType === 'cangku' ||
              currentFilterType === 'kuwei' ||
              currentFilterType === 'stock'
            "
          >
            仓库: <strong>{{ selectedCangku }}</strong>
          </div>
          <div
            v-if="
              (currentFilterType === 'kuwei' ||
                currentFilterType === 'stock') &&
              selectedKuwei
            "
          >
            库位: <strong>{{ selectedKuwei }}</strong>
          </div>
        </div>
        <div
          v-if="!detailLoading"
          class="mb-2 text-xs text-muted"
        >
          共 {{ detailTotal }} 条流水
          <span v-if="detailTruncated" class="text-amber-600 font-medium">
            （仅显示前 {{ detailList.length }} 条，请缩小筛选范围后查看）
          </span>
        </div>
        <div class="detail-table-wrap max-h-[55vh] overflow-auto border border-[var(--app-border)] rounded-lg">
          <UTable
            :loading="detailLoading"
            :columns="detailColumns"
            :data="detailList"
            class="detail-table"
          >
            <template #empty>
              <UEmpty description="暂无该物料的出入库流水明细" :image-size="64" />
            </template>
          </UTable>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" @click="detailOpen = false">关闭</UButton>
      </template>
    </UModal>

    <div v-show="total > 0" class="shrink-0">
      <pagination
        class="kingdee-stock-pagination"
        :total="total"
        v-model:page="queryParams.pageNum"
        v-model:limit="queryParams.pageSize"
        @pagination="getList"
      />
    </div>
  </div>
</template>

<script setup name="kingdee_kucun">
import { parseTime } from "@/utils/helpers";
import { useTkListQuery } from "@ctk-system/composables";

const { proxy } = getCurrentInstance();

const lastSyncTime = ref("");
const syncFailed = ref(false);
const statFailed = ref(false);
const exportLoading = ref(false);

const queryParams = ref({
  pageNum: 1,
  pageSize: 20,
  kdWlbm: null,
  kdWumc: null,
  kdGgxh: null,
  kdCangkuName: null,
  kdKuweiName: null,
});

// 主列表交给公共 composable（分页 / loading / 并发守卫 / code!==200 判定）；
// 统计与同步时间仍在本页，另用一条序号守卫
const {
  list: kucunList,
  loading,
  total,
  error: listError,
  getList: loadKucunList,
  handleQuery,
  resetQuery,
} = useTkListQuery({
  queryParams,
  fetchList: () => listKucun_sum(queryParams.value),
  beforeReset: () => {
    queryParams.value.kdWlbm = null;
    queryParams.value.kdWumc = null;
    queryParams.value.kdGgxh = null;
    queryParams.value.kdCangkuName = null;
    queryParams.value.kdKuweiName = null;
  },
});

const statData = reactive({
  inbound: 0,
  outbound: 0,
  stock: 0,
});

function formatNumber(val) {
  if (val == null) return "—";
  return Number(val).toLocaleString("zh-CN");
}

function getStockClass(val) {
  const n = Number(val);
  const base = "font-mono font-semibold tabular-nums";
  if (n < 0) return `${base} text-[#dc2626]`;
  if (n === 0) return `${base} text-[var(--app-page-text-muted)] font-medium`;
  return `${base} text-[var(--app-link-color)]`;
}

const columns = [
  {
    id: "kdWlbm",
    accessorKey: "kdWlbm",
    header: "物料编码",
    meta: {
      class: {
        th: "whitespace-nowrap",
        td: "whitespace-nowrap cursor-pointer",
      },
    },
  },
  {
    id: "kdWumc",
    accessorKey: "kdWumc",
    header: "物料名称",
    meta: {
      class: {
        th: "whitespace-nowrap",
        td: "whitespace-nowrap cursor-pointer",
      },
    },
  },
  {
    id: "kdGgxh",
    accessorKey: "kdGgxh",
    header: "规格型号",
    meta: {
      class: {
        th: "whitespace-nowrap",
        td: "whitespace-nowrap cursor-pointer",
      },
    },
  },
  {
    id: "kdCangkuName",
    accessorKey: "kdCangkuName",
    header: "仓库",
    meta: {
      class: {
        th: "whitespace-nowrap",
        td: "whitespace-nowrap cursor-pointer",
      },
    },
  },
  {
    id: "kdKuweiName",
    accessorKey: "kdKuweiName",
    header: "库位",
    meta: {
      class: {
        th: "whitespace-nowrap",
        td: "whitespace-nowrap cursor-pointer",
      },
    },
  },
  {
    id: "kdChukuNumber",
    accessorKey: "kdChukuNumber",
    header: "库存数量 (K)",
    meta: {
      class: {
        th: "whitespace-nowrap text-right min-w-[130px]",
        td: "whitespace-nowrap text-right cursor-pointer",
      },
    },
    cell: ({ row }) =>
      h(
        "span",
        { class: getStockClass(row.original.kdChukuNumber) },
        formatNumber(row.original.kdChukuNumber),
      ),
  },
];

const detailOpen = ref(false);
const detailLoading = ref(false);
const currentWlbm = ref("");
const currentWumc = ref("");
const detailList = ref([]);
const detailTotal = ref(0);
const detailTruncated = computed(
  () => detailTotal.value > detailList.value.length,
);

// 同步时间超过 24 小时即视为过期（后端取全表 MAX(sync_time)，单批失败看不出）
const syncStale = computed(() => {
  if (!lastSyncTime.value) return false;
  const t = new Date(lastSyncTime.value).getTime();
  return Number.isFinite(t) && Date.now() - t > 24 * 3600 * 1000;
});
const syncDotClass = computed(() =>
  syncFailed.value || !lastSyncTime.value || syncStale.value
    ? "w-1.5 h-1.5 rounded-full bg-amber-500"
    : "w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse",
);

const detailColumns = [
  {
    accessorKey: "kdBillno",
    header: "出入库单号",
    meta: { class: { th: "whitespace-nowrap", td: "whitespace-nowrap" } },
  },
  {
    id: "businessType",
    header: "业务类型",
    meta: { class: { th: "whitespace-nowrap", td: "whitespace-nowrap" } },
    cell: ({ row }) => {
      const isReturn = String(row.original.kdBillno || "")
        .toUpperCase()
        .startsWith("XSTH");
      return h(
        "span",
        {
          class: isReturn
            ? "font-semibold text-amber-600 dark:text-amber-400"
            : "font-semibold text-blue-600 dark:text-blue-400",
        },
        isReturn ? "销售退货" : "销售出库",
      );
    },
  },
  {
    accessorKey: "kdCangkuName",
    header: "仓库",
    meta: { class: { th: "whitespace-nowrap", td: "whitespace-nowrap" } },
  },
  {
    accessorKey: "kdKuweiName",
    header: "库位",
    meta: { class: { th: "whitespace-nowrap", td: "whitespace-nowrap" } },
  },
  {
    accessorKey: "kdChukuNumber",
    header: "发生数量 (K)",
    meta: {
      class: {
        th: "whitespace-nowrap text-right min-w-[100px]",
        td: "whitespace-nowrap text-right",
      },
    },
    cell: ({ row }) =>
      h(
        "span",
        { class: "font-mono font-semibold tabular-nums" },
        formatNumber(Math.abs(Number(row.original.kdChukuNumber || 0))),
      ),
  },
  {
    accessorKey: "kdChukuTime",
    header: "时间",
    meta: { class: { th: "whitespace-nowrap", td: "whitespace-nowrap" } },
    cell: ({ row }) =>
      h(
        "span",
        row.original.kdChukuTime
          ? new Date(row.original.kdChukuTime).toLocaleString("zh-CN")
          : "—",
      ),
  },
];

const currentFilterType = ref("wlbm");
const selectedCangku = ref("");
const selectedKuwei = ref("");

const detailModalTitle = computed(() => {
  let title = "出入库流水明细";
  if (currentFilterType.value === "cangku") {
    title += " - " + selectedCangku.value;
  } else if (
    currentFilterType.value === "kuwei" ||
    currentFilterType.value === "stock"
  ) {
    title +=
      " - " +
      selectedCangku.value +
      " / " +
      (selectedKuwei.value || "全部库位");
  }
  return title;
});

function showDetail(row, filterType = "wlbm") {
  currentWlbm.value = row.kdWlbm;
  currentWumc.value = row.kdWumc;
  currentFilterType.value = filterType;
  selectedCangku.value = row.kdCangkuName || "";
  selectedKuwei.value = row.kdKuweiName || "";
  detailList.value = [];
  detailTotal.value = 0;
  detailOpen.value = true;
  detailLoading.value = true;

  // 明细按行查：物料必带；仓库/库位按双击列追加。
  // 注意：汇总行仓库是截断到 '/' 前的前缀；库位为空时不传该条件（= 该仓库全部库位）。
  const params = {
    pageNum: 1,
    pageSize: 1000,
    kdWlbm: row.kdWlbm,
    status: "C",
  };

  if (
    filterType === "cangku" ||
    filterType === "kuwei" ||
    filterType === "stock"
  ) {
    params.kdCangkuName = row.kdCangkuName;
  }
  if ((filterType === "kuwei" || filterType === "stock") && row.kdKuweiName) {
    params.kdKuweiName = row.kdKuweiName;
  }

  listKucun(params)
    .then((response) => {
      detailList.value = response.rows || [];
      detailTotal.value = Number(response.total ?? detailList.value.length);
      detailLoading.value = false;
    })
    .catch(() => {
      detailLoading.value = false;
    });
}

function handleRowOpen(original, row, event) {
  // TkUTable 的 row 经 tableApi 解析，不受排序影响；双击列用列 id 判定
  // （不受列顺序影响），取不到时退化为按物料查整行。
  let filterType = "wlbm";
  const td = event?.target?.closest?.("td");
  const tr = event?.target?.closest?.("tbody tr");
  if (td && tr) {
    const cellIndex = Array.from(tr.querySelectorAll("td")).indexOf(td);
    const colId =
      row?.getVisibleCells?.()[cellIndex]?.column?.id ||
      columns[cellIndex]?.id;
    if (colId === "kdCangkuName") {
      filterType = "cangku";
    } else if (colId === "kdKuweiName") {
      filterType = "kuwei";
    } else if (colId === "kdChukuNumber") {
      filterType = "stock";
    }
  }
  showDetail(original, filterType);
}

let statSeq = 0;

function getList() {
  // 统计/导出只与筛选条件有关，剔除分页参数（后端当前也忽略分页，显式剔除防后续踩坑）
  const filterParams = { ...queryParams.value };
  delete filterParams.pageNum;
  delete filterParams.pageSize;

  // 1. 主列表：交给 composable（并发只认最后一次、失败保留旧数据并记 listError）
  const result = loadKucunList();

  // 2. 过滤后的统计汇总（随筛选条件变化）
  const seq = ++statSeq;
  list_sum_total(filterParams)
    .then((r) => {
      if (seq !== statSeq || !r) return;
      statFailed.value = false;
      // Customer-stock perspective: sales outbound enters the customer's
      // inventory, while sales return leaves it.
      statData.inbound = r.xsch || 0;
      statData.outbound = Math.abs(r.xsth || 0);
      statData.stock = r.total || 0;
    })
    .catch(() => {
      if (seq !== statSeq) return;
      // 统计失败不清零旧值，但必须明示，避免旧值被当成最新
      statFailed.value = true;
    });

  // 3. 后端同步时间
  getLastSyncTime()
    .then((r) => {
      if (seq !== statSeq) return;
      syncFailed.value = false;
      if (r && r.data) {
        lastSyncTime.value = r.data;
      } else {
        lastSyncTime.value = r;
      }
    })
    .catch(() => {
      if (seq !== statSeq) return;
      syncFailed.value = true;
    });

  return result;
}

function handleExport() {
  exportLoading.value = true;
  // 与页面表格一致：物料编码/名称/规格/仓库/库位/库存数量（不含出入库单）
  // 导出全量汇总行，不带分页参数
  const exportParams = { ...queryParams.value };
  delete exportParams.pageNum;
  delete exportParams.pageSize;
  // download 内部已做失败 toast（app/utils/request.js）；这里只补超时，
  // blob 一次性返回，做不了真进度条
  proxy
    .download(
      "tk_custom/kucun/export1",
      { ...exportParams },
      "D栋库存_" + new Date().getTime() + ".xlsx",
      { timeout: 120000 },
    )
    .finally(() => {
      exportLoading.value = false;
    });
}

onMounted(() => {
  getList();
});
</script>

<style scoped>
.kingdee-stock-pagination.pagination-container {
  padding-top: 16px !important;
  padding-bottom: 16px !important;
}
</style>
