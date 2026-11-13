export default defineNuxtPlugin(() => {
  if (!import.meta.client) return
  try {
    const key = 'nuxt-color-mode'
    const migratedKey = 'nuxt-color-mode-migrated-v2'
    if (localStorage.getItem(migratedKey)) return
    const v = localStorage.getItem(key)
    // 旧逻辑把 layout-setting.isDark 自动 pin 成 dark/light，导致跟随系统失效
    // 一次性把存量 pin 清掉，回到 preference = system，让实时跟随生效
    if (v === 'dark' || v === 'light') {
      localStorage.removeItem(key)
      if (window.__NUXT_COLOR_MODE__) {
        window.__NUXT_COLOR_MODE__.preference = 'system'
        // value 会由 plugin.client 的 watchMedia 重新计算，这里先按系统重算一次
        const resolved = window.__NUXT_COLOR_MODE__.getColorScheme?.() || 'light'
        window.__NUXT_COLOR_MODE__.value = resolved
        document.documentElement.classList.remove('dark', 'light')
        document.documentElement.classList.add(resolved)
      }
      localStorage.setItem(migratedKey, '1')
    }
  } catch (_) {}
})
