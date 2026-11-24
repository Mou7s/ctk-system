<script setup>
definePageMeta({ title: '角色用户授权', permission: 'system:role:list' })

const route = useRoute()
await navigateTo({ path: '/system/role/authUser', query: { roleId: route.params.roleId } }, { redirectCode: 301 })
</script>

<template><span /></template>
