<template>
  <UTooltip :text="tooltipText" :content="{ side: 'bottom' }">
    <UButton
      color="neutral"
      variant="ghost"
      size="md"
      square
      :icon="icon"
      :aria-label="tooltipText"
      @click="toggleTheme"
      @contextmenu.prevent="resetToSystem"
    />
  </UTooltip>
</template>

<script setup>
const colorMode = useColorMode()

const isSystem = computed(() => colorMode.preference === 'system')
const isResolvedDark = computed(() => colorMode.value === 'dark')

const icon = computed(() => isResolvedDark.value ? 'i-lucide-moon' : 'i-lucide-sun')

const tooltipText = computed(() => {
  if (isSystem.value) {
    return `跟随系统（当前${isResolvedDark.value ? '深色' : '浅色'}）· 点击切换为${isResolvedDark.value ? '浅色' : '深色'}`
  }
  return `${isResolvedDark.value ? '深色' : '浅色'}模式 · 点击切换`
})

function nextPreference() {
  return isResolvedDark.value ? 'light' : 'dark'
}

function resetToSystem() {
  applyPreference('system')
}

async function toggleTheme(event) {
  const next = nextPreference()
  await applyPreference(next, event)
}

async function applyPreference(next, event) {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (!document.startViewTransition || prefersReducedMotion || !event) {
    colorMode.preference = next
    return
  }

  const x = event.clientX
  const y = event.clientY
  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  )

  const transition = document.startViewTransition(async () => {
    colorMode.preference = next
    await nextTick()
  })

  await transition.ready
  document.documentElement.animate(
    {
      clipPath: [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${endRadius}px at ${x}px ${y}px)`,
      ],
    },
    {
      duration: 450,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      pseudoElement: '::view-transition-new(root)',
    },
  )
}
</script>

<style>
::view-transition-old(root),
::view-transition-new(root) {
  animation: none;
  mix-blend-mode: normal;
}

::view-transition-old(root) {
  z-index: 1;
}

::view-transition-new(root) {
  z-index: 9999;
}
</style>
