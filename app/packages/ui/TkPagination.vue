<template>
  <div class="grid min-w-0 grid-cols-2 items-center gap-x-3 gap-y-2 text-xs text-app-muted sm:grid-cols-[auto_minmax(0,1fr)_auto]">
    <span class="whitespace-nowrap">共 {{ total }} 条 · {{ totalPages }} 页</span>
    <div class="col-span-2 row-start-2 flex min-w-0 justify-center overflow-x-auto sm:col-span-1 sm:col-start-2 sm:row-start-1">
      <UPagination
        v-model:page="pageModel"
        :total="total"
        :items-per-page="pageSizeModel"
        :show-edges="showEdges"
        :size="size"
        class="shrink-0"
      />
    </div>
    <div v-if="showPageSize" class="flex items-center justify-self-end gap-2 whitespace-nowrap">
      <span>每页</span>
      <USelect
        v-model="pageSizeModel"
        :items="pageSizeOptions"
        value-key="value"
        label-key="label"
        size="xs"
        class="w-20"
        :aria-label="pageSizeLabel"
      />
      <span>条</span>
    </div>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue'

const props = defineProps({
  total: { type: Number, default: 0 },
  pageSizes: { type: Array, default: () => [20, 50, 100] },
  showEdges: { type: Boolean, default: true },
  showPageSize: { type: Boolean, default: true },
  size: { type: String, default: 'sm' },
  pageSizeLabel: { type: String, default: '每页条数' },
})

const emit = defineEmits(['pagination'])
const pageModel = defineModel('page', { type: Number, default: 1 })
const pageSizeModel = defineModel('pageSize', { type: Number, default: 50 })

const pageSizeOptions = computed(() => props.pageSizes.map((value) => ({
  label: String(value),
  value,
})))

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / Math.max(1, pageSizeModel.value))))

function emitPagination() {
  emit('pagination', { page: pageModel.value, pageSize: pageSizeModel.value })
}

watch(pageModel, (value, previous) => {
  if (value !== previous) emitPagination()
})

watch(pageSizeModel, (value, previous) => {
  if (value === previous) return
  if (pageModel.value > Math.ceil(props.total / Math.max(1, value))) {
    pageModel.value = 1
    return
  }
  emitPagination()
})
</script>
