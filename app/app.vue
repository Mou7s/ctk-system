<template>
  <UApp :locale="zh_cn">
    <!-- 路由切换顶部加载条：auth.global.ts 的 routeLoading 驱动，替代 nprogress -->
    <UProgress v-if="routeLoading" size="xs" class="fixed inset-x-0 top-0 z-[999]" />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>

<script setup>
import { zh_cn } from "@nuxt/ui/locale";
import useSettingsStore from "@/store/modules/settings";
import { useToast } from "#imports";

const toast = useToast();
const routeLoading = useState("routeLoading", () => false);
const settingsStore = useSettingsStore();
const colorMode = useColorMode();

useHead({
  htmlAttrs: {
    lang: "zh-CN",
  },
});

if (import.meta.client) {
  window.__nuxt_ui_toast__ = toast;

  try {
    const raw = localStorage.getItem("layout-setting");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        typeof parsed.isDark === "boolean" &&
        !localStorage.getItem("nuxt-color-mode")
      ) {
        localStorage.setItem(
          "nuxt-color-mode",
          parsed.isDark ? "dark" : "light",
        );
      }
    }
  } catch (_) {}
}

watchEffect(() => {
  settingsStore.isDark = colorMode.value === "dark";
});
</script>
