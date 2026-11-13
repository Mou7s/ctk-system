<template>
  <div v-if="loading || error || warnings.length" class="shrink-0 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs" role="status" aria-live="polite">
    <p v-if="loading" class="text-muted">正在核对同一客户、同一业务员的历史报价…</p>
    <p v-else-if="error" class="text-error">{{ error }} <button type="button" class="underline" @click="load">重试</button></p>
    <template v-else>
      <p class="font-semibold text-warning">低价提醒：低于同型号、同封装最近一次终审价格（同一客户、同一业务员）</p>
      <ul class="mt-1 max-h-36 space-y-1 overflow-y-auto">
        <li v-for="(warning, index) in warnings" :key="index">{{ quotationLowPriceText(warning) }}</li>
      </ul>
    </template>
  </div>
</template>

<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { fetchQuotationLowPrices, quotationLowPriceText } from '@/utils/quotationLowPrice'

const props = defineProps({ customerName: { type: String, default: '' }, lines: { type: Array, default: () => [] }, id: { type: Number, default: 0 }, businessType: { type: String, default: 'FOREIGN' } })
const loading = ref(false)
const error = ref('')
const warnings = ref([])
let timer
let version = 0
async function load() {
  const current = ++version
  loading.value = true
  error.value = ''
  try {
    const result = await fetchQuotationLowPrices({ customerName: props.customerName, lines: props.lines, id: props.id, businessType: props.businessType })
    if (current === version) warnings.value = result
  } catch (failure) {
    if (current === version) { warnings.value = []; error.value = failure?.message || '历史价格查询失败' }
  } finally { if (current === version) loading.value = false }
}
watch(() => JSON.stringify([props.lines, props.id, props.businessType, props.customerName]), () => {
  clearTimeout(timer)
  version++
  warnings.value = []
  error.value = ''
  loading.value = false
  if (!props.lines.some(line => String(line.ctkMpn || '').trim())) return
  timer = setTimeout(load, 500)
}, { immediate: true })
onBeforeUnmount(() => { clearTimeout(timer); version++ })
</script>
