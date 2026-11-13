import { getCurrentInstance, onBeforeUnmount, onMounted } from 'vue';

const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_COOLDOWN_MS = 15_000;

/**
 * 列表自动静默刷新 / 焦点唤醒 composable
 *
 * @param {object} options
 * @param {() => Promise<void> | void} options.onRefresh 触发刷新的回调函数
 * @param {() => boolean} [options.enabled] 当前是否允许刷新（例如当前在列表Tab、无编辑弹窗打开）
 * @param {() => boolean} [options.pollWhen] 是否满足定时轮询条件（例如列表存在待审单据）
 * @param {number} [options.intervalMs=30000] 轮询间隔，毫秒
 * @param {number} [options.cooldownMs=15000] 聚焦唤醒冷却时间，毫秒
 * @param {boolean} [options.immediate=false] 是否在 start 时立即触发一次
 */
export function useTkAutoRefresh({
  onRefresh,
  enabled,
  pollWhen,
  intervalMs = DEFAULT_INTERVAL_MS,
  cooldownMs = DEFAULT_COOLDOWN_MS,
  immediate = false,
}) {
  let timer = null;
  let lastRefreshAt = 0;
  let running = false;

  async function trigger(force = false) {
    if (typeof onRefresh !== 'function') return;
    if (!force && enabled && !enabled()) return;
    lastRefreshAt = Date.now();
    try {
      await onRefresh();
    } catch {
      // 静默捕获，后台刷新不阻断交互
    }
  }

  function handleFocusOrVisibility() {
    if (!running) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (Date.now() - lastRefreshAt < cooldownMs) return;
    if (enabled && !enabled()) return;
    void trigger();
  }

  function handleInterval() {
    if (!running) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (enabled && !enabled()) return;
    if (pollWhen && !pollWhen()) return;
    if (Date.now() - lastRefreshAt < Math.min(cooldownMs, intervalMs / 2)) return;
    void trigger();
  }

  function start() {
    if (running) return;
    running = true;

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleFocusOrVisibility);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleFocusOrVisibility);
    }
    if (intervalMs > 0) {
      timer = setInterval(handleInterval, intervalMs);
    }

    if (immediate) {
      void trigger();
    }
  }

  function stop() {
    running = false;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', handleFocusOrVisibility);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleFocusOrVisibility);
    }
  }

  if (getCurrentInstance()) {
    onMounted(() => {
      start();
    });
    onBeforeUnmount(() => {
      stop();
    });
  }

  return {
    start,
    stop,
    trigger,
    isRunning: () => running,
  };
}
