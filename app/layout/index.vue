<template>
  <UDashboardGroup unit="%" storage-key="app-shell">
    <UDashboardSidebar
      v-model:collapsed="isCollapsed"
      v-model:open="isOpen"
      :toggle="false"
      :resizable="false"
      collapsible
      :default-size="15"
      :min-size="10"
      :max-size="20"
      :collapsed-size="4"
      side="left"
      mode="slideover"
      :auto-close="appStore.device === 'mobile'"
      :ui="sidebarUi"
    >
      <template #header="{ collapsed }">
        <Logo :collapse="collapsed" />
      </template>

      <!-- 搜索入口：Nuxt UI 的 DashboardSearchButton（放大镜 + Search… + Ctrl K） -->
      <UDashboardSearchButton
        :collapsed="isCollapsed"
        class="bg-transparent ring-default"
      />

      <UNavigationMenu
        v-if="navItems.length"
        orientation="vertical"
        type="multiple"
        :items="navItems"
        variant="pill"
        color="primary"
        highlight
        :collapsed="isCollapsed"
        :tooltip="isCollapsed"
        :popover="isCollapsed"
      />

      <template #footer="{ collapsed }">
        <UDropdownMenu
          :items="userDropdownItems"
          :content="{ align: 'center', collisionPadding: 12 }"
          :ui="{
            content: collapsed
              ? 'w-48'
              : 'w-(--reka-dropdown-menu-trigger-width)',
          }"
        >
          <UButton
            :avatar="{ src: userStore.avatar, loading: 'lazy' }"
            :label="collapsed ? undefined : userStore.name"
            :trailing-icon="collapsed ? undefined : 'i-lucide-chevrons-up-down'"
            color="neutral"
            variant="ghost"
            block
            :square="collapsed"
            class="data-[state=open]:bg-elevated"
            :ui="{ trailingIcon: 'text-dimmed' }"
          />
          <template #chip-leading="{ item }">
            <span class="inline-flex size-5 shrink-0 items-center justify-center">
              <span class="size-2.5 rounded-full ring ring-default" :style="{ backgroundColor: themeColors[item.chip]?.[500] }" />
            </span>
          </template>
        </UDropdownMenu>
      </template>
    </UDashboardSidebar>

    <UDashboardPanel id="main" :ui="{ body: 'gap-0 overflow-hidden p-0 sm:p-0' }">
      <template #header>
        <navbar />
      </template>
      <template #body>
          <div
            v-if="isDemoAccount"
            class="flex items-center gap-2 border-b border-amber-300/60 bg-amber-50 px-4 py-1.5 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <UIcon name="i-lucide-triangle-alert" class="size-3.5 shrink-0" />
            <span>
              <strong class="font-semibold">演示环境</strong>：当前账号只连接演示数据库，
              页面里的企业、客户、员工、单据与金额<strong class="font-semibold">全部为虚构样例</strong>，
              仅用于功能展示，不代表任何真实数据；写操作只写入演示库，不会影响真实系统。
            </span>
          </div>
          <AppMain>
            <slot />
          </AppMain>
      </template>
    </UDashboardPanel>

    <UDashboardSearch
      :groups="searchGroups"
      :fuse="searchFuseOptions"
      placeholder="搜索功能菜单..."
    >
      <template #item-trailing="{ item }">
        <span
          v-if="item.to || item.href"
          class="text-xs text-muted font-mono truncate max-w-[240px] text-right select-none pointer-events-none"
        >
          {{ item.to || item.href }}
        </span>
      </template>
    </UDashboardSearch>

  </UDashboardGroup>
</template>

<script setup>
import { useWindowSize } from "@vueuse/core";
import themeColors from "tailwindcss/colors";
import Logo from "./components/Sidebar/Logo.vue";
import { AppMain, Navbar } from "./components";

import useAppStore from "@/store/modules/app";
import usePermissionStore from "@/store/modules/permission";
import useSettingsStore from "@/store/modules/settings";
import useUserStore from "@/store/modules/user";
import { isExternal } from "@/utils/validate";
import { getNormalPath } from "@/utils/helpers";
import { canAccessStaticRoute, findStaticRoute } from "@/router/static-navigation";

const { proxy } = getCurrentInstance();
const settingsStore = useSettingsStore();
const appStore = useAppStore();
const permissionStore = usePermissionStore();
const userStore = useUserStore();
// 演示账号：隐藏公司 logo/名称，并在页面顶部显示"数据为虚构样例"提示。
const isDemoAccount = computed(() => userStore.demo === true);
const runtimeBrand = useRuntimeConfig().public;
useHead({
  title: computed(() =>
    isDemoAccount.value
      ? `${runtimeBrand.demoTitle}（演示数据）`
      : runtimeBrand.appTitle
  ),
});
const toast = useToast();
const router = useRouter();
const route = useRoute();

const isChildActive = (item) => {
  if (item.to) {
    return (
      item.to === route.path ||
      (route.meta?.activeMenu && item.to === route.meta.activeMenu)
    );
  }
  if (item.children) {
    return item.children.some(isChildActive);
  }
  return false;
};

const sidebarRouters = computed(() => permissionStore.sidebarRouters);

const isOpen = ref(false);

const isCollapsed = computed({
  get: () => (appStore.device !== "mobile" ? !appStore.sidebar.opened : false),
  set: (value) => {
    if (appStore.device !== "mobile") {
      appStore.setSidebarOpened(!value);
    }
  },
});

const sidebarUi = computed(() => ({
  root: "border-e border-default bg-app-shell overflow-visible",
  header: "px-4 min-h-[50px]",
  body: `min-h-0 flex flex-col gap-4 flex-1 overflow-y-auto ${isCollapsed.value ? "overflow-x-visible" : "overflow-x-hidden"} px-4 py-2`,
  footer: "p-2 lg:border-t lg:border-default",
}));

function resolveMenuIcon(name) {
  if (!name || name === "#") return "i-lucide-menu";
  if (name.startsWith("i-")) return name;

  const kebab = name
    .replace(/([a-z])([A-Z])/g, "-")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "-")
    .toLowerCase();
  return "i-lucide-" + kebab;
}

function resolvePath(routePath, basePath = "") {
  if (isExternal(routePath)) return routePath;
  if (!routePath) return basePath || "/";
  if (isExternal(basePath)) return routePath;
  if (routePath === "/") return "/";
  if (routePath.startsWith("/")) return getNormalPath(routePath);
  return getNormalPath(basePath + "/" + routePath);
}

function convertRoutes(routes, basePath = "") {
  return routes
    .filter(
      (r) =>
        r && !r.hidden && (r.meta?.title || (r.children && r.children.length)),
    )
    .map((r) => {
      const path = resolvePath(r.path, basePath);
      const visibleChildren = r.children
        ? r.children.filter((c) => !c.hidden)
        : [];

      // 如果仅有一个可见的子路由，且没有设置 alwaysShow，则直接提升该子路由
      if (visibleChildren.length === 1 && !r.alwaysShow) {
        const singleChild = visibleChildren[0];
        const childPath = resolvePath(singleChild.path, path);

        // 如果子路由还有子路由，则递归提取
        if (
          singleChild.children &&
          singleChild.children.filter((c) => !c.hidden).length
        ) {
          return convertRoutes([singleChild], path)[0];
        }

        return {
          label: singleChild.meta?.title || r.meta?.title || "",
          icon: resolveMenuIcon(singleChild.meta?.icon || r.meta?.icon),
          to: isExternal(childPath) ? undefined : childPath,
          href: isExternal(childPath) ? childPath : undefined,
          target: isExternal(childPath) ? "_blank" : undefined,
        };
      }

      const children = convertRoutes(visibleChildren, path);
      if (children.length) {
        const hasActiveChild = children.some(isChildActive);
        return {
          label: r.meta?.title || "",
          icon: resolveMenuIcon(r.meta?.icon),
          children,
          defaultOpen: hasActiveChild,
        };
      }
      return {
        label: r.meta?.title || "",
        icon: resolveMenuIcon(r.meta?.icon),
        to: isExternal(path) ? undefined : path,
        href: isExternal(path) ? path : undefined,
        target: isExternal(path) ? "_blank" : undefined,
      };
    })
    .filter(Boolean);
}

const navItems = computed(() => convertRoutes(sidebarRouters.value));

// ── Search（Nuxt UI DashboardSearch：分组命令面板，Ctrl/⌘+K 与关闭由组件内置） ──

// Nuxt UI 的 DashboardSearch 默认给 Fuse 打开 useTokenSearch（分词搜索）。
// 本项目安装的 fuse.js（根依赖，@vueuse/integrations 用的就是这份）在开启分词后
// 连整条菜单名都匹配不上，中文菜单一个都搜不到；关掉它回到子串匹配，中英文都能命中。
// 同时加入 to 与 href 检索键，使输入英文路由地址（如 /system/user、user）也能搜索到对应菜单。
const searchFuseOptions = {
  fuseOptions: {
    useTokenSearch: false,
    keys: ["label", "description", "to", "href", "suffix"],
  },
};

function openSearchItem(item) {
  if (item.href) {
    window.open(item.href, item.target || "_blank");
    return;
  }
  if (item.to) router.push(item.to);
}

const searchGroups = computed(() => {
  const direct = [];
  const groups = [];

  const toSearchItem = (item, parentLabel = "") => ({
    label: item.label,
    to: item.to,
    href: item.href,
    description: parentLabel || undefined,
    icon: item.icon || "i-lucide-menu",
    onSelect: () => openSearchItem(item),
  });

  navItems.value.forEach((top) => {
    if (!top.children?.length) {
      direct.push(toSearchItem(top));
      return;
    }

    const items = [];
    // 组标题已经是这一层的父级，所以第一层不再重复父级名；只有更深的层级才补路径
    const walk = (node, path) => {
      if (node.to || node.href) {
        items.push({
          label: node.label,
          to: node.to,
          href: node.href,
          description: path || undefined,
          icon: node.icon || "i-lucide-menu",
          onSelect: () => openSearchItem(node),
        });
      }
      (node.children || []).forEach((child) =>
        walk(child, path ? `${path} / ${node.label}` : node.label),
      );
    };
    (top.children || []).forEach((child) => walk(child, ""));

    if (items.length) {
      groups.push({ id: `menu-${top.label}`, label: String(top.label), items });
    }
  });

  return direct.length
    ? [{ id: "menu-direct", items: direct }, ...groups]
    : groups;
});

// ── User dropdown（对齐 Nuxt UI 模板的 UserMenu：顶部用户信息 + 分组 + 二级菜单） ──

const colorMode = useColorMode();
const appConfig = useAppConfig();
const primaryColors = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose'];
const neutralColors = ['slate', 'gray', 'zinc', 'neutral', 'stone'];

function saveLayoutPreferences() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('layout-setting') || '{}') || {}; } catch { /* 使用默认配置 */ }
  localStorage.setItem('layout-setting', JSON.stringify({
    ...saved,
    primary: appConfig.ui.colors.primary,
    neutral: appConfig.ui.colors.neutral,
  }));
}

onMounted(() => {
  try {
    const saved = JSON.parse(localStorage.getItem('layout-setting') || '{}') || {};
    if (primaryColors.includes(saved.primary)) appConfig.ui.colors.primary = saved.primary;
    if (neutralColors.includes(saved.neutral)) appConfig.ui.colors.neutral = saved.neutral;
  } catch { /* 损坏的本地配置使用默认主题 */ }
});

const themeItems = computed(() => [
  { label: '主色', slot: 'chip', chip: appConfig.ui.colors.primary, children: primaryColors.map(color => ({
    label: color, slot: 'chip', chip: color, type: 'checkbox', checked: appConfig.ui.colors.primary === color,
    onSelect(event) { event.preventDefault(); appConfig.ui.colors.primary = color; saveLayoutPreferences(); },
  })) },
  { label: '中性色', slot: 'chip', chip: appConfig.ui.colors.neutral, children: neutralColors.map(color => ({
    label: color, slot: 'chip', chip: color, type: 'checkbox', checked: appConfig.ui.colors.neutral === color,
    onSelect(event) { event.preventDefault(); appConfig.ui.colors.neutral = color; saveLayoutPreferences(); },
  })) },
]);
const appearanceItems = computed(() => [
  {
    label: "跟随系统",
    icon: "i-lucide-monitor",
    type: "checkbox",
    checked: colorMode.preference === "system",
    onSelect: (event) => {
      event.preventDefault();
      colorMode.preference = "system";
    },
  },
  {
    label: "浅色",
    icon: "i-lucide-sun",
    type: "checkbox",
    checked: colorMode.preference === "light",
    onSelect: (event) => {
      event.preventDefault();
      colorMode.preference = "light";
    },
  },
  {
    label: "深色",
    icon: "i-lucide-moon",
    type: "checkbox",
    checked: colorMode.preference === "dark",
    onSelect: (event) => {
      event.preventDefault();
      colorMode.preference = "dark";
    },
  },
]);

const userDropdownItems = computed(() => [
  [
    {
      type: "label",
      label: userStore.name,
      avatar: { src: userStore.avatar },
    },
  ],
  [
    {
      label: "个人中心",
      icon: "i-lucide-user",
      to: "/user/profile",
    },

  ],
  ...(settingsStore.showSettings ? [[
    { label: "主题", icon: "i-lucide-palette", children: themeItems.value },
  ]] : []),
  [
    {
      label: "刷新页面权限",
      icon: "i-lucide-refresh-cw",
      onSelect: () => refreshPermissions(),
    },
    {
      label: "外观",
      icon: "i-lucide-sun-moon",
      children: appearanceItems.value,
    },
  ],
  [{ label: "退出登录", icon: "i-lucide-log-out", onSelect: () => logout() }],
]);

const refreshingPermissions = ref(false);

async function refreshPermissions() {
  if (refreshingPermissions.value) return;
  refreshingPermissions.value = true;
  try {
    await userStore.refreshPermissions();
    const currentStaticRoute = findStaticRoute(route.path);
    if (currentStaticRoute && !canAccessStaticRoute(userStore, currentStaticRoute)) {
      toast.add({ title: "当前页面权限已被收回", color: "warning" });
      await router.replace("/401?noGoBack=1");
      return;
    }
    toast.add({ title: "页面权限已刷新", color: "success" });
  } catch (error) {
    console.error("刷新页面权限失败:", error);
    toast.add({ title: "刷新页面权限失败，请稍后重试", color: "error" });
  } finally {
    refreshingPermissions.value = false;
  }
}

function logout() {
  useModalConfirm()
    .confirm("确定注销并退出系统吗？")
    .then(() => {
      const wasDemo = userStore.demo === true;
      userStore.logOut().then(() => {
        const homeTarget = import.meta.env.VITE_APP_ROUTER_MODE === "hash" ? "/#/" : "/";
        const demoTarget = import.meta.env.VITE_APP_ROUTER_MODE === "hash" ? "/#/login?demo=1" : "/login?demo=1";
        location.href = wasDemo ? demoTarget : homeTarget;
      });
    })
    .catch(() => {});
}

// ── Device detection ──

const { width } = useWindowSize();
// Keep device mode aligned with Nuxt UI's `lg` dashboard-sidebar breakpoint.
const WIDTH = 1024;

onMounted(() => {
  watchEffect(() => {
    if (width.value <= 0 || width.value === Infinity) return;
    const next = width.value - 1 < WIDTH ? "mobile" : "desktop";
    appStore.toggleDevice(next);
    if (next === "mobile") {
      isOpen.value = false;
    }
  });
});

</script>

<style scoped>
:deep(aside),
:deep(aside > div) {
  overflow: visible !important;
}
</style>
