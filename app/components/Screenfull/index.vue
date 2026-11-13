<template>
  <UTooltip :text="isFullscreen ? '退出全屏' : '全屏显示'" :content="{ side: 'bottom' }">
    <UButton
      color="neutral"
      variant="ghost"
      size="md"
      :square="true"
      :icon="isFullscreen ? 'i-lucide-minimize' : 'i-lucide-maximize'"
      :aria-label="isFullscreen ? '退出全屏' : '全屏显示'"
      @click="toggle"
    />
  </UTooltip>
</template>

<script setup>
import { useFullscreen } from '@vueuse/core'
const { isFullscreen, toggle } = useFullscreen();
</script>
