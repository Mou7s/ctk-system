<template>
  <section class="app-main relative min-h-0 w-full flex-1 overflow-hidden bg-app-bg transition-colors duration-350 ease-in-out">
    <slot />
    <iframe-toggle />
  </section>
</template>

<script setup>
import iframeToggle from "./IframeToggle/index"
</script>

<style></style>
