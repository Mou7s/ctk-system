<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4">
    <!-- 操作头 -->
    <UCard :ui="{ body: 'p-4' }">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 class="text-base font-bold text-highlighted">点歌台系统运行诊断</h2>
          <p class="mt-0.5 text-xs text-muted">
            实时检查同进程播放器音频环境、离线排期缓存、本地媒体校验与近期异常日志。
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2 shrink-0">
          <UButton
            v-if="canManage && needSyncTotal > 0"
            icon="i-lucide-refresh-cw"
            :label="`重试同步异常媒体 (${needSyncTotal})`"
            color="warning"
            variant="soft"
            size="sm"
            :loading="retryingSync"
            @click="emit('retry-sync', {})"
          />
          <UButton
            icon="i-lucide-activity"
            label="重新检测"
            color="primary"
            size="sm"
            :loading="loading"
            :disabled="!canDiagnostics"
            @click="emit('refresh')"
          />
        </div>
      </div>
    </UCard>

    <UAlert
      v-if="!canDiagnostics"
      color="warning"
      variant="soft"
      icon="i-lucide-shield-alert"
      title="当前账号没有「厂区广播系统诊断」权限（tk_custom:jukebox:diagnostics）"
      description="如需查看播放引擎诊断详情，请联系管理员授予诊断权限。"
    />

    <div v-else-if="loading && !data" class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <USkeleton v-for="n in 4" :key="n" class="h-28 w-full rounded-xl" />
    </div>

    <div v-else-if="!data" class="rounded-xl border border-dashed border-default bg-elevated/30 py-10">
      <UEmpty
        icon="i-lucide-activity"
        title="暂未获取诊断快照"
        description="点击下方按钮立即向播放器查询健康状态"
      >
        <template #actions>
          <UButton color="primary" icon="i-lucide-activity" :loading="loading" @click="emit('refresh')">
            开始检测
          </UButton>
        </template>
      </UEmpty>
    </div>

    <template v-else>
      <UAlert
        v-if="data.serviceError || data.player?.error || data.media?.sync?.lastError"
        color="error"
        variant="soft"
        icon="i-lucide-triangle-alert"
        :title="data.serviceError || data.player?.error || data.media?.sync?.lastError"
      />

      <!-- 4 个核心状态卡片 -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <UCard :ui="{ body: 'p-4' }">
          <div class="flex items-start justify-between gap-2">
            <div class="space-y-1">
              <span class="text-xs text-muted">播放器服务 / 音频引擎</span>
              <div class="flex items-center gap-2">
                <UBadge :color="statusColor(data.service?.status)" variant="soft" size="sm">
                  {{ statusLabel(data.service?.status) }}
                </UBadge>
                <span class="text-xs font-mono text-default">{{ data.api?.url || '-' }}</span>
              </div>
              <p class="text-xs text-muted">
                接口通道：{{ statusLabel(data.api?.status) }}
              </p>
            </div>
            <UIcon name="i-lucide-cpu" class="size-5 shrink-0 text-muted" />
          </div>
        </UCard>

        <UCard :ui="{ body: 'p-4' }">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 space-y-1">
              <span class="text-xs text-muted">当前播放状态</span>
              <div class="flex items-center gap-2">
                <UBadge :color="statusColor(data.player?.status)" variant="soft" size="sm">
                  {{ statusLabel(data.player?.status) }}
                </UBadge>
                <span class="truncate text-sm font-semibold text-highlighted">
                  {{ data.player?.current?.title || (data.player?.status === 'idle' ? '空闲待机' : '—') }}
                </span>
              </div>
              <p class="text-xs font-mono tabular-nums text-muted">
                进度：{{ formatJukeboxDuration(data.player?.elapsed) }} / {{ formatJukeboxDuration(data.player?.duration) }}
              </p>
            </div>
            <UIcon name="i-lucide-disc-3" class="size-5 shrink-0 text-muted" />
          </div>
        </UCard>

        <UCard :ui="{ body: 'p-4' }">
          <div class="flex items-start justify-between gap-2">
            <div class="space-y-1">
              <span class="text-xs text-muted">本地离线计划缓存</span>
              <div class="flex items-center gap-2">
                <UBadge :color="statusColor(data.schedule?.status)" variant="soft" size="sm">
                  {{ statusLabel(data.schedule?.status) }}
                </UBadge>
                <span class="text-sm font-semibold text-highlighted font-mono">
                  v{{ data.schedule?.planVersion ?? '-' }}
                </span>
              </div>
              <p class="text-xs text-muted">
                {{ data.schedule?.scheduleCount ?? 0 }} 个已同步计划 · {{ data.schedule?.timezone || 'Asia/Shanghai' }} ·
                {{ data.schedule?.syncedAt ? formatTimeText(data.schedule.syncedAt) : '尚未同步' }}
              </p>
            </div>
            <UIcon name="i-lucide-calendar-check" class="size-5 shrink-0 text-muted" />
          </div>
        </UCard>

        <UCard :ui="{ body: 'p-4' }">
          <div class="flex items-start justify-between gap-2">
            <div class="space-y-1">
              <span class="text-xs text-muted">私有媒体库同步状态</span>
              <div class="flex items-center gap-2">
                <span class="text-sm font-semibold text-highlighted">
                  播放器已登记 {{ data.media?.mediaCount ?? 0 }} 个
                </span>
                <UBadge :color="statusColor(data.media?.sync?.status)" variant="soft" size="xs">
                  数据库 {{ statusLabel(data.media?.sync?.status) }}
                </UBadge>
              </div>
              <p class="text-xs text-muted">
                已就绪 {{ data.media?.sync?.ready ?? 0 }} · 待同步 {{ data.media?.sync?.pending ?? 0 }} · 失败 {{ data.media?.sync?.failed ?? 0 }} · 未知 {{ data.media?.sync?.unknown ?? 0 }}
              </p>
            </div>
            <UIcon name="i-lucide-hard-drive" class="size-5 shrink-0 text-muted" />
          </div>
        </UCard>
      </div>

      <!-- 近期异常日志列表 -->
      <UCard :ui="{ body: 'p-0' }">
        <template #header>
          <div class="flex items-center justify-between">
            <span class="text-sm font-semibold text-highlighted">近期排期与播放异常记录</span>
            <UBadge :color="recentErrors.length ? 'error' : 'success'" variant="soft" size="xs">
              {{ recentErrors.length ? `${recentErrors.length} 条记录` : '运行无异常' }}
            </UBadge>
          </div>
        </template>

        <div v-if="!recentErrors.length" class="px-4 py-8 text-center text-xs text-muted">
          最近未记录排期或播控异常
        </div>

        <div v-else class="divide-y divide-default">
          <div
            v-for="(entry, idx) in recentErrors"
            :key="`${entry.at}-${idx}`"
            class="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="min-w-0 space-y-0.5">
              <p class="text-xs font-medium text-error">{{ entry.message }}</p>
              <p class="text-[11px] text-muted">
                排期 #{{ entry.scheduleId || 0 }}
                <span v-if="entry.trackId != null"> · 曲目 #{{ entry.trackId }}</span>
              </p>
            </div>
            <span class="shrink-0 font-mono text-[11px] text-muted">
              {{ formatTimeText(entry.at) }}
            </span>
          </div>
        </div>
      </UCard>
    </template>
  </div>
</template>

<script setup>
import { formatJukeboxDuration } from '@ctk-system/shared'

const props = defineProps({
  data: {
    type: Object,
    default: null,
  },
  loading: {
    type: Boolean,
    default: false,
  },
  retryingSync: {
    type: Boolean,
    default: false,
  },
  canDiagnostics: {
    type: Boolean,
    default: false,
  },
  canManage: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['refresh', 'retry-sync'])

const needSyncTotal = computed(() => {
  const sync = props.data?.media?.sync
  if (!sync) return 0
  return Number(sync.pending || 0) + Number(sync.failed || 0)
})

const recentErrors = computed(() => {
  const list = Array.isArray(props.data?.recentErrors) ? props.data.recentErrors : []
  return [...list].reverse()
})

function statusLabel(status) {
  const labels = {
    up: '正常',
    down: '连接失败',
    playing: '播放中',
    paused: '已暂停',
    idle: '空闲',
    error: '异常',
    synced: '已同步',
    unsynced: '未同步',
    available: '正常',
    unavailable: '不可用',
  }
  return labels[String(status || 'unavailable')] || '未知'
}

function statusColor(status) {
  const key = String(status || '')
  if (['up', 'playing', 'synced', 'available'].includes(key)) return 'success'
  if (['paused', 'idle'].includes(key)) return 'warning'
  if (['down', 'error'].includes(key)) return 'error'
  return 'neutral'
}

function formatTimeText(value) {
  return String(value || '').replace('T', ' ').replace('+08:00', '').slice(0, 19)
}
</script>
