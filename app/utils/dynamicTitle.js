import defaultSettings from '@/settings'

/**
 * 动态修改标题
 */
export function useDynamicTitle() {
  if (typeof document === 'undefined') return
  document.title = defaultSettings.title;
}
