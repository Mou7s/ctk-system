import { isRelogin } from "@/utils/request";
import useUserStore from "@/store/modules/user";
import useSettingsStore from "@/store/modules/settings";
import usePermissionStore from "@/store/modules/permission";
import { canAccessStaticRoute, findStaticRoute } from "@/router/static-navigation";
import { recordRouteVisit, shouldRecordRouteVisit } from "@/utils/homeUsage";

const whiteList = [
  "/login",
  "/register",
  "/WXApproveGoods",
  "/WXApproveStaff",
  "/WXApproveDetail",
  "/jukebox",
  "/lucky-draw",
  "/lucky-screen",
];

export default defineNuxtRouteMiddleware(async (to, from) => {
  // 顶部加载条状态（app.vue 用 UProgress 渲染）；只在 client 导航时置位
  const routeLoading = useState<boolean>("routeLoading", () => false);
  // Public pages do not need server-side auth bootstrap. Keeping this branch
  // server-safe avoids importing the legacy Pinia/auth flow into the initial
  // login HTML render; the browser resumes the normal middleware after mount.
  if (import.meta.server && whiteList.includes(to.path)) {
    return;
  }
  if (import.meta.client) routeLoading.value = true;
  const userStore = useUserStore();
  const permissionStore = usePermissionStore();

  const finish = () => {
    if (import.meta.client) routeLoading.value = false;
    if (!userStore.id || !shouldRecordRouteVisit(to.path, to.meta)) {
      return;
    }
    recordRouteVisit(userStore.id, to.path, to.meta.title as string);
  };

  try {
    if (to.path === "/login" && userStore.id) {
      finish();
      return navigateTo("/");
    }
    if (!userStore.id && !whiteList.includes(to.path)) {
      await userStore.getInfo();
    }
    if (userStore.id) {
      const staticRoute = findStaticRoute(to.path);
      const routeTitle = staticRoute?.meta?.title || to.meta.title;
      if (routeTitle) {
        useSettingsStore().setTitle(routeTitle as string);
      }
      if (to.path === "/login") {
        finish();
        return navigateTo("/");
      }
      if (whiteList.includes(to.path)) {
        finish();
        return;
      }
      if (!permissionStore.isRoutesLoaded) {
        isRelogin.show = true;
        const loadUserInfo =
          userStore.roles.length === 0 ? userStore.getInfo() : Promise.resolve();
        await loadUserInfo;
        isRelogin.show = false;
        permissionStore.initialize(userStore);
        finish();
      }
      if (staticRoute && !canAccessStaticRoute(userStore, staticRoute)) {
        finish();
        return navigateTo('/401?noGoBack=1');
      }
      finish();
      return;
    }

    if (whiteList.includes(to.path)) {
      finish();
      return;
    }
    finish();
    return navigateTo(`/login?redirect=${to.fullPath}`);
  } catch (err) {
    if (import.meta.client) routeLoading.value = false;
    try {
      await userStore.logOut();
    } catch (e) {
      // 即使后端退出接口报错，也必须强制清理本地 Cookie 和 store 角色状态，防止无限报错死循环
      const { removeToken } = await import("@/utils/auth");
      removeToken();
      userStore.roles = [];
      userStore.permissions = [];
      userStore.menuIds = [];
    }
    console.error("初始化用户信息失败，强制重定向到登录页:", String(err));
    return navigateTo("/login");
  }
});

