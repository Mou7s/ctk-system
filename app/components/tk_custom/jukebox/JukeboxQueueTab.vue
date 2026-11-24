<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4">
    <!-- 正在播放卡片 -->
    <UCard :ui="{ body: 'p-4 sm:p-5' }">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="min-w-0 flex-1 space-y-1.5">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted">正在播音</span>
            <UBadge
              :color="isPlaying ? 'success' : (isPaused ? 'warning' : 'neutral')"
              variant="soft"
              size="xs"
            >
              {{ isPlaying ? '播放中' : (isPaused ? '已暂停' : '空闲待机') }}
            </UBadge>
            <UBadge v-if="activeScheduleName" color="info" variant="subtle" size="xs" icon="i-lucide-calendar-clock">
              排期：{{ activeScheduleName }}
            </UBadge>
          </div>

          <template v-if="current">
            <h3 class="truncate text-lg font-bold text-highlighted" :title="current.title">
              {{ current.title }}
            </h3>
            <p class="text-xs text-muted">
              {{ current.channelTitle || current.channel || '未标注来源' }}
              <span v-if="current.requestedBy"> · 点歌人：{{ current.requestedBy }}</span>
              <span> · {{ formatJukeboxDuration(playerState.elapsed) }} / {{ formatJukeboxDuration(playerState.duration) }}</span>
            </p>
          </template>
          <p v-else class="text-sm text-muted">
            当前没有正在播放的曲目
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2 shrink-0">
          <UButton
            v-if="current"
            :icon="isPaused ? 'i-lucide-play' : 'i-lucide-pause'"
            :label="isPaused ? '继续' : '暂停'"
            color="primary"
            size="sm"
            :disabled="!canPlay"
            @click="emit('toggle-pause')"
          />
          <UButton
            v-if="current"
            icon="i-lucide-skip-forward"
            label="切下一首"
            color="neutral"
            variant="outline"
            size="sm"
            :loading="switchingNext"
            :disabled="!canPlay"
            @click="emit('next')"
          />
          <UButton
            v-if="current || queue.length"
            icon="i-lucide-square"
            label="停止并清空"
            color="error"
            variant="soft"
            size="sm"
            :disabled="!canPlay"
            @click="emit('stop')"
          />
        </div>
      </div>
    </UCard>

    <div class="grid grid-cols-1 gap-4 xl:grid-cols-12">
      <!-- 左侧：待播队列 -->
      <UCard class="xl:col-span-7" :ui="{ body: 'p-0' }">
        <template #header>
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-list-music" class="size-4 text-primary" />
              <span class="text-sm font-semibold text-highlighted">待播队列</span>
              <UBadge color="neutral" variant="soft" size="xs">{{ queue.length }} 首</UBadge>
            </div>
            <span class="text-xs text-muted">
              共 {{ formatHumanDurationMs(queueTotalMs) }}
            </span>
          </div>
        </template>

        <div v-if="!queue.length" class="py-10">
          <UEmpty
            icon="i-lucide-list-x"
            title="待播队列为空"
            description="可在曲库中或右侧快捷列表中把已就绪曲目加入待播队列"
          />
        </div>

        <div v-else class="divide-y divide-default">
          <div
            v-for="(item, index) in queue"
            :key="`${item.id}-${index}`"
            class="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-elevated/40"
          >
            <div class="flex min-w-0 items-center gap-3">
              <span class="w-6 text-center font-mono text-xs tabular-nums text-muted">
                {{ index + 1 }}
              </span>
              <div class="min-w-0">
                <div class="truncate text-sm font-medium text-highlighted" :title="item.title">
                  {{ item.title || '未知曲目' }}
                </div>
                <div class="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span class="truncate max-w-[180px]">{{ item.channelTitle || item.channel || '未标注来源' }}</span>
                  <span v-if="item.requestedBy">· 点播：{{ item.requestedBy }}</span>
                  <span v-else-if="item.scheduleId">· 排期队列</span>
                </div>
              </div>
            </div>

            <div class="flex items-center gap-2 shrink-0">
              <span class="font-mono text-xs tabular-nums text-muted">
                {{ formatJukeboxDuration(item.duration || Math.round((item.durationMs || 0) / 1000)) }}
              </span>
              <UTooltip text="移出待播队列">
                <UButton
                  icon="i-lucide-x"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :disabled="!canPlay"
                  aria-label="移出队列"
                  @click="emit('remove-item', item)"
                />
              </UTooltip>
            </div>
          </div>
        </div>
      </UCard>

      <!-- 右侧：从当前专辑快捷点歌入队 -->
      <UCard class="xl:col-span-5" :ui="{ body: 'p-4' }">
        <template #header>
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <span class="text-sm font-semibold text-highlighted">快捷点歌入队</span>
              <p v-if="activeAlbum" class="truncate text-xs text-muted">当前专辑：{{ activeAlbum.name }}</p>
            </div>
          </div>
        </template>

        <div v-if="!activeAlbum" class="py-6 text-center text-xs text-muted">
          请先从左侧选择一张专辑
        </div>
        <div v-else class="space-y-3">
          <UInput
            v-model="quickKeyword"
            icon="i-lucide-search"
            placeholder="筛选可播曲目..."
            size="sm"
            clearable
            class="w-full"
          />
          <div v-if="!readyTracks.length" class="py-6 text-center text-xs text-muted">
            当前专辑暂无匹配的已就绪曲目
          </div>
          <div v-else class="max-h-80 divide-y divide-default overflow-y-auto rounded-lg border border-default">
            <div
              v-for="track in readyTracks"
              :key="track.trackId"
              class="flex items-center justify-between gap-2 px-3 py-2 hover:bg-elevated/40"
            >
              <div class="min-w-0">
                <div class="truncate text-xs font-medium text-highlighted" :title="track.title">
                  {{ track.title }}
                </div>
                <div class="truncate text-[11px] text-muted">
                  {{ track.channel || '未标注来源' }} · {{ formatJukeboxDurationMs(getTrackDurationMs(track)) }}
                </div>
              </div>
              <UButton
                icon="i-lucide-list-plus"
                label="入队"
                size="xs"
                color="primary"
                variant="soft"
                :disabled="!canPlay"
                @click="emit('enqueue-track', track)"
              />
            </div>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup>
import {
  formatHumanDurationMs,
  formatJukeboxDuration,
  formatJukeboxDurationMs,
  getTrackDurationMs,
  isJukeboxTrackReady,
} from '@ctk-system/shared'

const props = defineProps({
  playerState: {
    type: Object,
    required: true,
  },
  activeAlbum: {
    type: Object,
    default: null,
  },
  activeScheduleName: {
    type: String,
    default: '',
  },
  canPlay: {
    type: Boolean,
    default: false,
  },
  switchingNext: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits([
  'toggle-pause',
  'next',
  'stop',
  'remove-item',
  'enqueue-track',
])

const quickKeyword = ref('')

const current = computed(() => props.playerState?.current || null)
const queue = computed(() => Array.isArray(props.playerState?.queue) ? props.playerState.queue : [])
const isPlaying = computed(() => props.playerState?.status === 'playing')
const isPaused = computed(() => Boolean(props.playerState?.paused) || props.playerState?.status === 'paused')

const queueTotalMs = computed(() => queue.value.reduce((total, item) => {
  const ms = Number(item.durationMs || 0) || Number(item.duration || 0) * 1000
  return total + (Number.isFinite(ms) && ms > 0 ? ms : 0)
}, 0))

const readyTracks = computed(() => {
  const list = Array.isArray(props.activeAlbum?.tracks) ? props.activeAlbum.tracks : []
  const kw = quickKeyword.value.trim().toLowerCase()
  return list.filter((track) => {
    if (!isJukeboxTrackReady(track)) return false
    if (!kw) return true
    return [track.title, track.channel].some((field) => String(field || '').toLowerCase().includes(kw))
  })
})
</script>
