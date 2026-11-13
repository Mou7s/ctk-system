import { ref } from "vue";
import { getNormalPath } from "@/utils/helpers";

const STORAGE_PREFIX = "tk_home_usage_";

const EXCLUDED_PATHS = new Set([
  "/login",
  "/register",
  "/redirect",
  "/",
  "/index",
  "/401",
  "/404",
  "/user/profile",
]);

export const usageVersion = ref(0);

export function shouldRecordRouteVisit(path, meta = {}) {
  const normalized = getNormalPath(path || "");
  if (!normalized || !meta?.title || meta.title === "首页") {
    return false;
  }
  if (EXCLUDED_PATHS.has(normalized)) {
    return false;
  }
  return true;
}

function getStorageKey(userId) {
  return `${STORAGE_PREFIX}${userId || "anonymous"}`;
}

export function getUsageMap(userId) {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function getUsageEntry(userId, path) {
  const normalized = getNormalPath(path || "");
  return getUsageMap(userId)[normalized] || null;
}

export function getUsageCount(userId, path) {
  return getUsageEntry(userId, path)?.count || 0;
}

export function recordRouteVisit(userId, path, title) {
  if (!userId) {
    return;
  }

  const normalized = getNormalPath(path || "");
  if (!normalized) {
    return;
  }

  const map = getUsageMap(userId);
  const previous = map[normalized] || { count: 0, title: "" };

  map[normalized] = {
    count: previous.count + 1,
    title: title || previous.title,
    lastAt: Date.now(),
  };

  try {
    localStorage.setItem(getStorageKey(userId), JSON.stringify(map));
    usageVersion.value += 1;
  } catch {
    // Ignore storage quota or privacy mode errors.
  }
}

export function filterUsedItems(userId, items = []) {
  return items.filter((item) => getUsageCount(userId, item.to) > 0);
}

export function sortItemsByUsage(userId, items = []) {
  const map = getUsageMap(userId);

  return [...items].sort((left, right) => {
    const leftPath = getNormalPath(left.to);
    const rightPath = getNormalPath(right.to);
    const leftCount = map[leftPath]?.count || 0;
    const rightCount = map[rightPath]?.count || 0;

    if (rightCount !== leftCount) {
      return rightCount - leftCount;
    }

    const leftLastAt = map[leftPath]?.lastAt || 0;
    const rightLastAt = map[rightPath]?.lastAt || 0;
    if (rightLastAt !== leftLastAt) {
      return rightLastAt - leftLastAt;
    }

    return left.title.localeCompare(right.title, "zh-CN");
  });
}
