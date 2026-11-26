<template>
  <!--
    工作台首页（2026-09-21 依据 developer.apple.com/design 的 HIG 重做）

    HIG → 落地映射：
    · layout「Order content by relative importance / Align elements / Group related items /
      Differentiate controls from content」→ 重要度自上而下：快捷入口 → 功能目录 → 通知公告；
      目录用**一个容器 + 发丝分隔线**分组，不再给每个分组各套一张卡（分组靠分隔线，不靠多一层容器）。
    · layout「Keep functionality the same as size classes change / consistent, predictable
      positions」+ principles「Familiarity / Preserve a person's context」→ 目录**永远全量、永远按
      侧栏菜单顺序**，不随个人使用记录变形；只有「常用功能」一块是个人化的。
    · materials「Don't use Liquid Glass in the content layer」+ color「Avoid relying solely on
      color / use color sparingly / limited palette」→ 内容卡一律实底；全页只用主色一个强调色，
      图标默认中性、悬停才上色。
    · typography「Conveying hierarchy / Support Dynamic Type」+ accessibility「Use recommended
      defaults for custom type sizes / Strive to meet color contrast minimum standards」→ 层级靠
      字号+字重；正文 12px 起、不写 px 字号（rem 才能跟随用户放大）；对比度实测见
      app/__tests__/home-page-compile.spec.js 的守卫注释。
    · accessibility「Offer sufficiently sized controls」「Convey information with more than color
      alone」「Increase Contrast」→ 触控目标 ≥44px、图标 aria-hidden、文字承载语义、
      支持 prefers-contrast: more。
    · motion「Aim for brevity and precision / Let people cancel motion / avoid sustained
      oscillation」→ 入场 320ms 无过冲、按下即时反馈、骨架屏静态（不做脉冲循环）。
  -->
  <div class="home-page absolute inset-0 overflow-y-auto bg-muted px-4 py-6 transition-colors duration-300 dark:bg-[var(--app-bg)] sm:px-6 lg:px-8">

    <!-- 标题区：不进内容卡层；品牌名已在壳层，这里展示用户问候与无框排版时钟 -->
    <header class="home-reveal mb-6 flex flex-wrap items-center justify-between gap-4 sm:mb-8">
      <div class="flex min-w-0 flex-1 items-center gap-3.5">
        <UAvatar
          :src="userStore.avatar || undefined"
          :alt="displayName"
          size="lg"
          class="shrink-0 ring-1 ring-default"
        />
        <div class="min-w-0 flex-1">
          <h1 class="truncate text-xl font-semibold text-highlighted sm:text-2xl">
            {{ greeting }}，{{ displayName }}
          </h1>
          <p class="mt-0.5 truncate text-xs text-muted">
            {{ workspaceSummary }}
          </p>
        </div>
      </div>

      <!-- 手机：时间区整块换行左对齐，桌面端右对齐，无框纯排版 -->
      <div class="basis-full shrink-0 text-left sm:basis-auto sm:text-right">
        <div class="leading-none tabular-nums">
          <strong class="text-2xl font-semibold tracking-tight text-highlighted">{{ clockMainLabel }}</strong><span class="text-base font-medium text-muted">{{ clockSecondLabel }}</span>
        </div>
        <p class="mt-1 text-xs tabular-nums text-muted">
          {{ todayLabel }}
        </p>
      </div>
    </header>

    <div class="grid grid-cols-12 items-start gap-6">

      <div class="col-span-12 flex flex-col gap-6 xl:col-span-9">

        <!-- 快捷入口：唯一的个人化区块；没有使用记录时整块不出现，目录本身不受影响 -->
        <section v-if="pinnedEntries.length" class="home-reveal" aria-labelledby="home-pinned-title">
          <h2 id="home-pinned-title" class="mb-3 flex items-center gap-2 text-sm font-semibold text-highlighted">
            <UIcon name="i-lucide-bolt" class="size-4 text-primary-600 dark:text-primary-400" aria-hidden="true" />
            常用功能
          </h2>

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <router-link
              v-for="item in pinnedEntries"
              :key="item.to"
              :to="item.to"
              class="home-card group flex min-h-11 items-center gap-3 rounded-2xl border border-default bg-default p-4 hover:border-primary-300 hover:bg-elevated dark:hover:border-primary-700"
            >
              <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-600 transition-transform duration-200 ease-out group-hover:scale-105 group-active:scale-95 dark:bg-primary-950/40 dark:text-primary-300" aria-hidden="true">
                <UIcon :name="item.icon || 'i-lucide-component'" class="size-5" />
              </span>
              <span class="min-w-0 flex-1">
                <strong class="block truncate text-sm font-semibold text-highlighted">{{ item.title }}</strong>
                <small class="mt-0.5 block truncate text-xs text-muted">{{ item.categoryTitle }}</small>
              </span>
              <UIcon
                name="i-lucide-arrow-up-right"
                class="home-card-arrow size-4 shrink-0 text-muted opacity-0 transition-all duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary-600 group-hover:opacity-100 group-focus-visible:opacity-100 dark:group-hover:text-primary-400"
                aria-hidden="true"
              />
            </router-link>
          </div>
        </section>

        <!-- 功能目录：全量 + 按菜单顺序（位置可预测），一个容器内用发丝分隔线分组 -->
        <section class="home-reveal" style="--reveal-delay: 60ms" aria-labelledby="home-catalog-title">
          <div class="mb-3 flex items-center justify-between gap-2">
            <h2 id="home-catalog-title" class="flex items-center gap-2 text-sm font-semibold text-highlighted">
              <UIcon name="i-lucide-layout-grid" class="size-4 text-primary-600 dark:text-primary-400" aria-hidden="true" />
              全部功能
            </h2>
            <span v-if="menuCategories.length" class="text-xs tabular-nums text-muted">
              共 {{ totalMenuCount }} 项
            </span>
          </div>

          <!-- 分类快速跳转锚点条：可见分类 >= 4 个时显示，不隐藏、不重排目录 -->
          <nav
            v-if="menuCategories.length >= 4"
            aria-label="功能分类快速跳转"
            class="home-anchor-bar mb-3 flex items-center gap-2 overflow-x-auto pb-1"
          >
            <button
              v-for="category in menuCategories"
              :key="`anchor-${category.key}`"
              type="button"
              class="home-card inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-default bg-default px-3.5 py-1.5 text-xs font-medium text-default hover:border-primary-300 hover:bg-elevated hover:text-primary-600 dark:hover:border-primary-700 dark:hover:text-primary-400"
              @click="scrollToCategory(category.key)"
            >
              <UIcon :name="category.icon" class="size-3.5 shrink-0 text-muted" aria-hidden="true" />
              <span>{{ category.title }}</span>
              <span class="tabular-nums text-muted">{{ category.items.length }}</span>
            </button>
          </nav>

          <div v-if="menuCategories.length" class="divide-y divide-default overflow-hidden rounded-2xl border border-default bg-default">
            <div
              v-for="category in menuCategories"
              :id="categoryAnchorId(category.key)"
              :key="category.key"
              class="scroll-mt-4 p-4 sm:p-6"
            >
              <div class="mb-3.5 flex items-center gap-3">
                <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-elevated text-primary-600 dark:text-primary-400" aria-hidden="true">
                  <UIcon :name="category.icon" class="size-4.5" />
                </span>
                <h3 class="min-w-0 flex-1 truncate text-sm font-semibold text-highlighted">{{ category.title }}</h3>
                <span class="shrink-0 rounded-full bg-elevated px-2.5 py-0.5 text-xs font-medium tabular-nums text-muted">
                  {{ category.items.length }} 个功能
                </span>
              </div>

              <!-- -mx-2.5：条目内边距挂到容器内边距外，条目图标与分类图标左对齐 -->
              <ul class="-mx-2.5 grid grid-cols-2 gap-1 md:grid-cols-3 sm:gap-1.5 xl:grid-cols-4">
                <li v-for="item in category.items" :key="item.to">
                  <router-link
                    :to="item.to"
                    class="home-card group flex min-h-11 items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-elevated active:bg-accented"
                  >
                    <UIcon
                      :name="item.icon || 'i-lucide-component'"
                      class="size-4.5 shrink-0 text-muted transition-colors duration-150 group-hover:text-primary-600 dark:group-hover:text-primary-400"
                      aria-hidden="true"
                    />
                    <span class="min-w-0 flex-1 truncate text-sm font-medium text-default transition-colors duration-150 group-hover:text-highlighted">{{ item.title }}</span>
                    <UIcon
                      name="i-lucide-chevron-right"
                      class="size-3.5 shrink-0 text-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
                      aria-hidden="true"
                    />
                  </router-link>
                </li>
              </ul>
            </div>
          </div>

          <div
            v-else
            class="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-default bg-default p-12 text-center"
          >
            <UIcon name="i-lucide-package-open" class="size-8 text-muted" aria-hidden="true" />
            <p class="text-sm text-muted">暂无可访问的功能</p>
          </div>
        </section>

      </div>

      <!-- 通知公告（xl 吸顶；卡片实底，不做半透明） -->
      <section class="home-reveal col-span-12 xl:sticky xl:top-6 xl:col-span-3" style="--reveal-delay: 120ms" aria-labelledby="home-notice-title">
        <div class="rounded-2xl border border-default bg-default p-4">
          <header class="mb-2 flex items-center gap-2 border-b border-default pb-3">
            <UIcon name="i-lucide-megaphone" class="size-4 shrink-0 text-primary-600 dark:text-primary-400" aria-hidden="true" />
            <h2 id="home-notice-title" class="min-w-0 flex-1 truncate text-sm font-semibold text-highlighted">通知公告</h2>
            <router-link to="/system/notice" class="home-card shrink-0 rounded px-1 text-xs font-medium text-primary-600 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-primary-400">更多</router-link>
          </header>

          <!-- 加载中：静态占位（不脉冲），另给屏幕阅读器一句真话 -->
          <div v-if="!noticesLoaded" class="space-y-4 py-2" aria-hidden="true">
            <div v-for="placeholder in 3" :key="placeholder" class="space-y-1.5">
              <div class="h-3 w-4/5 rounded bg-elevated" />
              <div class="h-2.5 w-1/3 rounded bg-elevated" />
            </div>
          </div>
          <p v-if="!noticesLoaded" class="sr-only">正在加载通知公告</p>

          <!-- -mx-2：公告条目的内边距挂到卡片内边距外，条目文字与卡头「通知公告」左对齐 -->
          <ul v-else-if="homeNotices.length" class="-mx-2 space-y-1">
            <li v-for="item in homeNotices" :key="item.noticeId">
              <button
                type="button"
                class="home-card min-h-11 w-full rounded-lg px-2 py-2.5 text-left hover:bg-elevated active:bg-accented"
                @click="openHomeNotice(item)"
              >
                <span class="line-clamp-2 text-pretty text-sm font-medium text-highlighted">{{ item.noticeTitle }}</span>
                <span class="mt-1.5 flex items-center gap-2 text-xs tabular-nums text-muted">
                  <span
                    class="inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-xs font-medium"
                    :class="noticeBadgeClass(item.noticeType)"
                  >
                    {{ noticeTypeLabel(item.noticeType) }}
                  </span>
                  <span>{{ formatHomeNoticeDate(item.createTime) }}</span>
                </span>
              </button>
            </li>
          </ul>

          <p v-else class="py-2 text-sm text-muted">暂无公告</p>
        </div>
      </section>

    </div>

    <UModal v-model:open="homeNoticeOpen" :title="activeHomeNotice?.noticeTitle || '公告详情'" :ui="{ content: 'max-w-2xl' }">
      <template #body>
        <div v-if="noticeDetailLoading" class="space-y-3 py-2" aria-hidden="true">
          <div class="h-4 w-1/3 rounded bg-elevated" />
          <div class="h-3.5 w-full rounded bg-elevated" />
          <div class="h-3.5 w-11/12 rounded bg-elevated" />
          <div class="h-3.5 w-4/5 rounded bg-elevated" />
        </div>
        <p v-if="noticeDetailLoading" class="sr-only">正在加载公告详情</p>

        <div v-else-if="noticeDetailError" role="alert" class="flex flex-col items-start gap-3 rounded-xl border border-default bg-elevated p-4">
          <p class="flex items-center gap-2 text-sm text-highlighted">
            <UIcon name="i-lucide-circle-alert" class="size-4 shrink-0 text-primary-600 dark:text-primary-400" aria-hidden="true" />
            <span>{{ noticeDetailError }}</span>
          </p>
          <UButton type="button" color="neutral" variant="outline" size="sm" @click="retryActiveNotice">
            重新加载
          </UButton>
        </div>

        <template v-else>
          <div v-if="activeHomeNotice" class="mb-4 flex items-center gap-2 border-b border-default pb-3 text-xs tabular-nums text-muted">
            <span
              class="inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-xs font-medium"
              :class="noticeBadgeClass(activeHomeNotice.noticeType)"
            >
              {{ noticeTypeLabel(activeHomeNotice.noticeType) }}
            </span>
            <span>{{ formatHomeNoticeDate(activeHomeNotice.createTime) }}</span>
          </div>
          <!-- 公告内容为富文本 HTML -->
          <div
            v-if="activeHomeNotice?.noticeContent"
            class="home-notice-prose break-words text-sm leading-relaxed text-default"
            v-html="activeHomeNotice.noticeContent"
          />
          <p v-else class="text-sm text-muted">暂无正文内容</p>
        </template>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" @click="homeNoticeOpen = false">关 闭</UButton>
      </template>
    </UModal>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import usePermissionStore from "@/store/modules/permission";
import useUserStore from "@/store/modules/user";
import {
  filterUsedItems,
  sortItemsByUsage,
  usageVersion,
} from "@/utils/homeUsage";
import { getNormalPath } from "@/utils/helpers";
import { isExternal } from "@/utils/validate";
import { listNotice, getNotice } from "@/api/system/notice";

const userStore = useUserStore();
const permissionStore = usePermissionStore();
const now = ref(new Date());
let clockTimer;

// 首页通知公告栏（只读正常状态前 5 条）
const homeNotices = ref([]);
const noticesLoaded = ref(false);
const homeNoticeOpen = ref(false);
const activeHomeNotice = ref(null);
const activeNoticeId = ref(null);
const noticeDetailLoading = ref(false);
const noticeDetailError = ref("");
let noticeDetailRequestId = 0;

const HOME_NOTICE_TYPE_LABEL = { 1: "通知", 2: "公告" };
function noticeTypeLabel(value) {
  return HOME_NOTICE_TYPE_LABEL[String(value)] || "公告";
}
function noticeBadgeClass(value) {
  return String(value) === "1"
    ? "bg-elevated text-default"
    : "bg-primary-50 text-primary-700 dark:bg-primary-950/50 dark:text-primary-300";
}
function formatHomeNoticeDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function loadNoticeDetail(noticeId) {
  const requestId = ++noticeDetailRequestId;
  noticeDetailLoading.value = true;
  noticeDetailError.value = "";
  getNotice(noticeId).then((res) => {
    if (requestId !== noticeDetailRequestId) return;
    activeHomeNotice.value = res.data || activeHomeNotice.value;
  }).catch(() => {
    if (requestId !== noticeDetailRequestId) return;
    noticeDetailError.value = "公告详情加载失败，请检查网络后重试";
  }).finally(() => {
    if (requestId === noticeDetailRequestId) {
      noticeDetailLoading.value = false;
    }
  });
}
function openHomeNotice(noticeOrId) {
  const isObj = noticeOrId && typeof noticeOrId === "object";
  const noticeId = isObj ? noticeOrId.noticeId : noticeOrId;
  activeNoticeId.value = noticeId;
  activeHomeNotice.value = isObj ? { ...noticeOrId } : null;
  homeNoticeOpen.value = true;
  loadNoticeDetail(noticeId);
}
function retryActiveNotice() {
  if (activeNoticeId.value != null) {
    loadNoticeDetail(activeNoticeId.value);
  }
}

// 首页不展示系统管理与系统监控（与侧栏口径一致的取舍）
const EXCLUDED_CATEGORY_TITLES = new Set(["系统管理", "系统监控"]);

function resolveMenuIcon(name) {
  if (!name || name === "#") return "i-lucide-menu";
  if (name.startsWith("i-")) return name;

  const kebab = name
    .replace(/([a-z])([A-Z])/g, "-")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "-")
    .toLowerCase();
  return "i-lucide-" + kebab;
}

function joinRoutePath(basePath, routePath = "") {
  if (isExternal(routePath)) {
    return routePath;
  }
  const parent = getNormalPath(basePath || "");
  const child = getNormalPath(routePath);
  if (!child) {
    return parent;
  }
  if (!parent || parent === "/") {
    return child;
  }
  if (child.startsWith("/")) {
    return child;
  }
  return getNormalPath(`${parent}/${child}`);
}

function isHomeEntry(route, basePath = "") {
  const path = joinRoutePath(basePath, route.path);
  const title = route.meta?.title || "";
  return title === "首页" || path === "/" || path === "/index" || path.endsWith("/index");
}

function collectLeafRoutes(route, basePath = "") {
  if (!route || route.hidden || isHomeEntry(route, basePath)) {
    return [];
  }

  const currentPath = joinRoutePath(basePath, route.path);
  const children = (route.children || []).filter(
    (child) => !child.hidden && !isHomeEntry(child, currentPath),
  );

  if (!children.length) {
    if (!route.meta?.title || isExternal(currentPath)) {
      return [];
    }
    return [
      {
        title: route.meta.title,
        to: currentPath,
        icon: resolveMenuIcon(route.meta.icon),
      },
    ];
  }

  return children.flatMap((child) => collectLeafRoutes(child, currentPath));
}

// 目录按侧栏顺序 / 菜单顺序生成，不受使用记录影响：同一账号每次进来位置都一样
function buildCategoriesFromSidebar(routes = []) {
  const categories = [];

  routes.forEach((route) => {
    if (!route || route.hidden || isHomeEntry(route)) {
      return;
    }

    const topPath = joinRoutePath("", route.path);
    const seen = new Set();
    const items = collectLeafRoutes(route).filter((item) => {
      if (seen.has(item.to)) {
        return false;
      }
      seen.add(item.to);
      return true;
    });

    if (!items.length) {
      return;
    }

    const title = route.meta?.title || topPath;
    if (EXCLUDED_CATEGORY_TITLES.has(title)) {
      return;
    }

    categories.push({
      key: topPath || title,
      title,
      icon: resolveMenuIcon(route.meta?.icon),
      items,
    });
  });

  return categories;
}

const menuCategories = computed(() =>
  buildCategoriesFromSidebar(permissionStore.sidebarRouters || []),
);

const totalMenuCount = computed(() =>
  menuCategories.value.reduce((sum, category) => sum + category.items.length, 0),
);

const workspaceSummary = computed(() =>
  totalMenuCount.value > 0
    ? `当前可用 ${menuCategories.value.length} 个模块 · ${totalMenuCount.value} 项功能`
    : "工作台已就绪",
);

function categoryAnchorId(key) {
  return `home-cat-${encodeURIComponent(String(key))}`;
}

function scrollToCategory(key) {
  const el = document.getElementById(categoryAnchorId(key));
  if (!el) return;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
}

const displayName = computed(() => userStore.name || "同事");

const greeting = computed(() => {
  const hour = now.value.getHours();
  if (hour < 6) return "夜深了";
  if (hour < 11) return "早上好";
  if (hour < 13) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
});

const todayLabel = computed(() => {
  const datePart = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(now.value);
  const weekdayPart = new Intl.DateTimeFormat("zh-CN", {
    weekday: "long",
  }).format(now.value);
  return `${datePart} · ${weekdayPart}`;
});

const clockMainLabel = computed(() => {
  const h = String(now.value.getHours()).padStart(2, "0");
  const m = String(now.value.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
});

const clockSecondLabel = computed(() => {
  const s = String(now.value.getSeconds()).padStart(2, "0");
  return `:${s}`;
});

// 访问足迹（localStorage 里的 tk_home_usage_<id>）只用来排「常用功能」，不参与目录结构
function getUsedMenuItems(userId) {
  return menuCategories.value.flatMap((category) =>
    filterUsedItems(userId, category.items).map((item) => ({
      ...item,
      categoryTitle: category.title,
    })),
  );
}

const pinnedEntries = computed(() => {
  usageVersion.value;
  return sortItemsByUsage(userStore.id, getUsedMenuItems(userStore.id)).slice(0, 4);
});

onMounted(() => {
  clockTimer = window.setInterval(() => {
    now.value = new Date();
  }, 1000);
  listNotice({ pageNum: 1, pageSize: 5, status: "0" }).then((res) => {
    homeNotices.value = res.rows || [];
  }).catch(() => {
    homeNotices.value = [];
  }).finally(() => {
    noticesLoaded.value = true;
  });
});

onBeforeUnmount(() => {
  if (clockTimer) {
    window.clearInterval(clockTimer);
  }
});
</script>

<style scoped>
/* 滚动容器：细滚动条；触屏不要系统高亮块，按下反馈交给卡片自己的状态 */
.home-page {
  scrollbar-width: thin;
  -webkit-tap-highlight-color: transparent;
}

.home-anchor-bar {
  scrollbar-width: none;
}

.home-anchor-bar::-webkit-scrollbar {
  display: none;
}

/* ── 交互反馈（HIG motion：即时、克制、只动合成器友好属性）──────────
   悬停 150ms、按下 100ms；只过渡 transform / 颜色 / 阴影，不碰尺寸属性（避免重排）。 */
.home-card {
  transition-property: transform, border-color, background-color, box-shadow, color;
  transition-duration: 150ms;
  transition-timing-function: cubic-bezier(0.32, 0.72, 0, 1);
}

.home-card:active {
  transform: scale(0.985);
  transition-duration: 100ms;
}

/* 键盘可达性：卡片是 router-link / button，浏览器默认 outline 落在圆角上很难看 */
.home-card:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--ui-primary);
}

/* 公告详情富文本规范排版与图片防溢出 */
.home-notice-prose :deep(p) {
  margin: 0 0 0.75rem;
}

.home-notice-prose :deep(p:last-child) {
  margin-bottom: 0;
}

.home-notice-prose :deep(ul),
.home-notice-prose :deep(ol) {
  margin: 0 0 0.75rem;
  padding-left: 1.25rem;
}

.home-notice-prose :deep(img) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0.75rem 0;
  border-radius: 0.5rem;
}

.home-notice-prose :deep(table) {
  display: block;
  width: 100%;
  overflow-x: auto;
  border-collapse: collapse;
  margin: 0.75rem 0;
}

/* ── 入场：轻微上浮 + 淡入，无过冲（进入不是手势动量，不该弹）── */
@keyframes home-reveal-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .home-reveal {
    animation: home-reveal-in 320ms cubic-bezier(0.32, 0.72, 0, 1) both;
    animation-delay: var(--reveal-delay, 0ms);
  }
}

/* ── 减弱动态：保留状态变化（颜色/透明度），去掉位移与循环 ── */
@media (prefers-reduced-motion: reduce) {
  .home-card,
  .home-card:active,
  .home-card-arrow {
    transform: none;
  }

  .home-reveal {
    animation: none;
  }
}

/* ── HIG accessibility「Increase Contrast」：系统打开增强对比时，把本页的语义
   token 整体提到更高对比档（边框 / 正文 / 次要文字 / 填充一起提），不必给每个
   元素再写一套颜色。色值取自实测对比度：neutral-400 边框 vs 白底 1.9、正文
   neutral-900 vs 白底 17.7，都过了 WCAG。 ── */
@media (prefers-contrast: more) {
  .home-page {
    --ui-border: var(--ui-color-neutral-400);
    --ui-border-muted: var(--ui-color-neutral-400);
    --ui-border-accented: var(--ui-color-neutral-500);
    --ui-text: var(--ui-color-neutral-900);
    --ui-text-muted: var(--ui-color-neutral-700);
    --ui-text-dimmed: var(--ui-color-neutral-600);
    --ui-bg-muted: var(--ui-color-neutral-200);
    --ui-bg-elevated: var(--ui-color-neutral-200);
  }
}

/* 说明：本页刻意不用半透明（HIG materials：材质属于控件/导航层，不进内容层）——
   实测半透明会把卡片内部洗成 #FBFCFE（兄弟卡实底 #FFFFFF），一眼看出两块底色不一样。 */
</style>
