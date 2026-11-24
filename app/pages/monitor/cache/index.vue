<template>
  <div class="app-container p-6 absolute inset-0 overflow-y-auto bg-gray-50 dark:bg-[#030712] transition-colors duration-300">
    <!-- 顶部操作栏 -->
    <div class="flex flex-wrap justify-between items-center gap-4 mb-6">
      <div>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <UIcon name="i-lucide-database" class="w-6 h-6 text-primary-500" />
          缓存管理大盘
        </h1>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Unified real-time console for Garnet/Redis performance metrics, key lists, and data purging.
        </p>
      </div>

      <!-- 右侧控制区 -->
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-1.5 text-xs font-mono select-none">
          <span class="text-gray-500 dark:text-gray-400">实时更新 (3s)</span>
          <USwitch v-model="autoRefresh" @update:model-value="handleAutoRefreshToggle" />
          <div class="flex items-center gap-1.5 pl-2 border-l border-gray-200 dark:border-gray-850">
            <span v-if="autoRefresh" class="w-1.5 h-1.5 rounded-full bg-green-500 animate-ping"></span>
            <span class="text-[10px] font-semibold font-mono tracking-wider transition-colors duration-300" :class="autoRefresh ? 'text-green-500' : 'text-gray-400 dark:text-gray-600'">{{ autoRefresh ? 'LIVE' : 'HOLD' }}</span>
          </div>
        </div>
        <UButton
          color="gray"
          variant="ghost"
          icon="i-lucide-refresh-cw"
          :loading="loading"
          @click="getList(false)"
          class="hover:bg-gray-100 dark:hover:bg-gray-900 transition-all font-mono text-xs"
        >
          sys-cli refresh
        </UButton>
      </div>
    </div>

    <!-- 1. 基本信息网格卡片 (Top Section) -->
    <div class="card-box mb-6">
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-activity" class="w-5 h-5 text-primary-500" />
            <span class="font-semibold text-gray-900 dark:text-gray-100">基本信息</span>
          </div>
        </template>

        <!-- 状态指标卡片网格 -->
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <div
            v-for="(card, index) in metricsCards"
            :key="index"
            class="flex items-center gap-4 p-4 rounded-xl border border-gray-150 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 hover:shadow-md transition-all duration-300"
          >
            <div class="p-3 rounded-lg bg-primary-50 dark:bg-primary-950/40 text-primary-500 dark:text-primary-400 flex items-center justify-center">
              <UIcon :name="card.icon" class="w-6 h-6" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="text-[11px] text-gray-500 dark:text-gray-400 font-medium truncate uppercase tracking-wider">{{ card.label }}</div>
              <div class="text-base font-semibold text-gray-900 dark:text-white mt-0.5 truncate font-mono">{{ card.value }}</div>
            </div>
          </div>
        </div>
      </UCard>
    </div>

    <!-- 2. 指标图表 (Middle Section) -->
    <div class="grid grid-cols-12 gap-6 mb-6">
      <!-- 键分布饼图 -->
      <div class="col-span-12 lg:col-span-6 card-box">
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-pie-chart" class="w-5 h-5 text-primary-500" />
              <span class="font-semibold text-gray-900 dark:text-gray-100">键分布</span>
            </div>
          </template>
          <div class="flex flex-col items-center justify-center p-2 min-h-[380px]">
            <div v-show="hasCommandData" ref="commandstats" class="w-full" style="height: 380px" />
            <div v-if="!hasCommandData" class="flex flex-col items-center justify-center text-center p-6 space-y-3">
              <UIcon name="i-lucide-terminal" class="w-12 h-12 text-gray-300 dark:text-gray-700 animate-pulse" />
              <div class="text-sm font-medium text-gray-500 dark:text-gray-400 font-mono">sys_cache 表当前为空</div>
              <div class="text-xs text-gray-400 dark:text-gray-600 max-w-sm">
                没有存活的键可统计。会话、验证码、幂等键在有人使用系统时才会写入这张表。
              </div>
            </div>
          </div>
        </UCard>
      </div>

      <!-- 键值内容占用仪表盘 -->
      <div class="col-span-12 lg:col-span-6 card-box">
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-gauge" class="w-5 h-5 text-primary-500" />
              <span class="font-semibold text-gray-900 dark:text-gray-100">键值内容占用</span>
            </div>
          </template>
          <div class="flex items-center justify-center p-2">
            <div ref="usedmemory" class="w-full" style="height: 380px" />
          </div>
        </UCard>
      </div>
    </div>

    <!-- 3. 数据管理 (Bottom Section) -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- 3.1 缓存名称列表 -->
      <UCard :ui="{ root: 'h-[520px] flex flex-col', body: 'flex-1 overflow-y-auto p-4' }">
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-folder-tree" class="w-4 h-4 text-indigo-500" />
              <span class="font-semibold text-gray-900 dark:text-gray-100">缓存列表</span>
            </div>
            <UButton variant="link" color="primary" icon="i-lucide-rotate-ccw" @click="refreshCacheNames" />
          </div>
        </template>
        <TkUTable
          :loading="listLoading"
          :data="cacheNames"
          :columns="cacheNameColumns"
          :ui="{ td: 'p-2 text-xs text-default whitespace-nowrap', th: 'px-3 py-2 text-xs text-highlighted text-left font-semibold' }"
          style="height: 100%"
          @row-click="getCacheKeys"
        />
      </UCard>

      <!-- 3.2 键名列表 -->
      <UCard :ui="{ root: 'h-[520px] flex flex-col', body: 'flex-1 overflow-y-auto p-4' }">
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-key-round" class="w-4 h-4 text-emerald-500" />
              <span class="font-semibold text-gray-900 dark:text-gray-100">键名列表 ({{ nowCacheName ? nowCacheName.replace(':', '') : '未选择' }})</span>
            </div>
            <UButton variant="link" color="primary" icon="i-lucide-rotate-ccw" @click="refreshCacheKeys" />
          </div>
        </template>
        <TkUTable
          :loading="subLoading"
          :data="cacheKeys"
          :columns="cacheKeyColumns"
          :ui="{ td: 'p-2 text-xs text-default whitespace-nowrap', th: 'px-3 py-2 text-xs text-highlighted text-left font-semibold' }"
          style="height: 100%"
          @row-click="handleCacheValue"
        />
      </UCard>

      <!-- 3.3 缓存具体内容与一键清理 -->
      <UCard :ui="{ root: 'h-[520px] flex flex-col', body: 'flex-1 overflow-y-auto p-4' }">
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-file-text" class="w-4 h-4 text-rose-500" />
              <span class="font-semibold text-gray-900 dark:text-gray-100">缓存值详情</span>
            </div>
            <UButton
              variant="solid"
              color="red"
              icon="i-lucide-trash-2"
              size="xs"
              @click="handleClearCacheAll"
            >
              清理全部缓存
            </UButton>
          </div>
        </template>

        <!-- 详情表单 -->
        <UForm :state="cacheForm" class="space-y-4">
          <UFormField label="所属缓存名称">
            <UInput
              v-model="cacheForm.cacheName"
              readonly
              class="font-mono text-xs bg-gray-50 dark:bg-gray-900"
            />
          </UFormField>
          <UFormField label="缓存键名 (Key)">
            <UInput
              v-model="cacheForm.cacheKey"
              readonly
              class="font-mono text-xs bg-gray-50 dark:bg-gray-900"
            />
          </UFormField>
          <UFormField label="缓存数据值 (Value)">
            <UTextarea
              v-model="cacheForm.cacheValue"
              :rows="12"
              readonly
              class="font-mono text-xs bg-gray-50 dark:bg-gray-900"
            />
          </UFormField>
        </UForm>
      </UCard>
    </div>
  </div>
</template>

<script setup>
import {
  ref,
  reactive,
  computed,
  onMounted,
  onUnmounted,
  h,
  resolveComponent,
  nextTick,
} from "vue";
import {
  getCache,
  listCacheName,
  listCacheKey,
  getCacheValue,
  clearCacheName,
  clearCacheKey,
  clearCacheAll,
} from "@/api/monitor/cache";
import * as echarts from "echarts/core";
import { GaugeChart, PieChart } from "echarts/charts";
import { TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { TkUTable } from "@ctk-system/ui";

echarts.use([
  GaugeChart,
  PieChart,
  TooltipComponent,
  CanvasRenderer,
]);

const toast = useToast();
const loadingModal = useTkLoading();
const UButton = resolveComponent("UButton");

// --- 性能监控数据 ---
const loading = ref(false);
const autoRefresh = ref(true);
let timer = null;

const cache = ref([]);
const commandstats = ref(null);
const usedmemory = ref(null);

let commandstatsIntance = null;
let usedmemoryInstance = null;

// --- 缓存管理数据 ---
const listLoading = ref(false);
const subLoading = ref(false);
const cacheNames = ref([]);
const cacheKeys = ref([]);
const nowCacheName = ref("");
const cacheForm = reactive({
  cacheName: "",
  cacheKey: "",
  cacheValue: "",
});

// 字节转换辅助函数
function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === "0") return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

// 性能监控：判定是否有真实的命令统计数据
const hasCommandData = computed(() => {
  if (!cache.value.commandStats) return false;
  return cache.value.commandStats.some(
    (item) =>
      item.value !== null && item.value !== undefined && item.value !== "",
  );
});

// 性能监控：整合缓存监控卡片
const metricsCards = computed(() => {
  if (!cache.value.info) return [];
  const info = cache.value.info;

  const engineVersion = info.engine_version
    ? `MySQL ${info.engine_version}`
    : "-";

  const port = info.tcp_port || "3306";

  const contentLabel =
    info.cache_content_human || formatBytes(Number(info.cache_content_bytes || 0));

  return [
    { label: "存储位置", value: "sys_cache 表", icon: "i-lucide-table" },
    { label: "MySQL 版本", value: engineVersion, icon: "i-lucide-info" },
    {
      label: "运行模式",
      value: info.redis_mode === "standalone" ? "单机" : "集群",
      icon: "i-lucide-split",
    },
    { label: "端口", value: port, icon: "i-lucide-plug" },
    {
      label: "数据库连接",
      value: info.connected_clients || "0",
      icon: "i-lucide-users",
    },
    {
      label: "数据库运行",
      value: `${info.uptime_in_days || 0} 天`,
      icon: "i-lucide-clock",
    },
    { label: "键值内容", value: contentLabel, icon: "i-lucide-database" },
    {
      label: "存活键",
      value: String(cache.value.dbSize ?? "0"),
      icon: "i-lucide-key-round",
    },
    {
      label: "待清理过期键",
      value: info.cache_expired_rows || "0",
      icon: "i-lucide-trash-2",
    },
  ];
});

// 仪表盘：当前键值内容占用（单位 KB）
function getUsedMemoryFloat() {
  if (!cache.value.info) return 0;
  return Number(cache.value.info.cache_content_bytes || 0) / 1024;
}

// 仪表盘：占用文本
function getUsedMemoryLabel() {
  if (!cache.value.info) return "-";
  const info = cache.value.info;
  if (info.cache_content_human) return info.cache_content_human;
  return formatBytes(Number(info.cache_content_bytes || 0));
}

// --- 性能监控加载 ---
function getList(isSilent = false) {
  if (!isSilent) {
    loading.value = true;
    loadingModal.start("正在加载性能指标，请稍候...");
  }
  getCache()
    .then(async (response) => {
      cache.value = response.data;

      // 核心安全守卫：等待 Vue DOM 模板更新彻底完成
      await nextTick();

      // 1. 初始化或更新命令饼图
      if (hasCommandData.value) {
        if (commandstats.value) {
          if (!commandstatsIntance) {
            commandstatsIntance = echarts.init(commandstats.value, "macarons");
          }
          commandstatsIntance.setOption({
            tooltip: {
              trigger: "item",
              formatter: "{a} <br/>{b} : {c} ({d}%)",
            },
            series: [
              {
                name: "命令",
                type: "pie",
                roseType: "radius",
                radius: [15, 95],
                center: ["50%", "38%"],
                data: response.data.commandStats,
                animationEasing: "cubicInOut",
                animationDuration: 1000,
              },
            ],
          });
        }
      } else {
        if (commandstatsIntance) {
          commandstatsIntance.dispose();
          commandstatsIntance = null;
        }
      }

      // 2. 初始化或更新内存消耗仪表盘
      const memoryFloat = getUsedMemoryFloat();
      const memoryLabel = getUsedMemoryLabel();

      if (usedmemory.value) {
        if (!usedmemoryInstance) {
          usedmemoryInstance = echarts.init(usedmemory.value, "macarons");
        }
        usedmemoryInstance.setOption({
          tooltip: {
            formatter: "{b} <br/>{a} : " + memoryLabel,
          },
          series: [
            {
              name: "峰值",
              type: "gauge",
              min: 0,
              max: 1024, // 键值内容以 KB 计：1MB 上限，会话/幂等键的实际规模远小于此
              detail: {
                formatter: memoryLabel,
              },
              data: [
                {
                  value: memoryFloat,
                  name: "内存消耗",
                },
              ],
            },
          ],
        });
      }
    })
    .catch((error) => {
      console.error("Failed to fetch cache stats:", error);
    })
    .finally(() => {
      if (!isSilent) {
        loading.value = false;
        loadingModal.stop();
      }
    });
}

// 轮询控制
function handleAutoRefreshToggle(val) {
  if (val) startTimer();
  else stopTimer();
}

function startTimer() {
  stopTimer();
  timer = setInterval(() => {
    getList(true);
  }, 3000);
}

function stopTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

// --- 缓存管理实现 ---
function getCacheNames() {
  listLoading.value = true;
  listCacheName()
    .then((response) => {
      cacheNames.value = response.data;
    })
    .finally(() => {
      listLoading.value = false;
    });
}

function refreshCacheNames() {
  getCacheNames();
  toast.add({
    title: "刷新缓存列表成功",
    color: "success",
  });
}

function handleClearCacheName(row) {
  clearCacheName(row.cacheName).then(() => {
    toast.add({
      title: `清理缓存名称[${row.cacheName}]成功`,
      color: "success",
    });
    getCacheKeys();
  });
}

function getCacheKeys(row) {
  const cacheName =
    typeof row === "object"
      ? row.original?.cacheName || row.cacheName
      : row || nowCacheName.value;
  if (!cacheName) return;
  subLoading.value = true;
  listCacheKey(cacheName)
    .then((response) => {
      cacheKeys.value = response.data;
      nowCacheName.value = cacheName;
    })
    .finally(() => {
      subLoading.value = false;
    });
}

function refreshCacheKeys() {
  getCacheKeys();
  toast.add({ title: "刷新键名列表成功", color: "success" });
}

function handleClearCacheKey(cacheKey) {
  clearCacheKey(cacheKey).then(() => {
    toast.add({ title: `清理缓存键名[${cacheKey}]成功`, color: "success" });
    getCacheKeys();
  });
}

function handleCacheValue(row) {
  const cacheKey = typeof row === "object" ? row.original || row.cacheKey : row;
  if (!cacheKey) return;
  getCacheValue(nowCacheName.value, cacheKey).then((response) => {
    Object.assign(cacheForm, response.data);
  });
}

function handleClearCacheAll() {
  clearCacheAll().then(() => {
    toast.add({ title: "清理全部缓存成功", color: "success" });
    cacheForm.cacheName = "";
    cacheForm.cacheKey = "";
    cacheForm.cacheValue = "";
    getCacheKeys();
  });
}

// 表格列定义
const cacheNameColumns = [
  {
    id: "index",
    header: "序号",
    size: 60,
    cell: ({ row }) => h("span", String(row.index + 1)),
  },
  {
    accessorKey: "cacheName",
    header: "缓存名称",
    cell: ({ row }) =>
      h("span", String(row.original.cacheName ?? "").replace(":", "")),
  },
  {
    accessorKey: "remark",
    header: "备注",
    cell: ({ row }) => h("span", row.original.remark ?? ""),
  },
  {
    id: "actions",
    header: "操作",
    size: 60,
    enableSorting: false,
    cell: ({ row }) =>
      h(UButton, {
        variant: "link",
        color: "primary",
        icon: "i-lucide-trash",
        onClick: (e) => {
          e.stopPropagation();
          handleClearCacheName(row.original);
        },
      }),
  },
];

const cacheKeyColumns = [
  {
    id: "index",
    header: "序号",
    size: 60,
    cell: ({ row }) => h("span", String(row.index + 1)),
  },
  {
    accessorKey: "cacheKey",
    header: "缓存键名",
    cell: ({ row }) =>
      h("span", String(row.original ?? "").replace(nowCacheName.value, "")),
  },
  {
    id: "actions",
    header: "操作",
    size: 60,
    enableSorting: false,
    cell: ({ row }) =>
      h(UButton, {
        variant: "link",
        color: "primary",
        icon: "i-lucide-trash",
        onClick: (e) => {
          e.stopPropagation();
          handleClearCacheKey(row.original);
        },
      }),
  },
];

function handleResize() {
  if (commandstatsIntance) commandstatsIntance.resize();
  if (usedmemoryInstance) usedmemoryInstance.resize();
}

onMounted(() => {
  getList(false);
  startTimer();
  getCacheNames();
  window.addEventListener("resize", handleResize);
});

onUnmounted(() => {
  stopTimer();
  window.removeEventListener("resize", handleResize);
  if (commandstatsIntance) commandstatsIntance.dispose();
  if (usedmemoryInstance) usedmemoryInstance.dispose();
});
</script>

<style scoped>
/* 滚动容器确保独立区域 */
.app-container {
  scrollbar-width: thin;
}
</style>
