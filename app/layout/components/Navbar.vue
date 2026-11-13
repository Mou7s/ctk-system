<template>
  <UDashboardNavbar
    :title="pageTitle"
    :ui="{
      root: 'h-[50px] px-2 sm:px-4 bg-app-shell',
      title: 'text-sm sm:text-base',
      right: 'gap-0.5 sm:gap-1'
    }"
  >
    <template #toggle="{ sidebarOpen }">
      <UDashboardSidebarToggle :aria-label="unref(sidebarOpen) ? '关闭侧边栏' : '打开侧边栏'" />
    </template>

    <template #leading="{ sidebarCollapsed }">
      <UDashboardSidebarCollapse :aria-label="unref(sidebarCollapsed) ? '展开侧边栏' : '折叠侧边栏'" />
    </template>

    <template #right>
      <AppUpdateNotice />
      <Screenfull />
      <DarkModeToggle />
    </template>
  </UDashboardNavbar>
</template>

<script setup>
import AppUpdateNotice from '@/components/AppUpdateNotice.vue'
import Screenfull from '@/components/Screenfull'
import DarkModeToggle from '@/components/DarkModeToggle'
import { findStaticRoute } from '@/router/static-navigation'
import { unref } from 'vue'

const route = useRoute()
const pageTitle = computed(() => findStaticRoute(route.path)?.meta?.title || route.meta?.title || 'Enterprise Admin')
</script>
