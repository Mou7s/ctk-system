import { filterStaticNavigation, staticNavigation } from '@/router/static-navigation'

const usePermissionStore = defineStore(
  'permission',
  {
    state: () => ({
      routes: [],
      defaultRoutes: [],
      topbarRouters: [],
      sidebarRouters: [],
      isRoutesLoaded: false,
    }),
    actions: {
      initialize(user) {
        const routes = filterStaticNavigation(staticNavigation, user)
        this.routes = routes
        this.defaultRoutes = routes
        this.topbarRouters = routes
        this.sidebarRouters = routes
        this.isRoutesLoaded = true
        return routes
      },
      setSidebarRouters(routes) {
        this.sidebarRouters = routes
      },
      resetRoutes() {
        this.routes = []
        this.defaultRoutes = []
        this.topbarRouters = []
        this.sidebarRouters = []
        this.isRoutesLoaded = false
      },
    },
  },
)

export default usePermissionStore
