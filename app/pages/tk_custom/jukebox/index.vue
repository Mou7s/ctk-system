<template>
  <div class="jukebox-page absolute inset-0 flex flex-col overflow-hidden bg-default text-default">
    <DefineAlbumSidebar>
      <div class="flex h-full min-h-0 flex-col">
        <div class="flex items-center justify-between gap-2 border-b border-default px-4 py-3">
          <div class="flex min-w-0 items-center gap-2">
            <UIcon name="i-lucide-disc-3" class="size-4 shrink-0 text-primary" />
            <span class="truncate text-sm font-bold text-highlighted">专辑曲库</span>
            <UBadge color="neutral" variant="soft" size="xs">{{ albums.length }}</UBadge>
          </div>
          <UButton
            v-if="canManage"
            icon="i-lucide-plus"
            label="新建"
            size="xs"
            color="primary"
            variant="soft"
            @click="openCreateAlbum"
          />
        </div>

        <div class="border-b border-default p-3">
          <UInput
            v-model="albumSearch"
            icon="i-lucide-search"
            placeholder="筛选专辑名称..."
            size="xs"
            clearable
            class="w-full"
          />
        </div>

        <div v-if="albumLoading && !albums.length" class="space-y-2 p-3">
          <USkeleton v-for="n in 5" :key="n" class="h-12 w-full rounded-lg" />
        </div>

        <div v-else-if="!filteredAlbums.length" class="flex flex-1 items-center justify-center p-4">
          <UEmpty
            icon="i-lucide-folder-search"
            :title="albums.length ? '无匹配专辑' : '暂无专辑'"
            :description="albums.length ? '试试更换搜索关键词' : '点击上方「新建」创建第一张专辑'"
          />
        </div>

        <div v-else class="flex-1 space-y-1 overflow-y-auto p-2">
          <button
            v-for="album in filteredAlbums"
            :key="album.albumId"
            type="button"
            class="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left transition-colors"
            :class="Number(activeAlbumId) === Number(album.albumId)
              ? 'bg-elevated text-highlighted ring-1 ring-primary/40 shadow-xs'
              : 'text-default hover:bg-elevated/60'"
            @click="selectAlbum(album.albumId)"
          >
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <span class="truncate text-sm font-medium" :title="album.name">{{ album.name }}</span>
              </div>
              <div class="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                <span>{{ albumStats(album).ready }}/{{ albumStats(album).total }} 首就绪</span>
                <span
                  v-if="linkedEnabledSchedulesMap.get(Number(album.albumId))?.length"
                  class="inline-flex items-center gap-0.5 text-info"
                >
                  <UIcon name="i-lucide-calendar-clock" class="size-3" />
                  已排期
                </span>
              </div>
            </div>

            <div class="flex items-center gap-1 shrink-0">
              <UIcon
                v-if="albumStats(album).needSyncCount > 0"
                name="i-lucide-alert-circle"
                class="size-3.5 text-warning"
                title="包含待同步或失败音频"
              />
              <UBadge
                :color="Number(activeAlbumId) === Number(album.albumId) ? 'primary' : 'neutral'"
                variant="subtle"
                size="xs"
              >
                {{ album.trackCount || 0 }}
              </UBadge>
            </div>
          </button>
        </div>

        <div class="flex items-center justify-between gap-2 border-t border-default px-4 py-2.5 text-xs text-muted">
          <span class="truncate">共 {{ totalTrackCount }} 首 · 就绪 {{ totalReadyTrackCount }} 首</span>
          <UButton
            icon="i-lucide-rotate-cw"
            size="xs"
            color="neutral"
            variant="ghost"
            :loading="refreshing"
            aria-label="刷新数据"
            @click="refreshAll"
          />
        </div>
      </div>
    </DefineAlbumSidebar>

    <!-- 顶部紧凑实时播控台 -->
    <JukeboxPlayerBar
      :player-state="playerState"
      :active-schedule-name="activeScheduleName"
      :health-ok="healthOk"
      :can-play="canPlay"
      :can-schedule="canSchedule"
      :switching-next="switchingNext"
      :syncing-schedule="syncingSchedule"
      :has-ready-album="activeAlbumReadyCount > 0"
      @toggle-pause="togglePause"
      @next="handleNextSong"
      @stop="handleStopPlayback"
      @play-active-album="activeAlbum && handlePlayAlbum({ album: activeAlbum, shuffle: false })"
      @volume-change="handleVolumeChange"
      @sync-schedule="syncScheduleAndRefresh"
      @open-albums-drawer="mobileAlbumDrawerOpen = true"
      @open-queue="activeTab = 'queue'"
    />

    <!-- 主工作台双栏体 -->
    <div class="flex min-h-0 flex-1 overflow-hidden">
      <!-- 桌面端左侧专辑边栏 -->
      <div class="hidden lg:flex lg:w-72 shrink-0 flex-col border-r border-default bg-elevated/30">
        <ReuseAlbumSidebar />
      </div>

      <!-- 移动端左侧专辑抽屉 -->
      <USlideover
        v-model:open="mobileAlbumDrawerOpen"
        side="left"
        title="选择广播专辑"
        :ui="{ content: 'sm:max-w-xs', body: 'p-0 flex flex-col overflow-hidden' }"
      >
        <template #body>
          <ReuseAlbumSidebar />
        </template>
      </USlideover>

      <!-- 右侧标签页工作区 -->
      <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div class="shrink-0 border-b border-default bg-default px-4 pt-2 sm:px-6">
          <UTabs
            v-model="activeTab"
            :items="workspaceTabs"
            :content="false"
            variant="link"
            color="primary"
          />
        </div>

        <div class="relative flex-1 overflow-y-auto p-4 sm:p-6">
          <JukeboxTrackList
            v-if="activeTab === 'library'"
            :album="activeAlbum"
            :now-playing="nowPlaying"
            :is-playing="isPlaying"
            :linked-schedule-names="activeAlbumLinkedScheduleNames"
            :can-play="canPlay"
            :can-manage="canManage"
            :reordering="reorderingTracks"
            :retrying-sync="retryingSync"
            :cleaning-unplayable="cleaningUnplayable"
            :importing-files="importingFiles"
            :import-progress="importProgress"
            :import-summary="importSummary"
            :saving-track-edit="savingTrackEdit"
            @play-album="handlePlayAlbum"
            @play-track="handlePlayTrackImmediately"
            @enqueue-track="handleEnqueueTrack"
            @reorder-tracks="handleReorderTracks"
            @edit-album="openEditAlbum"
            @delete-album="handleDeleteAlbum"
            @cleanup-unplayable="handleCleanupUnplayable"
            @retry-sync="handleRetryMediaSync"
            @import-files="handleImportFiles"
            @update-track="handleUpdateTrack"
            @delete-track="handleDeleteTrack"
            @clear-import-summary="importSummary = null"
          />

          <JukeboxScheduleTab
            v-else-if="activeTab === 'schedule'"
            :schedules="broadcastSchedules"
            :albums="albums"
            :active-schedule-id="activeScheduleId"
            :player-last-played="playerLastPlayed"
            :loading="scheduleLoading"
            :saving="scheduleSaving"
            :syncing="syncingSchedule"
            :can-schedule="canSchedule"
            @save="handleSaveSchedule"
            @toggle="handleToggleSchedule"
            @delete="handleDeleteSchedule"
            @sync="syncScheduleAndRefresh"
          />

          <JukeboxQueueTab
            v-else-if="activeTab === 'queue'"
            :player-state="playerState"
            :active-album="activeAlbum"
            :active-schedule-name="activeScheduleName"
            :can-play="canPlay"
            :switching-next="switchingNext"
            @toggle-pause="togglePause"
            @next="handleNextSong"
            @stop="handleStopPlayback"
            @remove-item="handleRemoveQueueItem"
            @enqueue-track="handleEnqueueTrack"
          />

          <JukeboxDiagnosticsTab
            v-else-if="activeTab === 'diagnostics'"
            :data="diagnosticsData"
            :loading="diagnosticsLoading"
            :retrying-sync="retryingSync"
            :can-diagnostics="canDiagnostics"
            :can-manage="canManage"
            @refresh="fetchDiagnostics"
            @retry-sync="handleRetryMediaSync"
          />
        </div>
      </div>
    </div>

    <!-- 新建 / 编辑专辑弹窗 -->
    <UModal
      v-model:open="albumModalOpen"
      :title="albumForm.albumId ? '编辑专辑' : '新建专辑'"
      :ui="{ content: 'max-w-md' }"
    >
      <template #body>
        <UForm :state="albumForm" class="space-y-4">
          <UFormField label="专辑名称" required>
            <UInput
              v-model="albumForm.name"
              placeholder="例如：早班轻音乐、车间安全宣导"
              maxlength="200"
              class="w-full"
              @keyup.enter="submitAlbumForm"
            />
          </UFormField>
          <UFormField label="简介 / 备注（可选）">
            <UTextarea
              v-model="albumForm.description"
              :rows="3"
              maxlength="500"
              placeholder="补充该专辑的使用场景或曲库说明"
              class="w-full"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" :disabled="savingAlbum" @click="albumModalOpen = false">
            取消
          </UButton>
          <UButton
            color="primary"
            :loading="savingAlbum"
            :disabled="!albumForm.name.trim()"
            @click="submitAlbumForm"
          >
            {{ albumForm.albumId ? '保存修改' : '创建专辑' }}
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup>
import { createReusableTemplate } from '@vueuse/core'
import {
  deleteSong,
  getBackendJukeboxHealth,
  getJukeboxPlayer,
  pausePlayback,
  playJukeboxSongImmediately,
  playNextSong,
  resumePlayback,
  setJukeboxVolume,
  stopPlayback,
  submitSongRequest,
  syncBackendJukeboxSchedule,
} from '@/api/tk_custom/jukebox'
import {
  addAlbum,
  addSchedule,
  cleanupUnplayableTracks,
  delAlbum,
  delSchedule,
  delTrack,
  importTrackFile,
  listAlbum,
  listSchedule,
  listTracks,
  reorderTracks,
  retryMediaSync,
  toggleSchedule,
  updateAlbum,
  updateSchedule,
  updateTrack,
} from '@/composables/autoGeneratedApis'
import { nuxtConfirm, nuxtMsg } from '@/composables/useNuxtFeedback'
import { hasStaticPermission } from '@/router/static-navigation'
import useUserStore from '@/store/modules/user'
import {
  isJukeboxTrackReady,
  summarizeAlbumTracks,
  toPlayableSongPayload,
} from '@ctk-system/shared'
import JukeboxDiagnosticsTab from '@/components/tk_custom/jukebox/JukeboxDiagnosticsTab.vue'
import JukeboxPlayerBar from '@/components/tk_custom/jukebox/JukeboxPlayerBar.vue'
import JukeboxQueueTab from '@/components/tk_custom/jukebox/JukeboxQueueTab.vue'
import JukeboxScheduleTab from '@/components/tk_custom/jukebox/JukeboxScheduleTab.vue'
import JukeboxTrackList from '@/components/tk_custom/jukebox/JukeboxTrackList.vue'

defineOptions({ name: 'FactoryBroadcast' })

const POLL_INTERVAL = 1000
const defaultPlayerState = {
  current: null,
  queue: [],
  status: 'idle',
  error: '',
  elapsed: 0,
  duration: 0,
  paused: false,
  volume: 70,
  schedule: null,
}

const [DefineAlbumSidebar, ReuseAlbumSidebar] = createReusableTemplate()
const userStore = useUserStore()

// 权限计算
const canPlay = computed(() => hasStaticPermission(userStore, 'tk_custom:jukebox:play'))
const canManage = computed(() => hasStaticPermission(userStore, 'tk_custom:jukebox:manage'))
const canSchedule = computed(() => hasStaticPermission(userStore, 'tk_custom:jukebox:schedule'))
const canDiagnostics = computed(() => hasStaticPermission(userStore, 'tk_custom:jukebox:diagnostics'))

// 核心状态
const activeTab = ref('library')
const mobileAlbumDrawerOpen = ref(false)

const playerState = ref({ ...defaultPlayerState })
const healthOk = ref(true)
const playerStateLoading = ref(false)

const albums = ref([])
const activeAlbumId = ref(null)
const albumSearch = ref('')
const albumLoading = ref(false)

const broadcastSchedules = ref([])
const scheduleLoading = ref(false)
const scheduleSaving = ref(false)

const diagnosticsData = ref(null)
const diagnosticsLoading = ref(false)

// 动作加载态
const refreshing = ref(false)
const switchingNext = ref(false)
const syncingSchedule = ref(false)
const reorderingTracks = ref(false)
const retryingSync = ref(false)
const cleaningUnplayable = ref(false)
const savingTrackEdit = ref(false)
const importingFiles = ref(false)
const importProgress = ref(null)
const importSummary = ref(null)

// 专辑弹窗状态
const albumModalOpen = ref(false)
const savingAlbum = ref(false)
const albumForm = reactive({
  albumId: null,
  name: '',
  description: '',
  sourceType: 'manual',
  status: '0',
})

let pollTimer = null

// 派生属性
const nowPlaying = computed(() => playerState.value.current || null)
const isPlaying = computed(() => playerState.value.status === 'playing')
const activeScheduleId = computed(() => {
  const id = playerState.value.schedule?.activeScheduleId ?? playerState.value.current?.scheduleId
  return id != null ? Number(id) : null
})
const playerLastPlayed = computed(() => playerState.value.schedule?.lastPlayed || {})

const activeScheduleName = computed(() => {
  if (!activeScheduleId.value) return ''
  return broadcastSchedules.value.find((plan) => Number(plan.scheduleId) === Number(activeScheduleId.value))?.name || ''
})

const activeAlbum = computed(
  () => albums.value.find((album) => Number(album.albumId) === Number(activeAlbumId.value)) || null,
)
const activeAlbumReadyCount = computed(() => summarizeAlbumTracks(activeAlbum.value?.tracks || []).ready)

const filteredAlbums = computed(() => {
  const kw = albumSearch.value.trim().toLowerCase()
  if (!kw) return albums.value
  return albums.value.filter((album) => String(album.name || '').toLowerCase().includes(kw))
})

const totalTrackCount = computed(() => albums.value.reduce((sum, album) => sum + Number(album.tracks?.length || 0), 0))
const totalReadyTrackCount = computed(() => albums.value.reduce((sum, album) => sum + summarizeAlbumTracks(album.tracks || []).ready, 0))
const enabledScheduleCount = computed(() => broadcastSchedules.value.filter((plan) => plan.enabled === '1').length)

const linkedEnabledSchedulesMap = computed(() => {
  const map = new Map()
  for (const plan of broadcastSchedules.value) {
    if (plan.enabled !== '1') continue
    for (const albumId of plan.albumIds || []) {
      const id = Number(albumId)
      const list = map.get(id) || []
      list.push(plan.name)
      map.set(id, list)
    }
  }
  return map
})

const activeAlbumLinkedScheduleNames = computed(() => {
  if (!activeAlbum.value) return []
  const names = []
  const targetId = Number(activeAlbum.value.albumId)
  for (const plan of broadcastSchedules.value) {
    if ((plan.albumIds || []).some((id) => Number(id) === targetId)) {
      names.push(plan.name)
    }
  }
  return names
})

const workspaceTabs = computed(() => [
  {
    label: '曲库管理',
    value: 'library',
    icon: 'i-lucide-disc-3',
    badge: activeAlbum.value ? (activeAlbum.value.tracks?.length || 0) : undefined,
  },
  {
    label: '定时广播排期',
    value: 'schedule',
    icon: 'i-lucide-calendar-clock',
    badge: enabledScheduleCount.value || undefined,
  },
  {
    label: '播控队列',
    value: 'queue',
    icon: 'i-lucide-list-music',
    badge: playerState.value.queue?.length || undefined,
  },
  {
    label: '系统诊断',
    value: 'diagnostics',
    icon: 'i-lucide-activity',
    disabled: !canDiagnostics.value,
  },
])

watch(activeTab, (tab) => {
  if (tab === 'diagnostics' && canDiagnostics.value && !diagnosticsData.value) {
    fetchDiagnostics()
  } else if (tab === 'schedule') {
    loadSchedules()
  }
})

// ── 工具函数 ──
function albumStats(album) {
  return summarizeAlbumTracks(album?.tracks || [])
}

function sortTrackRows(response) {
  const rows = Array.isArray(response) ? response : (response?.rows || response?.data || [])
  return [...rows].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || (a.trackId || 0) - (b.trackId || 0))
}

function applyPlayerState(data) {
  const raw = data?.player || data?.data?.player || data?.data || data || {}
  const st = {
    ...defaultPlayerState,
    ...raw,
    current: raw.current || raw.nowPlaying || raw.song || null,
    queue: Array.isArray(raw.queue) ? raw.queue : [],
    elapsed: Number(raw.elapsed || 0),
    duration: Number(raw.duration || 0),
    paused: Boolean(raw.paused),
    volume: Number(raw.volume ?? defaultPlayerState.volume),
    schedule: raw.schedule || null,
  }
  playerState.value = st
  healthOk.value = true
}

function selectAlbum(albumId) {
  activeAlbumId.value = albumId
  mobileAlbumDrawerOpen.value = false
  activeTab.value = 'library'
}

// ── 数据加载 ──
async function loadAlbums() {
  albumLoading.value = true
  try {
    const albumRes = await listAlbum({ pageNum: 1, pageSize: 999 })
    const albumRows = Array.isArray(albumRes) ? albumRes : (albumRes?.rows || albumRes?.data || [])
    const trackResults = await Promise.all(
      albumRows.map((album) => listTracks(album.albumId).catch(() => [])),
    )
    const enriched = albumRows.map((album, idx) => {
      const tracks = sortTrackRows(trackResults[idx])
      return {
        ...album,
        tracks,
        trackCount: tracks.length,
      }
    })
    // 保留“凌晨播放”历史空占位记录在数据库，但不当作曲库专辑显示
    const visibleAlbums = enriched.filter((album) => !(album.name === '凌晨播放' && album.tracks.length === 0))
    albums.value = visibleAlbums
    if (!visibleAlbums.some((album) => Number(album.albumId) === Number(activeAlbumId.value))) {
      activeAlbumId.value = visibleAlbums[0]?.albumId ?? null
    }
  } finally {
    albumLoading.value = false
  }
}

async function refreshAlbumTracks(album) {
  if (!album?.albumId) return []
  const response = await listTracks(album.albumId)
  const tracks = sortTrackRows(response)
  const target = albums.value.find((item) => Number(item.albumId) === Number(album.albumId))
  if (target) {
    target.tracks = tracks
    target.trackCount = tracks.length
  }
  return tracks
}

async function loadSchedules() {
  scheduleLoading.value = true
  try {
    const response = await listSchedule({ pageNum: 1, pageSize: 999 })
    const rows = Array.isArray(response)
      ? response
      : (response?.rows || response?.data?.rows || response?.data || [])
    broadcastSchedules.value = rows.map((row) => ({
      ...row,
      scheduleId: Number(row.scheduleId),
      albumIds: Array.isArray(row.albumIds) ? row.albumIds.map(Number) : [],
      albumNames: Array.isArray(row.albumNames) ? row.albumNames : [],
      weekdays: String(row.weekdays || ''),
      enabled: String(row.enabled ?? '0'),
      loop: String(row.loop ?? '0'),
    }))
  } catch {
    // 错误已由全局 fetch 拦截器提示
  } finally {
    scheduleLoading.value = false
  }
}

async function loadPlayerState(silent = true) {
  if (playerStateLoading.value) return
  playerStateLoading.value = true
  try {
    const config = silent ? { headers: { silentError: 'true' } } : {}
    const data = await getJukeboxPlayer(config)
    applyPlayerState(data)
  } catch {
    healthOk.value = false
  } finally {
    playerStateLoading.value = false
  }
}

async function fetchDiagnostics() {
  if (!canDiagnostics.value) return
  diagnosticsLoading.value = true
  try {
    const res = await getBackendJukeboxHealth()
    diagnosticsData.value = res?.data || res || null
  } catch {
    diagnosticsData.value = null
  } finally {
    diagnosticsLoading.value = false
  }
}

async function refreshAll() {
  refreshing.value = true
  try {
    await Promise.all([
      loadAlbums(),
      loadSchedules(),
      loadPlayerState(false),
      activeTab.value === 'diagnostics' && canDiagnostics.value ? fetchDiagnostics() : Promise.resolve(),
    ])
  } finally {
    refreshing.value = false
  }
}

// ── 播控操作 ──
async function handlePlayAlbum({ album, shuffle = false }) {
  if (!canPlay.value || !album?.tracks?.length) return
  const unavailableCount = album.tracks.filter((track) => !isJukeboxTrackReady(track)).length
  const readyList = album.tracks.filter(isJukeboxTrackReady)
  if (!readyList.length) {
    nuxtMsg('此专辑还没有已同步的本地音频', 'warning')
    return
  }
  const ordered = [...readyList]
  if (shuffle) {
    for (let i = ordered.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[ordered[i], ordered[j]] = [ordered[j], ordered[i]]
    }
  }
  const songs = ordered.map(toPlayableSongPayload)
  try {
    const res = await playJukeboxSongImmediately({ song: songs[0], queue: songs.slice(1) })
    applyPlayerState(res)
    nuxtMsg(
      unavailableCount
        ? `已开始播放就绪曲目；另有 ${unavailableCount} 首未就绪曲目已跳过`
        : `已开始${shuffle ? '随机' : '顺序'}播放「${album.name}」`,
      unavailableCount ? 'warning' : 'success',
    )
  } catch {
    // 拦截器已提示具体报错
  }
}

async function handlePlayTrackImmediately(track) {
  if (!canPlay.value) return
  if (!isJukeboxTrackReady(track)) {
    nuxtMsg('该曲目尚未就绪，请先导入或重试同步本地音频', 'warning')
    return
  }
  const allTracks = activeAlbum.value?.tracks || []
  const idx = allTracks.findIndex((item) => item.trackId === track.trackId)
  const song = toPlayableSongPayload(track)
  const queue = (idx >= 0 ? allTracks.slice(idx + 1) : [])
    .filter(isJukeboxTrackReady)
    .map(toPlayableSongPayload)
  try {
    const res = await playJukeboxSongImmediately({ song, queue })
    applyPlayerState(res)
    nuxtMsg(`已立即播放：${track.title}`, 'success')
  } catch {
    // 拦截器已提示
  }
}

async function handleEnqueueTrack(track) {
  if (!canPlay.value) return
  if (!isJukeboxTrackReady(track)) {
    nuxtMsg('该曲目尚未就绪，无法加入播控队列', 'warning')
    return
  }
  try {
    const res = await submitSongRequest({
      ...toPlayableSongPayload(track),
      requestedBy: userStore.nickName || userStore.name || '',
    })
    applyPlayerState(res)
    nuxtMsg(`已加入待播队列：${track.title}`, 'success')
  } catch {
    // 拦截器已提示
  }
}

async function handleRemoveQueueItem(item) {
  if (!canPlay.value || item?.id == null) return
  try {
    const res = await deleteSong(item.id)
    applyPlayerState(res)
    nuxtMsg(`已从队列移除：${item.title || '曲目'}`, 'success')
  } catch {
    // 拦截器已提示
  }
}

async function togglePause() {
  if (!canPlay.value) return
  const wasPaused = Boolean(playerState.value.paused)
  try {
    const res = wasPaused ? await resumePlayback() : await pausePlayback()
    applyPlayerState(res)
    await loadPlayerState(true)
    nuxtMsg(wasPaused ? '已继续播放' : '已暂停广播', 'success')
  } catch {
    // 拦截器已提示
  }
}

async function handleNextSong() {
  if (!canPlay.value || switchingNext.value) return
  switchingNext.value = true
  try {
    const res = await playNextSong()
    applyPlayerState(res)
  } catch {
    // 拦截器已提示
  } finally {
    switchingNext.value = false
  }
}

async function handleStopPlayback() {
  if (!canPlay.value) return
  try {
    const res = await stopPlayback()
    applyPlayerState(res)
    nuxtMsg('已停止广播并清空待播队列', 'success')
  } catch {
    // 拦截器已提示
  }
}

async function handleVolumeChange(volume) {
  if (!canPlay.value) return
  try {
    const res = await setJukeboxVolume(volume)
    applyPlayerState(res)
  } catch {
    // 拦截器已提示
  }
}

async function syncScheduleAndRefresh() {
  if (!canSchedule.value || syncingSchedule.value) return
  syncingSchedule.value = true
  try {
    const response = await syncBackendJukeboxSchedule()
    const syncResult = response?.data?.sync || response?.sync
    if (syncResult?.ok === false) {
      nuxtMsg(syncResult.error || '播放器排期同步未完成', 'warning')
    } else {
      const excluded = Number(syncResult?.excludedScheduleCount || 0)
      if (excluded > 0) {
        nuxtMsg(`已同步可用排期；另有 ${excluded} 条排期因专辑内存在未就绪音频被跳过`, 'warning')
      } else {
        nuxtMsg('广播排期已同步至播放器', 'success')
      }
    }
    await Promise.all([loadAlbums(), loadSchedules(), loadPlayerState(true)])
  } catch {
    await loadAlbums().catch(() => {})
  } finally {
    syncingSchedule.value = false
  }
}

// ── 专辑与曲目管理 ──
function openCreateAlbum() {
  Object.assign(albumForm, {
    albumId: null,
    name: '',
    description: '',
    sourceType: 'manual',
    status: '0',
  })
  albumModalOpen.value = true
}

function openEditAlbum(album) {
  if (!album) return
  Object.assign(albumForm, {
    albumId: album.albumId,
    name: album.name || '',
    description: album.description || '',
    sourceType: album.sourceType || 'manual',
    status: album.status || '0',
  })
  albumModalOpen.value = true
}

async function submitAlbumForm() {
  const name = albumForm.name.trim()
  if (!name || savingAlbum.value) return
  savingAlbum.value = true
  try {
    if (albumForm.albumId) {
      await updateAlbum({
        albumId: albumForm.albumId,
        name,
        description: albumForm.description.trim() || null,
        sourceType: albumForm.sourceType || 'manual',
        status: albumForm.status || '0',
      })
      nuxtMsg('专辑信息已更新', 'success')
    } else {
      await addAlbum({
        name,
        description: albumForm.description.trim() || null,
        sourceType: 'manual',
        status: '0',
      })
      nuxtMsg('专辑已创建', 'success')
    }
    albumModalOpen.value = false
    await loadAlbums()
  } catch {
    // 拦截器已提示
  } finally {
    savingAlbum.value = false
  }
}

async function handleDeleteAlbum(album) {
  if (!canManage.value || !album) return
  try {
    await nuxtConfirm(`确认要删除专辑「${album.name}」及其曲目列表吗？此操作不可恢复。`, '删除专辑', {
      type: 'warning',
    })
    await delAlbum(album.albumId)
    nuxtMsg('专辑已删除', 'success')
    if (Number(activeAlbumId.value) === Number(album.albumId)) {
      activeAlbumId.value = null
    }
    await loadAlbums()
  } catch {
    // 取消或拦截器已提示
  }
}

async function handleReorderTracks(items) {
  if (!canManage.value || !activeAlbum.value || reorderingTracks.value) return
  reorderingTracks.value = true
  try {
    await reorderTracks(activeAlbum.value.albumId, items)
    await refreshAlbumTracks(activeAlbum.value)
    nuxtMsg('曲目播放顺序已保存', 'success')
  } catch {
    await refreshAlbumTracks(activeAlbum.value).catch(() => {})
  } finally {
    reorderingTracks.value = false
  }
}

async function handleUpdateTrack({ albumId, trackId, title, channel, onSuccess }) {
  if (!canManage.value || savingTrackEdit.value) return
  savingTrackEdit.value = true
  try {
    await updateTrack(albumId, trackId, { title, channel })
    await refreshAlbumTracks({ albumId })
    nuxtMsg('曲目信息已保存', 'success')
    onSuccess?.()
  } catch {
    // 拦截器已提示
  } finally {
    savingTrackEdit.value = false
  }
}

async function handleDeleteTrack(track) {
  if (!canManage.value || !activeAlbum.value || !track) return
  try {
    await nuxtConfirm(`确认从专辑中移除「${track.title}」吗？`, '移除曲目', { type: 'warning' })
    await delTrack(activeAlbum.value.albumId, track.trackId)
    await refreshAlbumTracks(activeAlbum.value)
    nuxtMsg('已从专辑移除该曲目', 'success')
  } catch {
    // 取消或拦截器已提示
  }
}

async function handleCleanupUnplayable(album) {
  if (!canManage.value || !album || cleaningUnplayable.value) return
  try {
    await nuxtConfirm(
      `确认清理专辑「${album.name}」中所有缺少本地音频的旧占位曲目吗？已上传的本地音频不会被删除。`,
      '清理旧占位曲',
      { type: 'warning' },
    )
    cleaningUnplayable.value = true
    const response = await cleanupUnplayableTracks(album.albumId)
    const removed = Number(response?.data?.removed ?? 0)
    await refreshAlbumTracks(album)
    nuxtMsg(removed > 0 ? `已清理 ${removed} 首旧占位曲目` : '没有需要清理的旧占位曲目', 'success')
  } catch {
    // 取消或拦截器已提示
  } finally {
    cleaningUnplayable.value = false
  }
}

async function handleRetryMediaSync(payload = {}) {
  if (!canManage.value || retryingSync.value) return
  retryingSync.value = true
  try {
    const response = await retryMediaSync(payload)
    const data = response?.data || {}
    const attempted = Number(data.attempted || 0)
    const ready = Number(data.ready || 0)
    const failed = Number(data.failed || 0)
    const pending = Number(data.pending || 0)
    if (attempted === 0) {
      nuxtMsg('当前没有需要重试同步的媒体文件', 'info')
    } else if (failed === 0 && pending === 0) {
      nuxtMsg(`已成功校验并同步 ${ready} 个媒体文件`, 'success')
    } else {
      nuxtMsg(`重试 ${attempted} 个：就绪 ${ready}，待同步 ${pending}，失败 ${failed}`, 'warning')
    }
    await Promise.all([
      loadAlbums(),
      activeTab.value === 'diagnostics' && canDiagnostics.value ? fetchDiagnostics() : Promise.resolve(),
    ])
  } catch {
    // 拦截器已提示
  } finally {
    retryingSync.value = false
  }
}

async function handleImportFiles({ album, files, artist, onDone }) {
  if (!canManage.value || !album || !files?.length || importingFiles.value) return
  importingFiles.value = true
  importSummary.value = null
  const failures = []
  let succeeded = 0
  let duplicated = 0
  let pending = 0
  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]
      importProgress.value = { index: index + 1, total: files.length, fileName: file.name }
      const title = file.name.replace(/\.[^.]+$/, '').trim()
      try {
        const response = await importTrackFile(album.albumId, file, { title, artist })
        const result = response?.data || {}
        if (result.duplicateTrack) duplicated += 1
        else succeeded += 1
        if (result.copyStatus?.player !== 'ready') pending += 1
      } catch (error) {
        failures.push(`${file.name}：${error?.message || '导入失败'}`)
      }
    }
    await refreshAlbumTracks(album)
    const summaryResult = { succeeded, duplicated, pending, failures }
    importSummary.value = summaryResult
    onDone?.(summaryResult)
    if (failures.length) {
      nuxtMsg(`导入完成：成功 ${succeeded + duplicated} 个，失败 ${failures.length} 个`, 'warning')
    } else if (pending > 0) {
      nuxtMsg(`已导入 ${files.length} 个音频；其中 ${pending} 个待同步，可稍后重试`, 'warning')
    } else {
      nuxtMsg(`已成功导入 ${files.length} 个音频文件`, 'success')
    }
  } finally {
    importProgress.value = null
    importingFiles.value = false
  }
}

// ── 排期管理 ──
async function handleSaveSchedule({ scheduleId, payload, onSuccess }) {
  if (!canSchedule.value || scheduleSaving.value) return
  scheduleSaving.value = true
  try {
    if (scheduleId) {
      await updateSchedule({ scheduleId, ...payload })
    } else {
      await addSchedule(payload)
    }
    await Promise.all([loadSchedules(), loadPlayerState(true)])
    nuxtMsg('广播排期已保存并同步', 'success')
    onSuccess?.()
  } catch {
    // 拦截器已提示
  } finally {
    scheduleSaving.value = false
  }
}

async function handleToggleSchedule({ plan, enabled }) {
  if (!canSchedule.value || scheduleSaving.value) return
  scheduleSaving.value = true
  try {
    await toggleSchedule(Number(plan.scheduleId), enabled ? '1' : '0')
    await Promise.all([loadSchedules(), loadPlayerState(true)])
    nuxtMsg(enabled ? `排期「${plan.name}」已启用` : `排期「${plan.name}」已停用`, 'success')
  } catch {
    await loadSchedules().catch(() => {})
  } finally {
    scheduleSaving.value = false
  }
}

async function handleDeleteSchedule(plan) {
  if (!canSchedule.value || scheduleSaving.value) return
  try {
    await nuxtConfirm(`确认删除排期「${plan.name}」吗？`, '删除排期', { type: 'warning' })
    scheduleSaving.value = true
    await delSchedule(Number(plan.scheduleId))
    await Promise.all([loadSchedules(), loadPlayerState(true)])
    nuxtMsg('广播排期已删除', 'success')
  } catch {
    // 取消或拦截器已提示
  } finally {
    scheduleSaving.value = false
  }
}

// ── 生命周期与可见性感知轮询 ──
function startPolling() {
  stopPolling()
  pollTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible') {
      void loadPlayerState(true)
    }
  }, POLL_INTERVAL)
}

function stopPolling() {
  if (pollTimer) {
    window.clearInterval(pollTimer)
    pollTimer = null
  }
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') {
    void loadPlayerState(true)
  }
}

onMounted(() => {
  void refreshAll()
  startPolling()
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onBeforeUnmount(() => {
  stopPolling()
  document.removeEventListener('visibilitychange', onVisibilityChange)
})
</script>
