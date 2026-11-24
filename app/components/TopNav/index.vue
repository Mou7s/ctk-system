<template>
  <UNavigationMenu
    :default-active="activeMenu"
    mode="horizontal"
    @select="handleSelect"
    :ellipsis="false"
  >
    <template v-for="(item, index) in topMenus">
      <UNavigationMenuItem :style="{'--theme': theme}" :index="item.path" :key="index" v-if="index < visibleNumber">
        <UIcon :name="resolveMenuIcon(item.meta.icon)"
          v-if="item.meta && item.meta.icon && item.meta.icon !== '#'"
          class="top-menu-icon" />
        {{ item.meta.title }}
      </UNavigationMenuItem>
    </template>

    <!-- 顶部菜单超出数量折叠 -->
    <UNavigationMenuItem :style="{'--theme': theme}" index="more" v-if="topMenus.length > visibleNumber">
      <template #title>更多菜单</template>
      <template v-for="(item, index) in topMenus">
        <UNavigationMenuItem
          :index="item.path"
          :key="index"
          v-if="index >= visibleNumber">
        <UIcon :name="resolveMenuIcon(item.meta.icon)"
          v-if="item.meta && item.meta.icon && item.meta.icon !== '#'"
          class="top-menu-icon" />
        {{ item.meta.title }}
        </UNavigationMenuItem>
      </template>
    </UNavigationMenuItem>
  </UNavigationMenu>
</template>

<script setup>
import { isHttp } from '@/utils/validate'
import useAppStore from '@/store/modules/app'
import useSettingsStore from '@/store/modules/settings'
import usePermissionStore from '@/store/modules/permission'

// 顶部栏初始数
const visibleNumber = ref(null);
// 当前激活菜单的 index
const currentIndex = ref(null);
// 隐藏侧边栏路由
const hideList = ['/', '/index', '/user/profile'];

const appStore = useAppStore()
const settingsStore = useSettingsStore()
const permissionStore = usePermissionStore()
const route = useRoute();
const router = useRouter();

const ICON_MAP = {
  // ?? Element Plus??????????? ??
  house: 'i-lucide-home',
  user: 'i-lucide-user',
  videoplay: 'i-lucide-video',

  // 系统内置菜单图标映射
  system: 'i-lucide-cog',
  monitor: 'i-lucide-monitor',
  tool: 'i-lucide-wrench',
  chart: 'i-lucide-bar-chart-3',
  guide: 'i-lucide-compass',
  dashboard: 'i-lucide-layout-dashboard',
  dict: 'i-lucide-book-open',
  post: 'i-lucide-mail',
  role: 'i-lucide-users',
  log: 'i-lucide-scroll-text',
  job: 'i-lucide-clock',
  gen: 'i-lucide-database',
  swagger: 'i-lucide-file-json',
  form: 'i-lucide-align-left',
  table: 'i-lucide-table',
  tree: 'i-lucide-tree-pine',
  build: 'i-lucide-hard-hat',
  cache: 'i-lucide-database-zap',
  server: 'i-lucide-server',
  online: 'i-lucide-wifi',
  logininfor: 'i-lucide-shield-alert',
  operlog: 'i-lucide-clipboard-list',
  druid: 'i-lucide-database',

  // 扩展图标映射
  management: 'i-lucide-briefcase',
  briefcase: 'i-lucide-briefcase',
  tools: 'i-lucide-wrench',
  editpen: 'i-lucide-pen-tool',
  databoard: 'i-lucide-layout-dashboard',
  postcard: 'i-lucide-contact',
  memo: 'i-lucide-notebook',
  timer: 'i-lucide-timer',
  box: 'i-lucide-box',
  chatlineround: 'i-lucide-message-square',
  userfilled: 'i-lucide-user',
  peoples: 'i-lucide-users',
  nested: 'i-lucide-git-branch',
  documentation: 'i-lucide-file-text',

  // ?? ????????permission store ??? ??
  production: 'i-lucide-factory',

  // ?? ????????tk_custom? ??
  exception: 'i-lucide-alert-octagon',
  lookScreen: 'i-lucide-monitor',
  kucun: 'i-lucide-package',
  kucun_warning: 'i-lucide-alert-triangle',
  pd: 'i-lucide-clipboard-check',
  pd_ck: 'i-lucide-clipboard-list',
  gdzc: 'i-lucide-building-2',
  gdzc_app: 'i-lucide-scan-qr-code',
  wip: 'i-lucide-git-branch',
  mo: 'i-lucide-notepad-text',
  suggest: 'i-lucide-message-square-plus',
  visit: 'i-lucide-users',
  wxuser: 'i-lucide-message-circle',
  msgtowx: 'i-lucide-send',
  pic: 'i-lucide-image',
  approve: 'i-lucide-check-circle',
  jukebox: 'i-lucide-music',
  chuku_xs: 'i-lucide-log-out',
  arReconciliation: 'i-lucide-hand-coins',
  customerOverdueAr: 'i-lucide-hand-coins',
  processOutputReport: 'i-lucide-file-chart-column',
  qaShipping: 'i-lucide-package-check',
  dummyPiece: 'i-lucide-copy-plus',
  scanAdd: 'i-lucide-scan-line',
  simpleAdd: 'i-lucide-plus-circle',
  tag: 'i-lucide-tags',
  talent_pool: 'i-lucide-brain',
  gxjl: 'i-lucide-history',
  kingdee_kucun: 'i-lucide-cloud',
  kingdeeMaintenance: 'i-lucide-terminal',
  executeSql: 'i-lucide-terminal',
  others: 'i-lucide-ellipsis',
  lucky: 'i-lucide-trophy',
};

function resolveMenuIcon(name) {
  if (!name || name === '#') return 'i-lucide-menu';
  if (name.startsWith('i-')) return name;
  const lower = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (ICON_MAP[lower]) return ICON_MAP[lower];

  const kebab = name
    .replace(/([a-z])([A-Z])/g, '-')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '-')
    .toLowerCase();
  return 'i-lucide-' + kebab;
}

// 主题颜色
const theme = computed(() => settingsStore.theme);
// 所有的路由信息
const routers = computed(() => permissionStore.topbarRouters);

// 顶部显示菜单
const topMenus = computed(() => {
  let topMenus = [];
  routers.value.map((menu) => {
    if (menu.hidden !== true) {
      // 兼容顶部栏一级菜单内部跳转
      if (menu.path === "/") {
          topMenus.push(menu.children[0]);
      } else {
          topMenus.push(menu);
      }
    }
  })
  return topMenus;
})

// 设置子路由
const childrenMenus = computed(() => {
  return routers.value.flatMap((router) => (router.children || []).map((child) => ({
    ...child,
    path: isHttp(child.path) || child.path?.startsWith('/')
      ? child.path
      : `${router.path}/${child.path}`.replace(/\/+/g, '/'),
    parentPath: router.path,
  })))
})

// 默认激活的菜单
const activeMenu = computed(() => {
  const path = route.path || '/';
  const active = topMenus.value.find((item) => {
    if (item.path === '/') return path === '/';
    if (item.path === '/index') return path === '/index';
    return childrenMenus.value.some((child) => child.parentPath === item.path && child.path === path);
  });
  if (active?.children) {
    appStore.toggleSideBarHide(false);
    activeRoutes(active.path);
  } else {
    appStore.toggleSideBarHide(true);
  }
  return active?.path || path;
})

function setVisibleNumber() {
  const width = document.body.getBoundingClientRect().width / 3;
  visibleNumber.value = parseInt(width / 85);
}

function handleSelect(key, keyPath) {
  currentIndex.value = key;
  const route = routers.value.find(item => item.path === key);
  if (isHttp(key)) {
    // http(s):// 路径新窗口打开
    window.open(key, "_blank");
  } else if (!route || !route.children) {
    // 没有子路由路径内部打开
    const routeMenu = childrenMenus.value.find(item => item.path === key);
    if (routeMenu && routeMenu.query) {
      let query = JSON.parse(routeMenu.query);
      router.push({ path: key, query: query });
    } else {
      router.push({ path: key });
    }
    appStore.toggleSideBarHide(true);
  } else {
    // 显示左侧联动菜单
    activeRoutes(key);
    appStore.toggleSideBarHide(false);
  }
}

function activeRoutes(key) {
  let routes = [];
  if (childrenMenus.value && childrenMenus.value.length > 0) {
    childrenMenus.value.map((item) => {
      if (key == item.parentPath || (key == "index" && "" == item.path)) {
        routes.push(item);
      }
    });
  }
  if(routes.length > 0) {
    permissionStore.setSidebarRouters(routes);
  } else {
    appStore.toggleSideBarHide(true);
  }
  return routes;
}

onMounted(() => {
  window.addEventListener('resize', setVisibleNumber)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', setVisibleNumber)
})

onMounted(() => {
  setVisibleNumber()
})
</script>

<style>
/* 图标右间距 */
.top-menu-icon {
  margin-right: 4px;
  vertical-align: middle;
}
</style>

