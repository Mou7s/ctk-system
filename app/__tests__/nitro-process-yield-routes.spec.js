import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  authenticated: { session: { userId: 2 } },
  dashboard: vi.fn(async () => ({ rows: [], summary: { packageCount: 0 } })),
  planDetails: vi.fn(async () => ({ rows: [], total: 0, pageNum: 1, pageSize: 50 })),
  processData: vi.fn(async () => []),
  stockInAchievement: vi.fn(async () => []),
}));

vi.mock("h3", () => ({ readBody: vi.fn(async () => ({ startDate: "2026-01-01" })) }));
vi.mock("../../server/utils/auth.ts", () => ({ getAuthSession: vi.fn(async () => state.authenticated) }));
vi.mock("../../server/utils/process-yield.ts", () => ({
  queryProcessYieldDashboard: state.dashboard,
  queryProcessYieldPlanDetails: state.planDetails,
  queryProcessYieldData: state.processData,
  queryStockInAchievementData: state.stockInAchievement,
  ProcessYieldInputError: class ProcessYieldInputError extends Error { statusCode = 400 },
}));
vi.mock("../../server/utils/sqlserver.ts", () => ({
  SqlServerError: class SqlServerError extends Error { kind = "timeout"; statusCode = 504 },
}));
vi.mock("../../server/utils/response.ts", () => ({
  apiSuccess: (data, msg = "操作成功") => ({ code: 200, msg, data }),
  apiError: (msg, code = 500) => ({ code, msg }),
  errorMessage: (error) => error?.message || "unknown error",
}));

describe("Nitro process-yield dashboard route", () => {
  let handler;
  let planDetailsHandler;
  let processHandler;
  let stockInAchievementHandler;

  beforeAll(async () => {
    globalThis.defineEventHandler = (eventHandler) => eventHandler;
    handler = (await import("../../server/routes/prod-api/kingdee/getProcessYieldDashboard.post.ts")).default;
    planDetailsHandler = (await import("../../server/routes/prod-api/kingdee/getProcessYieldDashboardPlanDetails.post.ts")).default;
    processHandler = (await import("../../server/routes/prod-api/kingdee/getProcessYield.post.ts")).default;
    stockInAchievementHandler = (await import("../../server/routes/prod-api/kingdee/getStockInAchievement.post.ts")).default;
  });

  beforeEach(() => {
    state.authenticated = { session: { userId: 2 } };
    state.dashboard.mockReset().mockResolvedValue({ rows: [], summary: { packageCount: 0 } });
    state.planDetails.mockReset().mockResolvedValue({ rows: [], total: 0, pageNum: 1, pageSize: 50 });
    state.processData.mockReset().mockResolvedValue([]);
    state.stockInAchievement.mockReset().mockResolvedValue([]);
  });

  it("keeps the login boundary and AjaxResult data wrapper", async () => {
    state.authenticated = null;
    await expect(handler({})).resolves.toEqual({ code: 401, msg: "登录状态已过期" });
    state.authenticated = { session: { userId: 2 } };
    await expect(handler({})).resolves.toEqual({
      code: 200,
      msg: "操作成功",
      data: { rows: [], summary: { packageCount: 0 } },
    });
  });

  it("keeps the plan-details login boundary and AjaxResult data wrapper", async () => {
    state.authenticated = null;
    await expect(planDetailsHandler({})).resolves.toEqual({ code: 401, msg: "登录状态已过期" });
    state.authenticated = { session: { userId: 2 } };
    await expect(planDetailsHandler({})).resolves.toEqual({
      code: 200,
      msg: "操作成功",
      data: { rows: [], total: 0, pageNum: 1, pageSize: 50 },
    });
  });

  it("keeps the legacy read-only array response contracts", async () => {
    state.authenticated = null;
    await expect(processHandler({})).resolves.toEqual({ code: 401, msg: "登录状态已过期" });
    await expect(stockInAchievementHandler({})).resolves.toEqual({ code: 401, msg: "登录状态已过期" });

    state.authenticated = { session: { userId: 2 } };
    state.processData.mockResolvedValue([{ processName: "测试分选" }]);
    state.stockInAchievement.mockResolvedValue([{ billNo: "GX001" }]);
    await expect(processHandler({})).resolves.toEqual([{ processName: "测试分选" }]);
    await expect(stockInAchievementHandler({})).resolves.toEqual([{ billNo: "GX001" }]);
  });
});
