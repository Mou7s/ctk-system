<template>
  <div
    :class="['sidebar-logo-container', { collapse }]"
    class="relative flex h-[50px] w-full items-center overflow-hidden transition-colors duration-300 ease-in-out"
  >
    <transition name="sidebarLogoFade">
      <router-link
        v-if="collapse"
        key="collapse"
        class="flex h-full w-full items-center justify-center"
        to="/"
      >
        <img
          v-if="logo"
          :src="logo"
          class="size-7 shrink-0 rounded-md object-contain"
          :alt="title"
        />
        <h1
          v-else
          class="sidebar-title truncate text-sm font-semibold text-highlighted"
        >
          {{ title }}
        </h1>
      </router-link>
      <router-link
        v-else
        key="expand"
        class="flex h-full w-full min-w-0 items-center gap-2"
        to="/"
      >
        <img
          v-if="logo"
          :src="logo"
          class="size-7 shrink-0 rounded-md object-contain"
          :alt="title"
        />
        <h1
          class="sidebar-title m-0 min-w-0 truncate text-sm font-semibold text-highlighted"
        >
          {{ title }}
        </h1>
      </router-link>
    </transition>
  </div>
</template>

<script setup>
import defaultLogo from "@/assets/logo/logo.webp";
import useUserStore from "@/store/modules/user";

const runtimeConfig = useRuntimeConfig();
const userStore = useUserStore();

// 演示账号：不显示公司 logo，标题也换成中性名称（不出现公司名）。
const isDemoAccount = computed(() => userStore.demo === true);
const logo = isDemoAccount.value ? "" : defaultLogo;
const title = isDemoAccount.value ? runtimeConfig.public.demoTitle : runtimeConfig.public.appTitle;

defineProps({
  collapse: {
    type: Boolean,
    required: true,
  },
});
</script>
