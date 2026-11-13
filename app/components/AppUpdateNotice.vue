<template>
  <UButton v-if="available" color="warning" variant="soft" size="xs" icon="i-lucide-refresh-cw"
    class="shrink-0" title="系统已更新，加载新版前请保存当前编辑内容" @click="loadUpdate">
    <span class="hidden sm:inline">系统已更新</span>
    <span>加载新版</span>
  </UButton>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createAppUpdateMonitor, loadAppUpdate } from '@/utils/appUpdate'

const currentVersion = String(useRuntimeConfig().public.releaseVersion || '')
const available = ref(false)
let monitor
let timer
const check = () => { if (document.visibilityState !== 'hidden') void monitor?.check() }
onMounted(() => {
  monitor = createAppUpdateMonitor({
    currentVersion,
    fetchVersion: async () => {
      const response = await fetch(`/app-version?_=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(5000) })
      if (!response.ok) throw new Error('Version check failed')
      return response.json()
    },
    onUpdate: () => { available.value = true },
  })
  timer = setInterval(check, 60_000)
  window.addEventListener('focus', check)
  document.addEventListener('visibilitychange', check)
  check()
})
onBeforeUnmount(() => {
  monitor?.stop()
  clearInterval(timer)
  window.removeEventListener('focus', check)
  document.removeEventListener('visibilitychange', check)
})
function loadUpdate() {
  // A fresh document updates all lazy-loaded modules and preserves the current URL.
  loadAppUpdate()
}
</script>
