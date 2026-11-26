<template>
  <div class="server-monitor-page absolute inset-0 overflow-y-auto bg-muted px-4 py-6 transition-colors duration-300 dark:bg-[var(--app-bg)] sm:px-6 lg:px-8">
    <div class="mx-auto flex max-w-7xl flex-col gap-6">
      <!-- 顶部状态与控制栏 -->
      <header class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2.5">
            <h1 class="text-xl font-semibold text-highlighted sm:text-2xl">
              系统服务监控
            </h1>
            <UBadge
              :color="globalHealth.color"
              variant="subtle"
              size="sm"
              :icon="globalHealth.icon"
            >
              {{ globalHealth.label }}
            </UBadge>
          </div>
          <p class="mt-1 truncate text-xs text-muted">
            {{ headerSummary }}
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2.5">
          <span
            v-if="lastUpdatedLabel"
            class="inline-flex items-center gap-1.5 text-xs tabular-nums text-muted"
          >
            <UIcon name="i-lucide-clock" class="size-3.5 shrink-0" aria-hidden="true" />
            <span>更新于 {{ lastUpdatedLabel }}</span>
          </span>

          <USelect
            v-model="refreshInterval"
            :items="refreshOptions"
            value-key="value"
            size="sm"
            aria-label="自动刷新频率"
            class="w-36"
          />

          <UButton
            type="button"
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-lucide-refresh-cw"
            :loading="refreshing"
            @click="handleManualRefresh"
          >
            立即刷新
          </UButton>
        </div>
      </header>

      <!-- 异常提示横幅：保留上次成功快照，不清空页面 -->
      <UAlert
        v-if="fetchError"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        title="监控数据采集异常"
        :description="fetchError"
      >
        <template #actions>
          <UButton
            type="button"
            color="error"
            variant="outline"
            size="xs"
            icon="i-lucide-rotate-cw"
            :loading="refreshing"
            @click="handleManualRefresh"
          >
            立即重试
          </UButton>
        </template>
      </UAlert>

      <!-- 首屏静态骨架屏（不使用脉冲闪烁，不弹全屏遮罩） -->
      <template v-if="initialLoading && !server">
        <div class="space-y-6" aria-hidden="true">
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div
              v-for="idx in 4"
              :key="`kpi-sk-${idx}`"
              class="rounded-2xl border border-default bg-default p-5"
            >
              <div class="flex items-center justify-between">
                <div class="h-4 w-24 rounded bg-elevated" />
                <div class="h-5 w-12 rounded-full bg-elevated" />
              </div>
              <div class="mt-4 h-8 w-28 rounded bg-elevated" />
              <div class="mt-3 h-2 w-full rounded-full bg-elevated" />
              <div class="mt-4 flex justify-between gap-2">
                <div class="h-3 w-20 rounded bg-elevated" />
                <div class="h-3 w-20 rounded bg-elevated" />
              </div>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div
              v-for="idx in 2"
              :key="`detail-sk-${idx}`"
              class="rounded-2xl border border-default bg-default p-5"
            >
              <div class="h-5 w-32 rounded bg-elevated" />
              <div class="mt-4 space-y-3">
                <div v-for="row in 5" :key="row" class="flex justify-between gap-4">
                  <div class="h-3.5 w-24 rounded bg-elevated" />
                  <div class="h-3.5 w-44 rounded bg-elevated" />
                </div>
              </div>
            </div>
          </div>

          <div class="rounded-2xl border border-default bg-default p-5">
            <div class="h-5 w-28 rounded bg-elevated" />
            <div class="mt-4 space-y-3">
              <div class="h-9 w-full rounded bg-elevated" />
              <div class="h-10 w-full rounded bg-elevated" />
            </div>
          </div>
        </div>
        <p class="sr-only">正在加载系统服务监控数据</p>
      </template>

      <!-- 首屏失败且尚无快照时的兜底空态 -->
      <section
        v-else-if="!server"
        class="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-default bg-default px-6 py-14 text-center"
      >
        <UIcon name="i-lucide-server-off" class="size-9 text-muted" aria-hidden="true" />
        <div class="space-y-1">
          <p class="text-sm font-medium text-highlighted">暂无服务监控快照</p>
          <p class="text-xs text-muted">请检查服务端运行状态或网络连接后重试。</p>
        </div>
        <UButton
          type="button"
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-lucide-refresh-cw"
          :loading="refreshing"
          @click="handleManualRefresh"
        >
          重新采集
        </UButton>
      </section>

      <!-- 主内容区 -->
      <template v-else>
        <!-- 核心 KPI 指标区（4 列响应式） -->
        <section aria-label="核心资源指标" class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <!-- 1. CPU 使用率 -->
          <article class="flex flex-col justify-between rounded-2xl border border-default bg-default p-5">
            <div>
              <div class="flex items-center justify-between gap-2">
                <div class="flex min-w-0 items-center gap-2">
                  <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-elevated text-primary-600 dark:text-primary-400" aria-hidden="true">
                    <UIcon name="i-lucide-cpu" class="size-4" />
                  </span>
                  <h2 class="truncate text-sm font-semibold text-highlighted">CPU 使用率</h2>
                </div>
                <div class="flex shrink-0 items-center gap-1.5">
                  <UBadge color="neutral" variant="subtle" size="xs" class="tabular-nums">
                    {{ cpuMetrics.cpuNum }} 核
                  </UBadge>
                  <UBadge :color="cpuStatus.color" variant="subtle" size="xs">
                    {{ cpuStatus.label }}
                  </UBadge>
                </div>
              </div>

              <div class="mt-4 flex items-baseline gap-1.5 tabular-nums">
                <span class="text-2xl font-semibold tracking-tight text-highlighted">
                  {{ formatPercent(cpuMetrics.totalUsage) }}%
                </span>
                <span class="text-xs text-muted">总占用</span>
              </div>

              <UProgress
                :model-value="cpuMetrics.totalUsage"
                :color="cpuStatus.color"
                size="sm"
                class="mt-3"
                :aria-label="`CPU 总使用率 ${formatPercent(cpuMetrics.totalUsage)}%`"
              />
            </div>

            <dl class="mt-4 grid grid-cols-3 gap-2 border-t border-default pt-3 text-xs tabular-nums">
              <div>
                <dt class="text-muted">用户态</dt>
                <dd class="mt-0.5 font-medium text-default">{{ formatPercent(cpuMetrics.used) }}%</dd>
              </div>
              <div>
                <dt class="text-muted">系统态</dt>
                <dd class="mt-0.5 font-medium text-default">{{ formatPercent(cpuMetrics.sys) }}%</dd>
              </div>
              <div>
                <dt class="text-muted">空闲</dt>
                <dd class="mt-0.5 font-medium text-default">{{ formatPercent(cpuMetrics.free) }}%</dd>
              </div>
            </dl>
          </article>

          <!-- 2. 系统内存 -->
          <article class="flex flex-col justify-between rounded-2xl border border-default bg-default p-5">
            <div>
              <div class="flex items-center justify-between gap-2">
                <div class="flex min-w-0 items-center gap-2">
                  <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-elevated text-primary-600 dark:text-primary-400" aria-hidden="true">
                    <UIcon name="i-lucide-memory-stick" class="size-4" />
                  </span>
                  <h2 class="truncate text-sm font-semibold text-highlighted">系统内存</h2>
                </div>
                <UBadge :color="memStatus.color" variant="subtle" size="xs" class="shrink-0">
                  {{ memStatus.label }}
                </UBadge>
              </div>

              <div class="mt-4 flex items-baseline gap-1.5 tabular-nums">
                <span class="text-2xl font-semibold tracking-tight text-highlighted">
                  {{ formatPercent(memMetrics.usage) }}%
                </span>
                <span class="text-xs text-muted">物理内存占用</span>
              </div>

              <UProgress
                :model-value="memMetrics.usage"
                :color="memStatus.color"
                size="sm"
                class="mt-3"
                :aria-label="`系统内存使用率 ${formatPercent(memMetrics.usage)}%`"
              />
            </div>

            <dl class="mt-4 grid grid-cols-3 gap-2 border-t border-default pt-3 text-xs tabular-nums">
              <div>
                <dt class="text-muted">已用</dt>
                <dd class="mt-0.5 font-medium text-default">{{ formatGB(memMetrics.used) }}</dd>
              </div>
              <div>
                <dt class="text-muted">总计</dt>
                <dd class="mt-0.5 font-medium text-default">{{ formatGB(memMetrics.total) }}</dd>
              </div>
              <div>
                <dt class="text-muted">可用</dt>
                <dd class="mt-0.5 font-medium text-default">{{ formatGB(memMetrics.free) }}</dd>
              </div>
            </dl>
          </article>

          <!-- 3. 服务进程内存（RSS 为主，绝不对 heapUsed/heapTotal 标红） -->
          <article class="flex flex-col justify-between rounded-2xl border border-default bg-default p-5">
            <div>
              <div class="flex items-center justify-between gap-2">
                <div class="flex min-w-0 items-center gap-2">
                  <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-elevated text-primary-600 dark:text-primary-400" aria-hidden="true">
                    <UIcon name="i-lucide-layers" class="size-4" />
                  </span>
                  <h2 class="truncate text-sm font-semibold text-highlighted">服务进程内存</h2>
                </div>
                <UBadge :color="processMemStatus.color" variant="subtle" size="xs" class="shrink-0">
                  {{ processMemStatus.label }}
                </UBadge>
              </div>

              <div class="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 tabular-nums">
                <span class="text-2xl font-semibold tracking-tight text-highlighted">
                  {{ formatMB(runtimeMetrics.memory.rssMB) }}
                </span>
                <span class="text-xs text-muted">
                  RSS · 占主机 {{ formatPercent(runtimeMetrics.memory.systemUsage) }}%
                </span>
              </div>

              <UProgress
                :model-value="runtimeMetrics.memory.systemUsage"
                :color="processMemStatus.color"
                size="sm"
                class="mt-3"
                :aria-label="`服务进程 RSS 占宿主机内存 ${formatPercent(runtimeMetrics.memory.systemUsage)}%`"
              />
            </div>

            <div class="mt-4 flex items-center justify-between gap-2 border-t border-default pt-3 text-xs tabular-nums">
              <div class="min-w-0 truncate text-muted">
                <template v-if="runtimeMetrics.memory.hasHeap">
                  <span>堆已用 </span>
                  <span class="font-medium text-default">{{ formatMB(runtimeMetrics.memory.heapUsedMB) }}</span>
                  <span> / 已分配 </span>
                  <span class="font-medium text-default">{{ formatMB(runtimeMetrics.memory.heapTotalMB) }}</span>
                </template>
                <template v-else>
                  <span>常驻物理内存（RSS）</span>
                </template>
              </div>

              <UTooltip
                text="JS 引擎（JavaScriptCore / V8）按需动态扩容堆内存，堆已用接近堆已分配属正常行为。本卡片健康状态以进程 RSS 占宿主机物理内存比例为准，不对堆占比告警。"
              >
                <button
                  type="button"
                  class="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-elevated hover:text-highlighted"
                  aria-label="查看服务进程内存统计口径说明"
                >
                  <UIcon name="i-lucide-help-circle" class="size-3.5" aria-hidden="true" />
                </button>
              </UTooltip>
            </div>
          </article>

          <!-- 4. 系统负载（Linux/macOS） / 服务运行时（Windows 自动降级） -->
          <article class="flex flex-col justify-between rounded-2xl border border-default bg-default p-5">
            <template v-if="loadAvgMetrics.supported">
              <div>
                <div class="flex items-center justify-between gap-2">
                  <div class="flex min-w-0 items-center gap-2">
                    <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-elevated text-primary-600 dark:text-primary-400" aria-hidden="true">
                      <UIcon name="i-lucide-activity" class="size-4" />
                    </span>
                    <h2 class="truncate text-sm font-semibold text-highlighted">系统负载</h2>
                  </div>
                  <UBadge :color="loadStatus.color" variant="subtle" size="xs" class="shrink-0">
                    {{ loadStatus.label }}
                  </UBadge>
                </div>

                <div class="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 tabular-nums">
                  <span class="text-2xl font-semibold tracking-tight text-highlighted">
                    {{ formatLoad(loadAvgMetrics.one) }}
                  </span>
                  <span class="text-xs text-muted">
                    1m · 核均 {{ formatLoad(loadAvgMetrics.ratio1m) }}
                  </span>
                </div>

                <UProgress
                  :model-value="Math.min(100, Math.round(loadAvgMetrics.ratio1m * 100))"
                  :color="loadStatus.color"
                  size="sm"
                  class="mt-3"
                  :aria-label="`1 分钟系统负载核均比 ${formatLoad(loadAvgMetrics.ratio1m)}`"
                />
              </div>

              <dl class="mt-4 grid grid-cols-3 gap-2 border-t border-default pt-3 text-xs tabular-nums">
                <div>
                  <dt class="text-muted">5 分钟</dt>
                  <dd class="mt-0.5 font-medium text-default">{{ formatLoad(loadAvgMetrics.five) }}</dd>
                </div>
                <div>
                  <dt class="text-muted">15 分钟</dt>
                  <dd class="mt-0.5 font-medium text-default">{{ formatLoad(loadAvgMetrics.fifteen) }}</dd>
                </div>
                <div class="min-w-0">
                  <dt class="text-muted">运行时长</dt>
                  <dd class="mt-0.5 truncate font-medium text-default" :title="runtimeMetrics.runTime">
                    {{ runtimeMetrics.runTime }}
                  </dd>
                </div>
              </dl>
            </template>

            <template v-else>
              <div>
                <div class="flex items-center justify-between gap-2">
                  <div class="flex min-w-0 items-center gap-2">
                    <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-elevated text-primary-600 dark:text-primary-400" aria-hidden="true">
                      <UIcon name="i-lucide-timer" class="size-4" />
                    </span>
                    <h2 class="truncate text-sm font-semibold text-highlighted">服务运行时</h2>
                  </div>
                  <UBadge color="neutral" variant="subtle" size="xs" class="shrink-0 font-mono tabular-nums">
                    PID {{ runtimeMetrics.pid ?? "-" }}
                  </UBadge>
                </div>

                <div class="mt-4 tabular-nums">
                  <div class="truncate text-xl font-semibold tracking-tight text-highlighted" :title="runtimeMetrics.runTime">
                    {{ runtimeMetrics.runTime }}
                  </div>
                  <p class="mt-1.5 text-xs text-muted">
                    启动于 {{ formattedStartTime }}
                  </p>
                </div>
              </div>

              <div class="mt-4 flex items-center justify-between gap-2 border-t border-default pt-3 text-xs text-muted">
                <span v-if="sysMetrics.runTime" class="truncate tabular-nums">
                  宿主机已运行 {{ sysMetrics.runTime }}
                </span>
                <span v-else class="truncate">
                  当前平台不提供 Load Average
                </span>
                <UBadge color="neutral" variant="outline" size="xs" class="shrink-0">
                  {{ runtimeMetrics.name }}
                </UBadge>
              </div>
            </template>
          </article>
        </section>

        <!-- 运行时与主机环境详情（2 列） -->
        <section aria-label="运行时与主机详情" class="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <!-- 左卡：应用运行时 -->
          <div class="overflow-hidden rounded-2xl border border-default bg-default">
            <div class="flex items-center justify-between gap-3 border-b border-default px-5 py-4">
              <div class="flex min-w-0 items-center gap-2">
                <UIcon name="i-lucide-box" class="size-4 shrink-0 text-primary-600 dark:text-primary-400" aria-hidden="true" />
                <h2 class="truncate text-sm font-semibold text-highlighted">应用运行时</h2>
              </div>
              <UBadge
                v-if="runtimeMetrics.engine"
                color="neutral"
                variant="subtle"
                size="xs"
                class="shrink-0"
              >
                {{ runtimeMetrics.engine }}
              </UBadge>
            </div>

            <dl class="divide-y divide-default text-sm">
              <div class="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <dt class="text-xs text-muted">运行时与版本</dt>
                <dd class="flex flex-wrap items-center justify-end gap-2 font-medium text-highlighted tabular-nums">
                  <span>{{ runtimeVersionLabel }}</span>
                  <UBadge
                    v-if="runtimeMetrics.nodeCompatVersion && runtimeMetrics.name === 'Bun'"
                    color="neutral"
                    variant="outline"
                    size="xs"
                    class="tabular-nums"
                  >
                    Node 兼容 {{ runtimeMetrics.nodeCompatVersion }}
                  </UBadge>
                </dd>
              </div>

              <div class="flex items-center justify-between gap-4 px-5 py-3">
                <dt class="text-xs text-muted">进程 PID</dt>
                <dd class="font-mono text-xs font-medium text-default tabular-nums">
                  {{ runtimeMetrics.pid ?? "-" }}
                </dd>
              </div>

              <div class="flex items-center justify-between gap-4 px-5 py-3">
                <dt class="text-xs text-muted">启动时间</dt>
                <dd class="text-xs font-medium text-default tabular-nums">
                  {{ formattedStartTime }}
                </dd>
              </div>

              <div class="flex items-center justify-between gap-4 px-5 py-3">
                <dt class="text-xs text-muted">运行时长</dt>
                <dd class="text-xs font-medium text-default tabular-nums">
                  {{ runtimeMetrics.runTime }}
                </dd>
              </div>

              <div
                v-if="runtimeMetrics.memory.hasExtra"
                class="flex items-center justify-between gap-4 px-5 py-3"
              >
                <dt class="text-xs text-muted">扩展内存</dt>
                <dd class="text-xs font-medium text-default tabular-nums">
                  External {{ formatMB(runtimeMetrics.memory.externalMB) }} · ArrayBuffers {{ formatMB(runtimeMetrics.memory.arrayBuffersMB) }}
                </dd>
              </div>

              <div class="flex items-start justify-between gap-4 px-5 py-3">
                <dt class="shrink-0 pt-0.5 text-xs text-muted">运行时路径</dt>
                <dd class="flex min-w-0 items-start gap-1.5 text-right">
                  <span class="break-all font-mono text-xs text-default">
                    {{ runtimeMetrics.execPath || "-" }}
                  </span>
                  <UButton
                    v-if="runtimeMetrics.execPath"
                    type="button"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    icon="i-lucide-copy"
                    aria-label="复制运行时路径"
                    class="shrink-0"
                    @click="copyText(runtimeMetrics.execPath, '运行时路径')"
                  />
                </dd>
              </div>

              <div class="flex items-start justify-between gap-4 px-5 py-3">
                <dt class="shrink-0 pt-0.5 text-xs text-muted">工作目录</dt>
                <dd class="flex min-w-0 items-start gap-1.5 text-right">
                  <span class="break-all font-mono text-xs text-default">
                    {{ sysMetrics.userDir || "-" }}
                  </span>
                  <UButton
                    v-if="sysMetrics.userDir"
                    type="button"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    icon="i-lucide-copy"
                    aria-label="复制工作目录"
                    class="shrink-0"
                    @click="copyText(sysMetrics.userDir, '工作目录')"
                  />
                </dd>
              </div>

              <div class="flex items-start justify-between gap-4 px-5 py-3">
                <dt class="shrink-0 pt-0.5 text-xs text-muted">启动参数</dt>
                <dd class="flex min-w-0 items-start gap-1.5 text-right">
                  <span
                    v-if="runtimeMetrics.inputArgs"
                    class="break-all font-mono text-xs text-default"
                  >
                    {{ runtimeMetrics.inputArgs }}
                  </span>
                  <span v-else class="text-xs text-muted">无</span>
                  <UButton
                    v-if="runtimeMetrics.inputArgs"
                    type="button"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    icon="i-lucide-copy"
                    aria-label="复制启动参数"
                    class="shrink-0"
                    @click="copyText(runtimeMetrics.inputArgs, '启动参数')"
                  />
                </dd>
              </div>
            </dl>
          </div>

          <!-- 右卡：主机环境 -->
          <div class="overflow-hidden rounded-2xl border border-default bg-default">
            <div class="flex items-center justify-between gap-3 border-b border-default px-5 py-4">
              <div class="flex min-w-0 items-center gap-2">
                <UIcon name="i-lucide-server" class="size-4 shrink-0 text-primary-600 dark:text-primary-400" aria-hidden="true" />
                <h2 class="truncate text-sm font-semibold text-highlighted">主机环境</h2>
              </div>
              <UBadge
                v-if="sysMetrics.osArch"
                color="neutral"
                variant="subtle"
                size="xs"
                class="shrink-0 font-mono"
              >
                {{ sysMetrics.osArch }}
              </UBadge>
            </div>

            <dl class="divide-y divide-default text-sm">
              <div class="flex items-center justify-between gap-4 px-5 py-3">
                <dt class="shrink-0 text-xs text-muted">主机名</dt>
                <dd class="truncate font-mono text-xs font-medium text-highlighted" :title="sysMetrics.computerName">
                  {{ sysMetrics.computerName || "-" }}
                </dd>
              </div>

              <div class="flex items-center justify-between gap-4 px-5 py-3">
                <dt class="shrink-0 text-xs text-muted">内网 IP</dt>
                <dd class="flex items-center gap-1.5">
                  <span class="font-mono text-xs font-medium text-default tabular-nums">
                    {{ sysMetrics.computerIp || "-" }}
                  </span>
                  <UButton
                    v-if="sysMetrics.computerIp"
                    type="button"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    icon="i-lucide-copy"
                    aria-label="复制内网 IP"
                    class="shrink-0"
                    @click="copyText(sysMetrics.computerIp, '内网 IP')"
                  />
                </dd>
              </div>

              <div class="flex items-center justify-between gap-4 px-5 py-3">
                <dt class="shrink-0 text-xs text-muted">操作系统</dt>
                <dd class="text-right text-xs font-medium text-default">
                  {{ osFullLabel }}
                </dd>
              </div>

              <div class="flex items-center justify-between gap-4 px-5 py-3">
                <dt class="shrink-0 text-xs text-muted">系统架构</dt>
                <dd class="font-mono text-xs font-medium text-default">
                  {{ sysMetrics.osArch || "-" }}
                </dd>
              </div>

              <div class="flex items-start justify-between gap-4 px-5 py-3">
                <dt class="shrink-0 pt-0.5 text-xs text-muted">CPU 型号</dt>
                <dd class="break-words text-right text-xs font-medium text-default">
                  {{ cpuMetrics.model || "未提供" }}
                </dd>
              </div>

              <div class="flex items-center justify-between gap-4 px-5 py-3">
                <dt class="shrink-0 text-xs text-muted">CPU 核心与主频</dt>
                <dd class="text-xs font-medium text-default tabular-nums">
                  {{ cpuSpecLabel }}
                </dd>
              </div>

              <div v-if="sysMetrics.runTime" class="flex items-center justify-between gap-4 px-5 py-3">
                <dt class="shrink-0 text-xs text-muted">宿主机运行时长</dt>
                <dd class="text-xs font-medium text-default tabular-nums">
                  {{ sysMetrics.runTime }}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <!-- 磁盘存储区（全宽卡片） -->
        <section aria-label="磁盘存储状态" class="overflow-hidden rounded-2xl border border-default bg-default">
          <div class="flex items-center justify-between gap-3 border-b border-default px-5 py-4">
            <div class="flex min-w-0 items-center gap-2">
              <UIcon name="i-lucide-hard-drive" class="size-4 shrink-0 text-primary-600 dark:text-primary-400" aria-hidden="true" />
              <h2 class="truncate text-sm font-semibold text-highlighted">磁盘存储</h2>
            </div>
            <span class="shrink-0 text-xs tabular-nums text-muted">
              共 {{ diskFiles.length }} 项
            </span>
          </div>

          <div v-if="diskFiles.length" class="overflow-x-auto">
            <table class="min-w-full divide-y divide-default text-left text-xs">
              <thead>
                <tr class="bg-elevated/60 text-muted">
                  <th scope="col" class="px-5 py-3 font-medium">挂载路径</th>
                  <th scope="col" class="px-4 py-3 font-medium">文件系统</th>
                  <th scope="col" class="px-4 py-3 font-medium">类型说明</th>
                  <th scope="col" class="px-4 py-3 text-right font-medium">总容量</th>
                  <th scope="col" class="px-4 py-3 text-right font-medium">已用</th>
                  <th scope="col" class="px-4 py-3 text-right font-medium">可用</th>
                  <th scope="col" class="min-w-44 px-5 py-3 font-medium">使用率</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-default">
                <tr
                  v-for="(file, index) in diskFiles"
                  :key="`${file.dirName || 'disk'}-${index}`"
                  class="transition-colors hover:bg-elevated/40"
                >
                  <td class="max-w-xs px-5 py-3.5">
                    <div class="flex items-center gap-1.5">
                      <span class="truncate font-mono font-medium text-highlighted" :title="file.dirName">
                        {{ file.dirName || "-" }}
                      </span>
                      <UButton
                        v-if="file.dirName"
                        type="button"
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        icon="i-lucide-copy"
                        aria-label="复制挂载路径"
                        class="shrink-0"
                        @click="copyText(file.dirName, '挂载路径')"
                      />
                    </div>
                  </td>
                  <td class="whitespace-nowrap px-4 py-3.5 font-mono text-muted">
                    {{ file.sysTypeName || "-" }}
                  </td>
                  <td class="whitespace-nowrap px-4 py-3.5 text-default">
                    {{ file.typeName || "本地分区" }}
                  </td>
                  <td class="whitespace-nowrap px-4 py-3.5 text-right font-medium text-default tabular-nums">
                    {{ file.total || "-" }}
                  </td>
                  <td class="whitespace-nowrap px-4 py-3.5 text-right text-default tabular-nums">
                    {{ file.used || "-" }}
                  </td>
                  <td class="whitespace-nowrap px-4 py-3.5 text-right text-default tabular-nums">
                    {{ file.free || "-" }}
                  </td>
                  <td class="px-5 py-3.5">
                    <div class="flex items-center gap-3">
                      <UProgress
                        :model-value="file.usageValue"
                        :color="file.status.color"
                        size="sm"
                        class="min-w-20 flex-1"
                        :aria-label="`${file.dirName || '磁盘'} 使用率 ${formatPercent(file.usageValue)}%`"
                      />
                      <span class="w-12 shrink-0 text-right font-medium text-highlighted tabular-nums">
                        {{ formatPercent(file.usageValue) }}%
                      </span>
                      <UBadge :color="file.status.color" variant="subtle" size="xs" class="shrink-0">
                        {{ file.status.label }}
                      </UBadge>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div
            v-else
            class="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center"
          >
            <UIcon name="i-lucide-hard-drive" class="size-7 text-muted" aria-hidden="true" />
            <p class="text-sm text-muted">当前运行环境未提供磁盘分区信息</p>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { getServer } from "@/api/monitor/server";

const toast = useToast();

const server = ref(null);
const initialLoading = ref(true);
const refreshing = ref(false);
const fetchError = ref("");
const lastUpdatedAt = ref(null);

const refreshOptions = [
  { label: "关闭自动刷新", value: "0" },
  { label: "每 5 秒", value: "5000" },
  { label: "每 10 秒", value: "10000" },
  { label: "每 30 秒", value: "30000" },
];
const refreshInterval = ref("5000");

let pollTimer = null;
let latestRequestId = 0;
let inFlight = false;

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function clampPercent(value) {
  return Math.min(100, Math.max(0, toNumber(value, 0)));
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function getThresholdStatus(value, warnThreshold, errorThreshold) {
  const numeric = toNumber(value, 0);
  if (numeric >= errorThreshold) {
    return { level: "error", color: "error", label: "告警" };
  }
  if (numeric >= warnThreshold) {
    return { level: "warning", color: "warning", label: "偏高" };
  }
  return { level: "success", color: "success", label: "正常" };
}

function formatPercent(value) {
  const num = clampPercent(value);
  return Number.isInteger(num) ? String(num) : num.toFixed(1);
}

function formatGB(value) {
  return `${toNumber(value, 0).toFixed(2)} GB`;
}

function formatMB(value) {
  const mb = toNumber(value, 0);
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  return `${mb.toFixed(1)} MB`;
}

function formatLoad(value) {
  return toNumber(value, 0).toFixed(2);
}

function formatDateTime(isoString) {
  if (!isoString) return "-";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return String(isoString);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatTimeOnly(dateValue) {
  if (!dateValue) return "";
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// 1. CPU 指标（兼容旧结构无 totalUsage/model/speedMHz/loadAvg）
const cpuMetrics = computed(() => {
  const cpu = server.value?.cpu || {};
  const used = clampPercent(cpu.used);
  const sys = clampPercent(cpu.sys);
  const free = clampPercent(cpu.free);
  const totalUsage = cpu.totalUsage !== undefined && cpu.totalUsage !== null
    ? clampPercent(cpu.totalUsage)
    : clampPercent(round(used + sys, 2));
  const speedMHz = toNumber(cpu.speedMHz ?? cpu.speed, 0);
  return {
    cpuNum: Math.max(0, Math.round(toNumber(cpu.cpuNum, 0))),
    model: typeof cpu.model === "string" ? cpu.model.trim() : "",
    speedMHz,
    used,
    sys,
    free,
    totalUsage,
  };
});

// 2. 系统负载指标（兼容 cpu.loadAvg 对象与 sys.loadAvg 数组）
const loadAvgMetrics = computed(() => {
  const cpu = server.value?.cpu || {};
  const sys = server.value?.sys || {};
  const cpuNum = Math.max(1, cpuMetrics.value.cpuNum || 1);

  if (cpu.loadAvg && typeof cpu.loadAvg === "object") {
    const supported = Boolean(cpu.loadAvg.supported);
    const one = toNumber(cpu.loadAvg.one, 0);
    const five = toNumber(cpu.loadAvg.five, 0);
    const fifteen = toNumber(cpu.loadAvg.fifteen, 0);
    const ratio1m = cpu.loadAvg.ratio1m !== undefined && cpu.loadAvg.ratio1m !== null
      ? toNumber(cpu.loadAvg.ratio1m, 0)
      : round(one / cpuNum, 2);
    return { supported, one, five, fifteen, ratio1m };
  }

  if (Array.isArray(sys.loadAvg) && sys.loadAvg.length >= 3) {
    const one = toNumber(sys.loadAvg[0], 0);
    const five = toNumber(sys.loadAvg[1], 0);
    const fifteen = toNumber(sys.loadAvg[2], 0);
    return {
      supported: sys.platform !== "win32",
      one,
      five,
      fifteen,
      ratio1m: round(one / cpuNum, 2),
    };
  }

  return { supported: false, one: 0, five: 0, fifteen: 0, ratio1m: 0 };
});

// 3. 系统内存指标
const memMetrics = computed(() => {
  const mem = server.value?.mem || {};
  return {
    total: toNumber(mem.total, 0),
    used: toNumber(mem.used, 0),
    free: toNumber(mem.free, 0),
    usage: clampPercent(mem.usage),
  };
});

// 4. 运行时与服务进程指标（runtime 优先，缺失时安全回退 jvm）
const runtimeMetrics = computed(() => {
  const rt = server.value?.runtime;
  const jvm = server.value?.jvm || {};
  const mem = rt?.memory || {};

  const rssMB = mem.rssMB !== undefined && mem.rssMB !== null
    ? toNumber(mem.rssMB, 0)
    : toNumber(jvm.used, 0);

  let systemUsage;
  if (mem.systemUsage !== undefined && mem.systemUsage !== null) {
    systemUsage = clampPercent(mem.systemUsage);
  } else if (mem.rssSystemUsagePercent !== undefined && mem.rssSystemUsagePercent !== null) {
    systemUsage = clampPercent(mem.rssSystemUsagePercent);
  } else if (memMetrics.value.total > 0 && rssMB > 0) {
    systemUsage = clampPercent(round((rssMB / (memMetrics.value.total * 1024)) * 100, 2));
  } else {
    systemUsage = clampPercent(jvm.usage);
  }

  const hasHeap = mem.heapUsedMB !== undefined && mem.heapTotalMB !== undefined;
  const hasExtra = mem.externalMB !== undefined || mem.arrayBuffersMB !== undefined;

  const rawArgs = rt?.inputArgs ?? jvm.inputArgs ?? "";
  const inputArgs = Array.isArray(rawArgs) ? rawArgs.join(" ").trim() : String(rawArgs || "").trim();

  return {
    name: rt?.name || jvm.name || "服务运行时",
    version: rt?.version || jvm.version || "",
    engine: rt?.engine || "",
    nodeCompatVersion: rt?.nodeCompatVersion || "",
    execPath: rt?.execPath || jvm.home || "",
    pid: rt?.pid ?? null,
    startTime: rt?.startTime || jvm.startTime || "",
    runTime: rt?.runTime || jvm.runTime || "-",
    inputArgs,
    memory: {
      rssMB,
      systemUsage,
      hasHeap,
      heapUsedMB: toNumber(mem.heapUsedMB, 0),
      heapTotalMB: toNumber(mem.heapTotalMB, 0),
      hasExtra,
      externalMB: toNumber(mem.externalMB, 0),
      arrayBuffersMB: toNumber(mem.arrayBuffersMB, 0),
    },
  };
});

// 5. 宿主机信息
const sysMetrics = computed(() => {
  const sys = server.value?.sys || {};
  return {
    computerName: sys.computerName || "",
    computerIp: sys.computerIp || "",
    osName: sys.osName || "",
    osRelease: sys.osRelease || "",
    platform: sys.platform || "",
    osArch: sys.osArch || "",
    userDir: sys.userDir || "",
    runTime: sys.runTime || "",
  };
});

// 6. 磁盘分区列表
const diskFiles = computed(() => {
  const raw = Array.isArray(server.value?.sysFiles) ? server.value.sysFiles : [];
  return raw.map((item) => {
    const usageValue = clampPercent(item?.usage);
    return {
      dirName: item?.dirName || "",
      sysTypeName: item?.sysTypeName || "",
      typeName: item?.typeName || "",
      total: item?.total || "",
      used: item?.used || "",
      free: item?.free || "",
      usageValue,
      status: getThresholdStatus(usageValue, 75, 90),
    };
  });
});

// 三级健康状态判定（对齐 #4 第五节阈值）
const cpuStatus = computed(() => getThresholdStatus(cpuMetrics.value.totalUsage, 70, 85));
const memStatus = computed(() => getThresholdStatus(memMetrics.value.usage, 75, 90));
const processMemStatus = computed(() => getThresholdStatus(runtimeMetrics.value.memory.systemUsage, 50, 75));
const loadStatus = computed(() => getThresholdStatus(loadAvgMetrics.value.ratio1m, 0.7, 1.0));

const globalHealth = computed(() => {
  if (fetchError.value) {
    return { color: "error", label: "采集异常", icon: "i-lucide-circle-alert" };
  }
  if (!server.value) {
    return { color: "neutral", label: "采集中", icon: "i-lucide-loader-circle" };
  }

  const statuses = [
    cpuStatus.value.level,
    memStatus.value.level,
    processMemStatus.value.level,
    ...diskFiles.value.map((item) => item.status.level),
  ];
  if (loadAvgMetrics.value.supported) {
    statuses.push(loadStatus.value.level);
  }

  if (statuses.includes("error")) {
    return { color: "error", label: "资源偏高", icon: "i-lucide-alert-triangle" };
  }
  if (statuses.includes("warning")) {
    return { color: "warning", label: "资源偏高", icon: "i-lucide-alert-triangle" };
  }
  return { color: "success", label: "运行正常", icon: "i-lucide-check-circle-2" };
});

const runtimeVersionLabel = computed(() => {
  const { name, version } = runtimeMetrics.value;
  if (!version) return name;
  return `${name} ${version}`;
});

const formattedStartTime = computed(() => formatDateTime(runtimeMetrics.value.startTime));

const osFullLabel = computed(() => {
  const parts = [sysMetrics.value.osName, sysMetrics.value.osRelease].filter(Boolean);
  if (!parts.length) return "-";
  return parts.join(" ");
});

const cpuSpecLabel = computed(() => {
  const cores = `${cpuMetrics.value.cpuNum} 逻辑核心`;
  if (cpuMetrics.value.speedMHz > 0) {
    return `${cores} · ${cpuMetrics.value.speedMHz} MHz`;
  }
  return cores;
});

const headerSummary = computed(() => {
  if (!server.value) {
    return "实时监测主机资源、应用运行时与存储使用状态";
  }
  const host = sysMetrics.value.computerName || "当前主机";
  const osPart = [sysMetrics.value.osName, sysMetrics.value.osArch].filter(Boolean).join(" ");
  return [host, osPart, runtimeVersionLabel.value].filter(Boolean).join(" · ");
});

const lastUpdatedLabel = computed(() => formatTimeOnly(lastUpdatedAt.value));

async function fetchServerMetrics({ silent = false, force = false } = {}) {
  if (!force && inFlight) {
    return;
  }

  const requestId = ++latestRequestId;
  inFlight = true;
  if (!silent) {
    refreshing.value = true;
  }

  try {
    const response = await getServer();
    if (requestId !== latestRequestId) return;

    const payload = response?.data ?? null;
    if (!payload || typeof payload !== "object") {
      throw new Error("服务端返回的数据格式无效");
    }

    server.value = payload;
    fetchError.value = "";
    lastUpdatedAt.value = payload.collectedAt ? new Date(payload.collectedAt) : new Date();
  } catch (error) {
    if (requestId !== latestRequestId) return;
    fetchError.value = error?.message || "请求服务监控接口失败，请稍后重试";
  } finally {
    if (requestId === latestRequestId) {
      inFlight = false;
      initialLoading.value = false;
      refreshing.value = false;
    }
  }
}

function stopTimer() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startTimer() {
  stopTimer();
  const intervalMs = Number(refreshInterval.value);
  if (!intervalMs || intervalMs <= 0) {
    return;
  }
  if (typeof document !== "undefined" && document.hidden) {
    return;
  }
  pollTimer = setInterval(() => {
    fetchServerMetrics({ silent: true, force: false });
  }, intervalMs);
}

function handleManualRefresh() {
  startTimer();
  fetchServerMetrics({ silent: false, force: true });
}

function handleVisibilityChange() {
  if (typeof document === "undefined") return;
  if (document.hidden) {
    stopTimer();
  } else {
    const intervalMs = Number(refreshInterval.value);
    if (intervalMs > 0) {
      fetchServerMetrics({ silent: true, force: false });
      startTimer();
    }
  }
}

async function copyText(text, label) {
  if (!text) return;
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    toast.add({
      title: `已复制${label}`,
      color: "success",
    });
  } catch {
    toast.add({
      title: `复制${label}失败`,
      description: "请手动选中文本复制",
      color: "error",
    });
  }
}

watch(refreshInterval, () => {
  startTimer();
});

onMounted(() => {
  fetchServerMetrics({ silent: false, force: true });
  startTimer();
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }
});

onUnmounted(() => {
  stopTimer();
  if (typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  }
});
</script>

<style scoped>
.server-monitor-page {
  scrollbar-width: thin;
}
</style>
