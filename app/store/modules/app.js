import Cookies from 'js-cookie'

const useAppStore = defineStore(
  'app',
  {
    state: () => ({
      sidebar: {
        opened: Cookies.get('sidebarStatus') ? !!+Cookies.get('sidebarStatus') : true,
        withoutAnimation: false,
        hide: false
      },
      device: 'desktop'
    }),
    actions: {
      toggleSideBar(withoutAnimation) {
        if (this.sidebar.hide) {
          return false;
        }
        this.setSidebarOpened(!this.sidebar.opened, withoutAnimation)
      },
      setSidebarOpened(opened, withoutAnimation = false) {
        if (this.sidebar.hide) return false
        this.sidebar.opened = opened
        this.sidebar.withoutAnimation = withoutAnimation
        Cookies.set('sidebarStatus', opened ? 1 : 0)
      },
      closeSideBar({ withoutAnimation } = {}) {
        this.setSidebarOpened(false, withoutAnimation)
      },
      toggleDevice(device) {
        this.device = device
      },
      toggleSideBarHide(status) {
        this.sidebar.hide = status
      }
    }
  })

export default useAppStore
