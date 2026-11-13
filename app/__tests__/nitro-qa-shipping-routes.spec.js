import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  authenticated: { session: { userId: 2 } },
  report: vi.fn(async () => ({ month: "2026-02", rows: [], sumRow: { total: 0 } })),
}));

vi.mock("h3", () => ({ getQuery: vi.fn(() => ({ month: "2026-02" })) }));
vi.mock("../../server/utils/auth.ts", () => ({ getAuthSession: vi.fn(async () => state.authenticated) }));
vi.mock("../../server/utils/qa-shipping.ts", () => ({
  queryQaShippingReport: state.report,
  QaShippingInputError: class QaShippingInputError extends Error { statusCode = 400 },
}));
vi.mock("../../server/utils/k3.ts", () => ({
  K3CloudError: class K3CloudError extends Error { kind = "unavailable"; statusCode = 502 },
}));
vi.mock("../../server/utils/response.ts", () => ({
  apiSuccess: (data, msg = "操作成功") => ({ code: 200, msg, data }),
  apiError: (msg, code = 500) => ({ code, msg }),
  errorMessage: (error) => error?.message || "unknown error",
}));

describe("Nitro QA shipping report route", () => {
  let handler;

  beforeAll(async () => {
    globalThis.defineEventHandler = (eventHandler) => eventHandler;
    handler = (await import("../../server/routes/prod-api/tk_custom/qaShipping/report.get.ts")).default;
  });

  beforeEach(() => {
    state.authenticated = { session: { userId: 2 } };
    state.report.mockReset().mockResolvedValue({ month: "2026-02", rows: [], sumRow: { total: 0 } });
  });

  it("keeps login protection and AjaxResult data wrapper", async () => {
    state.authenticated = null;
    await expect(handler({})).resolves.toEqual({ code: 401, msg: "登录状态已过期" });
    state.authenticated = { session: { userId: 2 } };
    await expect(handler({})).resolves.toEqual({
      code: 200,
      msg: "操作成功",
      data: { month: "2026-02", rows: [], sumRow: { total: 0 } },
    });
  });
});
