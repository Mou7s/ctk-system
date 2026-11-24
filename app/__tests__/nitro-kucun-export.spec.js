import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  authenticated: { session: { userId: 1 } },
  query: {},
  body: { kdWlbm: "NAD0010003" },
  pool: { query: vi.fn() },
  setResponseHeader: vi.fn(),
}));

vi.mock("h3", () => ({
  getQuery: vi.fn(() => state.query),
  readBody: vi.fn(async () => state.body),
  setResponseHeader: state.setResponseHeader,
}));
vi.mock("../../server/utils/auth.ts", () => ({
  getAuthSession: vi.fn(async () => state.authenticated),
}));
vi.mock("../../server/utils/mysql.ts", () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}));

describe("Nitro kucun Excel export", () => {
  let exportHandler;

  beforeAll(async () => {
    globalThis.defineEventHandler = (handler) => handler;
    exportHandler = (await import("../../server/routes/prod-api/tk_custom/kucun/export1.post.ts")).default;
  });

  beforeEach(() => {
    state.authenticated = { session: { userId: 1 } };
    state.query = {};
    state.body = { kdWlbm: "NAD0010003" };
    state.pool.query.mockReset();
    state.setResponseHeader.mockReset();
  });

  it("returns an auth error before reading stock data when unauthenticated", async () => {
    state.authenticated = null;

    await expect(exportHandler({ node: { req: { headers: {} } } })).resolves.toEqual({
      code: 401,
      msg: "登录状态已过期",
    });
    expect(state.pool.query).not.toHaveBeenCalled();
  });

  it("generates an XLSX binary response from the filtered Nitro query", async () => {
    state.pool.query.mockResolvedValueOnce([[
      {
        kd_wlbm: "NAD0010003",
        kd_wumc: "LL4148",
        kd_ggxh: "LL-34",
        kd_cangku_name: "18-20年呆滞小房间",
        kd_kuwei_name: "LL-34成品仓",
        kdChukuNumber: "192.5",
      },
    ], []]);

    const result = await exportHandler({ node: { req: { headers: {} } } });

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.subarray(0, 2).toString()).toBe("PK");
    expect(state.pool.query.mock.calls[0][1]).toEqual(["C", "NAD0010003"]);
    expect(state.setResponseHeader).toHaveBeenCalledWith(
      expect.anything(),
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  });
});

