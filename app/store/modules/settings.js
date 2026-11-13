import defaultSettings from '@/settings'
import { useDynamicTitle } from '@/utils/dynamicTitle'

const { showSettings, topNav, tagsView, fixedHeader } = defaultSettings

function readStorageSetting() {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(window.localStorage.getItem('layout-setting')) || {}
  } catch {
    return {}
  }
}

const useSettingsStore = defineStore(
  'settings',
  {
    state: () => {
      const storageSetting = readStorageSetting()
      return {
      title: '',
      theme: storageSetting.theme || '#409EFF',
      showSettings: showSettings,
      topNav: storageSetting.topNav === undefined ? topNav : storageSetting.topNav,
      tagsView: storageSetting.tagsView === undefined ? tagsView : storageSetting.tagsView,
      fixedHeader: storageSetting.fixedHeader === undefined ? fixedHeader : storageSetting.fixedHeader,
      isDark: false
      }
    },
    actions: {
      changeSetting(data) {
        const { key, value } = data
        if (this.hasOwnProperty(key)) {
          this[key] = value
        }
      },
      setDarkMode(isDark) {
        this.isDark = isDark
        if (typeof window !== 'undefined' && typeof useColorMode === 'function') {
          useColorMode().preference = isDark ? 'dark' : 'light'
        }
      },
      toggleDarkMode() {
        this.setDarkMode(!this.isDark)
      },
      setTitle(title) {
        this.title = title
        useDynamicTitle();
      }
    }
  })

export default useSettingsStore
