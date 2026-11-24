<template>
  <header class="shrink-0 border-b border-default bg-elevated/40 px-4 py-3 sm:px-6">
    <div class="flex flex-col gap-2.5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <!-- 左侧：移动端曲库入口 + 当前曲目与状态 -->
        <div class="flex min-w-0 flex-1 items-center gap-3">
          <UButton
            icon="i-lucide-library"
            color="neutral"
            variant="outline"
            size="sm"
            class="lg:hidden shrink-0"
            aria-label="选择专辑"
            @click="emit('open-albums-drawer')"
          />

          <div
            class="flex size-10 shrink-0 items-center justify-center rounded-lg border border-default bg-default"
            :class="isPlaying ? 'border-primary/40 bg-primary/10 text-primary' : 'text-muted'"
          >
            <div v-if="isPlaying" class="flex h-4 items-end gap-0.5" aria-hidden="true">
              <span class="jukebox-eq-bar w-0.5 rounded-full bg-primary" />
              <span class="jukebox-eq-bar jukebox-eq-bar-2 w-0.5 rounded-full bg-primary" />
              <span class="jukebox-eq-bar jukebox-eq-bar-3 w-0.5 rounded-full bg-primary" />
            </div>
            <UIcon
              v-else
              :name="isPaused ? 'i-lucide-pause' : (isError ? 'i-lucide-alert-circle' : 'i-lucide-radio')"
              class="size-5"
            />
          </div>

          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-1.5">
              <UBadge :color="statusMeta.color" variant="soft" size="xs">
                {{ statusMeta.label }}
              </UBadge>
              <UBadge
                v-if="sourceBadgeLabel"
                :color="isScheduledActive ? 'info' : 'neutral'"
                variant="subtle"
                size="xs"
                :icon="isScheduledActive ? 'i-lucide-calendar-clock' : 'i-lucide-hand'"
              >
                {{ sourceBadgeLabel }}
              </UBadge>
              <span
                class="truncate text-sm font-semibold text-highlighted"
                :title="currentTitle"
              >
                {{ currentTitle }}
              </span>
            </div>
            <div class="mt-0.5 flex items-center gap-2 text-xs text-muted">
              <span class="truncate">{{ currentSubtitle }}</span>
            </div>
          </div>
        </div>

        <!-- 中部：播控按钮 -->
        <div class="flex flex-wrap items-center gap-1.5">
          <UTooltip :text="!canPlay ? '缺少播控权限' : (current ? (isPaused ? '继续播放' : '暂停播放') : '播放当前专辑')">
            <UButton
              v-if="current"
              :icon="isPaused ? 'i-lucide-play' : 'i-lucide-pause'"
              :label="isPaused ? '继续' : '暂停'"
              color="primary"
              variant="solid"
              size="sm"
              :disabled="!canPlay"
              @click="emit('toggle-pause')"
            />
            <UButton
              v-else
              icon="i-lucide-play"
              label="播放当前专辑"
              color="primary"
              variant="solid"
              size="sm"
              :disabled="!canPlay || !hasReadyAlbum"
              @click="emit('play-active-album')"
            />
          </UTooltip>

          <UTooltip text="下一首">
            <UButton
              icon="i-lucide-skip-forward"
              color="neutral"
              variant="outline"
              size="sm"
              aria-label="下一首"
              :loading="switchingNext"
              :disabled="!canPlay || !current"
              @click="emit('next')"
            />
          </UTooltip>

          <UTooltip text="停止广播并清空当前队列">
            <UButton
              icon="i-lucide-square"
              color="neutral"
              variant="outline"
              size="sm"
              aria-label="停止播放"
              :disabled="!canPlay || (!current && playerState.status === 'idle')"
              @click="emit('stop')"
            />
          </UTooltip>

          <UButton
            icon="i-lucide-list-music"
            color="neutral"
            variant="ghost"
            size="sm"
            @click="emit('open-queue')"
          >
            队列
            <UBadge v-if="queueLength > 0" color="primary" variant="soft" size="xs">
              {{ queueLength }}
            </UBadge>
          </UButton>
        </div>

        <!-- 右侧：音量控制 + 连通与排期同步 -->
        <div class="flex flex-wrap items-center gap-2 sm:gap-3">
          <div class="flex items-center gap-2 rounded-lg border border-default bg-default px-2.5 py-1">
            <UButton
              :icon="isMuted || localVolume === 0 ? 'i-lucide-volume-x' : 'i-lucide-volume-2'"
              color="neutral"
              variant="ghost"
              size="xs"
              :disabled="!canPlay"
              :aria-label="isMuted || localVolume === 0 ? '取消静音' : '静音'"
              @click="toggleMute"
            />
            <USlider
              v-model="localVolume"
              :min="0"
              :max="100"
              :step="1"
              size="xs"
              tooltip
              :disabled="!canPlay"
              class="w-20 sm:w-24"
              aria-label="音量"
              @update:model-value="onSliderInput"
              @change="commitSliderVolume"
            />
            <span class="w-8 text-right text-xs font-mono tabular-nums text-muted">
              {{ localVolume }}%
            </span>
          </div>

          <UBadge
            :color="healthOk ? 'success' : 'error'"
            variant="subtle"
            size="sm"
            :icon="healthOk ? 'i-lucide-wifi' : 'i-lucide-wifi-off'"
          >
            {{ healthOk ? '连通正常' : '连接异常' }}
          </UBadge>

          <UButton
            v-if="canSchedule"
            icon="i-lucide-refresh-cw"
            label="同步排期"
            color="neutral"
            variant="outline"
            size="sm"
            :loading="syncingSchedule"
            @click="emit('sync-schedule')"
          />
        </div>
      </div>

      <!-- 播放进度条 -->
      <div class="flex items-center gap-3">
        <UProgress
          :model-value="progressPercent"
          :max="100"
          size="xs"
          :color="isPaused ? 'warning' : 'primary'"
          class="flex-1"
        />
        <span class="shrink-0 text-xs font-mono tabular-nums text-muted">
          {{ elapsedText }} / {{ durationText }}
        </span>
      </div>

      <UAlert
        v-if="!healthOk || playerState.error"
        color="error"
        variant="soft"
        icon="i-lucide-triangle-alert"
        :title="!healthOk ? '播放器状态轮询连接异常，正在尝试恢复连接' : `播放器异常：${playerState.error}`"
      />
    </div>
  </header>
</template>

<script setup>
import { formatJukeboxDuration } from '@ctk-system/shared'

const props = defineProps({
  playerState: {
    type: Object,
    required: true,
  },
  activeScheduleName: {
    type: String,
    default: '',
  },
  healthOk: {
    type: Boolean,
    default: true,
  },
  canPlay: {
    type: Boolean,
    default: false,
  },
  canSchedule: {
    type: Boolean,
    default: false,
  },
  switchingNext: {
    type: Boolean,
    default: false,
  },
  syncingSchedule: {
    type: Boolean,
    default: false,
  },
  hasReadyAlbum: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits([
  'toggle-pause',
  'next',
  'stop',
  'play-active-album',
  'volume-change',
  'sync-schedule',
  'open-albums-drawer',
  'open-queue',
])

const localVolume = ref(Number(props.playerState?.volume ?? 70))
const preMuteVolume = ref(70)
const isMuted = ref(false)
const isAdjustingVolume = ref(false)
let adjustResetTimer = null

watch(
  () => props.playerState?.volume,
  (nextVol) => {
    if (isAdjustingVolume.value) return
    const num = Number(nextVol)
    if (!Number.isFinite(num)) return
    const clamped = Math.max(0, Math.min(100, Math.round(num)))
    localVolume.value = clamped
    isMuted.value = clamped === 0
    if (clamped > 0) preMuteVolume.value = clamped
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (adjustResetTimer) window.clearTimeout(adjustResetTimer)
})

const current = computed(() => props.playerState?.current || null)
const isPlaying = computed(() => props.playerState?.status === 'playing')
const isPaused = computed(() => Boolean(props.playerState?.paused) || props.playerState?.status === 'paused')
const isError = computed(() => props.playerState?.status === 'error')
const queueLength = computed(() => Array.isArray(props.playerState?.queue) ? props.playerState.queue.length : 0)

const isScheduledActive = computed(() => Boolean(
  props.playerState?.schedule?.activeScheduleId
  || current.value?.scheduleId,
))

const statusMeta = computed(() => {
  if (isPlaying.value) return { label: '正在播音', color: 'success' }
  if (isPaused.value) return { label: '已暂停', color: 'warning' }
  if (isError.value) return { label: '异常', color: 'error' }
  return { label: '空闲待机', color: 'neutral' }
})

const sourceBadgeLabel = computed(() => {
  if (!current.value && !isScheduledActive.value) return ''
  if (isScheduledActive.value) {
    return props.activeScheduleName ? `排期 · ${props.activeScheduleName}` : '定时排期播音'
  }
  return '手动播控'
})

const currentTitle = computed(() => current.value?.title || '厂区广播待机中')
const currentSubtitle = computed(() => {
  if (!current.value) {
    return queueLength.value > 0
      ? `待播队列中有 ${queueLength.value} 首曲目`
      : '请从左侧选择专辑播放，或前往「定时广播排期」设置自动播音'
  }
  const artist = current.value.channelTitle || current.value.channel || '未标注来源'
  return queueLength.value > 0 ? `${artist} · 队列剩余 ${queueLength.value} 首` : artist
})

const elapsedText = computed(() => formatJukeboxDuration(props.playerState?.elapsed || 0))
const durationText = computed(() => formatJukeboxDuration(props.playerState?.duration || 0))
const progressPercent = computed(() => {
  const dur = Number(props.playerState?.duration || 0)
  const el = Number(props.playerState?.elapsed || 0)
  if (!Number.isFinite(dur) || dur <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((el / dur) * 100)))
})

function onSliderInput(val) {
  isAdjustingVolume.value = true
  if (adjustResetTimer) window.clearTimeout(adjustResetTimer)
  adjustResetTimer = window.setTimeout(() => {
    isAdjustingVolume.value = false
  }, 2500)
  const numeric = Array.isArray(val) ? Number(val[0]) : Number(val)
  if (Number.isFinite(numeric)) {
    isMuted.value = numeric === 0
    if (numeric > 0) preMuteVolume.value = numeric
  }
}

function commitSliderVolume() {
  if (adjustResetTimer) window.clearTimeout(adjustResetTimer)
  isAdjustingVolume.value = false
  const clamped = Math.max(0, Math.min(100, Math.round(Number(localVolume.value || 0))))
  localVolume.value = clamped
  isMuted.value = clamped === 0
  if (clamped > 0) preMuteVolume.value = clamped
  emit('volume-change', clamped)
}

function toggleMute() {
  if (!props.canPlay) return
  if (isMuted.value || localVolume.value === 0) {
    const restored = preMuteVolume.value > 0 ? preMuteVolume.value : 70
    localVolume.value = restored
    isMuted.value = false
    emit('volume-change', restored)
  } else {
    preMuteVolume.value = localVolume.value
    localVolume.value = 0
    isMuted.value = true
    emit('volume-change', 0)
  }
}
</script>

<style scoped>
.jukebox-eq-bar {
  height: 5px;
  animation: jukebox-eq 0.7s ease-in-out infinite alternate;
}
.jukebox-eq-bar-2 {
  animation-delay: 0.2s;
}
.jukebox-eq-bar-3 {
  animation-delay: 0.4s;
}
@keyframes jukebox-eq {
  from { height: 4px; }
  to { height: 15px; }
}
</style>
