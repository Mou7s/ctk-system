<template>
  <div class="app-container p-6 bg-gray-50 dark:bg-[#030712] min-h-screen transition-colors duration-300">
    <!-- 顶部操作栏 -->
    <div class="flex justify-between items-center mb-6">
      <div>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <UIcon name="i-lucide-terminal" class="w-6 h-6 text-primary-500 animate-pulse" />
          系统服务监控
        </h1>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Real-time status console in Neofetch / Fastfetch terminal styles.</p>
      </div>
      
      <!-- 轮询控制与刷新按钮 -->
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-1.5 text-xs font-mono">
          <span class="text-gray-500 dark:text-gray-400">实时更新 (3s)</span>
          <USwitch v-model="autoRefresh" @update:model-value="handleAutoRefreshToggle" />
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

    <!-- 终端模拟器外壳 -->
    <div class="w-full rounded-xl border border-gray-200 dark:border-gray-800/80 bg-white dark:bg-[#090d16] shadow-xl dark:shadow-[0_0_50px_rgba(59,130,246,0.06)] overflow-hidden transition-all duration-300">
      <!-- 终端标题栏 -->
      <div class="bg-gray-100 dark:bg-[#0f172a]/60 px-4 py-3 border-b border-gray-200 dark:border-gray-800/80 flex items-center justify-between">
        <!-- Mac 风格三色圆点 -->
        <div class="flex items-center gap-2">
          <span class="w-3 h-3 rounded-full bg-red-500/90 inline-block"></span>
          <span class="w-3 h-3 rounded-full bg-yellow-500/90 inline-block"></span>
          <span class="w-3 h-3 rounded-full bg-green-500/90 inline-block"></span>
        </div>
        <!-- 终端 Title -->
        <div class="text-xs font-mono text-gray-500 dark:text-gray-400 select-none">
          admin@ctk-system: ~/monitor/server — bash — {{ autoRefresh ? 'LIVE' : 'PAUSED' }}
        </div>
        <!-- 右侧占位 -->
        <div class="flex items-center gap-1.5">
          <span v-if="autoRefresh" class="w-2 h-2 rounded-full bg-green-500 animate-ping"></span>
          <span class="text-[10px] font-mono text-gray-400 dark:text-gray-600 select-none">{{ autoRefresh ? 'AUTO' : 'HOLD' }}</span>
        </div>
      </div>

      <!-- 终端主体面板 -->
      <div class="p-6 md:p-8 font-mono text-xs leading-relaxed text-gray-800 dark:text-gray-200 overflow-x-auto">
        
        <div class="grid grid-cols-12 gap-6 items-start">
          <!-- 左侧：操作系统 logo 字符画 -->
          <div class="col-span-12 md:col-span-4 flex justify-center md:justify-start">
            <pre class="font-mono text-[11px] leading-[1.08] whitespace-pre select-none text-primary-500 dark:text-primary-400 opacity-90 transition-all duration-300">{{ currentAscii }}</pre>
          </div>

          <!-- 右侧：Fastfetch 信息行 -->
          <div class="col-span-12 md:col-span-8 space-y-1">
            <!-- 终端用户名和主机 -->
            <div class="text-sm">
              <span class="text-green-500 dark:text-green-400 font-bold" v-if="server.sys">admin</span>
              <span class="text-gray-500 dark:text-gray-400 font-bold">@</span>
              <span class="text-blue-500 dark:text-blue-400 font-bold" v-if="server.sys">{{ server.sys.computerName }}</span>
            </div>
            <div class="text-gray-400 dark:text-gray-600 select-none leading-none pb-1">-----------------------------------------------------</div>

            <!-- OS & Hardware Info -->
            <div v-if="server.sys">
              <span class="text-blue-500 dark:text-blue-400 font-semibold inline-block w-24">OS</span>: 
              <span class="text-gray-900 dark:text-gray-200">{{ server.sys.osName }} ({{ server.sys.osArch }})</span>
            </div>
            <div v-if="server.sys">
              <span class="text-blue-500 dark:text-blue-400 font-semibold inline-block w-24">Host</span>: 
              <span class="text-gray-900 dark:text-gray-200">{{ server.sys.computerName }}</span>
            </div>
            <div v-if="server.sys">
              <span class="text-blue-500 dark:text-blue-400 font-semibold inline-block w-24">Local IP</span>: 
              <span class="text-gray-900 dark:text-gray-200">{{ server.sys.computerIp }}</span>
            </div>
            <div v-if="server.jvm">
              <span class="text-blue-500 dark:text-blue-400 font-semibold inline-block w-24">Uptime</span>: 
              <span class="text-gray-900 dark:text-gray-200">{{ server.jvm.runTime }}</span>
            </div>
            <div v-if="server.jvm">
              <span class="text-blue-500 dark:text-blue-400 font-semibold inline-block w-24">Java VM</span>: 
              <span class="text-gray-900 dark:text-gray-200">{{ server.jvm.name }} (Ver. {{ server.jvm.version }})</span>
            </div>
            <div v-if="server.cpu">
              <span class="text-blue-500 dark:text-blue-400 font-semibold inline-block w-24">CPU</span>: 
              <span class="text-gray-900 dark:text-gray-200">{{ server.cpu.cpuNum }} Cores</span>
            </div>

            <!-- CPU & Mem Progress Bar Section -->
            <div class="space-y-1 border-t border-dashed border-gray-200 dark:border-gray-800/80 pt-2.5 mt-2">
              <!-- CPU Used -->
              <div v-if="server.cpu" class="flex flex-wrap items-center gap-1.5">
                <span class="text-blue-500 dark:text-blue-400 font-semibold w-24">CPU Usage</span>:
                <span class="select-none font-mono">
                  [<span :class="getProgressColor(server.cpu.used)">{{ getProgressLine(server.cpu.used).filledStr }}</span><span class="text-gray-300 dark:text-gray-700">{{ getProgressLine(server.cpu.used).emptyStr }}</span>]
                </span>
                <span :class="getProgressColor(server.cpu.used)" class="font-semibold">{{ server.cpu.used }}%</span>
                <span class="text-[10px] text-gray-500 dark:text-gray-400">(User: {{ server.cpu.used }}%, Sys: {{ server.cpu.sys }}%, Free: {{ server.cpu.free }}%)</span>
              </div>

              <!-- System Memory -->
              <div v-if="server.mem" class="flex flex-wrap items-center gap-1.5">
                <span class="text-blue-500 dark:text-blue-400 font-semibold w-24">Memory</span>:
                <span class="select-none font-mono">
                  [<span :class="getProgressColor(server.mem.usage)">{{ getProgressLine(server.mem.usage).filledStr }}</span><span class="text-gray-300 dark:text-gray-700">{{ getProgressLine(server.mem.usage).emptyStr }}</span>]
                </span>
                <span :class="getProgressColor(server.mem.usage)" class="font-semibold">{{ server.mem.used }}G / {{ server.mem.total }}G</span>
                <span class="text-[10px] text-gray-500 dark:text-gray-400">({{ server.mem.usage }}% Used, Free: {{ server.mem.free }}G)</span>
              </div>

              <!-- JVM Memory -->
              <div v-if="server.jvm" class="flex flex-wrap items-center gap-1.5">
                <span class="text-blue-500 dark:text-blue-400 font-semibold w-24">JVM Mem</span>:
                <span class="select-none font-mono">
                  [<span :class="getProgressColor(server.jvm.usage)">{{ getProgressLine(server.jvm.usage).filledStr }}</span><span class="text-gray-300 dark:text-gray-700">{{ getProgressLine(server.jvm.usage).emptyStr }}</span>]
                </span>
                <span :class="getProgressColor(server.jvm.usage)" class="font-semibold">{{ server.jvm.used }}M / {{ server.jvm.total }}M</span>
                <span class="text-[10px] text-gray-500 dark:text-gray-400">({{ server.jvm.usage }}% Used, Free: {{ server.jvm.free }}M)</span>
              </div>
            </div>

            <!-- Path & Parameters -->
            <div class="space-y-1 border-t border-dashed border-gray-200 dark:border-gray-800/80 pt-2.5 mt-2">
              <div v-if="server.sys" class="flex items-start">
                <span class="text-indigo-500 dark:text-indigo-400 font-semibold w-24 flex-shrink-0">Home Path</span>:
                <span class="text-gray-600 dark:text-gray-400 break-all ml-1">{{ server.sys.userDir }}</span>
              </div>
              <div v-if="server.jvm" class="flex items-start">
                <span class="text-indigo-500 dark:text-indigo-400 font-semibold w-24 flex-shrink-0">Java Home</span>:
                <span class="text-gray-600 dark:text-gray-400 break-all ml-1">{{ server.jvm.home }}</span>
              </div>
              <div v-if="server.jvm" class="flex items-start">
                <span class="text-indigo-500 dark:text-indigo-400 font-semibold w-24 flex-shrink-0">JVM Args</span>:
                <span class="text-gray-600 dark:text-gray-400 break-all whitespace-pre-wrap ml-1">{{ server.jvm.inputArgs }}</span>
              </div>
            </div>

            <!-- Terminal Palette Colors -->
            <div class="flex gap-1.5 mt-5">
              <span class="inline-block w-6 h-3.5 bg-black dark:bg-gray-800 rounded-sm"></span>
              <span class="inline-block w-6 h-3.5 bg-red-500 rounded-sm"></span>
              <span class="inline-block w-6 h-3.5 bg-green-500 rounded-sm"></span>
              <span class="inline-block w-6 h-3.5 bg-yellow-500 rounded-sm"></span>
              <span class="inline-block w-6 h-3.5 bg-blue-500 rounded-sm"></span>
              <span class="inline-block w-6 h-3.5 bg-fuchsia-500 rounded-sm"></span>
              <span class="inline-block w-6 h-3.5 bg-cyan-500 rounded-sm"></span>
              <span class="inline-block w-6 h-3.5 bg-white dark:bg-gray-300 rounded-sm"></span>
            </div>
          </div>
        </div>

        <!-- 模拟 df -h 挂载分区状态 -->
        <div class="mt-8 border-t border-gray-200 dark:border-gray-800/80 pt-6">
          <div class="flex items-center gap-2 text-green-500 dark:text-green-400 mb-4 font-bold select-none">
            <span>admin@ctk-system:~$</span>
            <span class="text-gray-900 dark:text-white">df -h --total</span>
          </div>
          
          <div class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-[#05070e]/80">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-800 font-mono text-xs text-left">
              <thead>
                <tr class="bg-gray-100 dark:bg-gray-900/60 text-gray-500 dark:text-gray-400 font-semibold border-b border-gray-200 dark:border-gray-800">
                  <th class="px-4 py-3">Filesystem (盘符路径)</th>
                  <th class="px-4 py-3">Type (文件系统)</th>
                  <th class="px-4 py-3">Mount On (类型)</th>
                  <th class="px-4 py-3 text-right">Size (总大小)</th>
                  <th class="px-4 py-3 text-right">Used (已用)</th>
                  <th class="px-4 py-3 text-right">Avail (剩余)</th>
                  <th class="px-4 py-3 text-center">Use% (使用率)</th>
                </tr>
              </thead>
              <tbody v-if="server.sysFiles" class="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-transparent">
                <tr v-for="(sysFile, index) in server.sysFiles" :key="index" class="hover:bg-gray-50 dark:hover:bg-gray-900/40 transition-colors">
                  <td class="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">{{ sysFile.dirName }}</td>
                  <td class="px-4 py-3 text-gray-500 dark:text-gray-400">{{ sysFile.sysTypeName }}</td>
                  <td class="px-4 py-3 text-gray-500 dark:text-gray-400">{{ sysFile.typeName }}</td>
                  <td class="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{{ sysFile.total }}</td>
                  <td class="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{{ sysFile.used }}</td>
                  <td class="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{{ sysFile.free }}</td>
                  <td class="px-4 py-3 text-center">
                    <span :class="sysFile.usage > 80 ? 'text-red-500 font-semibold animate-pulse' : 'text-green-500 font-semibold'">
                      {{ sysFile.usage }}%
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 模拟终端交互行 -->
        <div class="mt-6 flex items-center gap-2 text-gray-500 dark:text-gray-400 select-none">
          <span class="text-green-500 dark:text-green-400 font-bold">admin@ctk-system:~$</span>
          <span class="relative flex items-center">
            <span class="animate-pulse bg-gray-400 dark:bg-gray-300 w-2 h-4.5 inline-block"></span>
          </span>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { getServer } from "@/api/monitor/server";

const loading = ref(false);
const server = ref([]);
const autoRefresh = ref(true);
let timer = null;

// 动态匹配 ASCII Art - 100% 还原用户真实的斜切 Windows 徽标
const asciiWindows = [
  "/////////////////   /////////////////",
  "/////////////////   /////////////////",
  "/////////////////   /////////////////",
  "/////////////////   /////////////////",
  "/////////////////   /////////////////",
  "/////////////////   /////////////////",
  "/////////////////   /////////////////",
  "/////////////////   /////////////////",
  "                                     ",
  "/////////////////   /////////////////",
  "/////////////////   /////////////////",
  "/////////////////   /////////////////",
  "/////////////////   /////////////////",
  "/////////////////   /////////////////",
  "/////////////////   /////////////////",
  "/////////////////   /////////////////",
  "/////////////////   /////////////////"
].join("\n");

const asciiLinux = [
  "        .88888888.",
  "       .8888888888.",
  "      .88   ''   88.",
  "     .88   (OO)   88.",
  "    .88.  .----.  .88.",
  "   .8888  |    |  8888.",
  "   .8888  |____|  8888.",
  "    .88.          .88.",
  "     .88.        .88.",
  "       .8888888888."
].join("\n");

const asciiDefault = [
  "       ._____________________.",
  "      |.                     .|",
  "      ||  Enterprise Admin   ||",
  "      ||   System Monitor    ||",
  "      ||_____________________||",
  "      |_______________________|",
  "      \\\\#####################\\\\",
  "       \\\\#####################\\\\",
  "        \\\\_____________________\\\\"
].join("\n");

const currentAscii = computed(() => {
  const os = server.value.sys?.osName || "";
  if (os.toLowerCase().includes("windows")) {
    return asciiWindows;
  } else if (os.toLowerCase().includes("linux")) {
    return asciiLinux;
  }
  return asciiDefault;
});

// 计算进度条字符块
function getProgressLine(percentage) {
  if (percentage === undefined || percentage === null) {
    return { filledStr: "", emptyStr: "░".repeat(12) };
  }
  const totalBlocks = 12;
  const filledBlocks = Math.min(totalBlocks, Math.max(0, Math.round((percentage / 100) * totalBlocks)));
  const emptyBlocks = totalBlocks - filledBlocks;
  return {
    filledStr: "█".repeat(filledBlocks),
    emptyStr: "░".repeat(emptyBlocks)
  };
}

// 判定颜色类别
function getProgressColor(usage) {
  return usage > 80 ? "text-red-500" : "text-green-500 dark:text-green-400";
}

const loadingModal = useTkLoading();

// 获取数据，新增静默刷新支持以实现轮询不弹 Loading Modal
function getList(isSilent = false) {
  if (!isSilent) {
    loading.value = true;
    loadingModal.start("正在载入 Fastfetch 系统资源面板，请稍候...");
  }
  getServer()
    .then((response) => {
      server.value = response.data;
    })
    .catch((error) => {
      console.error("Failed to load server data:", error);
    })
    .finally(() => {
      if (!isSilent) {
        loading.value = false;
        loadingModal.stop();
      }
    });
}

// 控制轮询开始/暂停
function handleAutoRefreshToggle(val) {
  if (val) {
    startTimer();
  } else {
    stopTimer();
  }
}

function startTimer() {
  stopTimer();
  timer = setInterval(() => {
    getList(true); // 3秒一次静默更新
  }, 3000);
}

function stopTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

onMounted(() => {
  getList(false); // 首次载入弹 loading
  startTimer();   // 随后开始轮询
});

onUnmounted(() => {
  stopTimer();
});
</script>

<style scoped>
/* 终端光标闪烁效果补足 */
.animate-pulse {
  animation: pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}
</style>
