<template>
  <UModal v-model:open="modalOpen" title="扫描条码" :ui="{ content: 'sm:max-w-lg' }">
    <template #body>
      <div class="space-y-4">
        <div class="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-950">
          <video ref="videoRef" class="size-full object-cover" muted playsinline />
          <div v-if="starting" class="absolute inset-0 grid place-items-center bg-slate-950/80 text-sm text-white">
            <div class="text-center">
              <UIcon name="i-lucide-loader-circle" class="mx-auto mb-2 size-6 animate-spin" />
              正在启动摄像头
            </div>
          </div>
          <div v-else-if="errorMessage" class="absolute inset-0 grid place-items-center bg-slate-950 px-6 text-center text-sm leading-6 text-slate-200">
            <div>
              <UIcon name="i-lucide-camera-off" class="mx-auto mb-3 size-8 text-slate-400" />
              {{ errorMessage }}
            </div>
          </div>
          <template v-else>
            <div class="pointer-events-none absolute inset-x-[12%] top-1/2 h-36 -translate-y-1/2 rounded-xl border-2 border-primary-400/90 shadow-[0_0_0_999px_rgba(2,6,23,0.45)]" />
            <div class="scan-line pointer-events-none absolute inset-x-[16%] top-1/2 h-0.5 bg-primary-400 shadow-[0_0_12px_rgba(96,165,250,0.95)]" />
          </template>
        </div>

        <div class="flex items-start gap-2 rounded-xl bg-primary-50 px-3 py-2.5 text-sm leading-5 text-primary-800 dark:bg-primary-950/40 dark:text-primary-200">
          <UIcon name="i-lucide-scan-barcode" class="mt-0.5 size-4 shrink-0" />
          <span>旧版入库标签二维码较密，请让二维码占满取景框、保持平整并停留1～2秒；实时识别困难时使用“旧标签高清拍照”。识别由本地 WASM 完成，不依赖浏览器原生扫码能力。</span>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-between gap-2">
        <input
          ref="fileInputRef"
          type="file"
          accept="image/*"
          capture="environment"
          class="hidden"
          @change="decodeImage"
        >
        <UButton color="neutral" variant="soft" icon="i-lucide-image" @click="fileInputRef?.click()">
          旧标签高清拍照
        </UButton>
        <div class="flex gap-2">
          <UButton v-if="errorMessage" color="primary" variant="soft" icon="i-lucide-refresh-cw" @click="startCamera">重试</UButton>
          <UButton color="neutral" variant="ghost" @click="modalOpen = false">关闭</UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup>
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader'
import zxingReaderWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({ open: Boolean })
const emit = defineEmits(['update:open', 'detected'])

const modalOpen = computed({
  get: () => props.open,
  set: value => emit('update:open', value)
})

const videoRef = ref(null)
const fileInputRef = ref(null)
const starting = ref(false)
const errorMessage = ref('')
let liveCanvas = null
let liveContext = null
const readerOptions = {
  formats: ['QRCode', 'Code128', 'Code39', 'EAN13'],
  tryHarder: true,
  tryRotate: true,
  tryInvert: true,
  tryDownscale: true,
  maxNumberOfSymbols: 1,
}
let stream = null
let resolved = false
let scanTimer = null
let scanRunning = false
let wasmConfigured = false

function configureWasm() {
  if (wasmConfigured) return
  prepareZXingModule({
    overrides: {
      locateFile: path => path.endsWith('.wasm') ? zxingReaderWasmUrl : path,
    },
  })
  wasmConfigured = true
}

function configureLiveCanvas() {
  if (liveCanvas) return
  liveCanvas = document.createElement('canvas')
  liveContext = liveCanvas.getContext('2d', { willReadFrequently: true })
}

function stopCamera() {
  if (scanTimer) window.clearTimeout(scanTimer)
  scanTimer = null
  scanRunning = false
  stream?.getTracks?.().forEach(track => track.stop())
  stream = null
  if (videoRef.value) {
    videoRef.value.srcObject = null
  }
}

async function decodeInput(input, options = readerOptions) {
  configureWasm()
  const results = await readBarcodes(input, options)
  return results.find(result => result?.isValid !== false && result?.text)?.text || ''
}

function scheduleLiveScan(delay = 220) {
  if (resolved || !modalOpen.value) return
  scanTimer = window.setTimeout(scanLiveFrame, delay)
}

async function scanLiveFrame() {
  configureLiveCanvas()
  const video = videoRef.value
  if (resolved || !modalOpen.value || !video || !liveContext) return
  if (scanRunning || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
    scheduleLiveScan()
    return
  }
  scanRunning = true
  try {
    // 取画面中央区域，和取景框一致；减少背景干扰，同时保留相机原始像素密度。
    const sourceWidth = Math.round(video.videoWidth * 0.82)
    const sourceHeight = Math.round(video.videoHeight * 0.72)
    const sourceX = Math.round((video.videoWidth - sourceWidth) / 2)
    const sourceY = Math.round((video.videoHeight - sourceHeight) / 2)
    liveCanvas.width = sourceWidth
    liveCanvas.height = sourceHeight
    liveContext.drawImage(
      video,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      sourceWidth,
      sourceHeight,
    )
    const value = await decodeInput(liveContext.getImageData(0, 0, sourceWidth, sourceHeight))
    if (value) finish(value)
  } catch {
    // 单帧失败属于正常情况，继续读取后续画面。
  } finally {
    scanRunning = false
    scheduleLiveScan()
  }
}

function finish(value) {
  if (resolved || !value) return
  resolved = true
  stopCamera()
  emit('detected', value)
  modalOpen.value = false
}

async function startCamera() {
  stopCamera()
  resolved = false
  errorMessage.value = ''
  starting.value = true
  await nextTick()

  if (!navigator.mediaDevices?.getUserMedia) {
    starting.value = false
    errorMessage.value = '当前浏览器环境无法直接调用摄像头，请使用下方“拍照识别”。'
    return
  }

  try {
    configureWasm()
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 2560 },
        height: { ideal: 1440 },
      },
    })
    videoRef.value.srcObject = stream
    await videoRef.value.play()
    const track = stream.getVideoTracks?.()[0]
    const capabilities = track?.getCapabilities?.() || {}
    const advanced = []
    if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes('continuous')) {
      advanced.push({ focusMode: 'continuous' })
    }
    if (capabilities.zoom && Number(capabilities.zoom.max) > Number(capabilities.zoom.min)) {
      const min = Number(capabilities.zoom.min || 1)
      const max = Number(capabilities.zoom.max || min)
      advanced.push({ zoom: Math.min(max, Math.max(min, 1.5)) })
    }
    if (advanced.length) {
      await track.applyConstraints({ advanced }).catch(() => {})
    }
    scheduleLiveScan(0)
  } catch (error) {
    const denied = error?.name === 'NotAllowedError' || error?.name === 'SecurityError'
    errorMessage.value = denied
      ? '未获得摄像头权限，请在浏览器设置中允许访问，或使用拍照识别。'
      : '摄像头或 WASM 识别器启动失败，请确认设备未被其他应用占用并刷新后重试。'
    stopCamera()
  } finally {
    starting.value = false
  }
}

async function decodeImage(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  errorMessage.value = ''
  try {
    const value = await decodeInput(file, {
      ...readerOptions,
      tryDenoise: true,
    })
    if (!value) throw new Error('No barcode found')
    finish(value)
  } catch {
    errorMessage.value = '未能识别图片中的条码。请靠近旧标签、对焦清晰并避免灯光反射后重新拍摄。'
  }
}

watch(() => props.open, value => {
  if (value) startCamera()
  else stopCamera()
})

onBeforeUnmount(stopCamera)
</script>

<style scoped>
@keyframes scan-line {
  0%, 100% { transform: translateY(-64px); opacity: 0.45; }
  50% { transform: translateY(64px); opacity: 1; }
}

.scan-line {
  animation: scan-line 2.2s ease-in-out infinite;
}
</style>
