<template>
  <UModal
    v-model:open="isOpen"
    :title="text || '请稍候'"
    :dismissible="false"
    :close="false"
    :ui="{ content: 'max-w-sm' }"
  >
    <template #body>
      <div class="space-y-3">
        <div class="flex items-center gap-3 text-sm text-default">
          <UIcon
            name="i-lucide-loader-circle"
            class="size-5 animate-spin text-primary"
          />
          <span>{{ text || "正在处理，请稍候..." }}</span>
        </div>
        <UProgress animation="carousel" />
      </div>
    </template>
  </UModal>
</template>

<script setup>
defineProps({
  text: {
    type: String,
    default: "正在处理，请稍候...",
  },
});

const isOpen = defineModel("open", { type: Boolean, default: true });
</script>
