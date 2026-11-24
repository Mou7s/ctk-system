function inferRouteComponent(path) {
  const normalized = String(path || '')
    .replace(/^\/+/, '')
    .replace(/\/:[^/]+$/, '')
  if (!normalized || normalized.startsWith('__nav/')) return null
  return `${normalized}/index`
}

const page = (path, title, icon, permission, extra = {}) => {
  const { menuId, additionalMenuIds, adminOnly, component, ...routeExtra } = extra
  const routeComponent = component || inferRouteComponent(path)
  return {
    path,
    meta: {
      title,
      icon,
      ...(permission ? { permission } : {}),
      ...(Number.isInteger(menuId) ? { menuId } : {}),
      ...(Array.isArray(additionalMenuIds) && additionalMenuIds.length ? { additionalMenuIds } : {}),
      ...(adminOnly ? { adminOnly: true } : {}),
    },
    ...(routeComponent ? { component: routeComponent } : {}),
    ...routeExtra,
  }
}

const group = (path, title, icon, children, extra = {}) => ({
  path,
  meta: { title, icon },
  children,
  ...extra,
})

// This tree is navigation metadata only. Nuxt's app/pages directory owns the
// actual route table; sys_menu is used for permission grants, never to load a
// component or create a route at runtime.
export const staticNavigation = [
  group('/', '首页', 'i-lucide-home', [
    page('/', '首页', 'i-lucide-home'),
  ]),
  group('/__nav/system', '系统管理', 'i-lucide-settings', [
    page('/system/user', '用户管理', 'i-lucide-user', 'system:user:list', { menuId: 100 }),
    page('/system/role', '角色管理', 'i-lucide-users', 'system:role:list', { menuId: 101 }),
    page('/system/dept', '部门管理', 'i-lucide-network', 'system:dept:list', { menuId: 103 }),
    page('/system/post', '岗位管理', 'i-lucide-briefcase', 'system:post:list', { menuId: 104 }),
    page('/system/menu', '权限目录', 'i-lucide-menu', 'system:menu:list', { menuId: 102 }),
    page('/system/notice', '通知公告', 'i-lucide-bell', 'system:notice:list', { menuId: 107 }),
    page('/system/dict', '字典管理', 'i-lucide-book-open', 'system:dict:list', { menuId: 105 }),
    page('/system/config', '参数设置', 'i-lucide-sliders-horizontal', 'system:config:list', { menuId: 106 }),
    page('/user/profile', '个人中心', 'i-lucide-circle-user'),
    page('/system/user/authRole', '用户角色授权', 'i-lucide-user-cog', 'system:user:list', { menuId: 100, hidden: true }),
    page('/system/user-auth/role/:userId', '用户角色授权', 'i-lucide-user-cog', 'system:user:list', { menuId: 100, hidden: true }),
    page('/system/role/authUser', '角色用户授权', 'i-lucide-users-round', 'system:role:list', { menuId: 101, hidden: true }),
    page('/system/role-auth/user/:roleId', '角色用户授权', 'i-lucide-users-round', 'system:role:list', { menuId: 101, hidden: true }),
    page('/system/dict/data', '字典数据', 'i-lucide-list-tree', 'system:dict:list', { menuId: 105, hidden: true }),
    page('/system/dict-data/index/:dictId', '字典数据', 'i-lucide-list-tree', 'system:dict:list', { menuId: 105, hidden: true }),
  ]),
  group('/__nav/monitor', '系统监控', 'i-lucide-monitor', [
    page('/monitor/online', '在线用户', 'i-lucide-wifi', 'monitor:online:list', { menuId: 109 }),
    page('/monitor/job', '定时任务', 'i-lucide-clock', 'monitor:job:list', { menuId: 110 }),
    page('/monitor/job/log', '调度日志', 'i-lucide-scroll-text', 'monitor:job:list', { menuId: 110, hidden: true }),
    page('/monitor/job-log/index/:jobId', '调度日志', 'i-lucide-scroll-text', 'monitor:job:list', { menuId: 110, hidden: true }),
    page('/monitor/logininfor', '登录日志', 'i-lucide-shield-alert', 'monitor:logininfor:list', { menuId: 501 }),
    page('/monitor/operlog', '操作日志', 'i-lucide-clipboard-list', 'monitor:operlog:list', { menuId: 500 }),
    page('/monitor/cache', '缓存监控', 'i-lucide-database-zap', 'monitor:cache:list', { menuId: 113 }),
    page('/monitor/server', '服务监控', 'i-lucide-server', 'monitor:server:list', { menuId: 112 }),
  ]),
  group('/__nav/production', '生产管理', 'i-lucide-factory', [
    page('/tk_custom/productionOrder', '生产订单', 'i-lucide-clipboard-list', 'tk_custom:productionOrder:list', { menuId: 2193 }),
    page('/tk_custom/processYield', '生产质量', 'i-lucide-chart-line', 'tk_custom:processYield:list', { menuId: 2190 }),
    page('/tk_custom/processOutputReport', '产量汇报', 'i-lucide-file-chart-column', 'tk_custom:processOutputReport:list', { menuId: 2166 }),
    page('/tk_custom/mo', '生产进度', 'i-lucide-notepad-text', 'tk_custom:mo:list', { menuId: 2054 }),
    page('/tk_custom/wip', '车间半成品在制', 'i-lucide-git-branch', 'tk_custom:wip:list', { menuId: 2186 }),
    page('/tk_custom/pd', '车间半成品盘点', 'i-lucide-clipboard-check', 'tk_custom:pd:list', { menuId: 2011 }),
    page('/tk_custom/productionReceipt', '生产入库', 'i-lucide-package-check', 'tk_custom:productionReceipt:list', { menuId: 2192 }),
    page('/tk_custom/dummyPiece', '假片重量月度录入', 'i-lucide-copy-plus', 'tk_custom:dummyPiece:list', { menuId: 2180 }),
  ]),
  group('/__nav/salesManagement', '销售管理', 'i-lucide-shopping-cart', [
    page('/tk_custom/quotation', '外贸销售报价单', 'i-lucide-file-spreadsheet', 'tk_custom:quotation:list'),
    page('/tk_custom/domesticQuotation', '内贸销售报价单', 'i-lucide-file-spreadsheet', 'tk_custom:domesticQuotation:list'),
    page('/tk_custom/salesPriceTrend', '销售价格走势', 'i-lucide-chart-spline', 'tk_custom:salesPriceTrend:list', { menuId: 2209 }),
    page('/tk_custom/customerOverdueAr', '客户逾期应收', 'i-lucide-hand-coins', 'tk_custom:customerOverdueAr:list', { menuId: 2202 }),
    page('/tk_custom/sampleProgress', '客户样品进度', 'i-lucide-flask-conical', 'tk_custom:sampleProgress:list', { menuId: 2222 }),
    page('/tk_custom/deliveryAlert', '销售交期预警', 'i-lucide-bell-ring', 'tk_custom:deliveryAlert:list', { roles: ['sales_manager'] }),
  ], { alwaysShow: true }),
  group('/__nav/procurement', '采购管理', 'i-lucide-package', [
    page('/tk_custom/npi', '供应商准入与测试', 'i-lucide-git-branch', null, { menuId: 2244, additionalMenuIds: [2234] }),
  ], { alwaysShow: true }),
  group('/__nav/workshop', '车间管理', 'i-lucide-factory', [
    page('/tk_custom/pic', '弹坑图片', 'i-lucide-image', 'tk_custom:pic:list', { menuId: 2083 }),
    page('/tk_custom/exception', '异常单', 'i-lucide-alert-octagon', 'tk_custom:exception:list', { menuId: 2099 }),
    page('/tk_custom/exceptionDashboard', '异常看板', 'i-lucide-layout-dashboard', 'tk_custom:exception:list', { menuId: 2099, additionalMenuIds: [2150] }),
    page('/tk_custom/suggest', '意见建议', 'i-lucide-message-square-plus', 'tk_custom:suggest:list', { menuId: 2062 }),
    page('/tk_custom/videoLibrary', '视频资料库', 'i-lucide-video', 'tk_custom:videoLibrary:list', { menuId: 2210 }),
    page('/tk_custom/wireBondCard', '焊线机工卡打印', 'i-lucide-printer', null, { adminOnly: true }),
  ]),
  group('/__nav/warehouse', '仓库管理', 'i-lucide-package', [
    page('/tk_custom/kucun', '库存查询', 'i-lucide-package', 'tk_custom:kucun:list', { menuId: 2055, hidden: true }),
    page('/tk_custom/kucun_warning', '库存预警', 'i-lucide-alert-triangle', 'tk_custom:kucun:list', { menuId: 2178 }),
    page('/tk_custom/kingdee_kucun', 'D栋库存', 'i-lucide-cloud', 'tk_custom:kucun:list', { menuId: 2061 }),
    page('/tk_custom/kingdee_inventory', '金蝶即时库存', 'i-lucide-box', 'tk_custom:kingdeeInventory:list', { menuId: 2214 }),
    page('/tk_custom/wmsStructure', '仓库结构', 'i-lucide-warehouse', 'tk_custom:wmsStructure:list', { menuId: 2204 }),
    page('/tk_custom/wmsInbound', '采购入库', 'i-lucide-log-in', 'tk_custom:wmsInbound:list', { menuId: 2197 }),
    page('/tk_custom/wmsOutbound', '销售出库', 'i-lucide-log-out', 'tk_custom:wmsOutbound:list', { menuId: 2196 }),
    page('/tk_custom/localStockInbound', '库位上架', 'i-lucide-package-plus', 'tk_custom:localStock:list', { menuId: 2199 }),

    page('/tk_custom/tag', '标签管理', 'i-lucide-tags', 'tk_custom:tag:list', { menuId: 2026 }),
  ]),
  group('/__nav/internal', 'TK内部管理', 'i-lucide-briefcase', [
    page('/tk_custom/itAsset', 'IT资产管理', 'i-lucide-monitor', 'tk_custom:itAsset:list', { menuId: 2278 }),
    page('/tk_custom/kingdeeMaintenance', '金蝶快捷指令', 'i-lucide-terminal', 'tk_custom:kingdee:query', { menuId: 2045 }),
    page('/tk_custom/jukebox', '厂区广播', 'i-lucide-music', 'tk_custom:jukebox:list', { menuId: 2179 }),
    page('/tk_custom/talent_pool', '人才库', 'i-lucide-brain', 'tk_custom:talent_pool:list', { menuId: 2095 }),
    page('/tk_custom/employmentSummary', '入离职汇总', 'i-lucide-user-round-check', 'tk_custom:employmentSummary:list', { menuId: 2228 }),
    page('/tk_custom/wecomAttendance', '考勤核算', 'i-lucide-clock', 'tk_custom:wecomAttendance:list', { menuId: 2277 }),
    page('/tk_custom/attendance', 'ESD门禁记录', 'i-lucide-shield-check', 'tk_custom:attendance:list', { menuId: 2255 }),
    page('/tk_custom/wxuser', '企业微信通讯录', 'i-lucide-message-circle', 'tk_custom:wxuser:list', { menuId: 2043 }),
    page('/tk_custom/msgtowx', '企业微信消息', 'i-lucide-send', 'tk_custom:msgtowx:list', { menuId: 2068 }),
    page('/tk_custom/wfExport', '外发上锡导出', 'i-lucide-file-spreadsheet', 'tk_custom:others:list', { menuId: 2052 }),
    page('/tk_custom/lucky/admin', '抽奖管理', 'i-lucide-gift', 'tk_custom:lucky:list', { menuId: 2189 }),
  ]),
]

function normalizePermission(value) {
  return String(value || '').trim()
}

export function hasStaticPermission(user, permission) {
  const required = normalizePermission(permission)
  if (!required) return true
  if (Number(user?.id) === 1) return true
  const permissions = Array.isArray(user?.permissions) ? user.permissions.map(String) : []
  return permissions.some((item) => item === required
    || item === '*'
    || item === '*:*:*'
    || (item.endsWith(':*') && required.startsWith(item.slice(0, -1))))
}

export function hasStaticRole(user, roles) {
  if (!Array.isArray(roles) || roles.length === 0) return true
  if (Number(user?.id) === 1) return true
  const current = Array.isArray(user?.roles) ? user.roles.map(String) : []
  return roles.some((role) => current.includes(String(role)))
}

export function canAccessStaticRoute(user, route) {
  if (Number(user?.id) === 1) return true
  if (route?.adminOnly || route?.meta?.adminOnly) return false

  const primaryMenuId = Number(route?.menuId || route?.meta?.menuId)
  const additionalMenuIds = route?.additionalMenuIds || route?.meta?.additionalMenuIds || []
  const acceptedMenuIds = [primaryMenuId, ...additionalMenuIds.map(Number)].filter(Number.isInteger)
  const userMenuIds = new Set((Array.isArray(user?.menuIds) ? user.menuIds : []).map(Number))
  const hasMenuGrant = acceptedMenuIds.length === 0
    || acceptedMenuIds.some((menuId) => userMenuIds.has(menuId))

  const permissionFallback = acceptedMenuIds.length === 0
    ? hasStaticPermission(user, route?.meta?.permission)
    : true
  return hasMenuGrant
    && permissionFallback
    && hasStaticRole(user, route?.roles || route?.meta?.roles)
}

export function filterStaticNavigation(routes, user) {
  return routes
    .filter((route) => canAccessStaticRoute(user, route))
    .map((route) => {
      if (route.hidden || route.meta?.hidden) return null
      const children = Array.isArray(route.children)
        ? filterStaticNavigation(route.children, user)
        : []
      if (route.children && children.length === 0) return null
      return { ...route, children }
    })
    .filter(Boolean)
}

function pathMatches(pattern, path) {
  const normalizedPattern = String(pattern || '').replace(/\/+$/, '') || '/'
  const normalizedPath = String(path || '').replace(/\/+$/, '') || '/'
  if (normalizedPattern === normalizedPath) return true
  if (normalizedPattern.includes(':')) {
    const expression = new RegExp(`^${normalizedPattern.replace(/:[^/]+/g, '[^/]+')}$`)
    return expression.test(normalizedPath)
  }
  return false
}

export function findStaticRoute(path, routes = staticNavigation) {
  for (const route of routes) {
    if (pathMatches(route.path, path)) return route
    const child = findStaticRoute(path, route.children || [])
    if (child) return child
  }
  return null
}
