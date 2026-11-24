<template>
  <div />
</template>

<script setup>
definePageMeta({ layout: false });

await navigateTo({ path: "/login", query: { demo: "1" } }, { replace: true });
</script>
