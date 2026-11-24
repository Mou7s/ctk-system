<template>
  <div class="image-preview-wrapper" :style="{ width: realWidth, height: realHeight }">
    <img
      :src="realSrc"
      :style="{ width: realWidth, height: realHeight }"
      class="image-preview-img"
      @click.stop="showPreview = true"
      @error="onError"
    />
    <div v-if="loadError" class="image-slot">
      <UIcon name="i-lucide-image-off" class="text-3xl text-gray-400" />
    </div>

    <ClientOnly>
      <VueEasyLightbox
        :visible="showPreview"
        :imgs="realSrc ? [realSrc] : []"
        :index="0"
        @hide="showPreview = false"
      />
    </ClientOnly>
  </div>
</template>

<script setup>
import { ref, computed } from "vue"
import { isExternal } from "@/utils/validate"

const props = defineProps({
  src: { type: String, default: "" },
  width: { type: [Number, String], default: "" },
  height: { type: [Number, String], default: "" },
})

const showPreview = ref(false)
const loadError = ref(false)

const realSrc = computed(() => {
  if (!props.src) return ""
  let first = String(props.src).split(",")[0].trim()
  if (isExternal(first)) return first
  if (first && !first.startsWith("/")) first = "/" + first
  // /profile and /upload are served directly at root, not under /prod-api
  if (/^\/(?:profile|upload)(?:\/|$)/i.test(first)) return first
  return import.meta.env.VITE_APP_BASE_API + first
})

const realWidth = computed(() => {
  if (typeof props.width === "number") return `${props.width}px`;
  if (typeof props.width === "string" && props.width.trim()) {
    return /^\d+$/.test(props.width.trim()) ? `${props.width.trim()}px` : props.width;
  }
  return props.width ? `${props.width}px` : "100%";
});

const realHeight = computed(() => {
  if (typeof props.height === "number") return `${props.height}px`;
  if (typeof props.height === "string" && props.height.trim()) {
    return /^\d+$/.test(props.height.trim()) ? `${props.height.trim()}px` : props.height;
  }
  return props.height ? `${props.height}px` : "100%";
});

function onError() {
  loadError.value = true
}
</script>

<style scoped>
.image-preview-wrapper {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  background-color: #ebeef5;
  box-shadow: 0 0 5px 1px #ccc;
  position: relative;
  overflow: hidden;
}
.image-preview-img {
  object-fit: cover;
  cursor: pointer;
  transition: transform 0.3s;
}
.image-preview-img:hover {
  transform: scale(1.2);
}
.image-slot {
  position: absolute;
  inset: 0;
  display: flex;
  justify-content: center;
  align-items: center;
}
</style>

<style>
.my-custom-preview-content {
  max-width: min(1200px, 95vw) !important;
  width: auto !important;
  min-width: 320px !important;
}
.my-custom-preview-content img {
  max-height: 85vh !important;
  width: auto !important;
}
</style>
