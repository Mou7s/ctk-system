<template>
  <div class="absolute inset-0 overflow-y-auto bg-gray-50 dark:bg-gray-950">
    <div class="mx-auto max-w-7xl space-y-5 p-4 pb-20 sm:p-6">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-primary">TK KNOWLEDGE</p>
          <h1 class="mt-1 text-2xl font-bold text-gray-900 dark:text-white">视频知识库</h1>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">上传操作指导、培训资料和经验分享，供内部员工在线播放。</p>
        </div>
        <UButton color="primary" icon="i-lucide-upload" @click="openCreate">
          上传视频
        </UButton>
      </div>

      <UCard class="border-gray-200/80 bg-white/90 dark:border-gray-800 dark:bg-gray-900/80" :ui="{ body: 'p-4' }">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
          <UInput
            v-model="query.title"
            icon="i-lucide-search"
            placeholder="搜索视频标题或简介"
            class="w-full lg:max-w-md"
            @keydown.enter="handleSearch"
          />
          <USelect
            v-model="query.category"
            :items="categoryOptions"
            value-key="value"
            label-key="label"
            placeholder="全部分类"
            class="w-full sm:w-48"
          />
          <div class="flex gap-2 lg:ml-auto">
            <UButton color="primary" icon="i-lucide-search" @click="handleSearch">搜索</UButton>
            <UButton color="neutral" variant="outline" icon="i-lucide-rotate-ccw" @click="resetSearch">重置</UButton>
          </div>
        </div>
      </UCard>

      <div v-if="loading" class="py-20 text-center">
        <UProgress animation="carousel" class="mx-auto max-w-sm" />
        <p class="mt-3 text-sm text-gray-500 dark:text-gray-400">正在加载视频...</p>
      </div>

      <div v-else-if="videos.length" class="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <UCard
          v-for="video in videos"
          :key="video.id"
          class="group overflow-hidden border-gray-200/80 bg-white/90 transition hover:-translate-y-0.5 hover:shadow-lg dark:border-gray-800 dark:bg-gray-900/80"
          :ui="{ body: 'p-0' }"
        >
          <button type="button" class="block w-full text-left" @click="openDetail(video)">
            <div class="relative flex aspect-video items-center justify-center overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-primary-950">
              <img
                v-if="video.coverUrl"
                :src="withApiBase(video.coverUrl)"
                :alt="video.title"
                class="absolute inset-0 size-full object-cover transition group-hover:scale-105"
                loading="lazy"
              >
              <template v-else>
                <div class="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(56,189,248,.28),transparent_35%),radial-gradient(circle_at_80%_80%,rgba(129,140,248,.24),transparent_35%)]" />
              </template>
              <div class="absolute inset-0 bg-black/20 transition group-hover:bg-black/30" />
              <UIcon name="i-lucide-play-circle" class="relative size-16 text-white/90 drop-shadow transition group-hover:scale-110" />
              <UBadge v-if="video.category" color="primary" variant="soft" class="absolute left-3 top-3">
                {{ video.category }}
              </UBadge>
              <span class="absolute bottom-3 right-3 rounded bg-black/60 px-2 py-1 text-xs text-white">
                {{ formatDuration(video.durationSeconds) }}
              </span>
            </div>
            <div class="space-y-2 p-4">
              <h2 class="truncate font-semibold text-gray-900 dark:text-white" :title="video.title">{{ video.title }}</h2>
              <p class="line-clamp-2 min-h-10 text-sm leading-5 text-gray-500 dark:text-gray-400">
                {{ video.description || '暂无简介' }}
              </p>
              <div class="flex items-center justify-between gap-3 text-xs text-gray-400">
                <span class="truncate">{{ video.uploaderName || '未知员工' }}</span>
                <span class="shrink-0">{{ formatDate(video.createTime) }} · {{ formatBytes(video.sizeBytes) }}</span>
              </div>
            </div>
          </button>
          <div v-if="video.canEdit" class="flex justify-end gap-1 border-t border-gray-100 px-3 py-2 dark:border-gray-800">
            <UButton variant="ghost" color="primary" size="xs" icon="i-lucide-pencil" @click="openEdit(video)">编辑</UButton>
            <UButton variant="ghost" color="error" size="xs" icon="i-lucide-trash-2" @click="removeVideo(video)">删除</UButton>
          </div>
        </UCard>
      </div>

      <UCard v-else class="border-dashed border-gray-300 bg-white/90 dark:border-gray-700 dark:bg-gray-900/80">
        <div class="flex flex-col items-center justify-center py-20 text-center">
          <UIcon name="i-lucide-video-off" class="size-14 text-gray-300 dark:text-gray-700" />
          <p class="mt-4 font-medium text-gray-700 dark:text-gray-300">还没有找到视频</p>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">上传第一条内部培训或操作指导视频吧。</p>
          <UButton class="mt-5" color="primary" variant="soft" icon="i-lucide-upload" @click="openCreate">上传视频</UButton>
        </div>
      </UCard>

      <pagination
        v-show="total > 0"
        :total="total"
        v-model:page="query.pageNum"
        v-model:limit="query.pageSize"
        @pagination="loadVideos"
      />
    </div>

    <UModal v-model:open="uploadOpen" :title="editingId ? '编辑视频信息' : '上传视频'" :ui="{ content: 'max-w-2xl' }">
      <template #body>
        <UForm :state="form" class="space-y-4">
          <UFormField label="视频标题" name="title" required>
            <UInput v-model="form.title" placeholder="例如：新员工入职安全培训" maxlength="128" class="w-full" />
          </UFormField>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="分类" name="category">
              <UInput v-model="form.category" placeholder="例如：操作指导、培训" maxlength="64" class="w-full" />
            </UFormField>
            <UFormField v-if="!editingId" label="视频文件" name="file" required>
              <div class="flex gap-2">
                <UButton color="neutral" variant="outline" icon="i-lucide-file-video" @click="videoInput?.click()">选择 MP4</UButton>
                <span class="min-w-0 flex-1 self-center truncate text-sm text-gray-500 dark:text-gray-400">{{ videoFile?.name || '未选择文件' }}</span>
              </div>
              <input ref="videoInput" type="file" accept="video/mp4,.mp4" class="hidden" @change="selectVideoFile" />
            </UFormField>
          </div>

          <UFormField label="视频简介" name="description">
            <UTextarea v-model="form.description" :rows="4" maxlength="2000" placeholder="补充视频适用场景、操作要点或注意事项" class="w-full" />
          </UFormField>

          <div v-if="videoPreviewUrl" class="overflow-hidden rounded-xl border border-gray-200 bg-black dark:border-gray-800">
            <video
              ref="previewPlayer"
              :src="videoPreviewUrl"
              controls
              muted
              playsinline
              preload="auto"
              class="max-h-64 w-full object-contain"
              @loadedmetadata="onPreviewMetadata"
            />
          </div>
          <div v-if="videoFile" class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
            <span>大小：{{ formatBytes(videoFile.size) }}</span>
            <span v-if="form.durationSeconds">时长：{{ formatDuration(form.durationSeconds) }}</span>
            <span>限制：512MB，MP4</span>
          </div>

          <div v-if="uploading" class="space-y-2 rounded-lg bg-primary-50 p-3 dark:bg-primary-950/30">
            <div class="flex justify-between text-xs text-primary-700 dark:text-primary-300">
              <span>正在上传视频...</span>
              <span>{{ uploadProgress }}%</span>
            </div>
            <UProgress :model-value="uploadProgress" size="md" />
          </div>
        </UForm>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" :disabled="uploading" @click="closeUpload">取消</UButton>
          <UButton color="primary" :loading="uploading" @click="submitUpload">{{ editingId ? '保存' : '开始上传' }}</UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="detailOpen" :title="detailVideo?.title || '视频播放'" :ui="{ content: 'max-w-5xl' }">
      <template #body>
        <div v-if="detailLoading" class="flex min-h-80 items-center justify-center">
          <UProgress animation="carousel" class="w-64" />
        </div>
        <div v-else-if="detailVideo" class="space-y-4">
          <div class="overflow-hidden rounded-xl bg-black">
            <video
              ref="player"
              :src="playUrl"
              :poster="coverUrl || undefined"
              controls
              playsinline
              preload="metadata"
              controlslist="nodownload"
              class="max-h-[65vh] min-h-64 w-full object-contain"
              @error="handlePlaybackError"
            />
          </div>
          <div class="flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <UBadge v-if="detailVideo.category" color="primary" variant="soft">{{ detailVideo.category }}</UBadge>
            <span>{{ detailVideo.uploaderName || '未知员工' }}</span>
            <span>·</span>
            <span>{{ formatDate(detailVideo.createTime) }}</span>
            <span>·</span>
            <span>{{ formatBytes(detailVideo.sizeBytes) }}</span>
          </div>
          <p class="whitespace-pre-wrap text-sm leading-6 text-gray-600 dark:text-gray-300">{{ detailVideo.description || '暂无简介' }}</p>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup>
import {
  deleteVideoLibrary,
  getVideoPlayToken,
  listVideoLibrary,
  updateVideoLibrary,
  uploadVideoLibrary,
} from '@/api/tk_custom/videoLibrary'

const toast = useToast()
const videoInput = ref(null)
const player = ref(null)
const previewPlayer = ref(null)
const loading = ref(false)
const total = ref(0)
const videos = ref([])
const uploadOpen = ref(false)
const detailOpen = ref(false)
const detailLoading = ref(false)
const detailVideo = ref(null)
const playUrl = ref('')
const coverUrl = ref('')
const videoFile = ref(null)
const coverFile = ref(null)
const videoPreviewUrl = ref('')
const editingId = ref(null)
const uploading = ref(false)
const uploadProgress = ref(0)

const MAX_VIDEO_BYTES = 512 * 1024 * 1024
const ALL_CATEGORIES = '__all__'
const categoryOptions = [
  { label: '全部分类', value: ALL_CATEGORIES },
  { label: '培训', value: '培训' },
  { label: '操作指导', value: '操作指导' },
  { label: '安全规范', value: '安全规范' },
  { label: '经验分享', value: '经验分享' },
  { label: '其他', value: '其他' },
]

const query = reactive({
  pageNum: 1,
  pageSize: 12,
  title: '',
  category: ALL_CATEGORIES,
})

const form = reactive({
  title: '',
  category: '',
  description: '',
  durationSeconds: null,
})

async function loadVideos() {
  loading.value = true
  try {
    const response = await listVideoLibrary({
      ...query,
      category: query.category === ALL_CATEGORIES ? '' : query.category,
    })
    videos.value = response.rows || []
    total.value = Number(response.total || 0)
  } catch (error) {
    toast.add({ title: error?.message || '视频列表加载失败', color: 'error' })
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  query.pageNum = 1
  loadVideos()
}

function resetSearch() {
  query.title = ''
  query.category = ALL_CATEGORIES
  handleSearch()
}

function openCreate() {
  resetUploadForm()
  uploadOpen.value = true
}

function openEdit(video) {
  resetUploadForm()
  editingId.value = video.id
  form.title = video.title || ''
  form.category = video.category || ''
  form.description = video.description || ''
  uploadOpen.value = true
}

function selectVideoFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (!file.name.toLowerCase().endsWith('.mp4') || (file.type && file.type !== 'video/mp4')) {
    toast.add({ title: '请选择有效的 MP4 视频文件', color: 'warning' })
    return
  }
  if (file.size > MAX_VIDEO_BYTES) {
    toast.add({ title: '视频不能超过 512MB', color: 'warning' })
    return
  }
  revokePreviewUrl()
  coverFile.value = null
  videoFile.value = file
  videoPreviewUrl.value = URL.createObjectURL(file)
  if (!editingId.value && !form.title) {
    form.title = file.name.replace(/\.mp4$/i, '')
  }
}

function onPreviewMetadata(event) {
  const video = event.target
  const duration = video.duration
  if (Number.isFinite(duration) && duration >= 0) {
    form.durationSeconds = Math.round(duration)
  }
  captureCoverFromVideo(video)
}

async function captureCoverFromVideo(video) {
  if (!video) return
  try {
    await waitForVideoData(video)
    if (!video.videoWidth || !video.videoHeight) return

    const duration = Number(video.duration)
    // t=0 常未解码或黑场，从极短时间起找第一帧可用画面
    const candidates = [0.04, 0.08, 0.12, 0.2, 0.35, 0.5, 1, 1.5, 2]
      .map((t) => (Number.isFinite(duration) && duration > 0 ? Math.min(t, Math.max(duration - 0.05, 0)) : t))
      .filter((t, i, arr) => t >= 0 && arr.indexOf(t) === i)

    const maxEdge = 1280
    const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight))
    const width = Math.max(1, Math.round(video.videoWidth * scale))
    const height = Math.max(1, Math.round(video.videoHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    let blob = null
    for (const time of candidates) {
      await seekVideo(video, time)
      await waitForPaintedFrame(video)
      ctx.drawImage(video, 0, 0, width, height)
      if (isMostlyBlackFrame(ctx, width, height)) continue
      blob = await canvasToJpeg(canvas, 0.86)
      if (blob) break
    }
    if (!blob) {
      await seekVideo(video, candidates[0] || 0)
      await waitForPaintedFrame(video)
      ctx.drawImage(video, 0, 0, width, height)
      blob = await canvasToJpeg(canvas, 0.86)
    }
    if (blob && blob.size > 2 * 1024 * 1024) {
      blob = await canvasToJpeg(canvas, 0.7)
    }
    if (!blob) return
    coverFile.value = new File([blob], 'auto-cover.jpg', { type: 'image/jpeg' })
  } catch {
    // keep default card style when browser cannot decode a frame
  }
}

function canvasToJpeg(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
}

function isMostlyBlackFrame(ctx, width, height) {
  const sample = Math.min(48, width, height)
  const stepX = Math.max(1, Math.floor(width / sample))
  const stepY = Math.max(1, Math.floor(height / sample))
  const data = ctx.getImageData(0, 0, width, height).data
  let lit = 0
  let total = 0
  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const i = (y * width + x) * 4
      const luminance = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
      if (luminance > 18) lit += 1
      total += 1
    }
  }
  return total > 0 && lit / total < 0.02
}

function waitForVideoData(video) {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      resolve()
    }, 4000)
    const onReady = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('video load failed'))
    }
    const cleanup = () => {
      clearTimeout(timer)
      video.removeEventListener('loadeddata', onReady)
      video.removeEventListener('canplay', onReady)
      video.removeEventListener('error', onError)
    }
    video.addEventListener('loadeddata', onReady)
    video.addEventListener('canplay', onReady)
    video.addEventListener('error', onError)
  })
}

function waitForPaintedFrame(video) {
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      resolve()
    }
    if (typeof video.requestVideoFrameCallback === 'function') {
      const id = video.requestVideoFrameCallback(() => finish())
      setTimeout(() => {
        if (typeof video.cancelVideoFrameCallback === 'function') {
          try { video.cancelVideoFrameCallback(id) } catch { /* ignore */ }
        }
        finish()
      }, 800)
      return
    }
    requestAnimationFrame(() => requestAnimationFrame(finish))
    setTimeout(finish, 120)
  })
}

function seekVideo(video, time) {
  return new Promise((resolve, reject) => {
    if (!Number.isFinite(time)) {
      resolve()
      return
    }
    if (Math.abs((video.currentTime || 0) - time) < 0.001 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      resolve()
      return
    }
    const timer = setTimeout(() => {
      cleanup()
      resolve()
    }, 1500)
    const onSeeked = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('seek failed'))
    }
    const cleanup = () => {
      clearTimeout(timer)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
    }
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('error', onError)
    try {
      video.currentTime = time
    } catch (error) {
      cleanup()
      reject(error)
    }
  })
}

async function submitUpload() {
  if (!form.title.trim()) {
    toast.add({ title: '请输入视频标题', color: 'warning' })
    return
  }
  if (editingId.value) {
    try {
      await updateVideoLibrary({
        id: editingId.value,
        title: form.title.trim(),
        category: form.category.trim(),
        description: form.description.trim(),
      })
      toast.add({ title: '视频信息已保存', color: 'success' })
      closeUpload()
      await loadVideos()
    } catch (error) {
      toast.add({ title: error?.message || '保存失败', color: 'error' })
    }
    return
  }
  if (!videoFile.value) {
    toast.add({ title: '请选择 MP4 视频文件', color: 'warning' })
    return
  }

  if (!coverFile.value && previewPlayer.value) {
    await captureCoverFromVideo(previewPlayer.value)
  }

  const data = new FormData()
  data.append('file', videoFile.value)
  data.append('title', form.title.trim())
  data.append('category', form.category.trim())
  data.append('description', form.description.trim())
  if (form.durationSeconds != null) data.append('durationSeconds', String(form.durationSeconds))
  if (coverFile.value) data.append('coverFile', coverFile.value)

  uploading.value = true
  uploadProgress.value = 0
  try {
    await uploadVideoLibrary(data, {
      timeout: 10 * 60 * 1000,
      onProgress(loaded, totalBytes) {
        uploadProgress.value = totalBytes ? Math.min(99, Math.round((loaded / totalBytes) * 100)) : 0
      },
    })
    uploadProgress.value = 100
    toast.add({ title: '视频上传成功，员工现在可以观看', color: 'success' })
    closeUpload()
    await loadVideos()
  } catch (error) {
    toast.add({ title: error?.message || '视频上传失败', color: 'error' })
  } finally {
    uploading.value = false
  }
}

async function openDetail(video) {
  detailVideo.value = video
  detailOpen.value = true
  detailLoading.value = true
  playUrl.value = ''
  coverUrl.value = ''
  try {
    const response = await getVideoPlayToken(video.id)
    playUrl.value = withApiBase(response.data?.streamUrl)
    coverUrl.value = withApiBase(response.data?.coverUrl)
    if (!playUrl.value) throw new Error('未获取到视频播放地址')
  } catch (error) {
    detailOpen.value = false
    toast.add({ title: error?.message || '视频播放地址获取失败', color: 'error' })
  } finally {
    detailLoading.value = false
  }
}

function withApiBase(path) {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  const base = import.meta.env.VITE_APP_BASE_API || ''
  return `${base.replace(/\/$/, '')}/${String(path).replace(/^\//, '')}`
}

function handlePlaybackError() {
  toast.add({ title: '视频播放失败，可能是编码格式不兼容', color: 'error' })
}

async function removeVideo(video) {
  if (!window.confirm(`确定删除“${video.title}”吗？删除后其他员工将无法观看。`)) return
  try {
    await deleteVideoLibrary(video.id)
    toast.add({ title: '视频已删除', color: 'success' })
    await loadVideos()
  } catch (error) {
    toast.add({ title: error?.message || '删除失败', color: 'error' })
  }
}

function closeUpload() {
  if (uploading.value) return
  uploadOpen.value = false
  resetUploadForm()
}

function resetUploadForm() {
  editingId.value = null
  form.title = ''
  form.category = ''
  form.description = ''
  form.durationSeconds = null
  videoFile.value = null
  coverFile.value = null
  uploadProgress.value = 0
  revokePreviewUrl()
}

function revokePreviewUrl() {
  if (videoPreviewUrl.value) URL.revokeObjectURL(videoPreviewUrl.value)
  videoPreviewUrl.value = ''
}

function formatBytes(value) {
  const bytes = Number(value || 0)
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`
}

function formatDuration(value) {
  const seconds = Number(value || 0)
  if (!seconds) return '未知时长'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}` : `${minutes}:${String(rest).padStart(2, '0')}`
}

function formatDate(value) {
  if (!value) return '-'
  return String(value).slice(0, 10)
}

onMounted(loadVideos)

watch(detailOpen, (open) => {
  if (!open && player.value) {
    player.value.pause()
    player.value.removeAttribute('src')
    player.value.load()
  }
})

onBeforeUnmount(() => {
  revokePreviewUrl()
})
</script>
