<template>
  <UForm
    v-show="showSearch"
    :state="model"
    :class="['tk-search-panel', inline ? 'tk-search-panel--inline' : '', panelClass]"
  >
    <slot />
    <slot name="actions" />
  </UForm>
</template>

<script setup>
defineProps({
  model: { type: Object, default: () => ({}) },
  showSearch: { type: Boolean, default: true },
  panelClass: { type: [String, Array, Object], default: '' },
  inline: { type: Boolean, default: false },
  labelWidth: { type: String, default: '' },
  labelPosition: { type: String, default: 'top' },
});

function resetFields() {
  // 搜索表单不参与深层校验；清空由调用方在 beforeReset 里手动处理
}

defineExpose({ resetFields, clearValidate: resetFields });
</script>

<style scoped>
.tk-search-panel {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem 0;
}

.tk-search-panel--inline {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

.tk-search-panel--inline > :not(button):not(.flex):not(.tk-search-actions) {
  width: 13rem;
}

.tk-search-panel :deep(.tk-search-actions) {
  margin-left: auto;
  display: flex;
  gap: 0.5rem;
}
</style>
