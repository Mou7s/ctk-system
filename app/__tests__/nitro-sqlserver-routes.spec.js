import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  query: {},
  authenticated: { session: { userId: 2 } },
  allowed: true,
}));

vi.mock("h3", () => ({
  getQuery: vi.fn(() => state.query),
}));

vi.mock("../../server/utils/auth.ts", () => ({
  getAuthSession: vi.fn(async () => state.authenticated),
  hasPermission: vi.fn(() => state.allowed),
}));

vi.mock("../../server/utils/sales-price-trend.ts", () => ({
  querySalesPriceTrendOptions: vi.fn(async () => [{ number: "C001", name: "客户" }]),
  querySalesPriceTrend: vi.fn(async () => ({ series: [], seriesCount: 0, pointCount: 0 })),
  SalesPriceTrendInputError: class SalesPriceTrendInputError extends Error {},
}));

const wipQuery = vi.hoisted(() => ({
  run: vi.fn(async () => ({ details: [], summaries: [], totalQty: 0 })),
  hasFilter: vi.fn((query) => Boolean(query?.processName || query?.moNumber || query?.billNo || query?.materialKeyword)),
  weakFilter: vi.fn(() => null),
  WipQueryLimitError: class WipQueryLimitError extends Error {},
}));

vi.mock("../../server/utils/wip.ts", () => ({
  queryWipReport: wipQuery.run,
  hasWipFilter: wipQuery.hasFilter,
  weakWipFilterMessage: wipQuery.weakFilter,
  WIP_FILTER_REQUIRED_MESSAGE: "请至少填写一个筛选条件后查询",
  WipQueryLimitError: wipQuery.WipQueryLimitError,
}));

vi.mock("../../server/utils/sqlserver.ts", () => ({
  SqlServerError: class SqlServerError extends Error {
    kind = "timeout";
    statusCode = 504;
  },
}));

vi.mock("../../server/utils/response.ts", () => ({
  apiSuccess: (data, msg = "操作成功") => ({ code: 200, msg, data }),
  apiError: (msg, code = 500) => ({ code, msg }),
  errorMessage: (error) => error?.message || "unknown error",
}));

describe("Nitro sales price trend routes", () => {
  let optionsHandler;
  let trendHandler;
  let wipHandler;

  beforeAll(async () => {
    globalThis.defineEventHandler = (handler) => handler;
    optionsHandler = (await import("../../server/routes/prod-api/tk_custom/salesPriceTrend/options.get.ts")).default;
    trendHandler = (await import("../../server/routes/prod-api/tk_custom/salesPriceTrend/trend.get.ts")).default;
    wipHandler = (await import("../../server/routes/prod-api/tk_custom/wip/list.get.ts")).default;
  });

  beforeEach(() => {
    state.query = { type: "customer" };
    state.authenticated = { session: { userId: 2 } };
    state.allowed = true;
    wipQuery.run.mockReset().mockResolvedValue({ details: [], summaries: [], totalQty: 0 });
  });

  it("keeps authentication and permission checks at the Nitro route boundary", async () => {
    state.authenticated = null;
    await expect(optionsHandler({})).resolves.toEqual({ code: 401, msg: "登录状态已过期" });

    state.authenticated = { session: { userId: 2 } };
    state.allowed = false;
    await expect(trendHandler({})).resolves.toEqual({ code: 403, msg: "没有权限访问该接口" });
  });

  it("returns the existing AjaxResult shape for a successful read", async () => {
    await expect(optionsHandler({})).resolves.toEqual({
      code: 200,
      msg: "操作成功",
      data: [{ number: "C001", name: "客户" }],
    });
    state.query = { processName: "固晶" };
    await expect(wipHandler({})).resolves.toEqual({
      code: 200,
      msg: "操作成功",
      data: { details: [], summaries: [], totalQty: 0 },
    });
  });

  it("returns input errors as client errors instead of server errors", async () => {
    const trendUtils = await import("../../server/utils/sales-price-trend.ts");
    trendUtils.querySalesPriceTrend.mockRejectedValueOnce(
      new trendUtils.SalesPriceTrendInputError("客户和物料至少选择一项"),
    );
    await expect(trendHandler({})).resolves.toEqual({
      code: 400,
      msg: "客户和物料至少选择一项",
    });
    trendUtils.querySalesPriceTrendOptions.mockRejectedValueOnce(
      new trendUtils.SalesPriceTrendInputError("选项类型必须是 customer 或 material"),
    );
    await expect(optionsHandler({})).resolves.toEqual({
      code: 400,
      msg: "选项类型必须是 customer 或 material",
    });
  });

  it("queries the full-plant WIP set when no filter is given", async () => {
    state.query = { onlyPositive: "true" };
    wipQuery.run.mockClear();

    await expect(wipHandler({})).resolves.toMatchObject({ code: 200 });
    // 首屏不填筛选是合法请求：页一打开就要出「封装 × 工序」全厂矩阵
    expect(wipQuery.run).toHaveBeenCalledWith(state.query);
  });

  it("rejects a weak WIP filter before querying SQL Server", async () => {
    state.query = { materialKeyword: "1" };
    wipQuery.weakFilter.mockReturnValueOnce("筛选条件太宽泛，请至少输入2个字符后再查询");

    await expect(wipHandler({})).resolves.toEqual({
      code: 400,
      msg: "筛选条件太宽泛，请至少输入2个字符后再查询",
    });
    expect(wipQuery.run).not.toHaveBeenCalled();
  });

  it("keeps the WIP query limit as a client error", async () => {
    state.query = { processName: "固晶" };
    wipQuery.run.mockRejectedValueOnce(new wipQuery.WipQueryLimitError("请缩小筛选范围"));

    await expect(wipHandler({})).resolves.toEqual({
      code: 429,
      msg: "请缩小筛选范围",
    });
  });
});
