<template>
  <div class="absolute inset-0 overflow-y-auto bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-white">
    <header class="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      <div class="mx-auto flex h-14 max-w-[1500px] items-center justify-between gap-3 px-4 sm:px-6">
        <div class="flex min-w-0 items-center gap-3">
          <div class="grid size-9 shrink-0 place-items-center rounded-lg bg-indigo-500 text-white shadow-sm">
            <UIcon name="i-lucide-blocks" class="size-5" />
          </div>
          <div class="min-w-0">
            <h1 class="truncate text-base font-bold sm:text-lg">仓库结构</h1>
            <p class="truncate text-xs text-slate-500 dark:text-slate-400">{{ warehouseLabel }} · {{ summary.locationCount || locations.length }} 个排位 · 一排一码</p>
          </div>
        </div>
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="loading" @click="loadOverview">
          刷新
        </UButton>
      </div>
    </header>

    <main class="mx-auto w-full max-w-[1500px] space-y-3 px-3 py-3 sm:px-6">
      <section class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div class="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
          <div class="flex min-w-0 items-center gap-3">
            <div class="grid size-11 shrink-0 place-items-center rounded-xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
              <UIcon name="i-lucide-warehouse" class="size-6" />
            </div>
            <div>
              <div class="flex flex-wrap items-baseline gap-x-2">
                <h2 class="text-lg font-black">{{ warehouseLabel }}</h2>
                <span class="text-xs text-slate-500 dark:text-slate-400">{{ zoneSummaryText }}</span>
              </div>
              <div class="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                <span class="rounded-full bg-sky-50 px-2.5 py-1 font-semibold text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">总排位 {{ summary.locationCount }}</span>
                <span class="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">有库存 {{ summary.occupiedCount }}</span>
                <span class="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">空排位 {{ summary.emptyCount }}</span>
                <span v-if="summary.disabledCount" class="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">停用 {{ summary.disabledCount }}</span>
              </div>
            </div>
          </div>
          <div class="flex shrink-0 flex-wrap gap-2">
            <UButton icon="i-lucide-printer-check" color="primary" variant="soft" :disabled="!locations.length" @click="printAll">
              打印全部 {{ locations.length }} 个
            </UButton>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 bg-slate-50/80 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-400">
          <span class="inline-flex items-center gap-1.5"><i class="size-2.5 rounded-full bg-emerald-500" />有库存</span>
          <span class="inline-flex items-center gap-1.5"><i class="size-2.5 rounded-full bg-white ring-1 ring-slate-300 dark:bg-slate-900 dark:ring-slate-600" />空排位</span>
          <span class="inline-flex items-center gap-1.5"><i class="size-2.5 rounded-full bg-slate-400" />已停用</span>
          <span class="ml-auto hidden sm:inline">点击排位查看详情 · 每排对应一个二维码</span>
        </div>
      </section>

      <section v-if="selectedLocation" class="rounded-xl border border-indigo-200 bg-white p-3 shadow-sm dark:border-indigo-800 dark:bg-slate-900">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex items-center gap-3">
            <span class="grid size-10 place-items-center rounded-lg bg-indigo-600 font-mono text-sm font-black text-white">{{ selectedLocation.zoneCode }}</span>
            <div>
              <div class="flex items-center gap-2">
                <strong class="font-mono text-lg">{{ selectedLocation.locationCode }}</strong>
                <UBadge :color="selectedLocation.status === '0' ? 'success' : 'neutral'" variant="soft">
                  {{ selectedLocation.status === '0' ? '启用' : '停用' }}
                </UBadge>
              </div>
              <p class="text-xs text-slate-500 dark:text-slate-400">
                第{{ pad(selectedLocation.rowNo) }}排 · {{ selectedLocation.skuCount || 0 }} 种物料 · {{ formatQty(selectedLocation.occupiedQty) }}K
              </p>
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton icon="i-lucide-printer" color="neutral" variant="soft" @click="printLocations([selectedLocation], selectedLocation.locationCode)">打印标签</UButton>
            <UButton
              :icon="selectedLocation.status === '0' ? 'i-lucide-ban' : 'i-lucide-circle-check'"
              :color="selectedLocation.status === '0' ? 'warning' : 'success'"
              variant="soft"
              :disabled="selectedLocation.status === '0' && Number(selectedLocation.occupiedQty || 0) !== 0"
              :loading="statusUpdating"
              @click="toggleSelectedStatus"
            >
              {{ selectedLocation.status === '0' ? '停用排位' : '启用排位' }}
            </UButton>
            <UButton icon="i-lucide-x" color="neutral" variant="ghost" aria-label="关闭排位详情" @click="selectedLocation = null" />
          </div>
        </div>
      </section>

      <div v-if="loading" class="grid gap-3 lg:grid-cols-2">
        <USkeleton v-for="index in 2" :key="index" class="h-[430px] rounded-xl" />
      </div>

      <section v-else-if="errorMessage" class="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
        <div class="flex items-center justify-between gap-3">
          <span>{{ errorMessage }}</span>
          <UButton color="error" variant="soft" @click="loadOverview">重试</UButton>
        </div>
      </section>

      <section v-else-if="locations.length" class="grid gap-3 lg:grid-cols-2">
        <article
          v-for="zone in zonePanels"
          :key="zone.code"
          class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <div class="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <div class="flex items-center gap-3">
              <span class="grid size-9 place-items-center rounded-lg text-base font-black text-white" :class="zone.badgeClass">{{ zone.code }}</span>
              <div>
                <h2 class="font-bold">{{ zone.code }} 区</h2>
                <p class="text-xs text-slate-500 dark:text-slate-400">{{ zone.items.length }} 个排位 · {{ zone.occupiedCount }} 个有库存</p>
              </div>
            </div>
            <UButton size="sm" icon="i-lucide-printer" color="neutral" variant="ghost" :disabled="!zone.items.length" @click="printZone(zone.code)">
              打印{{ zone.code }}区
            </UButton>
          </div>

          <div class="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
            <article
              v-for="location in zone.items"
              :key="location.locationCode"
              class="group relative min-h-24 overflow-hidden rounded-lg border transition"
              :class="locationClass(location)"
            >
              <button
                type="button"
                class="flex size-full min-h-24 flex-col p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
                @click="selectedLocation = location"
              >
                <span class="flex w-full items-center gap-1.5 pr-7">
                  <i class="size-2 shrink-0 rounded-full" :class="statusDotClass(location)" />
                  <strong class="font-mono text-lg leading-none">{{ location.locationCode }}</strong>
                </span>
                <span class="mt-1 text-xs opacity-70">第{{ pad(location.rowNo) }}排</span>
                <span class="mt-auto flex w-full items-end justify-between gap-1 pt-2 text-[11px] font-semibold">
                  <span>{{ locationStatusText(location) }}</span>
                  <span v-if="Number(location.occupiedQty || 0) !== 0" class="tabular-nums">{{ formatQty(location.occupiedQty) }}K</span>
                </span>
              </button>
              <UButton
                size="xs"
                icon="i-lucide-printer"
                color="neutral"
                variant="ghost"
                class="absolute right-1 top-1 opacity-70 group-hover:opacity-100"
                :aria-label="`打印 ${location.locationCode} 标签`"
                @click.stop="printLocations([location], location.locationCode)"
              />
            </article>
          </div>
        </article>
      </section>

      <section v-else class="rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-500 dark:border-slate-700">
        暂无排位数据
      </section>

    </main>
  </div>
</template>

<script setup>
import { BrowserQRCodeSvgWriter } from '@zxing/browser'
import {
  getWmsStructureOverview,
  updateWmsLocationStatus,
} from '@/api/tk_custom/wmsStructure'

const toast = useToast()
const loading = ref(false)
const statusUpdating = ref(false)
const errorMessage = ref('')
const locations = ref([])
const summary = reactive({
  locationCount: 0,
  enabledCount: 0,
  disabledCount: 0,
  occupiedCount: 0,
  emptyCount: 0,
})
const selectedLocation = ref(null)

const ZONE_BADGE_CLASSES = ['bg-sky-600', 'bg-violet-600', 'bg-emerald-600', 'bg-amber-600', 'bg-rose-600', 'bg-cyan-600']
function zoneBadgeClass(zoneCode, index) {
  if (zoneCode === 'A') return 'bg-sky-600'
  if (zoneCode === 'B') return 'bg-violet-600'
  return ZONE_BADGE_CLASSES[index % ZONE_BADGE_CLASSES.length]
}
const zonePanels = computed(() => {
  const codes = [...new Set(locations.value.map(item => item.zoneCode).filter(Boolean))].sort()
  return codes.map((code, index) => {
    const items = zoneLocations(code)
    return {
      code,
      badgeClass: zoneBadgeClass(code, index),
      items,
      occupiedCount: items.filter(item => Number(item.occupiedQty || 0) !== 0).length,
    }
  })
})
const warehouseLabel = computed(() => {
  const first = locations.value[0]
  if (!first) return 'WH01 主仓库'
  return `${first.warehouseCode || 'WH01'} ${first.warehouseName || '主仓库'}`
})
const zoneSummaryText = computed(() => {
  if (!zonePanels.value.length) return '暂无分区'
  return zonePanels.value.map(zone => `${zone.code}区 ${zone.items.length}排`).join(' · ')
})

function pad(value) {
  return String(value || 0).padStart(2, '0')
}

function formatQty(value) {
  const number = Number(value || 0)
  if (!Number.isFinite(number)) return '0'
  return Number.isInteger(number) ? String(number) : String(Math.round(number * 1000) / 1000)
}

function zoneLocations(zoneCode) {
  return locations.value
    .filter(item => item.zoneCode === zoneCode)
    .sort((a, b) => Number(a.rowNo) - Number(b.rowNo))
}

function locationClass(location) {
  if (selectedLocation.value?.locationCode === location.locationCode) {
    return 'border-indigo-500 bg-indigo-50 text-indigo-950 ring-2 ring-indigo-500 dark:bg-indigo-950/60 dark:text-indigo-100'
  }
  if (location.status === '1') {
    return 'border-slate-300 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-500'
  }
  if (Number(location.occupiedQty || 0) !== 0) {
    return 'border-emerald-300 bg-emerald-50 text-emerald-950 hover:-translate-y-0.5 hover:shadow-sm dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100'
  }
  return 'border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-indigo-700'
}

function statusDotClass(location) {
  if (location.status === '1') return 'bg-slate-400'
  return Number(location.occupiedQty || 0) !== 0 ? 'bg-emerald-500' : 'bg-white ring-1 ring-slate-300 dark:bg-slate-900 dark:ring-slate-600'
}

function locationStatusText(location) {
  if (location.status === '1') return '已停用'
  return Number(location.occupiedQty || 0) !== 0 ? `${location.skuCount || 0} 种物料` : '空排位'
}

async function loadOverview() {
  loading.value = true
  errorMessage.value = ''
  try {
    const response = await getWmsStructureOverview()
    if (response?.code !== 200) throw new Error(response?.msg || '仓库结构加载失败')
    const data = response.data || {}
    locations.value = Array.isArray(data.locations) ? data.locations : []
    Object.assign(summary, data.summary || {})
    if (selectedLocation.value) {
      selectedLocation.value = locations.value.find(item => item.locationCode === selectedLocation.value.locationCode) || null
    }
  } catch (error) {
    errorMessage.value = error.message || String(error)
  } finally {
    loading.value = false
  }
}

async function toggleSelectedStatus() {
  const location = selectedLocation.value
  if (!location) return
  const nextStatus = location.status === '0' ? '1' : '0'
  const action = nextStatus === '1' ? '停用' : '启用'
  if (!window.confirm(`确认${action}库位 ${location.locationCode}？`)) return
  statusUpdating.value = true
  try {
    const response = await updateWmsLocationStatus({ locationCode: location.locationCode, status: nextStatus })
    if (response?.code !== 200) throw new Error(response?.msg || `${action}失败`)
    toast.add({ title: `库位已${action}`, description: location.locationCode, color: 'success' })
    await loadOverview()
  } catch (error) {
    toast.add({ title: `${action}失败`, description: error.message || String(error), color: 'error' })
  } finally {
    statusUpdating.value = false
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function printLocations(items, title = '库位标签') {
  if (!items.length) return
  const popup = window.open('', '_blank')
  if (!popup) {
    toast.add({ title: '浏览器阻止了打印窗口', description: '请允许此网站打开弹窗后重试', color: 'warning' })
    return
  }
  popup.opener = null
  const writer = new BrowserQRCodeSvgWriter()
  const labels = items.map((location) => {
    const payload = location.locationCode
    const svg = writer.write(payload, 180, 180).outerHTML
    return `
      <article class="label">
        <section class="information">
          <div class="meta"><span>WH01 主仓库</span><strong>${escapeHtml(location.zoneCode)}区</strong></div>
          <div class="code">${escapeHtml(location.locationCode)}</div>
          <div class="position"><b>第${pad(location.rowNo)}排</b></div>
          <div class="payload">${escapeHtml(payload)}</div>
        </section>
        <section class="qr-panel">
          <div class="qr">${svg}</div>
          <div class="scan-hint">扫描确认库位</div>
        </section>
      </article>`
  }).join('')
  popup.document.open()
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    *{box-sizing:border-box}body{margin:0;font-family:Arial,"Microsoft YaHei",sans-serif;color:#000}
    .label{width:70mm;height:45mm;padding:3mm;display:grid;grid-template-columns:minmax(0,1fr) 25mm;gap:3mm;border:0;page-break-after:always;overflow:hidden}
    .information{min-width:0;display:flex;flex-direction:column}.meta{display:flex;align-items:center;justify-content:space-between;gap:2mm;border-bottom:.35mm solid #111;padding-bottom:1.2mm;font-size:8.5pt;font-weight:700}
    .meta strong{font-size:11pt}.code{margin-top:2.2mm;white-space:nowrap;font:900 24pt Consolas,monospace;letter-spacing:.4px}
    .position{margin-top:2mm;border:.3mm solid #111;border-radius:1mm;padding:2mm;text-align:center}.position b{display:block;font:900 17pt "Microsoft YaHei",sans-serif}
    .payload{margin-top:auto;font:7.5pt Consolas,monospace;white-space:nowrap}
    .qr-panel{min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;border-left:.3mm solid #bbb;padding-left:2mm}.qr{width:23mm;height:23mm;flex:none}
    .qr svg{display:block;width:100%;height:100%}.scan-hint{margin-top:1.2mm;font-size:7pt;font-weight:700;letter-spacing:.2mm;white-space:nowrap}
    @page{size:70mm 45mm;margin:0}@media print{.label:last-child{page-break-after:auto}}
  </style></head><body>${labels}<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),150))<\/script></body></html>`)
  popup.document.close()
}

function printZone(zoneCode) {
  printLocations(zoneLocations(zoneCode), `${zoneCode}区排位标签`)
}

function printAll() {
  if (!window.confirm(`将生成全部 ${locations.value.length} 个库位标签，确认继续？`)) return
  printLocations(locations.value, 'WH01全部库位标签')
}

onMounted(loadOverview)
</script>
