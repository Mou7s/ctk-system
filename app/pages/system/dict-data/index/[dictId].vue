<script setup>
definePageMeta({ title: '字典数据', permission: 'system:dict:list' })

const route = useRoute()
await navigateTo({ path: '/system/dict/data', query: { dictId: route.params.dictId } }, { redirectCode: 301 })
</script>

<template><span /></template>
