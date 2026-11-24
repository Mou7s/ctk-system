<template>
  <div class="pl-1">
    <div
      class="group flex items-center gap-1 rounded-lg px-1.5 py-1 cursor-pointer"
      :class="isSelected ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300' : 'hover:bg-slate-100 dark:hover:bg-slate-800'"
      :style="{ marginLeft: depth ? `${depth * 12}px` : undefined }"
      @click="$emit('select', node.id)"
    >
      <button
        v-if="node.children && node.children.length"
        class="grid size-6 place-items-center rounded shrink-0 hover:bg-black/5 dark:hover:bg-white/10"
        @click.stop="$emit('toggle', node.id)"
      >
        <UIcon :name="isExpanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-3.5" />
      </button>
      <span v-else class="size-6 shrink-0" />

      <UIcon :name="node.children && node.children.length ? 'i-lucide-folder' : 'i-lucide-building-2'" class="size-3.5 shrink-0" :class="isSelected ? 'text-indigo-500' : 'text-slate-400'" />
      <span class="flex-1 truncate text-sm font-medium">{{ node.name }}</span>
      <span class="shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold" :class="isSelected ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'">
        {{ node.employeeCount }}
      </span>
    </div>
    <div v-if="node.children && node.children.length && isExpanded" class="mt-0.5 space-y-0.5">
      <OrgTreeNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        :selected-id="selectedId"
        :expanded="expanded"
        @toggle="$emit('toggle', $event)"
        @select="$emit('select', $event)"
      />
    </div>
  </div>
</template>

<script setup>
defineOptions({ name: 'OrgTreeNode' })
const props = defineProps({
  node: { type: Object, required: true },
  depth: { type: Number, default: 0 },
  selectedId: { type: Number, default: null },
  expanded: { type: Object, required: true }, // Set
})
defineEmits(['toggle', 'select'])

const isSelected = computed(() => props.selectedId === props.node.id)
const isExpanded = computed(() => props.expanded.has(props.node.id))
</script>
