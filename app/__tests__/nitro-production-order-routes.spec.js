import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  authenticated: { session: { userId: 2 } },
  query: { pageNum: "1" },
  list: vi.fn(async () => ({ rows: [], pageNum: 1, pageSize: 10, hasMore: false })),
  summary: vi.fn(async () => ({ rows: [], totals: {}, source: "K3Cloud / PRD_MO" })),
}));

vi.mock("h3", () => ({ getQuery: vi.fn(() => state.query) }));
vi.mock("../../server/utils/auth.ts", () => ({ getAuthSession: vi.fn(async () => state.authenticated) }));
vi.mock("../../server/utils/production-order.ts", () => ({
  queryProductionOrderList: state.list,
  queryProductionOrderSummary: state.summary,
  ProductionOrderInputError: class ProductionOrderInputError extends Error { statusCode = 400 },
}));
vi.mock("../../server/utils/k3.ts", () => ({
  K3CloudError: class K3CloudError extends Error { kind = "timeout"; statusCode = 504 },
}));
vi.mock("../../server/utils/response.ts", () => ({
  apiSuccess: (data, msg = "操作成功") => ({ code: 200, msg, data }),
  apiError: (msg, code = 500) => ({ code, msg }),
  errorMessage: (error) => error?.message || "unknown error",
}));

describe("Nitro production-order routes", () => {
  let listHandler;
  let summaryHandler;

  beforeAll(async () => {
    globalThis.defineEventHandler = (handler) => handler;
    listHandler = (await import("../../server/routes/prod-api/tk_custom/productionOrder/list.get.ts")).default;
    summaryHandler = (await import("../../server/routes/prod-api/tk_custom/productionOrder/summary.get.ts")).default;
  });

  beforeEach(() => {
    state.authenticated = { session: { userId: 2 } };
    state.query = { pageNum: "1" };
    state.list.mockReset().mockResolvedValue({ rows: [], pageNum: 1, pageSize: 10, hasMore: false });
    state.summary.mockReset().mockResolvedValue({ rows: [], totals: {}, source: "K3Cloud / PRD_MO" });
  });

  it("keeps the Java authentication boundary and AjaxResult shape", async () => {
    state.authenticated = null;
    await expect(listHandler({})).resolves.toEqual({ code: 401, msg: "登录状态已过期" });

    state.authenticated = { session: { userId: 2 } };
    await expect(summaryHandler({})).resolves.toEqual({
      code: 200,
      msg: "操作成功",
      data: { rows: [], totals: {}, source: "K3Cloud / PRD_MO" },
    });
  });
});
