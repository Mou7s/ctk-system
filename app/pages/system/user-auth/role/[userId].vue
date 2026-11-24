<script setup>
definePageMeta({ title: '用户角色授权', permission: 'system:user:list' })

const route = useRoute()
await navigateTo({ path: '/system/user/authRole', query: { userId: route.params.userId } }, { redirectCode: 301 })
</script>

<template><span /></template>
