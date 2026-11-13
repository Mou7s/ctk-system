import { describe, expect, it } from "vitest";

import {
  canAccessStaticRoute,
  filterStaticNavigation,
  findStaticRoute,
  hasStaticPermission,
  staticNavigation,
} from "../router/static-navigation.js";

describe("static Nuxt navigation", () => {
  it("uses file routes as the source for the Kingdee maintenance page and legacy redirects", () => {
    expect(findStaticRoute("/tk_custom/kingdeeMaintenance")).toMatchObject({
      path: "/tk_custom/kingdeeMaintenance",
      meta: {
        permission: "tk_custom:kingdee:query",
        menuId: 2045,
      },
    });
    expect(findStaticRoute("/system/user-auth/role/12")).toMatchObject({
      path: "/system/user-auth/role/:userId",
    });
    expect(findStaticRoute("/tk_custom/music")).toBeNull();
  });

  it("removes obsolete development tool pages and navigation", () => {
    expect(findStaticRoute("/tool/gen")).toBeNull();
    expect(findStaticRoute("/tool/gen-edit/index/42")).toBeNull();
    expect(findStaticRoute("/tool/swagger")).toBeNull();

    const adminRoutes = filterStaticNavigation(staticNavigation, { id: 1, permissions: [], menuIds: [], roles: [] });
    const adminPaths = adminRoutes.flatMap((group) => (group.children || []).map((item) => item.path));
    expect(adminRoutes.map((group) => group.path)).not.toContain("/__nav/tool");
    expect(adminPaths).not.toContain("/tool/gen");
    expect(adminPaths).not.toContain("/tool/gen-edit/index/:tableId");
    expect(adminPaths).not.toContain("/tool/swagger");
  });

  it("labels the Kingdee customer inventory route with its actual business name", () => {
    expect(findStaticRoute("/tk_custom/kingdee_kucun")).toMatchObject({
      path: "/tk_custom/kingdee_kucun",
      meta: {
        title: "D栋库存",
        menuId: 2061,
      },
    });
  });

  it("keeps the quotation page under the Sales navigation category", () => {
    const salesGroup = staticNavigation.find((route) => route.path === "/__nav/salesManagement");
    expect(salesGroup).toMatchObject({
      meta: { title: "销售管理" },
      alwaysShow: true,
    });
    expect(findStaticRoute("/tk_custom/quotation")).toMatchObject({
      meta: {
        title: "外贸销售报价单",
        permission: "tk_custom:quotation:list",
      },
    });
    expect(findStaticRoute("/tk_custom/domesticQuotation")).toMatchObject({
      meta: {
        title: "内贸销售报价单",
        permission: "tk_custom:domesticQuotation:list",
      },
    });
  });

  it("exposes the employment summary under internal management", () => {
    expect(findStaticRoute("/tk_custom/employmentSummary")).toMatchObject({
      path: "/tk_custom/employmentSummary",
      meta: {
        title: "入离职汇总",
        icon: "i-lucide-user-round-check",
        permission: "tk_custom:employmentSummary:list",
        menuId: 2228,
      },
    });
  });

  it("exposes the talent pool under internal management, outside the workshop category", () => {
    const internalPaths = staticNavigation.find((route) => route.path === "/__nav/internal")
      ?.children.map((route) => route.path);
    const workshopPaths = staticNavigation.find((route) => route.path === "/__nav/workshop")
      ?.children.map((route) => route.path);

    expect(findStaticRoute("/tk_custom/talent_pool")).toMatchObject({
      path: "/tk_custom/talent_pool",
      meta: {
        title: "人才库",
        permission: "tk_custom:talent_pool:list",
        menuId: 2095,
      },
    });
    expect(internalPaths).toContain("/tk_custom/talent_pool");
    expect(workshopPaths).not.toContain("/tk_custom/talent_pool");
  });

  it("requires the dedicated employment summary menu grant", () => {
    const route = findStaticRoute("/tk_custom/employmentSummary");
    expect(canAccessStaticRoute(
      { id: 7, permissions: ["tk_custom:employmentSummary:list"], menuIds: [2228], roles: [] },
      route,
    )).toBe(true);
    expect(canAccessStaticRoute(
      { id: 8, permissions: ["tk_custom:employmentSummary:list"], menuIds: [], roles: [] },
      route,
    )).toBe(false);
  });

  it("keeps sales pricing and customer receivables under Sales", () => {
    const salesGroup = staticNavigation.find((route) => route.path === "/__nav/salesManagement");
    const salesPaths = (salesGroup?.children || []).map((route) => route.path);

    expect(salesPaths).toEqual([
      "/tk_custom/customerCard",
      "/tk_custom/quotation",
      "/tk_custom/domesticQuotation",
      "/tk_custom/salesPriceTrend",
      "/tk_custom/customerOverdueAr",
      "/tk_custom/sampleProgress",
      "/tk_custom/deliveryAlert",
    ]);
    expect(staticNavigation.find((route) => route.path === "/__nav/production")?.children)
      .not.toEqual(expect.arrayContaining([
        expect.objectContaining({ path: "/tk_custom/salesPriceTrend" }),
      ]));
    expect(staticNavigation.find((route) => route.path === "/__nav/internal")?.children)
      .not.toEqual(expect.arrayContaining([
        expect.objectContaining({ path: "/tk_custom/customerOverdueAr" }),
      ]));
  });

  it("labels the production count route as workshop semi-finished goods counting", () => {
    expect(findStaticRoute("/tk_custom/pd")).toMatchObject({
      path: "/tk_custom/pd",
      meta: {
        title: "车间半成品盘点",
        menuId: 2011,
      },
    });
  });

  it("labels local stock inbound as location shelving without changing route ownership", () => {
    expect(findStaticRoute("/tk_custom/localStockInbound")).toMatchObject({
      path: "/tk_custom/localStockInbound",
      meta: {
        title: "库位上架",
        permission: "tk_custom:localStock:list",
        menuId: 2199,
      },
    });
  });

  it("labels the picture route as crater test images", () => {
    expect(findStaticRoute("/tk_custom/pic")).toMatchObject({
      path: "/tk_custom/pic",
      meta: {
        title: "弹坑图片",
        permission: "tk_custom:pic:list",
        menuId: 2083,
      },
    });
  });

  it("labels the exception route as 异常单", () => {
    expect(findStaticRoute("/tk_custom/exception")).toMatchObject({
      path: "/tk_custom/exception",
      meta: {
        title: "异常单",
        permission: "tk_custom:exception:list",
        menuId: 2099,
      },
    });
  });

  it("uses the external tinning export route and removes the old others route", () => {
    expect(findStaticRoute("/tk_custom/wfExport")).toMatchObject({
      path: "/tk_custom/wfExport",
      meta: {
        title: "外发上锡导出",
        permission: "tk_custom:others:list",
        menuId: 2052,
      },
    });
    expect(findStaticRoute("/tk_custom/others")).toBeNull();

    const adminPaths = filterStaticNavigation(staticNavigation, { id: 1, permissions: [], roles: [] })
      .flatMap((group) => (group.children || []).map((item) => item.path));
    expect(adminPaths).toContain("/tk_custom/wfExport");
    expect(adminPaths).not.toContain("/tk_custom/others");
  });

  it("does not expose the removed workshop scan registration route", () => {
    expect(findStaticRoute("/tk_custom/workshop")).toBeNull();
  });

  it("does not expose the removed process reporting route", () => {
    expect(findStaticRoute("/tk_custom/gxjl")).toBeNull();
  });

  it("requires the dedicated 2061 menu grant for customer inventory", () => {
    const route = findStaticRoute("/tk_custom/kingdee_kucun");
    const sharedInventoryUser = { id: 7, permissions: ["tk_custom:kucun:list"], menuIds: [2178], roles: [] };
    const grantedUser = { id: 8, permissions: ["tk_custom:kucun:list"], menuIds: [2061], roles: [] };

    expect(canAccessStaticRoute(grantedUser, route)).toBe(true);
    expect(canAccessStaticRoute(sharedInventoryUser, route)).toBe(false);
  });

  it("filters visible navigation by assigned menu IDs while keeping admin access", () => {
    const ordinaryUser = {
      id: 7,
      permissions: ["tk_custom:kingdee:query"],
      menuIds: [2045],
      roles: [],
    };
    const filtered = filterStaticNavigation(staticNavigation, ordinaryUser);
    const visiblePaths = filtered.flatMap((group) => (group.children || []).map((item) => item.path));

    expect(visiblePaths).toContain("/tk_custom/kingdeeMaintenance");
    expect(visiblePaths).not.toContain("/system/user");
    expect(visiblePaths).not.toContain("/system/user-auth/role/:userId");
    expect(visiblePaths).toContain("/user/profile");

    const admin = { id: 1, permissions: [], roles: [] };
    const adminPaths = filterStaticNavigation(staticNavigation, admin)
      .flatMap((group) => (group.children || []).map((item) => item.path));
    expect(adminPaths).toContain("/system/user");
    expect(adminPaths).not.toContain("/system/user-auth/role/:userId");
  });

  it("removes the obsolete Druid monitoring page", () => {
    expect(findStaticRoute("/monitor/druid")).toBeNull();

    const adminPaths = filterStaticNavigation(staticNavigation, { id: 1, permissions: [], roles: [] })
      .flatMap((group) => (group.children || []).map((item) => item.path));
    expect(adminPaths).not.toContain("/monitor/druid");
  });

  it("keeps permission helpers for action checks but uses menu grants for page ownership", () => {
    expect(hasStaticPermission({ id: 7, permissions: ["tk_custom:*:*"] }, "tk_custom:kingdee:query")).toBe(false);
    expect(hasStaticPermission({ id: 7, permissions: ["tk_custom:*"] }, "tk_custom:kingdee:query")).toBe(true);
    expect(hasStaticPermission({ id: 1, permissions: [] }, "system:user:list")).toBe(true);
    expect(canAccessStaticRoute(
      { id: 7, permissions: ["tk_custom:kingdee:query"], menuIds: [2045], roles: [] },
      findStaticRoute("/tk_custom/kingdeeMaintenance"),
    )).toBe(true);
    expect(canAccessStaticRoute(
      { id: 7, permissions: ["tk_custom:kingdee:query"], menuIds: [], roles: [] },
      findStaticRoute("/tk_custom/kingdeeMaintenance"),
    )).toBe(false);
  });

  it("does not expand shared permissions into unassigned pages", () => {
    const user = {
      id: 7,
      permissions: ["tk_custom:kucun:list"],
      menuIds: [2178],
      roles: [],
    };
    const visiblePaths = filterStaticNavigation(staticNavigation, user)
      .flatMap((group) => (group.children || []).map((item) => item.path));

    expect(visiblePaths).toContain("/tk_custom/kucun_warning");
    expect(visiblePaths).not.toContain("/tk_custom/kingdee_kucun");
    expect(visiblePaths).not.toContain("/tk_custom/kingdee_inventory");
  });

  it("keeps hidden routes directly accessible to their grantees", () => {
    const hiddenKucun = findStaticRoute("/tk_custom/kucun");
    const user = { id: 7, permissions: ["tk_custom:kucun:list"], menuIds: [2055], roles: [] };
    expect(canAccessStaticRoute(user, hiddenKucun)).toBe(true);
    expect(filterStaticNavigation(staticNavigation, user)
      .flatMap((group) => (group.children || []).map((item) => item.path)))
      .not.toContain("/tk_custom/kucun");
  });

  it("preserves shared menu aliases", () => {
    const ordinaryUser = { id: 7, permissions: [], menuIds: [2011, 2099], roles: [] };
    expect(canAccessStaticRoute(ordinaryUser, findStaticRoute("/tk_custom/pd"))).toBe(true);
    expect(canAccessStaticRoute(ordinaryUser, findStaticRoute("/tk_custom/exceptionDashboard"))).toBe(true);
    expect(canAccessStaticRoute(
      { id: 8, permissions: ["tk_custom:exception:query"], menuIds: [2150], roles: [] },
      findStaticRoute("/tk_custom/exceptionDashboard"),
    )).toBe(true);
  });

  it("removes the obsolete mobile counting page", () => {
    expect(findStaticRoute("/tk_custom/pdAPP")).toBeNull();

    const ordinaryPaths = filterStaticNavigation(staticNavigation, {
      id: 7,
      permissions: [],
      menuIds: [2011],
      roles: [],
    }).flatMap((group) => (group.children || []).map((item) => item.path));
    const adminPaths = filterStaticNavigation(staticNavigation, { id: 1, permissions: [], roles: [] })
      .flatMap((group) => (group.children || []).map((item) => item.path));

    expect(ordinaryPaths).not.toContain("/tk_custom/pdAPP");
    expect(adminPaths).not.toContain("/tk_custom/pdAPP");
    expect(ordinaryPaths).toContain("/tk_custom/pd");
  });

  it("restores assigned pages and denies direct access without their menu grant", () => {
    expect(findStaticRoute("/tk_custom/lucky/admin")?.meta.menuId).toBe(2189);
    expect(findStaticRoute("/tk_custom/wmsStructure")?.meta.menuId).toBe(2204);
    expect(canAccessStaticRoute(
      { id: 150, permissions: [], menuIds: [2054], roles: [] },
      findStaticRoute("/tk_custom/mo"),
    )).toBe(true);
    expect(canAccessStaticRoute(
      { id: 151, permissions: ["tk_custom:mo:list"], menuIds: [], roles: [] },
      findStaticRoute("/tk_custom/mo"),
    )).toBe(false);
  });
});
