<template>
  <div class="absolute inset-0 overflow-y-auto bg-default">
    <main class="mx-auto flex w-full max-w-[1680px] flex-col gap-4 p-4 sm:p-6">
      <header class="dashboard-header flex flex-col gap-4 rounded-xl border border-default bg-elevated p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div class="flex items-center gap-3">
            <div class="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <UIcon name="i-lucide-chart-no-axes-combined" class="size-5" />
            </div>
            <div>
              <h1 class="text-xl font-semibold text-highlighted">质量异常监控看板</h1>
              <p class="mt-1 text-sm text-muted">面向车间和品质的异常处理监控，优先关注待处理与最新异常</p>
            </div>
          </div>
          <p class="mt-3 text-xs text-muted">
            统计区间：{{ periodLabel }} · 趋势按异常发生日期统计，状态为当前状态，不代表历史状态变化
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <USelect
            v-model="selectedDays"
            :items="rangeOptions"
            size="sm"
            class="w-28"
            aria-label="异常统计时间范围"
          />
          <span class="text-xs text-muted">更新：{{ lastUpdatedLabel }}</span>
          <UButton
            color="primary"
            variant="soft"
            size="sm"
            icon="i-lucide-refresh-cw"
            :loading="loading"
            :disabled="loading"
            @click="initData"
          >
            刷新
          </UButton>
        </div>
      </header>

      <div v-if="errorMessage" class="flex items-start gap-3 rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
        <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-4 shrink-0" />
        <div class="flex-1">
          <p class="font-medium">看板数据刷新失败</p>
          <p class="mt-1 text-xs">{{ errorMessage }}{{ lastSuccessfulAt ? `，当前仍显示上次成功数据（${formatDateTime(lastSuccessfulAt)}）` : '' }}</p>
        </div>
      </div>

      <div v-if="loading && !hasLoaded" class="rounded-xl border border-default bg-elevated px-4 py-10 text-center text-sm text-muted">
        正在读取异常统计，请稍候…
      </div>

      <div v-else-if="!hasLoaded && errorMessage" class="rounded-xl border border-default bg-elevated px-4 py-10 text-center shadow-sm">
        <p class="text-sm font-medium text-highlighted">看板数据加载失败</p>
        <p class="mt-1 text-xs text-muted">当前没有可用的统计数据，请检查网络后重试</p>
        <UButton color="primary" variant="soft" size="sm" icon="i-lucide-refresh-cw" class="mt-4" :loading="loading" @click="initData">
          重新加载
        </UButton>
      </div>

      <template v-else>
        <section class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="异常汇总">
          <button
            v-for="item in kpiStats"
            :key="item.key"
            type="button"
            class="dashboard-kpi group rounded-xl border border-default bg-elevated p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"
            @click="openExceptionList(item.query)"
          >
            <div class="flex items-start justify-between gap-3">
              <span class="text-sm text-muted">{{ item.title }}</span>
              <span :class="['flex size-8 items-center justify-center rounded-lg', item.iconClass]">
                <UIcon :name="item.icon" class="size-4" />
              </span>
            </div>
            <div class="mt-3 flex items-baseline gap-1">
              <span class="text-2xl font-semibold tabular-nums text-highlighted">{{ item.value }}</span>
              <span v-if="item.unit" class="text-xs text-muted">{{ item.unit }}</span>
            </div>
            <p class="mt-2 text-xs text-muted">{{ item.footer }}</p>
            <span class="mt-3 inline-flex items-center gap-1 text-xs text-primary opacity-0 transition group-hover:opacity-100">
              查看异常列表 <UIcon name="i-lucide-arrow-up-right" class="size-3" />
            </span>
          </button>
        </section>

        <section class="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(360px,0.9fr)]">
          <div class="dashboard-panel rounded-xl border border-default bg-elevated p-4 shadow-sm">
            <div class="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 class="font-medium text-highlighted">异常发生趋势</h2>
                <p class="mt-1 text-xs text-muted">总量与当前待处理状态分布</p>
              </div>
              <UIcon name="i-lucide-chart-line" class="size-5 text-primary" />
            </div>
            <div v-if="dashboard.trend.length" ref="trendChart" class="h-[280px] w-full" />
            <EmptyPanel v-else message="当前区间没有异常记录" />
          </div>

          <div class="dashboard-panel rounded-xl border border-default bg-elevated p-4 shadow-sm">
            <div class="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 class="font-medium text-highlighted">待处理异常队列</h2>
                <p class="mt-1 text-xs text-muted">待处理和处理中，点击可进入异常单</p>
              </div>
              <UBadge color="warning" variant="subtle">{{ pendingQueue.length }} 条</UBadge>
            </div>
            <div v-if="pendingQueue.length" class="space-y-2">
              <button
                v-for="row in pendingQueue"
                :key="row.id || row.reportNo"
                type="button"
                class="queue-row flex w-full items-center gap-3 rounded-lg border border-default px-3 py-2 text-left transition hover:border-primary/50 hover:bg-primary/5"
                @click="openLatest(row)"
              >
                <span :class="['size-2 shrink-0 rounded-full', row.status === '1' ? 'bg-warning' : 'bg-error']" />
                <span class="min-w-0 flex-1">
                  <span class="flex items-center gap-2">
                    <span class="truncate text-sm font-medium text-highlighted">{{ row.reportNo || row.planNo || '未填写单号' }}</span>
                    <UBadge :color="row.status === '1' ? 'warning' : 'error'" variant="subtle" size="xs">{{ statusLabel(row.status) }}</UBadge>
                  </span>
                  <span class="mt-1 block truncate text-xs text-muted">{{ row.processName || '未填写工序' }} · {{ row.productName || '未填写物料' }}</span>
                </span>
                <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-muted" />
              </button>
            </div>
            <EmptyPanel v-else message="暂无待处理异常" />
          </div>
        </section>

        <section class="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div class="dashboard-panel rounded-xl border border-default bg-elevated p-4 shadow-sm">
            <div class="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 class="font-medium text-highlighted">多发工序排行</h2>
                <p class="mt-1 text-xs text-muted">点击工序查看异常单</p>
              </div>
              <UIcon name="i-lucide-git-branch" class="size-5 text-primary" />
            </div>
            <div v-if="dashboard.process.length" ref="processChart" class="h-[300px] w-full" />
            <EmptyPanel v-else message="当前区间没有工序数据" />
          </div>

          <div class="dashboard-panel rounded-xl border border-default bg-elevated p-4 shadow-sm">
            <div class="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 class="font-medium text-highlighted">异常类别分布</h2>
                <p class="mt-1 text-xs text-muted">点击类别查看异常单</p>
              </div>
              <UIcon name="i-lucide-chart-pie" class="size-5 text-primary" />
            </div>
            <div v-if="dashboard.category.length" ref="categoryChart" class="h-[300px] w-full" />
            <EmptyPanel v-else message="当前区间没有类别数据" />
          </div>
        </section>

        <section class="grid grid-cols-1 gap-4 pb-6 lg:grid-cols-2">
          <div class="dashboard-panel rounded-xl border border-default bg-elevated p-4 shadow-sm">
            <div class="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 class="font-medium text-highlighted">机台风险排行</h2>
                <p class="mt-1 text-xs text-muted">按异常总数排序，红色数字为待处理</p>
              </div>
              <UIcon name="i-lucide-cpu" class="size-5 text-primary" />
            </div>
            <RiskList :items="dashboard.machine" query-key="machineNo" @select="openExceptionList" />
          </div>

          <div class="dashboard-panel rounded-xl border border-default bg-elevated p-4 shadow-sm">
            <div class="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 class="font-medium text-highlighted">物料风险排行</h2>
                <p class="mt-1 text-xs text-muted">按物料异常总数排序</p>
              </div>
              <UIcon name="i-lucide-package-search" class="size-5 text-primary" />
            </div>
            <RiskList :items="dashboard.product" query-key="productName" @select="openExceptionList" />
          </div>
        </section>
      </template>
    </main>
  </div>
</template>

<script setup name="ExceptionDashboard">
import * as echarts from "echarts/core";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import useSettingsStore from "@/store/modules/settings";
import { chartTooltip, getChartTheme } from "@/utils/chartTheme";
import { useDict } from "@/utils/dict";

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer,
]);

const EmptyPanel = defineComponent({
  props: { message: { type: String, default: "暂无数据" } },
  setup(props) {
    return () => h("div", { class: "flex h-[220px] items-center justify-center text-sm text-muted" }, props.message);
  },
});

const RiskList = defineComponent({
  props: {
    items: { type: Array, default: () => [] },
    queryKey: { type: String, required: true },
  },
  emits: ["select"],
  setup(props, { emit }) {
    return () => props.items.length
      ? h("div", { class: "space-y-2" }, props.items.map((item, index) => {
        const isUnknown = !item.name || item.name === EMPTY_RANK_NAME;
        return h(
        isUnknown ? "div" : "button",
        {
          key: `${item.name}-${index}`,
          ...(isUnknown ? {} : { type: "button", onClick: () => emit("select", { [props.queryKey]: item.name }) }),
          class: [
            "flex w-full items-center gap-3 rounded-lg border border-default px-3 py-2 text-left",
            isUnknown ? "cursor-default opacity-70" : "transition hover:border-primary/50 hover:bg-primary/5",
          ],
        },
        [
          h("span", { class: "w-6 text-center text-xs font-semibold text-muted" }, String(index + 1).padStart(2, "0")),
          h("span", { class: "min-w-0 flex-1 truncate text-sm text-highlighted" }, item.name),
          h("span", { class: "text-xs tabular-nums text-muted" }, `${item.total} 起`),
          h("span", { class: "w-14 text-right text-xs tabular-nums text-error" }, item.pending ? `${item.pending} 待处理` : "已清零"),
          h("span", { class: "text-muted" }, isUnknown ? "" : "›"),
        ],
        );
      }))
      : h("div", { class: "flex h-[220px] items-center justify-center text-sm text-muted" }, "暂无排行数据");
  },
});

const settingsStore = useSettingsStore();
// 与服务端 COALESCE(NULLIF(TRIM(...), ''), '未填写') 保持一致：该行无真实筛选值，不可点击穿透
const EMPTY_RANK_NAME = "未填写";
const rangeOptions = [
  { label: "近 7 天", value: "7" },
  { label: "近 30 天", value: "30" },
  { label: "近 90 天", value: "90" },
];
const selectedDays = ref("30");
const loading = ref(false);
const hasLoaded = ref(false);
const errorMessage = ref("");
const lastSuccessfulAt = ref("");
const refreshTimer = ref(null);
const trendChart = ref(null);
const processChart = ref(null);
const categoryChart = ref(null);
const chartInstances = [];

const dashboard = reactive({
  period: { days: 30, startDate: "", endDate: "" },
  generatedAt: "",
  summary: { total: 0, today: 0, pending: 0, processing: 0, resolved: 0, resolutionRate: 0 },
  trend: [],
  category: [],
  process: [],
  machine: [],
  product: [],
  latest: [],
});

const { tk_exception_category } = useDict("tk_exception_category");
const exceptionCategoryOptions = computed(() => (tk_exception_category.value || []).map((dict) =>
  dict.value === "O" ? { ...dict, label: "人/机" } : dict,
));

const periodLabel = computed(() => {
  if (!dashboard.period.startDate || !dashboard.period.endDate) return `近 ${selectedDays.value} 天`;
  return `${dashboard.period.startDate} 至 ${dashboard.period.endDate}`;
});
const lastUpdatedLabel = computed(() => lastSuccessfulAt.value ? formatDateTime(lastSuccessfulAt.value) : "未成功更新");
const pendingQueue = computed(() => dashboard.latest || []);
// 看板区间（发生日期范围）：穿透到异常列表时带上，保证 KPI/排行口径与列表一致
const periodRangeQuery = computed(() => {
  const { startDate, endDate } = dashboard.period;
  if (!startDate || !endDate) return {};
  return { beginOccurDate: startDate, endOccurDate: endDate };
});
const todayRangeQuery = computed(() => {
  const { endDate } = dashboard.period;
  if (!endDate) return {};
  return { beginOccurDate: endDate, endOccurDate: endDate };
});
const kpiStats = computed(() => [
  {
    key: "total",
    title: "区间异常总数",
    value: dashboard.summary.total,
    unit: "起",
    footer: `近 ${dashboard.period.days} 天发生记录`,
    icon: "i-lucide-file-warning",
    iconClass: "bg-primary/10 text-primary",
    query: { ...periodRangeQuery.value },
  },
  {
    key: "today",
    title: "今日新增",
    value: dashboard.summary.today,
    unit: "起",
    footer: "按异常发生日期统计",
    icon: "i-lucide-calendar-plus",
    iconClass: "bg-info/10 text-info",
    query: { ...todayRangeQuery.value },
  },
  {
    key: "pending",
    title: "待处理",
    value: dashboard.summary.pending,
    unit: "起",
    footer: "待处理状态异常",
    icon: "i-lucide-circle-alert",
    iconClass: "bg-error/10 text-error",
    query: { status: "0", ...periodRangeQuery.value },
  },
  {
    key: "processing",
    title: "处理中",
    value: dashboard.summary.processing,
    unit: "起",
    footer: "处理中状态异常",
    icon: "i-lucide-loader-circle",
    iconClass: "bg-warning/10 text-warning",
    query: { status: "1", ...periodRangeQuery.value },
  },
  {
    key: "resolutionRate",
    title: "解决率",
    value: `${(Number(dashboard.summary.resolutionRate || 0) * 100).toFixed(1)}`,
    unit: "%",
    footer: "已完成 + 已关闭",
    icon: "i-lucide-circle-check",
    iconClass: "bg-success/10 text-success",
    query: { ...periodRangeQuery.value },
  },
]);

function formatDateTime(value) {
  if (!value) return "未成功更新";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", { hour12: false });
}

function statusLabel(status) {
  const key = String(status);
  if (key === "1") return "处理中";
  if (key === "0") return "待处理";
  if (key === "2") return "已完成";
  if (key === "3") return "已关闭";
  return "待处理";
}

function categoryLabel(value) {
  const dict = exceptionCategoryOptions.value.find((item) => item.value === value);
  return dict?.label || (value === "O" ? "人/机" : value || "未填写");
}

function resetCharts() {
  chartInstances.splice(0).forEach((chart) => chart?.dispose());
}

function resizeCharts() {
  chartInstances.forEach((chart) => chart?.resize());
}

function renderCharts() {
  nextTick(() => {
    resetCharts();
    const theme = getChartTheme();
    if (trendChart.value && dashboard.trend.length) renderTrendChart(theme);
    if (processChart.value && dashboard.process.length) renderProcessChart(theme);
    if (categoryChart.value && dashboard.category.length) renderCategoryChart(theme);
  });
}

function formatDayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// 服务端只返回有数据的天；按看板区间补零，保证 x 轴连续、不跳日期
function filledTrend() {
  const { startDate, endDate } = dashboard.period;
  if (!startDate || !endDate) return dashboard.trend;
  const byDay = new Map((dashboard.trend || []).map((row) => [row.day, row]));
  const rows = [];
  const cursor = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) return dashboard.trend;
  for (; cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const key = formatDayKey(cursor);
    rows.push(byDay.get(key) || { day: key, total: 0, pending: 0, processing: 0, resolved: 0 });
  }
  return rows;
}

function renderTrendChart(theme) {
  const chart = echarts.init(trendChart.value);
  chartInstances.push(chart);
  const rows = filledTrend();
  chart.setOption({
    color: ["#3b82f6", "#ef4444", "#f59e0b", "#22c55e"],
    grid: { left: "2%", right: "2%", top: 20, bottom: 10, containLabel: true },
    tooltip: { trigger: "axis", ...chartTooltip(theme) },
    legend: { top: 0, right: 0, textStyle: { color: theme.legendText, fontSize: 11 } },
    xAxis: { type: "category", data: rows.map((item) => item.day.slice(5)), axisLabel: { color: theme.axisText, fontSize: 10 }, axisLine: { lineStyle: { color: theme.axisLine } } },
    yAxis: { type: "value", minInterval: 1, axisLabel: { color: theme.axisText, fontSize: 10 }, splitLine: { lineStyle: { color: theme.splitLine, type: "dashed" } } },
    series: [
      { name: "异常总数", type: "line", smooth: true, showSymbol: false, data: rows.map((item) => item.total), areaStyle: { opacity: 0.08 } },
      { name: "待处理", type: "line", smooth: true, showSymbol: false, data: rows.map((item) => item.pending) },
      { name: "处理中", type: "line", smooth: true, showSymbol: false, data: rows.map((item) => item.processing) },
      { name: "已解决", type: "line", smooth: true, showSymbol: false, data: rows.map((item) => item.resolved) },
    ],
  });
}

function renderProcessChart(theme) {
  const chart = echarts.init(processChart.value);
  chartInstances.push(chart);
  const rows = [...dashboard.process].slice(0, 10).reverse();
  chart.setOption({
    grid: { left: "2%", right: "8%", top: 12, bottom: 10, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, ...chartTooltip(theme) },
    xAxis: { type: "value", minInterval: 1, axisLabel: { color: theme.axisText, fontSize: 10 }, splitLine: { lineStyle: { color: theme.splitLine, type: "dashed" } } },
    yAxis: { type: "category", data: rows.map((item) => item.name), axisLabel: { color: theme.labelText, fontSize: 11 }, axisTick: { show: false } },
    series: [
      { name: "异常总数", type: "bar", barWidth: 14, data: rows.map((item) => item.total), itemStyle: { color: "#3b82f6", borderRadius: [0, 4, 4, 0] }, label: { show: true, position: "right", color: theme.labelText, fontSize: 10 } },
      { name: "待处理", type: "bar", barWidth: 14, data: rows.map((item) => item.pending), itemStyle: { color: "#ef4444", borderRadius: [0, 4, 4, 0] } },
    ],
  });
  chart.on("click", (params) => {
    if (params.name && params.name !== EMPTY_RANK_NAME) openExceptionList({ processName: params.name });
  });
}

function renderCategoryChart(theme) {
  const chart = echarts.init(categoryChart.value);
  chartInstances.push(chart);
  const rows = dashboard.category.map((item) => ({ name: categoryLabel(item.name), value: item.total, queryName: item.name }));
  chart.setOption({
    color: ["#3b82f6", "#ef4444", "#f59e0b", "#22c55e", "#8b5cf6", "#06b6d4", "#f97316"],
    tooltip: { trigger: "item", ...chartTooltip(theme), formatter: "{b}: {c} 起 ({d}%)" },
    legend: { bottom: 0, left: "center", textStyle: { color: theme.legendText, fontSize: 11 } },
    series: [{ name: "异常类别", type: "pie", radius: ["38%", "64%"], center: ["50%", "43%"], itemStyle: { borderColor: theme.itemBorder, borderWidth: 2, borderRadius: 4 }, label: { color: theme.labelText, fontSize: 11, formatter: "{b} {d}%" }, data: rows }],
  });
  chart.on("click", (params) => {
    if (params.data?.queryName && params.data.queryName !== EMPTY_RANK_NAME) openExceptionList({ defectCategory: params.data.queryName });
  });
}

async function initData() {
  if (loading.value) return;
  loading.value = true;
  errorMessage.value = "";
  try {
    const response = await getExceptionDashboard(Number(selectedDays.value));
    const data = response?.data || {};
    Object.assign(dashboard, {
      period: data.period || { days: Number(selectedDays.value), startDate: "", endDate: "" },
      generatedAt: data.generatedAt || "",
      summary: { ...dashboard.summary, ...(data.summary || {}) },
      trend: Array.isArray(data.trend) ? data.trend : [],
      category: Array.isArray(data.category) ? data.category : [],
      process: Array.isArray(data.process) ? data.process : [],
      machine: Array.isArray(data.machine) ? data.machine : [],
      product: Array.isArray(data.product) ? data.product : [],
      latest: Array.isArray(data.latest) ? data.latest : [],
    });
    lastSuccessfulAt.value = data.generatedAt || new Date().toISOString();
    hasLoaded.value = true;
    renderCharts();
  } catch (error) {
    errorMessage.value = error?.data?.msg || error?.message || "请稍后重试";
    console.error("Failed to load exception dashboard", error);
  } finally {
    loading.value = false;
  }
}

function openExceptionList(query = {}) {
  // 维度穿透默认带上看板区间；调用方自带的日期优先
  const merged = { ...periodRangeQuery.value, ...query };
  const normalized = Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== null && value !== undefined && String(value) !== ""));
  navigateTo({ path: "/tk_custom/exception", query: normalized });
}

function openLatest(row) {
  // 按单号直达：不带区间，避免单号命中但发生日期落在区间外时被过滤掉
  const query = row.reportNo ? { reportNo: row.reportNo } : { planNo: row.planNo };
  const normalized = Object.fromEntries(Object.entries(query).filter(([, value]) => value !== null && value !== undefined && String(value) !== ""));
  navigateTo({ path: "/tk_custom/exception", query: normalized });
}

watch(selectedDays, () => initData());
watch(() => settingsStore.isDark, () => renderCharts());

onMounted(() => {
  initData();
  refreshTimer.value = window.setInterval(initData, 5 * 60 * 1000);
  window.addEventListener("resize", resizeCharts);
});

onBeforeUnmount(() => {
  if (refreshTimer.value) window.clearInterval(refreshTimer.value);
  window.removeEventListener("resize", resizeCharts);
  resetCharts();
});
</script>
