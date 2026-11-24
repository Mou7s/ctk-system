<template>
  <div class="absolute inset-0 overflow-y-auto scroll-pb-24 bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-white">
    <header class="sticky top-0 z-20 border-b border-slate-200/80 bg-slate-50/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      <div class="mx-auto flex min-h-12 max-w-6xl items-center justify-between gap-3 px-3 sm:px-5">
        <div class="flex min-w-0 items-center gap-2">
          <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-emerald-500 text-white shadow-sm">
            <UIcon name="i-lucide-package-check" class="size-4" />
          </span>
          <div class="min-w-0 leading-tight">
            <p class="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">WMS 作业台</p>
          </div>
        </div>
        <UButton icon="i-lucide-rotate-ccw" size="sm" color="neutral" variant="soft" @click="resetAll">重新开始</UButton>
      </div>
    </header>

    <main class="mx-auto w-full max-w-6xl space-y-4 px-3 py-3 sm:px-5 sm:py-4">
      <section class="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div class="grid grid-cols-3 gap-2">
          <div class="flex min-w-0 items-center gap-2 rounded-xl border border-primary-200 bg-primary-50/70 p-2 dark:border-primary-900/70 dark:bg-primary-950/25">
            <span class="grid size-7 shrink-0 place-items-center rounded-lg bg-primary-600 text-xs font-black text-white">1</span>
            <div class="min-w-0">
              <p class="truncate text-[10px] font-bold uppercase tracking-wide text-primary-700 dark:text-primary-300">扫描</p>
              <p class="truncate text-xs font-semibold">物料条码</p>
            </div>
          </div>
          <div
            class="flex min-w-0 items-center gap-2 rounded-xl border p-2"
            :class="selectedLine ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/70 dark:bg-emerald-950/25' : receiptLines.length ? 'border-primary-200 bg-primary-50/70 dark:border-primary-900/70 dark:bg-primary-950/25' : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50'"
          >
            <span class="grid size-7 shrink-0 place-items-center rounded-lg text-xs font-black text-white" :class="selectedLine ? 'bg-emerald-600' : receiptLines.length ? 'bg-primary-600' : 'bg-slate-400'">2</span>
            <div class="min-w-0">
              <p class="truncate text-[10px] font-bold uppercase tracking-wide text-slate-500">选择</p>
              <p class="truncate text-xs font-semibold">来源库存</p>
            </div>
          </div>
          <div
            class="flex min-w-0 items-center gap-2 rounded-xl border p-2"
            :class="canSubmit ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/70 dark:bg-emerald-950/25' : selectedLine ? 'border-primary-200 bg-primary-50/70 dark:border-primary-900/70 dark:bg-primary-950/25' : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50'"
          >
            <span class="grid size-7 shrink-0 place-items-center rounded-lg text-xs font-black text-white" :class="canSubmit ? 'bg-emerald-600' : selectedLine ? 'bg-primary-600' : 'bg-slate-400'">3</span>
            <div class="min-w-0">
              <p class="truncate text-[10px] font-bold uppercase tracking-wide text-slate-500">填写并确认</p>
              <p class="truncate text-xs font-semibold">实际库位</p>
            </div>
          </div>
        </div>
      </section>

      <section class="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div class="border-b border-slate-200 p-4 dark:border-slate-800 sm:p-5">
          <div class="flex items-center gap-2">
            <span class="grid size-8 shrink-0 place-items-center rounded-xl bg-primary-600 text-sm font-black text-white">1</span>
            <div>
              <p class="text-[10px] font-bold uppercase tracking-[0.18em] text-primary-600 dark:text-primary-300">STEP 01</p>
          <h2 class="font-bold">扫描物料条码</h2>
            </div>
          </div>

          <div class="mt-4 flex flex-col gap-2 sm:flex-row">
            <div ref="queryWrapRef" class="relative min-w-0 flex-1">
              <UInput
                v-model="queryText"
                class="w-full font-mono"
                size="lg"
                placeholder="扫描标签或输入物料编码"
                @keyup.enter="loadSource"
                @update:model-value="handleMaterialSearchInput"
              />
              <Teleport to="body">
                <div
                  v-if="materialDropdownOpen"
                  class="fixed z-50 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800"
                  :style="materialDropdownStyle"
                >
                  <p v-if="materialOptionsLoading && !materialOptions.length" class="px-3 py-2.5 text-sm text-slate-500">正在搜索金蝶物料…</p>
                  <button
                    v-for="opt in materialOptions"
                    :key="opt.id || opt.value"
                    type="button"
                    class="w-full border-b border-slate-100 px-3 py-2.5 text-left last:border-0 hover:bg-blue-50 dark:border-slate-700 dark:hover:bg-slate-700"
                    @click="onMaterialSelect(opt)"
                  >
                    <span class="font-mono text-sm font-bold text-primary-700 dark:text-primary-300">{{ opt.value }}</span>
                    <span class="ml-2 text-sm">{{ opt.name || '' }}</span>
                    <span v-if="opt.spec" class="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-300">{{ opt.spec }}</span>
                  </button>
                </div>
              </Teleport>
            </div>
            <div class="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
              <UButton icon="i-lucide-search" size="lg" :loading="loadingReceipt" @click="loadSource">读取明细</UButton>
              <UButton icon="i-lucide-camera" size="lg" color="neutral" variant="soft" @click="scannerOpen = true">扫码</UButton>
            </div>
          </div>
        </div>

        <div v-if="receiptLines.length" class="space-y-2.5 bg-slate-50/70 p-3 dark:bg-slate-950/20 sm:p-4">
          <div v-if="receiptMaterial" class="flex flex-wrap items-baseline gap-x-2 px-1">
            <span class="font-mono text-sm font-bold text-primary-700 dark:text-primary-300">{{ receiptMaterial.materialCode }}</span>
            <span class="text-sm font-semibold">{{ receiptMaterial.materialName }}</span>
            <span class="text-xs text-slate-500">{{ receiptMaterial.specification || '无规格' }} · {{ receiptLines.length }} 个来源</span>
          </div>
          <button
            v-for="line in receiptLines"
            :key="lineKey(line)"
            type="button"
            :disabled="Number(line.transferableQty || 0) <= 0"
            :aria-pressed="selectedLine && lineKey(selectedLine) === lineKey(line)"
            class="w-full rounded-2xl border bg-white px-3 py-4 text-left shadow-sm transition hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-900"
            :class="selectedLine && lineKey(selectedLine) === lineKey(line)
              ? 'border-primary-400 bg-primary-50 ring-1 ring-primary-300 dark:bg-primary-950/30'
              : 'border-slate-200 hover:border-primary-300 dark:border-slate-700'"
            @click="selectLine(line)"
          >
            <div class="flex items-center gap-2">
              <span v-if="selectedLine && lineKey(selectedLine) === lineKey(line)" class="rounded-full bg-primary-600 px-2 py-0.5 text-[11px] font-bold text-white">已选择</span>
              <span v-else class="text-xs text-slate-400">点击选择该来源</span>
              <span class="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-300">批次 {{ line.lotNumber || '无' }}</span>
              <UIcon name="i-lucide-chevron-right" class="ml-auto size-5 shrink-0 text-slate-400" />
            </div>
            <div class="mt-2 grid min-w-0 grid-cols-3 gap-2 text-xs">
              <div class="min-w-0 rounded-xl bg-slate-50 px-2.5 py-2 dark:bg-slate-800/70">
                <p class="text-slate-500">仓库</p>
                <p class="mt-0.5 truncate font-semibold">{{ line.sourceStockName || line.sourceStockNumber || '未返回' }}</p>
                <p v-if="line.sourceStockName && line.sourceStockNumber" class="truncate font-mono text-slate-400">{{ line.sourceStockNumber }}</p>
              </div>
              <div class="min-w-0 rounded-xl bg-slate-50 px-2.5 py-2 dark:bg-slate-800/70">
                <p class="text-slate-500">库位</p>
                <p class="mt-0.5 truncate font-semibold">{{ line.sourceStockLocationName || line.sourceStockLocationNumber || '无仓位维度' }}</p>
                <p v-if="line.sourceStockLocationName && line.sourceStockLocationNumber" class="truncate font-mono text-slate-400">{{ line.sourceStockLocationNumber }}</p>
              </div>
              <div class="min-w-0 rounded-xl bg-emerald-50 px-2.5 py-2 dark:bg-emerald-950/30">
                <p class="text-slate-500">可上架</p>
                <p class="mt-0.5 truncate font-mono font-black" :class="Number(line.transferableQty) > 0 ? 'text-emerald-600' : 'text-rose-600'">
                  {{ formatQty(line.transferableQty) }}<span class="ml-1 text-[11px] font-semibold text-slate-400">{{ line.unitNumber }}</span>
                </p>
                <p v-if="Math.abs(sourceOnHandQty(line) - Number(line.transferableQty || 0)) > 0.0001" class="truncate font-mono text-[11px] text-slate-400">在手 {{ formatQty(sourceOnHandQty(line)) }}</p>
              </div>
            </div>
          </button>
        </div>

        <details v-if="inventory.materialCode" class="group border-t border-sky-100 bg-sky-50/50 dark:border-sky-900/60 dark:bg-sky-950/20">
          <summary class="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 select-none [&::-webkit-details-marker]:hidden sm:px-4">
            <div class="flex min-w-0 items-center gap-2">
              <UIcon name="i-lucide-layers-3" class="size-4 shrink-0 text-sky-600 dark:text-sky-300" />
              <div class="min-w-0">
                <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span class="font-bold text-sky-900 dark:text-sky-100">完整库存核对</span>
                  <span class="truncate font-mono text-xs text-sky-700 dark:text-sky-300">{{ inventory.materialCode }}</span>
                </div>
                <p class="truncate text-xs text-sky-700/80 dark:text-sky-200/80">全仓实时盘点 · 展开查看明细</p>
              </div>
            </div>
            <div class="flex shrink-0 items-center gap-2 text-right">
              <span v-if="inventory.loading" class="text-xs text-sky-700 dark:text-sky-300">查询中…</span>
              <span v-else-if="inventory.error" class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">查询失败</span>
              <span v-else class="hidden text-xs text-sky-700 dark:text-sky-300 sm:inline">{{ inventory.rowCount }} 行 · 可用 {{ formatQty(inventory.totalAvailableQty) }} {{ inventory.unitNumber }}</span>
              <UIcon name="i-lucide-chevron-down" class="size-4 text-sky-600 transition-transform group-open:rotate-180 dark:text-sky-300" />
            </div>
          </summary>

          <div class="border-t border-sky-100/80 p-3 dark:border-sky-900/50 sm:p-4">
            <p v-if="inventory.queriedAt && !inventory.loading" class="mb-3 text-xs text-sky-700/80 dark:text-sky-200/80">查询时间 {{ inventory.queriedAt }}</p>
            <p v-if="inventory.error" class="text-sm text-amber-700 dark:text-amber-300">
              完整库存查询失败：{{ inventory.error }}；不影响重新查询来源库存。
            </p>
            <template v-else-if="!inventory.loading">
              <div class="grid gap-2 sm:grid-cols-3">
                <div class="rounded-xl border border-sky-100 bg-white/80 px-3 py-2 dark:border-sky-900/50 dark:bg-slate-900/70">
                  <p class="text-xs text-slate-500">总在手</p>
                  <p class="font-mono text-lg font-black">{{ formatQty(inventory.totalOnHandQty) }} {{ inventory.unitNumber }}</p>
                </div>
                <div class="rounded-xl border border-sky-100 bg-white/80 px-3 py-2 dark:border-sky-900/50 dark:bg-slate-900/70">
                  <p class="text-xs text-slate-500">总可用</p>
                  <p class="font-mono text-lg font-black text-emerald-600">{{ formatQty(inventory.totalAvailableQty) }} {{ inventory.unitNumber }}</p>
                </div>
                <div class="rounded-xl border border-sky-100 bg-white/80 px-3 py-2 dark:border-sky-900/50 dark:bg-slate-900/70">
                  <p class="text-xs text-slate-500">库存明细</p>
                  <p class="font-mono text-lg font-black">{{ inventory.rowCount }} 行</p>
                </div>
              </div>

              <div v-if="inventory.rows.length" class="mt-3 max-w-full overflow-x-auto rounded-xl border border-sky-100 bg-white dark:border-sky-900/60 dark:bg-slate-900">
                <table class="min-w-[620px] text-left text-xs">
                  <thead class="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-800/70">
                    <tr>
                      <th class="whitespace-nowrap px-3 py-2 font-semibold">仓库</th>
                      <th class="whitespace-nowrap px-3 py-2 font-semibold">库位</th>
                      <th class="whitespace-nowrap px-3 py-2 font-semibold">批次</th>
                      <th class="whitespace-nowrap px-3 py-2 text-right font-semibold">在手</th>
                      <th class="whitespace-nowrap px-3 py-2 text-right font-semibold">可用</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in inventory.rows" :key="`${row.stockNumber}-${row.stockLocationNumber}-${row.lotNumber}`" class="border-b border-slate-100 last:border-0 dark:border-slate-800">
                      <td class="whitespace-nowrap px-3 py-2">
                        <span class="font-semibold">{{ row.stockName || row.stockNumber || '未设置仓库' }}</span>
                        <span v-if="row.stockName && row.stockNumber" class="ml-1 font-mono text-slate-400">{{ row.stockNumber }}</span>
                      </td>
                      <td class="whitespace-nowrap px-3 py-2">
                        <span>{{ row.stockLocationName || row.stockLocationNumber || '未设置库位' }}</span>
                        <span v-if="row.stockLocationName && row.stockLocationNumber" class="ml-1 font-mono text-slate-400">{{ row.stockLocationNumber }}</span>
                      </td>
                      <td class="whitespace-nowrap px-3 py-2 font-mono">{{ row.lotNumber || '无批次' }}</td>
                      <td class="whitespace-nowrap px-3 py-2 text-right font-mono font-bold" :class="Number(row.onHandQty) < 0 ? 'text-rose-600' : ''">{{ formatQty(row.onHandQty) }}</td>
                      <td class="whitespace-nowrap px-3 py-2 text-right font-mono font-bold" :class="Number(row.availableQty) < 0 ? 'text-rose-600' : 'text-emerald-600'">{{ formatQty(row.availableQty) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-else class="mt-3 text-sm text-slate-500">金蝶当前没有该物料的非零库存。</p>
            </template>
          </div>
        </details>
      </section>

      <section class="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div class="border-b border-slate-200 p-4 dark:border-slate-800 sm:p-5">
          <div class="flex items-center gap-2">
          <span class="grid size-8 shrink-0 place-items-center rounded-xl text-sm font-black text-white" :class="selectedLine ? 'bg-primary-600' : 'bg-slate-400'">2</span>
          <div>
            <p class="text-[10px] font-bold uppercase tracking-[0.18em] text-primary-600 dark:text-primary-300">STEP 02–03</p>
            <h2 class="font-bold">填写、选择或扫描实际库位并确认调拨</h2>
          </div>
          </div>
        </div>

        <div v-if="selectedLine" class="space-y-4 p-3 sm:p-5">
          <div class="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-800/70 sm:grid-cols-2 lg:grid-cols-3">
            <p><span class="text-slate-500">物料：</span><strong>{{ selectedLine.materialCode }} · {{ selectedLine.materialName }}</strong></p>
            <p><span class="text-slate-500">来源仓库：</span><strong>{{ selectedLine.sourceStockName || selectedLine.sourceStockNumber || '未返回' }}</strong></p>
            <p><span class="text-slate-500">来源批次：</span><strong class="font-mono">{{ selectedLine.lotNumber || '无批次' }}</strong></p>
            <p><span class="text-slate-500">当前可用库存：</span><strong>{{ formatQty(selectedLine.sourceAvailableQty ?? selectedLine.receiptQty) }} {{ selectedLine.unitNumber }}</strong></p>
            <p><span class="text-slate-500">来源库位：</span><strong>{{ selectedLine.sourceStockLocationName || selectedLine.sourceStockLocationNumber || '未返回' }}</strong> <span v-if="selectedLine.sourceStockLocationNumber" class="font-mono text-slate-400">{{ selectedLine.sourceStockLocationNumber }}</span></p>
            <p><span class="text-slate-500">来源账面库存：</span><strong>{{ formatQty(selectedLine.sourceOnHandQty ?? selectedLine.sourceAvailableQty ?? selectedLine.stagingAvailableQty) }} {{ selectedLine.unitNumber }}</strong></p>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="本次上架数量" description="只从当前选择的仓库和批次扣减">
              <UInput v-model.number="form.qty" type="number" step="0.001" min="0" :max="selectedLine.transferableQty" size="lg" class="w-full font-mono" />
              <p class="mt-1 text-xs text-slate-500">最多可上架 {{ formatQty(selectedLine.transferableQty) }} {{ selectedLine.unitNumber }}</p>
            </UFormField>
            <UFormField label="实际库位" description="可搜索已启用且已配置金蝶映射的 CTK10 库位">
              <div class="flex gap-2">
                <USelectMenu
                  :model-value="form.locationCode"
                  :items="locationOptions"
                  value-key="value"
                  label-key="label"
                  filterable
                  size="lg"
                  class="min-w-0 flex-1"
                  placeholder="搜索并选择实际库位"
                  :loading="loadingLocations"
                  :disabled="loadingLocations || !locationOptions.length"
                  @update:model-value="handleLocationSelect"
                />
                <UButton icon="i-lucide-camera" color="neutral" variant="soft" @click="scannerOpen = true" />
              </div>
              <div v-if="locationError" class="mt-1 flex items-center gap-2 text-xs text-rose-600">
                <span>{{ locationError }}</span>
                <UButton size="xs" color="neutral" variant="link" :loading="loadingLocations" @click="loadLocationOptions">重试</UButton>
              </div>
            </UFormField>
          </div>

          <div v-if="suggest.locationCode" class="rounded-2xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-900 dark:border-primary-900/70 dark:bg-primary-950/40 dark:text-primary-100">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex min-w-0 items-center gap-2">
                <UIcon name="i-lucide-map-pin" class="size-4 shrink-0" />
                <div class="min-w-0">
                  <p class="text-xs font-semibold text-primary-700 dark:text-primary-200">推荐实际库位</p>
                  <p v-if="suggest.locationCode" class="font-mono text-lg font-black">{{ suggest.locationCode }}</p>
                </div>
              </div>
              <UButton v-if="suggest.locationCode" size="sm" color="neutral" variant="soft" @click="confirmSuggestedLocation">采用推荐库位</UButton>
            </div>
            <p v-if="suggest.reasonText" class="mt-1 text-xs text-primary-700/80 dark:text-primary-200/80">{{ suggest.reasonText }}</p>
          </div>

          <UFormField label="备注" description="可填写异常、来源或现场交接说明">
            <UInput v-model="form.remark" class="w-full" />
          </UFormField>

          <div class="sticky bottom-3 z-10 -mx-1 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
            <UButton
              icon="i-lucide-arrow-right-left"
              size="xl"
              class="min-h-12 w-full justify-center text-base font-bold"
              :loading="submitting"
              :disabled="!canSubmit"
              @click="submitTransfer"
            >确认上架</UButton>
          </div>
        </div>
      </section>

      <section v-if="lastSuccess" class="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
        <div class="flex items-start gap-2">
          <UIcon name="i-lucide-circle-check" class="mt-0.5 size-5 shrink-0" />
          <div>
        <p class="font-bold">验收上架成功</p>
        <p class="mt-1">金蝶直接调拨单 <strong class="font-mono">{{ lastSuccess.kingdeeBillNo }}</strong> 已审核；{{ lastSuccess.materialCode }} → {{ lastSuccess.locationCode }} +{{ formatQty(lastSuccess.qty) }}</p>
          </div>
        </div>
      </section>
    </main>

    <CameraBarcodeScanner v-model:open="scannerOpen" @detected="handleScanDetected" />
  </div>
</template>

<script setup>
import CameraBarcodeScanner from '@/components/tk_custom/CameraBarcodeScanner.vue'
import request from '@/utils/request'
import {
  getMaterialInventory,
  getStagingByLegacyMaterial,
  suggestLocalStockLocation,
  transferStagingStock,
} from '@/api/tk_custom/localStock'
import { getWmsStructureOverview } from '@/api/tk_custom/wmsStructure'
import { parseLegacyStockLabelBarcode } from '@ctk-system/shared'

const toast = useToast()
const queryText = ref('')
const receiptLines = ref([])
const selectedLine = ref(null)
const loadingReceipt = ref(false)
const submitting = ref(false)
const scannerOpen = ref(false)
const lastSuccess = ref(null)
const locationOptions = ref([])
const loadingLocations = ref(false)
const locationError = ref('')
const labelHint = reactive({ materialCode: '' })
const materialOptions = ref([])
const materialOptionsLoading = ref(false)
const queryWrapRef = ref(null)
const materialDropdownStyle = ref({})
const materialDropdownOpen = computed(() => materialOptionsLoading.value || materialOptions.value.length > 0)
function updateMaterialDropdownPosition() {
  const wrap = queryWrapRef.value
  if (!wrap) return
  const rect = wrap.getBoundingClientRect()
  materialDropdownStyle.value = {
    top: `${rect.bottom + 4}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
  }
}
watch(materialDropdownOpen, (open) => {
  if (open) {
    nextTick(updateMaterialDropdownPosition)
    window.addEventListener('scroll', updateMaterialDropdownPosition, true)
    window.addEventListener('resize', updateMaterialDropdownPosition)
  } else {
    window.removeEventListener('scroll', updateMaterialDropdownPosition, true)
    window.removeEventListener('resize', updateMaterialDropdownPosition)
  }
})
onUnmounted(() => {
  window.removeEventListener('scroll', updateMaterialDropdownPosition, true)
  window.removeEventListener('resize', updateMaterialDropdownPosition)
})
let materialSearchSeq = 0
let materialSearchTimer = null
let justSelectedMaterialCode = ''
const form = reactive({ requestId: '', qty: null, locationCode: '', remark: '' })
const suggest = reactive({ locationCode: '', reasonText: '', zone: '' })
const inventory = reactive({
  loading: false,
  error: '',
  materialCode: '',
  materialName: '',
  specification: '',
  unitNumber: '',
  unitName: '',
  totalOnHandQty: 0,
  totalAvailableQty: 0,
  rowCount: 0,
  queriedAt: '',
  rows: [],
})
let inventoryRequestSeq = 0
let lastSubmitFingerprint = ''

const canSubmit = computed(() => {
  if (!selectedLine.value || !labelHint.materialCode || !form.locationCode.trim()) return false
  if (!locationOptions.value.some(option => option.value === form.locationCode.trim().toUpperCase())) return false
  const qty = Number(form.qty)
  return Number.isFinite(qty)
    && qty > 0
    && qty <= Number(selectedLine.value.transferableQty || 0)
})

function lineKey(line) {
  return `${line?.materialCode || ''}::${line?.sourceStockNumber || ''}::${line?.sourceStockLocationNumber || ''}::${line?.sourceBillNo || ''}::${line?.sourceEntryId || ''}::${line?.lotNumber || ''}`
}

function sourceOnHandQty(line) {
  return Number(line?.sourceOnHandQty ?? line?.sourceAvailableQty ?? line?.receiptQty ?? 0)
}

const receiptMaterial = computed(() => {
  const line = receiptLines.value[0]
  if (!line) return null
  return {
    materialCode: line.materialCode || '',
    materialName: line.materialName || '',
    specification: line.specification || '',
  }
})

function newRequestId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function formatQty(value) {
  const number = Number(value || 0)
  if (!Number.isFinite(number)) return '0'
  return Number.isInteger(number) ? String(number) : String(Math.round(number * 1000) / 1000)
}

function handleLocationSelect(value) {
  const raw = value && typeof value === 'object'
    ? value.value || value.locationCode || ''
    : value
  form.locationCode = String(raw || '').trim().toUpperCase()
}

function confirmSuggestedLocation() {
  if (!suggest.locationCode) return
  const locationCode = suggest.locationCode.trim().toUpperCase()
  if (!locationOptions.value.some(option => option.value === locationCode)) {
    return toast.add({ title: '推荐库位未配置为启用库位', description: locationCode, color: 'warning' })
  }
  form.locationCode = locationCode
}

function confirmScannedLocation(location) {
  if (!locationOptions.value.some(option => option.value === location)) {
    return toast.add({ title: '库位不存在或未启用', description: location, color: 'error' })
  }
  form.locationCode = location
}

async function loadLocationOptions() {
  loadingLocations.value = true
  locationError.value = ''
  try {
    const response = await getWmsStructureOverview()
    if (response?.code !== 200) throw new Error(response?.msg || '库位列表加载失败')
    const locations = Array.isArray(response.data?.locations) ? response.data.locations : []
    locationOptions.value = locations
      .filter(item => String(item.status) === '0')
      .filter(item => String(item.kingdeeStockNumber || '').trim().toUpperCase() === 'CTK10')
      .filter(item => String(item.kingdeeStockLocationNumber || '').trim())
      .map(item => {
        const value = String(item.locationCode || '').trim().toUpperCase()
        const area = item.zoneName || item.zoneCode || ''
        const row = item.rowNo == null || item.rowNo === '' ? '' : `${item.rowNo}排`
        return {
          value,
          label: [value, item.warehouseName, area, row].filter(Boolean).join(' · '),
        }
      })
      .filter(item => item.value)
    if (!locationOptions.value.length) throw new Error('没有找到已启用且已配置金蝶映射的 CTK10 库位')
  } catch (error) {
    locationOptions.value = []
    locationError.value = error.message || String(error)
  } finally {
    loadingLocations.value = false
  }
}

function resetInventory() {
  inventoryRequestSeq += 1
  Object.assign(inventory, {
    loading: false,
    error: '',
    materialCode: '',
    materialName: '',
    specification: '',
    unitNumber: '',
    unitName: '',
    totalOnHandQty: 0,
    totalAvailableQty: 0,
    rowCount: 0,
    queriedAt: '',
    rows: [],
  })
}

async function loadMaterialInventory(materialCode) {
  const requestSeq = ++inventoryRequestSeq
  Object.assign(inventory, {
    loading: true,
    error: '',
    materialCode,
    materialName: '',
    specification: '',
    unitNumber: '',
    unitName: '',
    totalOnHandQty: 0,
    totalAvailableQty: 0,
    rowCount: 0,
    queriedAt: '',
    rows: [],
  })
  try {
    const response = await getMaterialInventory(materialCode)
    if (requestSeq !== inventoryRequestSeq) return
    if (response?.code !== 200) throw new Error(response?.msg || '完整库存查询失败')
    Object.assign(inventory, response.data || {}, { loading: false, error: '' })
    inventory.rows = Array.isArray(response.data?.rows) ? response.data.rows : []
  } catch (error) {
    if (requestSeq !== inventoryRequestSeq) return
    inventory.error = error.message || String(error)
    inventory.loading = false
  }
}

function detectQueryKind(raw) {
  const text = String(raw || '').trim()
  if (!text) return { kind: 'empty', value: '' }

  const label = parseLegacyStockLabelBarcode(text)
  if (label?.materialCode) {
    return {
      kind: 'legacy-material',
      value: label.materialCode,
      materialCode: label.materialCode,
      legacy: true,
    }
  }
  if (/^[A-Z0-9][A-Z0-9._-]{3,}$/i.test(text)) {
    return {
      kind: 'legacy-material',
      value: text.toUpperCase(),
      materialCode: text.toUpperCase(),
      legacy: true,
    }
  }
  return { kind: 'unsupported', value: text }
}

async function loadMaterialOptions(keyword = '') {
  const kw = String(keyword || '').trim()
  const seq = ++materialSearchSeq
  if (kw.length < 2) {
    materialOptions.value = []
    materialOptionsLoading.value = false
    return
  }
  materialOptionsLoading.value = true
  try {
    const res = await request({ url: '/tk_custom/material/options', method: 'get', params: { keyword: kw, limit: 20 } })
    if (seq !== materialSearchSeq) return
    const rows = res?.data || []
    materialOptions.value = (Array.isArray(rows) ? rows : [])
      .map(row => ({
        id: row.id,
        value: String(row.number || row.value || '').trim().toUpperCase(),
        name: row.name || '',
        spec: row.spec || '',
      }))
      .filter(row => row.value)
  } catch {
    if (seq === materialSearchSeq) materialOptions.value = []
  } finally {
    if (seq === materialSearchSeq) materialOptionsLoading.value = false
  }
}

function handleMaterialSearchInput(value) {
  if (String(value || '').trim().toUpperCase() === justSelectedMaterialCode) return
  justSelectedMaterialCode = ''
  clearTimeout(materialSearchTimer)
  updateMaterialDropdownPosition()
  materialSearchTimer = setTimeout(() => loadMaterialOptions(value), 300)
}

function onMaterialSelect(option) {
  clearTimeout(materialSearchTimer)
  materialSearchSeq += 1
  materialOptions.value = []
  materialOptionsLoading.value = false
  justSelectedMaterialCode = String(option?.value || '').trim().toUpperCase()
  queryText.value = justSelectedMaterialCode
  loadSource()
}

async function loadSource() {
  const detected = detectQueryKind(queryText.value)
  if (detected.kind === 'empty') {
    return toast.add({ title: '请扫描标签或输入物料编码', color: 'warning' })
  }
  if (detected.kind !== 'legacy-material') {
    return toast.add({ title: '标签格式不支持', description: '请扫描标签或输入物料编码', color: 'error' })
  }
  clearTimeout(materialSearchTimer)
  materialSearchSeq += 1
  materialOptions.value = []
  materialOptionsLoading.value = false
  justSelectedMaterialCode = String(detected.materialCode || '').trim().toUpperCase()

  Object.assign(labelHint, {
    materialCode: detected.materialCode || '',
  })
  resetInventory()
  void loadMaterialInventory(detected.materialCode)
  loadingReceipt.value = true
  try {
    const response = await getStagingByLegacyMaterial(detected.materialCode)
    if (response?.code !== 200) throw new Error(response?.msg || '读取失败')
    receiptLines.value = Array.isArray(response.data) ? response.data : []
    selectedLine.value = null
    Object.assign(form, { requestId: '', qty: null, locationCode: '', remark: '' })
    if (receiptLines.value.length === 1 && Number(receiptLines.value[0].transferableQty || 0) > 0) {
      await selectLine(receiptLines.value[0])
    }
  } catch (error) {
    receiptLines.value = []
    selectedLine.value = null
    toast.add({ title: '读取失败', description: error.message || String(error), color: 'error' })
  } finally {
    loadingReceipt.value = false
  }
}

async function selectLine(line) {
  selectedLine.value = line
  form.requestId = newRequestId()
  const transferable = Number(line.transferableQty || 0)
  form.qty = null
  form.locationCode = ''
  Object.assign(suggest, { locationCode: '', reasonText: '', zone: '' })
  if (transferable <= 0) {
    toast.add({ title: '该明细当前没有可上架剩余数量', color: 'warning' })
    return
  }
  try {
    const response = await suggestLocalStockLocation({
      materialCode: line.materialCode,
      packageName: line.packageName,
    })
    if (response?.code !== 200) throw new Error(response?.msg || '推荐排位失败')
    const data = response.data || {}
    suggest.locationCode = data.locationCode || ''
    suggest.reasonText = data.reasonText || ''
    suggest.zone = data.zone || ''
  } catch (error) {
    toast.add({ title: '排位推荐失败', description: error.message || String(error), color: 'warning' })
  }
}

function parseLocation(raw) {
  const text = String(raw || '').trim().toUpperCase()
  if (text.startsWith('LOC:')) return text.slice(4).trim()
  if (/^[AB]-\d{2}$/.test(text)) return text
  return ''
}

function handleScanDetected(raw) {
  const text = String(raw || '').trim()
  const location = parseLocation(text)
  if (location) {
    if (!selectedLine.value) return toast.add({ title: '请先扫描入库标签', color: 'warning' })
    confirmScannedLocation(location)
    return
  }

  const detected = detectQueryKind(text)
  if (detected.kind === 'legacy-material') {
    queryText.value = text
    loadSource()
    return
  }

  toast.add({ title: '无法识别扫码内容', description: '请扫描标签二维码或实际库位码', color: 'error' })
}

function submitFingerprint() {
  const line = selectedLine.value
  if (!line) return ''
  return [
    line.materialCode, line.sourceStockNumber, line.sourceStockLocationNumber,
    line.lotNumber, line.sourceBillNo, line.sourceEntryId,
    Number(form.qty), String(form.locationCode || '').trim().toUpperCase(),
  ].join('|')
}

async function submitTransfer() {
  if (!canSubmit.value) return toast.add({ title: '请核对明细、数量和实际库位', color: 'warning' })
  // 内容不变的重提复用同一幂等键，让服务端续做而不是建新单；改了数量/库位/来源才换新键
  const fingerprint = submitFingerprint()
  if (fingerprint !== lastSubmitFingerprint) {
    form.requestId = newRequestId()
    lastSubmitFingerprint = fingerprint
  }
  submitting.value = true
  try {
    const response = await transferStagingStock({
      requestId: form.requestId,
      legacyMaterialCode: labelHint.materialCode,
      sourceStockNumber: selectedLine.value.sourceStockNumber,
      sourceStockLocationNumber: selectedLine.value.sourceStockLocationNumber,
      sourceLotNumber: selectedLine.value.lotNumber || '',
      qty: Number(form.qty),
      locationCode: form.locationCode.trim().toUpperCase(),
      remark: form.remark.trim(),
    })
    if (response?.code !== 200) throw new Error(response?.msg || '验收上架失败')
    lastSuccess.value = response.data
    Object.assign(form, { requestId: '', qty: null, locationCode: '', remark: '' })
    Object.assign(suggest, { locationCode: '', reasonText: '', zone: '' })
    selectedLine.value = null
    await loadSource()
  } catch (error) {
    toast.add({ title: '验收上架失败', description: error?.message || String(error || '未知错误'), color: 'error' })
  } finally {
    submitting.value = false
  }
}

function resetAll() {
  resetInventory()
  lastSubmitFingerprint = ''
  clearTimeout(materialSearchTimer)
  materialSearchSeq += 1
  materialOptions.value = []
  materialOptionsLoading.value = false
  justSelectedMaterialCode = ''
  queryText.value = ''
  receiptLines.value = []
  selectedLine.value = null
  Object.assign(form, { requestId: '', qty: null, locationCode: '', remark: '' })
  Object.assign(suggest, { locationCode: '', reasonText: '', zone: '' })
  Object.assign(labelHint, { materialCode: '' })
  lastSuccess.value = null
}

onMounted(loadLocationOptions)
</script>
