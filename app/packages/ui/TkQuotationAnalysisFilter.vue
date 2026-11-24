<template>
  <UFormField :label="label" :error="error || undefined">
    <USelectMenu
      v-model="selected" v-model:search-term="search" :items="items" value-key="value"
      :placeholder="placeholder || `不限${label}`" :icon="icon" :loading="loading" ignore-filter
      :search-input="{ placeholder: `搜索${label}`, 'aria-label': `搜索${label}` }"
      :clear="{ 'aria-label': `清除${label}` }" class="w-full"
      @update:open="onOpenChange"
    >
      <template #empty>{{ loading ? '搜索中…' : '没有匹配的选项' }}</template>
      <template v-if="hasMore" #content-bottom><p class="border-t border-muted px-3 py-2 text-xs text-muted">更多结果，请继续输入关键词</p></template>
    </USelectMenu>
  </UFormField>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
const props = defineProps({
  modelValue: { type: String, default: '' }, field: { type: String, required: true },
  label: { type: String, required: true }, placeholder: { type: String, default: '' },
  icon: { type: String, default: undefined }, filters: { type: Object, required: true },
  fetchOptions: { type: Function, required: true },
})
const emit = defineEmits(['update:modelValue'])
const selected = computed({ get: () => props.modelValue || undefined, set: value => emit('update:modelValue', value || '') })
const search = ref('')
const values = ref([])
const loading = ref(false)
const error = ref('')
const hasMore = ref(false)
const open = ref(false)
const items = computed(() => [
  ...[...new Set([...(props.modelValue ? [props.modelValue] : []), ...values.value])].map(value => ({ label: value, value })),
])
let requestId = 0
let active = true
async function loadOptions() {
  if (!active || !open.value) return
  const id = ++requestId
  loading.value = true
  error.value = ''
  try {
    const response = await props.fetchOptions({ ...props.filters, optionsField: props.field, optionsSearch: search.value })
    if (!active || id !== requestId) return
    if (response?.code !== 200) throw new Error(response?.msg || '选项加载失败')
    values.value = response.data?.items || []
    hasMore.value = !!response.data?.hasMore
  } catch (err) { if (active && id === requestId) { values.value = []; hasMore.value = false; error.value = err?.message || '选项加载失败' } }
  finally { if (active && id === requestId) loading.value = false }
}
const debounceLoad = useDebounceFn(loadOptions, 250)
watch([search, () => props.filters], () => {
  if (!open.value) return
  ++requestId
  loading.value = true
  values.value = []
  hasMore.value = false
  debounceLoad()
}, { deep: true })
function onOpenChange(value) {
  open.value = value
  if (value) loadOptions()
  else { ++requestId; loading.value = false }
}
onBeforeUnmount(() => { active = false; ++requestId })
</script>
