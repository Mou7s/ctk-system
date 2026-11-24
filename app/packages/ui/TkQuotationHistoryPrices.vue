<template>
  <UPopover
    :open="open"
    :content="{ align: 'end', sideOffset: 4 }"
    @update:open="handleOpen"
  >
    <button
      type="button"
      class="inline-flex size-7 shrink-0 items-center justify-center rounded text-primary hover:bg-primary/10 hover:text-primary-active transition-colors"
      :title="`查看 ${normalizedMpn || '该型号'} 的历史终审价格`"
      :aria-label="`查看 ${normalizedMpn || '该型号'} 的历史终审价格`"
      :disabled="!normalizedMpn"
      @click.stop
    >
      <UIcon :name="loading ? 'i-lucide-loader-circle' : 'i-lucide-history'" :class="['size-4', loading ? 'animate-spin' : '']" />
    </button>

    <template #content>
      <div class="w-80 max-w-[90vw] p-2 text-xs">
        <div class="mb-1.5 flex items-center justify-between gap-2 border-b border-muted/50 pb-1.5">
          <span class="flex min-w-0 items-center gap-1 font-medium text-highlighted">
            <UIcon name="i-lucide-history" class="size-3.5 shrink-0 text-primary" />
            <span>同型号历史终审单价</span>
          </span>
          <span class="max-w-[140px] truncate font-mono text-[10px] text-muted">{{ normalizedMpn }}</span>
        </div>

        <div v-if="loading && !historyPrices.length" class="py-4 text-center text-muted">
          正在加载历史价格…
        </div>
        <div v-else-if="error" class="py-4 text-center text-error">
          {{ error }}，关闭后重新打开可重试
        </div>
        <div v-else-if="historyPrices.length" class="max-h-60 space-y-1 overflow-y-auto">
          <div
            v-for="item in historyPrices"
            :key="item.lineId"
            class="flex items-center justify-between gap-2 rounded p-1.5"
          >
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <span class="font-mono text-sm font-bold text-primary">¥{{ formatPrice(item.priceRmb) }}</span>
                <span class="text-[10px] text-muted">/ {{ item.unit || 'KPCS' }}</span>
                <UBadge size="xs" color="success" variant="subtle" class="scale-75 origin-left">终审价</UBadge>
              </div>
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="truncate text-[11px] text-highlighted" :title="item.customerName">
                  {{ item.customerName || '未知客户' }}
                </span>
                <UBadge v-if="item.isReference" size="xs" color="warning" variant="subtle" class="scale-75 origin-left shrink-0">参考客户</UBadge>
              </div>
              <div class="flex flex-wrap gap-x-2 text-[10px] text-muted">
                <span class="break-words">封装：{{ item.packageName || '—' }}</span>
                <span>客户性质：{{ item.customerStyle || '—' }}</span>
                <span class="break-words">城市：{{ item.city || '—' }}</span>
                <span class="break-words">芯片大小：{{ item.dieSize || '—' }}</span>
              </div>
              <div class="truncate text-[10px] text-muted" :title="item.quoteNo">
                {{ item.quoteNo || '报价单' }}
              </div>
            </div>
            <div class="shrink-0 text-right">
              <div v-if="item.qty != null" class="font-mono text-[10px] text-muted">
                {{ formatQuantity(item.qty) }} {{ item.unit || 'KPCS' }}
              </div>
              <div class="text-[10px] text-muted">{{ item.quoteDate || '-' }}</div>
            </div>
          </div>
        </div>
        <div v-else class="py-4 text-center text-muted">
          暂无同型号历史终审价格
        </div>

        <div class="mt-2 border-t border-muted/40 pt-1.5 text-center text-[10px] text-muted">
          仅供审核比价，不会修改当前报价
        </div>
      </div>
    </template>
  </UPopover>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  ctkMpn: { type: String, default: '' },
})

const normalizedMpn = computed(() => String(props.ctkMpn || '').trim().toUpperCase())
const open = ref(false)
const loading = ref(false)
const loadedMpn = ref('')
const historyPrices = ref([])
const error = ref('')

watch(normalizedMpn, () => {
  open.value = false
  loading.value = false
  loadedMpn.value = ''
  historyPrices.value = []
  error.value = ''
})

async function handleOpen(value) {
  open.value = value
  if (!value || !normalizedMpn.value || loadedMpn.value === normalizedMpn.value || loading.value) return

  const requestMpn = normalizedMpn.value
  loading.value = true
  error.value = ''
  try {
    const request = (await import('@/utils/request')).default
    const response = await request({
      url: '/tk_custom/quotation/history-prices',
      method: 'get',
      params: { ctkMpn: requestMpn, limit: 5 },
    })
    if (response?.code != null && response.code !== 200) throw new Error(response.msg || '获取历史价格失败')
    if (requestMpn !== normalizedMpn.value) return
    historyPrices.value = Array.isArray(response?.data)
      ? response.data
      : (Array.isArray(response?.rows) ? response.rows : [])
    loadedMpn.value = requestMpn
  } catch {
    if (requestMpn === normalizedMpn.value) {
      historyPrices.value = []
      error.value = '历史价格加载失败'
    }
  } finally {
    if (requestMpn === normalizedMpn.value) loading.value = false
  }
}

function formatPrice(value) {
  const price = Number(value)
  return Number.isFinite(price) ? price.toFixed(2) : String(value ?? '-')
}

function formatQuantity(value) {
  const quantity = Number(value)
  return Number.isFinite(quantity) ? quantity.toLocaleString('en-US') : String(value ?? '')
}
</script>
