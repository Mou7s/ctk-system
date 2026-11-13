<script setup>
definePageMeta({ title: '调度日志', permission: 'monitor:job:list' })

const route = useRoute()
await navigateTo({ path: '/monitor/job/log', query: { jobId: route.params.jobId } }, { redirectCode: 301 })
</script>

<template><span /></template>
