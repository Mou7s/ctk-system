<template>
  <div class="tags-view-container h-[31px] w-full border-b border-(--ui-border) bg-(--ui-bg) transition-colors duration-300">
    <scroll-pane ref="scrollPaneRef" class="tags-view-wrapper" @scroll="handleScroll">
      <router-link
        v-for="tag in visitedViews"
        :key="tag.path"
        :data-path="tag.path"
        :class="['tags-view-item', { active: isActive(tag) }]"
        :to="{ path: tag.path, query: tag.query, fullPath: tag.fullPath }"
        @click.middle="!isAffix(tag) ? closeSelectedTag(tag) : ''"
        @contextmenu.prevent="openMenu(tag, $event)"
      >
        <span class="tag-label">{{ tag.title }}</span>
        <UIcon
          v-if="!isAffix(tag)"
          name="i-lucide-x"
          class="tag-close"
          @click.prevent.stop="closeSelectedTag(tag)"
        />
      </router-link>
    </scroll-pane>

    <!-- Context menu -->
    <ul
      v-show="visible"
      :style="{ left: left + 'px', top: top + 'px' }"
      class="contextmenu fixed z-[3000] m-0 list-none rounded-lg border border-(--ui-border) bg-(--ui-bg) p-1 text-sm text-(--ui-text) shadow-lg"
    >
      <li class="contextmenu-item" @click="refreshSelectedTag(selectedTag)">
        <UIcon name="i-lucide-refresh-cw" class="size-3.5 shrink-0" />
        <span>刷新页面</span>
      </li>
      <li v-if="!isAffix(selectedTag)" class="contextmenu-item" @click="closeSelectedTag(selectedTag)">
        <UIcon name="i-lucide-x" class="size-3.5 shrink-0" />
        <span>关闭当前</span>
      </li>
      <li class="contextmenu-item" @click="closeOthersTags">
        <UIcon name="i-lucide-x-circle" class="size-3.5 shrink-0" />
        <span>关闭其他</span>
      </li>
      <li v-if="!isFirstView()" class="contextmenu-item" @click="closeLeftTags">
        <UIcon name="i-lucide-arrow-left" class="size-3.5 shrink-0" />
        <span>关闭左侧</span>
      </li>
      <li v-if="!isLastView()" class="contextmenu-item" @click="closeRightTags">
        <UIcon name="i-lucide-arrow-right" class="size-3.5 shrink-0" />
        <span>关闭右侧</span>
      </li>
      <li class="contextmenu-item" @click="closeAllTags(selectedTag)">
        <UIcon name="i-lucide-x-circle" class="size-3.5 shrink-0" />
        <span>全部关闭</span>
      </li>
    </ul>
  </div>
</template>

<script setup>
import ScrollPane from "./ScrollPane";
import { getNormalPath } from "@/utils/helpers";
import useTagsViewStore from "@/store/modules/tagsView";
import usePermissionStore from "@/store/modules/permission";

const visible = ref(false);
const top = ref(0);
const left = ref(0);
const selectedTag = ref({});
const affixTags = ref([]);
const scrollPaneRef = ref(null);

const { proxy } = getCurrentInstance();
const route = useRoute();
const router = useRouter();

const visitedViews = computed(() => useTagsViewStore().visitedViews);
const routes = computed(() => usePermissionStore().routes);

watch(route, () => {
  addTags();
  moveToCurrentTag();
});

watch(visible, (value) => {
  if (value) {
    document.body.addEventListener("click", closeMenu);
  } else {
    document.body.removeEventListener("click", closeMenu);
  }
});

onMounted(() => {
  initTags();
  addTags();
});

function isActive(r) {
  return r.path === route.path;
}

function isAffix(tag) {
  return tag.meta && tag.meta.affix;
}

function isFirstView() {
  try {
    return selectedTag.value.fullPath === "/index" || selectedTag.value.fullPath === visitedViews.value[1].fullPath;
  } catch (err) {
    return false;
  }
}

function isLastView() {
  try {
    return selectedTag.value.fullPath === visitedViews.value[visitedViews.value.length - 1].fullPath;
  } catch (err) {
    return false;
  }
}

function filterAffixTags(routes, basePath = "") {
  let tags = [];
  routes.forEach((route) => {
    if (route.meta && route.meta.affix) {
      const tagPath = getNormalPath(basePath + "/" + route.path);
      tags.push({
        fullPath: tagPath,
        path: tagPath,
        name: route.name,
        meta: { ...route.meta },
      });
    }
    if (route.children) {
      const tempTags = filterAffixTags(route.children, route.path);
      if (tempTags.length >= 1) {
        tags = [...tags, ...tempTags];
      }
    }
  });
  return tags;
}

function initTags() {
  const res = filterAffixTags(routes.value);
  affixTags.value = res;
  for (const tag of res) {
    if (tag.name) {
      useTagsViewStore().addVisitedView(tag);
    }
  }
}

function addTags() {
  const { name } = route;
  if (name) {
    useTagsViewStore().addView(route);
    if (route.meta.link) {
      useTagsViewStore().addIframeView(route);
    }
  }
  return false;
}

function moveToCurrentTag() {
  nextTick(() => {
    for (const r of visitedViews.value) {
      if (r.path === route.path) {
        scrollPaneRef.value.moveToTarget(r);
        if (r.fullPath !== route.fullPath) {
          useTagsViewStore().updateVisitedView(route);
        }
      }
    }
  });
}

function refreshSelectedTag(view) {
  proxy.$tab.refreshPage(view);
  if (route.meta.link) {
    useTagsViewStore().delIframeView(route);
  }
}

function closeSelectedTag(view) {
  proxy.$tab.closePage(view).then(({ visitedViews }) => {
    if (isActive(view)) {
      toLastView(visitedViews, view);
    }
  });
}

function closeRightTags() {
  proxy.$tab.closeRightPage(selectedTag.value).then((visitedViews) => {
    if (!visitedViews.find((i) => i.fullPath === route.fullPath)) {
      toLastView(visitedViews);
    }
  });
}

function closeLeftTags() {
  proxy.$tab.closeLeftPage(selectedTag.value).then((visitedViews) => {
    if (!visitedViews.find((i) => i.fullPath === route.fullPath)) {
      toLastView(visitedViews);
    }
  });
}

function closeOthersTags() {
  router.push(selectedTag.value).catch(() => {});
  proxy.$tab.closeOtherPage(selectedTag.value).then(() => {
    moveToCurrentTag();
  });
}

function closeAllTags(view) {
  proxy.$tab.closeAllPage().then(({ visitedViews }) => {
    if (affixTags.value.some((tag) => tag.path === route.path)) {
      return;
    }
    toLastView(visitedViews, view);
  });
}

function toLastView(visitedViews, view) {
  const latestView = visitedViews.slice(-1)[0];
  if (latestView) {
    router.push(latestView.fullPath);
  } else {
    if (view.name === "Dashboard") {
      router.replace({ path: "/redirect" + view.fullPath });
    } else {
      router.push("/");
    }
  }
}

function openMenu(tag, e) {
  const menuMinWidth = 105;
  const offsetLeft = proxy.$el.getBoundingClientRect().left;
  const offsetWidth = proxy.$el.offsetWidth;
  const maxLeft = offsetWidth - menuMinWidth;
  const l = e.clientX - offsetLeft + 15;

  if (l > maxLeft) {
    left.value = maxLeft;
  } else {
    left.value = l;
  }

  top.value = e.clientY;
  visible.value = true;
  selectedTag.value = tag;
}

function closeMenu() {
  visible.value = false;
}

function handleScroll() {
  closeMenu();
}
</script>

<style scoped>
.tags-view-wrapper {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 8px;
  height: 100%;
}

.tags-view-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  height: 22px;
  padding: 0 10px;
  font-size: 12px;
  border-radius: 6px;
  color: var(--ui-text-muted);
  white-space: nowrap;
  text-decoration: none;
  flex-shrink: 0;
  transition: all 0.15s ease;
  position: relative;
}

.tags-view-item:hover {
  background-color: var(--ui-bg-elevated);
  color: var(--ui-text);
}

.tags-view-item.active {
  background-color: color-mix(in srgb, var(--ui-primary) 12%, transparent);
  color: var(--ui-primary);
  font-weight: 500;
}

.tags-view-item .tag-label {
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}

.tags-view-item .tag-close {
  width: 14px;
  height: 14px;
  opacity: 0;
  transition: opacity 0.15s ease;
  border-radius: 9999px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.tags-view-item.active .tag-close,
.tags-view-item:hover .tag-close {
  opacity: 0.5;
}

.tags-view-item .tag-close:hover {
  opacity: 1;
  background-color: var(--ui-bg-elevated);
}

.tags-view-item:first-of-type {
  margin-left: 10px;
}

/* Context menu */
.contextmenu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 6px 12px;
  border-radius: 6px;
  transition: background-color 0.12s ease;
}

.contextmenu-item:hover {
  background-color: var(--ui-bg-elevated);
}
</style>
