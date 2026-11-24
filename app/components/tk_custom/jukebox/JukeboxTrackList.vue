<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4">
    <!-- 空态：未选择专辑 -->
    <div v-if="!album" class="flex flex-1 items-center justify-center py-12">
      <UEmpty
        icon="i-lucide-disc-3"
        title="未选择专辑"
        description="请从左侧曲库列表选择或新建一张专辑"
      />
    </div>

    <template v-else>
      <!-- 专辑头信息与核心动作栏 -->
      <UCard :ui="{ body: 'p-4 sm:p-5' }">
        <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div class="min-w-0 flex-1 space-y-2">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="truncate text-lg font-bold text-highlighted sm:text-xl" :title="album.name">
                {{ album.name }}
              </h2>
              <UBadge v-if="linkedScheduleNames.length" color="info" variant="soft" size="sm" icon="i-lucide-calendar-clock">
                被 {{ linkedScheduleNames.length }} 条排期使用
              </UBadge>
            </div>
            <p v-if="album.description" class="text-sm text-muted">
              {{ album.description }}
            </p>
            <div class="flex flex-wrap items-center gap-2 text-xs">
              <UBadge color="neutral" variant="outline" size="sm">
                共 {{ summary.total }} 首
              </UBadge>
              <UBadge :color="summary.ready > 0 ? 'success' : 'neutral'" variant="soft" size="sm">
                已就绪 {{ summary.ready }} 首
              </UBadge>
              <UBadge v-if="summary.readyDurationMs > 0" color="neutral" variant="subtle" size="sm" icon="i-lucide-clock">
                可播时长 {{ formatHumanDurationMs(summary.readyDurationMs) }}
              </UBadge>
              <UBadge v-if="summary.needSyncCount > 0" color="warning" variant="soft" size="sm">
                待同步/异常 {{ summary.needSyncCount }} 首
              </UBadge>
              <UBadge v-if="summary.missing > 0" color="neutral" variant="soft" size="sm">
                缺本地音频 {{ summary.missing }} 首
              </UBadge>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2 shrink-0">
            <UButton
              icon="i-lucide-play"
              label="顺序播放"
              color="primary"
              size="sm"
              :disabled="!canPlay || summary.ready === 0"
              @click="emit('play-album', { album, shuffle: false })"
            />
            <UButton
              icon="i-lucide-shuffle"
              label="随机播放"
              color="neutral"
              variant="outline"
              size="sm"
              :disabled="!canPlay || summary.ready === 0"
              @click="emit('play-album', { album, shuffle: true })"
            />
            <UButton
              v-if="canManage"
              icon="i-lucide-upload"
              label="导入音频"
              color="neutral"
              variant="soft"
              size="sm"
              @click="openImportModal"
            />
            <UDropdownMenu v-if="canManage" :items="albumActionItems">
              <UButton
                icon="i-lucide-more-horizontal"
                color="neutral"
                variant="ghost"
                size="sm"
                aria-label="专辑管理操作"
              />
            </UDropdownMenu>
          </div>
        </div>
      </UCard>

      <!-- 异常媒体 / 旧占位曲目运维提醒条 -->
      <UAlert
        v-if="summary.needSyncCount > 0"
        color="warning"
        variant="soft"
        icon="i-lucide-refresh-cw"
        :title="`当前专辑有 ${summary.needSyncCount} 首曲目的本地音频尚未同步就绪（待同步 ${summary.pending} / 异常 ${summary.failed}）`"
        description="未同步完成的曲目无法被定时广播排期触发播放。"
      >
        <template v-if="canManage" #actions>
          <UButton
            size="xs"
            color="warning"
            variant="solid"
            :loading="retryingSync"
            @click="emit('retry-sync', { albumId: album.albumId })"
          >
            重试同步
          </UButton>
        </template>
      </UAlert>

      <UAlert
        v-if="summary.missing > 0"
        color="neutral"
        variant="subtle"
        icon="i-lucide-info"
        :title="`包含 ${summary.missing} 首无本地音频的旧占位曲目`"
        description="这些旧元数据不会参与播音，也不影响其他本地音频的正常点播；如需清理可点击右侧按钮。"
      >
        <template v-if="canManage" #actions>
          <UButton
            size="xs"
            color="neutral"
            variant="outline"
            :loading="cleaningUnplayable"
            @click="emit('cleanup-unplayable', album)"
          >
            清理旧占位曲
          </UButton>
        </template>
      </UAlert>

      <!-- 筛选与排序提示栏 -->
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex flex-1 flex-wrap items-center gap-2">
          <UInput
            v-model="searchKeyword"
            icon="i-lucide-search"
            placeholder="搜索歌曲标题、艺术家或文件名..."
            clearable
            size="sm"
            class="w-full sm:w-64"
          />
          <div class="flex flex-wrap items-center gap-1">
            <UButton
              v-for="tab in statusFilterOptions"
              :key="tab.value"
              size="xs"
              :color="statusFilter === tab.value ? 'primary' : 'neutral'"
              :variant="statusFilter === tab.value ? 'soft' : 'ghost'"
              @click="statusFilter = tab.value"
            >
              {{ tab.label }}
              <span class="ml-0.5 font-mono text-[11px] opacity-75">({{ tab.count }})</span>
            </UButton>
          </div>
        </div>

        <div class="flex items-center gap-2 text-xs text-muted shrink-0">
          <template v-if="canReorder">
            <UIcon name="i-lucide-grip-vertical" class="size-3.5" />
            <span>支持拖拽行或上下按钮调整播放顺序</span>
          </template>
          <span v-else-if="canManage && tracks.length > 1">
            清空搜索与筛选后可调整播放顺序
          </span>
        </div>
      </div>

      <!-- 曲目清单 -->
      <div v-if="!tracks.length" class="rounded-xl border border-dashed border-default bg-elevated/30 py-12">
        <UEmpty
          icon="i-lucide-music-2"
          title="此专辑暂无曲目"
          description="导入本地 MP3、FLAC、WAV、M4A 等音频文件即可开始点播或编排定时广播"
        >
          <template v-if="canManage" #actions>
            <UButton icon="i-lucide-upload" color="primary" @click="openImportModal">
              导入本地音频
            </UButton>
          </template>
        </UEmpty>
      </div>

      <div v-else-if="!filteredTracks.length" class="rounded-xl border border-dashed border-default bg-elevated/30 py-10">
        <UEmpty
          icon="i-lucide-search-x"
          title="没有匹配的曲目"
          description="尝试调整关键字或状态筛选条件"
        >
          <template #actions>
            <UButton
              size="sm"
              color="neutral"
              variant="outline"
              @click="searchKeyword = ''; statusFilter = 'all'"
            >
              重置筛选
            </UButton>
          </template>
        </UEmpty>
      </div>

      <div v-else class="overflow-hidden rounded-xl border border-default bg-default">
        <!-- 桌面端表头 -->
        <div class="hidden sm:grid sm:grid-cols-[56px_minmax(0,1fr)_160px_84px_124px_164px] items-center gap-3 border-b border-default bg-elevated/60 px-4 py-2.5 text-xs font-semibold text-muted">
          <span class="text-center">#</span>
          <span>曲目 / 媒体信息</span>
          <span>艺术家 / 来源</span>
          <span class="text-right">时长</span>
          <span>媒体状态</span>
          <span class="text-right">操作</span>
        </div>

        <div class="divide-y divide-default">
          <div
            v-for="(track, index) in filteredTracks"
            :key="track.trackId"
            :draggable="canReorder"
            class="transition-colors hover:bg-elevated/50"
            :class="[
              isTrackPlaying(track) ? 'bg-primary/5' : '',
              dragOverTrackId === track.trackId ? 'ring-2 ring-inset ring-primary/50 bg-primary/5' : '',
            ]"
            @dragstart="onTrackDragStart($event, track.trackId)"
            @dragover.prevent="onTrackDragOver(track.trackId)"
            @drop.prevent="onTrackDrop(track.trackId)"
            @dragend="onTrackDragEnd"
            @dblclick="canPlay && isTrackReady(track) && emit('play-track', track)"
          >
            <!-- 桌面端行布局 -->
            <div class="hidden sm:grid sm:grid-cols-[56px_minmax(0,1fr)_160px_84px_124px_164px] items-center gap-3 px-4 py-2.5">
              <div class="flex items-center justify-center gap-1">
                <UIcon
                  v-if="canReorder"
                  name="i-lucide-grip-vertical"
                  class="size-3.5 shrink-0 cursor-grab text-muted active:cursor-grabbing"
                />
                <span
                  v-if="isTrackPlaying(track) && isPlaying"
                  class="inline-flex items-center gap-0.5 text-primary"
                  title="正在播音"
                >
                  <UIcon name="i-lucide-volume-2" class="size-4" />
                </span>
                <span v-else class="font-mono text-xs tabular-nums text-muted">
                  {{ trackOrderLabel(track, index) }}
                </span>
              </div>

              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <span
                    class="truncate text-sm font-medium"
                    :class="isTrackPlaying(track) ? 'text-primary font-semibold' : 'text-highlighted'"
                    :title="track.title"
                  >
                    {{ track.title }}
                  </span>
                </div>
                <div class="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span v-if="track.mediaFileName" class="truncate max-w-[260px]" :title="track.mediaFileName">
                    {{ track.mediaFileName }}
                  </span>
                  <span v-if="track.mediaCodec || track.mediaFileSize" class="font-mono uppercase">
                    {{ [track.mediaCodec, track.mediaFileSize ? formatJukeboxFileSize(track.mediaFileSize) : ''].filter(Boolean).join(' · ') }}
                  </span>
                </div>
              </div>

              <div class="min-w-0 truncate text-xs text-muted" :title="track.channel || '未标注来源'">
                {{ track.channel || '—' }}
              </div>

              <div class="text-right font-mono text-xs tabular-nums text-muted">
                {{ formatTrackDuration(track) }}
              </div>

              <div>
                <UTooltip :text="trackStatus(track).detail">
                  <UBadge :color="trackStatus(track).color" variant="soft" size="sm">
                    {{ trackStatus(track).label }}
                  </UBadge>
                </UTooltip>
              </div>

              <div class="flex items-center justify-end gap-1">
                <UTooltip text="立即播放">
                  <UButton
                    icon="i-lucide-play"
                    size="xs"
                    color="primary"
                    variant="ghost"
                    :disabled="!canPlay || !isTrackReady(track)"
                    aria-label="立即播放"
                    @click.stop="emit('play-track', track)"
                  />
                </UTooltip>
                <UTooltip text="加入待播队列">
                  <UButton
                    icon="i-lucide-list-plus"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    :disabled="!canPlay || !isTrackReady(track)"
                    aria-label="加入队列"
                    @click.stop="emit('enqueue-track', track)"
                  />
                </UTooltip>
                <template v-if="canReorder">
                  <UButton
                    icon="i-lucide-arrow-up"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    :disabled="reordering || index === 0"
                    aria-label="上移"
                    @click.stop="moveTrack(index, index - 1)"
                  />
                  <UButton
                    icon="i-lucide-arrow-down"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    :disabled="reordering || index === filteredTracks.length - 1"
                    aria-label="下移"
                    @click.stop="moveTrack(index, index + 1)"
                  />
                </template>
                <UDropdownMenu v-if="canManage" :items="trackMenuItems(track)">
                  <UButton
                    icon="i-lucide-ellipsis-vertical"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    aria-label="更多曲目操作"
                    @click.stop
                  />
                </UDropdownMenu>
              </div>
            </div>

            <!-- 移动端紧凑双行卡片 -->
            <div class="flex flex-col gap-2 px-3.5 py-3 sm:hidden">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5">
                    <span class="font-mono text-xs text-muted">{{ trackOrderLabel(track, index) }}.</span>
                    <span
                      class="truncate text-sm font-medium"
                      :class="isTrackPlaying(track) ? 'text-primary font-semibold' : 'text-highlighted'"
                    >
                      {{ track.title }}
                    </span>
                  </div>
                  <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span>{{ track.channel || '未标注来源' }}</span>
                    <span>·</span>
                    <span class="font-mono tabular-nums">{{ formatTrackDuration(track) }}</span>
                    <UBadge :color="trackStatus(track).color" variant="soft" size="xs">
                      {{ trackStatus(track).label }}
                    </UBadge>
                  </div>
                </div>
                <UDropdownMenu v-if="canManage" :items="trackMenuItems(track)">
                  <UButton icon="i-lucide-ellipsis-vertical" size="xs" color="neutral" variant="ghost" />
                </UDropdownMenu>
              </div>
              <div class="flex flex-wrap items-center gap-1.5">
                <UButton
                  icon="i-lucide-play"
                  label="播放"
                  size="xs"
                  color="primary"
                  variant="soft"
                  :disabled="!canPlay || !isTrackReady(track)"
                  @click="emit('play-track', track)"
                />
                <UButton
                  icon="i-lucide-list-plus"
                  label="入队"
                  size="xs"
                  color="neutral"
                  variant="outline"
                  :disabled="!canPlay || !isTrackReady(track)"
                  @click="emit('enqueue-track', track)"
                />
                <template v-if="canReorder">
                  <UButton
                    icon="i-lucide-arrow-up"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    :disabled="reordering || index === 0"
                    @click="moveTrack(index, index - 1)"
                  />
                  <UButton
                    icon="i-lucide-arrow-down"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    :disabled="reordering || index === filteredTracks.length - 1"
                    @click="moveTrack(index, index + 1)"
                  />
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- 导入本地音频弹窗 -->
    <UModal
      v-model:open="importOpen"
      title="导入本地音频"
      :description="album ? `将音频校验、备份并登记到「${album.name}」` : undefined"
      :ui="{ content: 'max-w-2xl' }"
    >
      <template #body>
        <div class="flex flex-col gap-4">
          <UFileUpload
            v-model="selectedFiles"
            multiple
            dropzone
            layout="list"
            :file-image="false"
            file-icon="i-lucide-music-2"
            :accept="JUKEBOX_AUDIO_ACCEPT"
            label="拖拽音频文件到此处，或点击选择文件"
            description="支持 MP3、M4A、AAC、FLAC、WAV、OGG、OPUS、AIFF、APE、WMA（按 SHA-256 自动去重）"
            :disabled="importingFiles"
          />

          <UFormField label="艺术家 / 来源分组（可选）" hint="将统一写入本次批量导入曲目的来源标签">
            <UInput
              v-model="importArtist"
              placeholder="例如：轻音乐、厂区广播通知"
              maxlength="200"
              :disabled="importingFiles"
              class="w-full"
            />
          </UFormField>

          <div v-if="importProgress" class="space-y-2 rounded-lg border border-default bg-elevated/50 p-3">
            <div class="flex items-center justify-between text-xs">
              <span class="truncate font-medium text-highlighted">
                正在校验并导入（{{ importProgress.index }} / {{ importProgress.total }}）：{{ importProgress.fileName }}
              </span>
              <span class="font-mono text-muted">
                {{ Math.round((importProgress.index / Math.max(1, importProgress.total)) * 100) }}%
              </span>
            </div>
            <UProgress
              :model-value="importProgress.index"
              :max="Math.max(1, importProgress.total)"
              size="sm"
            />
          </div>

          <UAlert
            v-if="importSummary"
            :color="importSummary.failures.length ? 'warning' : (importSummary.pending > 0 ? 'info' : 'success')"
            variant="soft"
            icon="i-lucide-check-circle-2"
            :title="`导入完成：成功 ${importSummary.succeeded} 个，重复保留 ${importSummary.duplicated} 个，待同步 ${importSummary.pending} 个，失败 ${importSummary.failures.length} 个`"
          >
            <template v-if="importSummary.failures.length" #description>
              <ul class="mt-1 list-disc pl-4 text-xs space-y-0.5">
                <li v-for="msg in importSummary.failures.slice(0, 5)" :key="msg">{{ msg }}</li>
              </ul>
            </template>
          </UAlert>

          <p class="text-xs text-muted">
            导入仅把文件存入私有媒体库并登记到当前专辑，不会改动现有广播排期或打断正在播放的音频。
          </p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full items-center justify-between gap-2">
          <UButton
            v-if="selectedFiles.length && !importingFiles"
            color="neutral"
            variant="ghost"
            label="清空列表"
            @click="selectedFiles = []"
          />
          <span v-else />
          <div class="flex items-center gap-2">
            <UButton
              color="neutral"
              variant="outline"
              label="关闭"
              :disabled="importingFiles"
              @click="importOpen = false"
            />
            <UButton
              color="primary"
              icon="i-lucide-upload"
              :loading="importingFiles"
              :disabled="!album || !selectedFiles.length"
              @click="submitImport"
            >
              开始导入 ({{ selectedFiles.length }})
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- 编辑单曲信息弹窗 -->
    <UModal
      v-model:open="editTrackOpen"
      title="编辑曲目信息"
      :ui="{ content: 'max-w-md' }"
    >
      <template #body>
        <UForm :state="editTrackForm" class="space-y-4">
          <UFormField label="歌曲标题" required>
            <UInput
              v-model="editTrackForm.title"
              placeholder="请输入歌曲标题"
              maxlength="300"
              class="w-full"
              @keyup.enter="submitEditTrack"
            />
          </UFormField>
          <UFormField label="艺术家 / 来源分组" hint="留空表示不标注来源">
            <UInput
              v-model="editTrackForm.channel"
              placeholder="例如：轻音乐、华语经典"
              maxlength="200"
              class="w-full"
              @keyup.enter="submitEditTrack"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" :disabled="savingTrackEdit" @click="editTrackOpen = false">
            取消
          </UButton>
          <UButton color="primary" :loading="savingTrackEdit" :disabled="!editTrackForm.title.trim()" @click="submitEditTrack">
            保存修改
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup>
import {
  JUKEBOX_AUDIO_ACCEPT,
  formatHumanDurationMs,
  formatJukeboxDurationMs,
  formatJukeboxFileSize,
  getTrackDurationMs,
  getTrackSyncStatusMeta,
  isJukeboxTrackReady,
  moveArrayItem,
  summarizeAlbumTracks,
} from '@ctk-system/shared'

const props = defineProps({
  album: {
    type: Object,
    default: null,
  },
  nowPlaying: {
    type: Object,
    default: null,
  },
  isPlaying: {
    type: Boolean,
    default: false,
  },
  linkedScheduleNames: {
    type: Array,
    default: () => [],
  },
  canPlay: {
    type: Boolean,
    default: false,
  },
  canManage: {
    type: Boolean,
    default: false,
  },
  reordering: {
    type: Boolean,
    default: false,
  },
  retryingSync: {
    type: Boolean,
    default: false,
  },
  cleaningUnplayable: {
    type: Boolean,
    default: false,
  },
  importingFiles: {
    type: Boolean,
    default: false,
  },
  importProgress: {
    type: Object,
    default: null,
  },
  importSummary: {
    type: Object,
    default: null,
  },
  savingTrackEdit: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits([
  'play-album',
  'play-track',
  'enqueue-track',
  'reorder-tracks',
  'edit-album',
  'delete-album',
  'cleanup-unplayable',
  'retry-sync',
  'import-files',
  'update-track',
  'delete-track',
  'clear-import-summary',
])

const searchKeyword = ref('')
const statusFilter = ref('all')

const draggedTrackId = ref(null)
const dragOverTrackId = ref(null)

const importOpen = ref(false)
const selectedFiles = ref([])
const importArtist = ref('')

const editTrackOpen = ref(false)
const editTrackForm = reactive({
  trackId: null,
  title: '',
  channel: '',
})

watch(() => props.album?.albumId, () => {
  searchKeyword.value = ''
  statusFilter.value = 'all'
})

const tracks = computed(() => Array.isArray(props.album?.tracks) ? props.album.tracks : [])
const summary = computed(() => summarizeAlbumTracks(tracks.value))

const statusFilterOptions = computed(() => [
  { label: '全部', value: 'all', count: summary.value.total },
  { label: '已就绪', value: 'ready', count: summary.value.ready },
  { label: '待同步/异常', value: 'need_sync', count: summary.value.needSyncCount },
  { label: '缺本地音频', value: 'missing', count: summary.value.missing },
])

const filteredTracks = computed(() => {
  const kw = searchKeyword.value.trim().toLowerCase()
  return tracks.value.filter((track) => {
    const meta = getTrackSyncStatusMeta(track)
    if (statusFilter.value === 'ready' && !meta.ready) return false
    if (statusFilter.value === 'need_sync' && (meta.ready || meta.code === 'missing_media')) return false
    if (statusFilter.value === 'missing' && meta.code !== 'missing_media') return false
    if (!kw) return true
    return [track.title, track.channel, track.mediaFileName]
      .some((field) => String(field || '').toLowerCase().includes(kw))
  })
})

const canReorder = computed(() => (
  props.canManage
  && !searchKeyword.value.trim()
  && statusFilter.value === 'all'
  && tracks.value.length > 1
))

const albumActionItems = computed(() => {
  const groups = [
    [
      {
        label: '编辑专辑名称与描述',
        icon: 'i-lucide-pencil',
        onSelect: () => emit('edit-album', props.album),
      },
    ],
  ]
  if (summary.value.missing > 0) {
    groups[0].push({
      label: `清理 ${summary.value.missing} 首无音频旧曲目`,
      icon: 'i-lucide-sparkles',
      onSelect: () => emit('cleanup-unplayable', props.album),
    })
  }
  groups.push([
    {
      label: '删除此专辑',
      icon: 'i-lucide-trash-2',
      color: 'error',
      onSelect: () => emit('delete-album', props.album),
    },
  ])
  return groups
})

function isTrackReady(track) {
  return isJukeboxTrackReady(track)
}

function trackStatus(track) {
  return getTrackSyncStatusMeta(track)
}

function formatTrackDuration(track) {
  const ms = getTrackDurationMs(track)
  return ms > 0 ? formatJukeboxDurationMs(ms) : '—'
}

function trackOrderLabel(track, fallbackIndex) {
  const idx = tracks.value.findIndex((item) => item.trackId === track.trackId)
  return (idx >= 0 ? idx : fallbackIndex) + 1
}

function isTrackPlaying(track) {
  if (!props.nowPlaying || !track) return false
  if (props.nowPlaying.trackId != null && track.trackId != null) {
    return Number(props.nowPlaying.trackId) === Number(track.trackId)
  }
  return Boolean(track.mediaId && Number(props.nowPlaying.mediaId) === Number(track.mediaId))
}

function trackMenuItems(track) {
  const items = [
    {
      label: '编辑标题 / 来源',
      icon: 'i-lucide-pencil',
      onSelect: () => openEditTrack(track),
    },
  ]
  if (track.mediaId && !isTrackReady(track)) {
    items.push({
      label: '重试同步此音频',
      icon: 'i-lucide-refresh-cw',
      onSelect: () => emit('retry-sync', { mediaId: track.mediaId }),
    })
  }
  return [
    items,
    [
      {
        label: '从专辑移除',
        icon: 'i-lucide-trash-2',
        color: 'error',
        onSelect: () => emit('delete-track', track),
      },
    ],
  ]
}

function moveTrack(fromIndex, toIndex) {
  if (!canReorder.value || props.reordering) return
  const next = moveArrayItem(tracks.value, fromIndex, toIndex)
  emit('reorder-tracks', next.map((item, idx) => ({
    trackId: item.trackId,
    sortOrder: idx + 1,
  })))
}

function onTrackDragStart(event, trackId) {
  if (!canReorder.value || props.reordering) return
  draggedTrackId.value = trackId
  if (event?.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onTrackDragOver(trackId) {
  if (draggedTrackId.value && draggedTrackId.value !== trackId) {
    dragOverTrackId.value = trackId
  }
}

function onTrackDrop(targetTrackId) {
  const sourceId = draggedTrackId.value
  onTrackDragEnd()
  if (!sourceId || sourceId === targetTrackId || !canReorder.value || props.reordering) return
  const fromIndex = tracks.value.findIndex((item) => item.trackId === sourceId)
  const toIndex = tracks.value.findIndex((item) => item.trackId === targetTrackId)
  if (fromIndex === -1 || toIndex === -1) return
  moveTrack(fromIndex, toIndex)
}

function onTrackDragEnd() {
  draggedTrackId.value = null
  dragOverTrackId.value = null
}

function openImportModal() {
  emit('clear-import-summary')
  selectedFiles.value = []
  importOpen.value = true
}

function submitImport() {
  if (!props.album || !selectedFiles.value.length || props.importingFiles) return
  emit('import-files', {
    album: props.album,
    files: [...selectedFiles.value],
    artist: importArtist.value.trim(),
    onDone: (summaryResult) => {
      if (summaryResult && !summaryResult.failures?.length) {
        selectedFiles.value = []
      }
    },
  })
}

function openEditTrack(track) {
  editTrackForm.trackId = track.trackId
  editTrackForm.title = track.title || ''
  editTrackForm.channel = track.channel || ''
  editTrackOpen.value = true
}

function submitEditTrack() {
  if (!props.album || !editTrackForm.trackId || !editTrackForm.title.trim() || props.savingTrackEdit) return
  emit('update-track', {
    albumId: props.album.albumId,
    trackId: editTrackForm.trackId,
    title: editTrackForm.title.trim(),
    channel: editTrackForm.channel.trim(),
    onSuccess: () => {
      editTrackOpen.value = false
    },
  })
}
</script>
