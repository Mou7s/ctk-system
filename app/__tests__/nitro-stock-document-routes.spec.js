import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  authenticated: { session: { userId: 2 } },
  query: { pageNum: "1" },
  StockDocumentInputError: class StockDocumentInputError extends Error {
    statusCode = 400;
  },
}));

vi.mock("../../server/utils/sqlserver.ts", () => ({ queryK3SqlServer: vi.fn(async () => [{ number: "FIN" }]) }));
vi.mock("h3", () => ({ getQuery: vi.fn(() => state.query), getRouterParam: vi.fn(() => "SO001") }));
vi.mock("../../server/utils/auth.ts", () => ({ getAuthSession: vi.fn(async () => state.authenticated) }));
vi.mock("../../server/utils/stock-document.ts", () => ({
  queryK3Warehouses: vi.fn(async () => [{ label: "仓库（W001）", value: "W001" }]),
  queryK3Locations: vi.fn(async () => [{ label: "库位（L001）", value: "L001" }]),
  queryK3Inventory: vi.fn(async () => ({ rows: [], total: 0, pageNum: 1, pageSize: 50 })),
  queryK3DocumentList: vi.fn(async (type) => ({ rows: [], total: 0, pageNum: 1, pageSize: 10, source: `K3Cloud / ${type}` })),
  queryK3SalesOutboundPicking: vi.fn(async () => ({ billNo: "SO001", rows: [] })),
  StockDocumentInputError: state.StockDocumentInputError,
}));
vi.mock("../../server/utils/k3.ts", () => ({
  K3CloudError: class K3CloudError extends Error { kind = "unavailable"; statusCode = 502 },
}));
vi.mock("../../server/utils/response.ts", () => ({
  apiSuccess: (data, msg = "操作成功") => ({ code: 200, msg, data }),
  apiError: (msg, code = 500) => ({ code, msg }),
  errorMessage: (error) => error?.message || "unknown error",
}));

describe("Nitro stock-document read routes", () => {
  let warehouseHandler;
  let locationHandler;
  let inventoryHandler;
  let salesOutboundHandler;
  let productionReceiptHandler;
  let purchaseOrderHandler;
  let purchaseInboundHandler;
  let pickingHandler;

  beforeAll(async () => {
    globalThis.defineEventHandler = (handler) => handler;
    warehouseHandler = (await import("../../server/routes/prod-api/tk_custom/stockDocument/warehouses.get.ts")).default;
    locationHandler = (await import("../../server/routes/prod-api/tk_custom/stockDocument/locations.get.ts")).default;
    inventoryHandler = (await import("../../server/routes/prod-api/tk_custom/stockDocument/inventory.get.ts")).default;
    salesOutboundHandler = (await import("../../server/routes/prod-api/tk_custom/stockDocument/salesOutbound.get.ts")).default;
    productionReceiptHandler = (await import("../../server/routes/prod-api/tk_custom/stockDocument/productionReceipt.get.ts")).default;
    purchaseOrderHandler = (await import("../../server/routes/prod-api/tk_custom/stockDocument/purchaseOrder.get.ts")).default;
    purchaseInboundHandler = (await import("../../server/routes/prod-api/tk_custom/stockDocument/purchaseInbound.get.ts")).default;
    pickingHandler = (await import("../../server/routes/prod-api/tk_custom/stockDocument/salesOutbound/picking/[billNo].get.ts")).default;
  });

  it("passes server-owned finished-material scope for sales", async () => {
    state.authenticated = { session: { userId: 2, roles: ["foreign_trade_sales"] } };
    const { queryK3Inventory } = await import("../../server/utils/stock-document.ts");
    await inventoryHandler({});
    expect(queryK3Inventory).toHaveBeenLastCalledWith(state.query, ["FIN"]);
  });

  beforeEach(() => {
    state.authenticated = { session: { userId: 2 } };
    state.query = { pageNum: "1" };
  });

  it("requires login and keeps AjaxResult responses for the three read endpoints", async () => {
    state.authenticated = null;
    await expect(warehouseHandler({})).resolves.toEqual({ code: 401, msg: "登录状态已过期" });

    state.authenticated = { session: { userId: 2 } };
    await expect(locationHandler({})).resolves.toMatchObject({ code: 200, data: [{ value: "L001" }] });
    await expect(inventoryHandler({})).resolves.toMatchObject({ code: 200, data: { total: 0 } });
    await expect(salesOutboundHandler({})).resolves.toMatchObject({ code: 200, data: { total: 0 } });
    await expect(productionReceiptHandler({})).resolves.toMatchObject({ code: 200, data: { total: 0 } });
    await expect(purchaseOrderHandler({})).resolves.toMatchObject({ code: 200, data: { total: 0 } });
    await expect(purchaseInboundHandler({})).resolves.toMatchObject({ code: 200, data: { total: 0 } });
    await expect(pickingHandler({})).resolves.toMatchObject({ code: 200, data: { billNo: "SO001" } });
  });

  it("maps invalid query conditions to 400 and keeps K3 failures at 502", async () => {
    const { queryK3DocumentList } = await import("../../server/utils/stock-document.ts");

    queryK3DocumentList.mockRejectedValueOnce(new state.StockDocumentInputError("请至少填写日期范围或关键字"));
    await expect(productionReceiptHandler({})).resolves.toEqual({ code: 400, msg: "请至少填写日期范围或关键字" });

    queryK3DocumentList.mockRejectedValueOnce(new state.StockDocumentInputError("请至少填写日期范围或关键字"));
    await expect(salesOutboundHandler({})).resolves.toEqual({ code: 400, msg: "请至少填写日期范围或关键字" });

    queryK3DocumentList.mockRejectedValueOnce(new state.StockDocumentInputError("单据状态参数不正确"));
    await expect(purchaseOrderHandler({})).resolves.toEqual({ code: 400, msg: "单据状态参数不正确" });

    queryK3DocumentList.mockRejectedValueOnce(new Error("金蝶连接超时"));
    await expect(productionReceiptHandler({})).resolves.toEqual({ code: 502, msg: "金蝶单据查询失败，请检查金蝶连接或稍后重试" });
  });
});
