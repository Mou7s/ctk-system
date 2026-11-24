<template>
  <div :class="{ 'hidden': hidden }" class="pagination-container">
    <div
      class="grid grid-cols-2 items-center gap-x-2 gap-y-2 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
    >
      <span class="text-sm text-(--ui-text-dimmed)">共 {{ total }} 条 · {{ totalPages }} 页</span>
      <div
        class="col-span-2 row-start-2 flex min-w-0 justify-center overflow-x-auto sm:col-span-1 sm:col-start-2 sm:row-start-1"
      >
        <UPagination
          v-model:page="currentPage"
          :total="total"
          :items-per-page="pageSize"
          :show-edges="true"
          size="sm"
          class="shrink-0"
        />
      </div>
      <div class="flex items-center justify-self-end gap-2 text-sm">
        <span class="text-(--ui-text-dimmed)">每页</span>
        <USelect
          v-model="pageSize"
          :items="pageSizeOptions"
          size="xs"
          class="w-24"
        />
        <span class="text-(--ui-text-dimmed)">条</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { scrollTo } from '@/utils/scroll-to'

const props = defineProps({
  total: {
    required: true,
    type: Number
  },
  page: {
    type: Number,
    default: 1
  },
  limit: {
    type: Number,
    default: 10
  },
  pageSizes: {
    type: Array,
    default() {
      return [10, 20, 30, 50, 100]
    }
  },
  pagerCount: {
    type: Number,
    default: 5
  },
  layout: {
    type: String,
    default: 'total, sizes, prev, pager, next, jumper'
  },
  background: {
    type: Boolean,
    default: true
  },
  autoScroll: {
    type: Boolean,
    default: true
  },
  hidden: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:page', 'update:limit', 'pagination'])

const pageSizeOptions = computed(() =>
  props.pageSizes.map(s => ({ label: String(s), value: s }))
)

const currentPage = computed({
  get() { return props.page },
  set(val) {
    emit('update:page', val)
    emit('pagination', { page: val, limit: pageSize.value })
    if (props.autoScroll) scrollTo(0, 800)
  }
})

const pageSize = computed({
  get() { return props.limit },
  set(val) {
    emit('update:limit', val)
    if (currentPage.value * val > props.total) {
      currentPage.value = 1
    }
    emit('pagination', { page: currentPage.value, limit: val })
    if (props.autoScroll) scrollTo(0, 800)
  }
})

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / pageSize.value)))
</script>

<style scoped>
.pagination-container {
  height: auto;
  min-height: 0;
  margin: 0;
  padding: 4px 16px !important;
}
.pagination-container.hidden {
  display: none;
}
</style>
