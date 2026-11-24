import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  authenticated: { session: { userId: 1 } },
  query: { pageNum: "1", pageSize: "20" },
  pool: { query: vi.fn() },
}));

vi.mock("h3", () => ({ getQuery: vi.fn(() => state.query) }));
vi.mock("../../server/utils/auth.ts", () => ({
  getAuthSession: vi.fn(async () => state.authenticated),
}));
vi.mock("../../server/utils/mysql.ts", () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}));

vi.mock("../../server/utils/sqlserver.ts", () => ({
  queryK3SqlServer: vi.fn(async () => [{ number: "FIN" }]),
}));

describe("Nitro kucun read routes", () => {
  let listHandler;
  let summaryHandler;
  let totalsHandler;
  let lastSyncHandler;

  beforeAll(async () => {
    globalThis.defineEventHandler = (handler) => handler;
    listHandler = (await import("../../server/routes/prod-api/tk_custom/kucun/list.get.ts")).default;
    summaryHandler = (await import("../../server/routes/prod-api/tk_custom/kucun/list_sum.get.ts")).default;
    totalsHandler = (await import("../../server/routes/prod-api/tk_custom/kucun/list_sum_total.get.ts")).default;
    lastSyncHandler = (await import("../../server/routes/prod-api/tk_custom/kucun/lastSyncTime.get.ts")).default;
  });

  beforeEach(() => {
    state.authenticated = { session: { userId: 1 } };
    state.query = { pageNum: "1", pageSize: "20" };
    state.pool.query.mockReset();
  });

  it("requires a login session before querying the database", async () => {
    state.authenticated = null;

    await expect(summaryHandler({})).resolves.toEqual({ code: 401, msg: "登录状态已过期" });
    expect(state.pool.query).not.toHaveBeenCalled();
  });

  it("forces sales inventory scope on both count and rows despite client overrides", async () => {
    state.authenticated = { session: { userId: 2, roles: ["domestic_trade_sales", "inventory_viewer"] } };
    state.query = { allowedMaterials: ["RAW"] };
    state.pool.query.mockResolvedValueOnce([[{ total: 0 }], []]).mockResolvedValueOnce([[], []]);
    await summaryHandler({});
    for (const [options, params] of state.pool.query.mock.calls) {
      expect(options.sql).toContain("kd_wlbm IN (?)");
      expect(params).toContain("FIN");
      expect(params).not.toContain("RAW");
    }
  });

  it("returns the paged customer-stock summary with the legacy table shape", async () => {
    state.query = { pageNum: "2", pageSize: "20", kdWlbm: "M-" };
    state.pool.query
      .mockResolvedValueOnce([[{ total: 641 }], []])
      .mockResolvedValueOnce([[{
        kd_wlbm: "M-001",
        kd_wumc: "物料",
        kd_ggxh: "规格",
        kd_cangku_name: "D栋二楼",
        kd_kuwei_name: "A01",
        kdChukuNumber: "12.500",
      }], []]);

    await expect(summaryHandler({})).resolves.toEqual({
      code: 200,
      msg: "查询成功",
      rows: [{
        kdWlbm: "M-001",
        kdWumc: "物料",
        kdGgxh: "规格",
        kdCangkuName: "D栋二楼",
        kdKuweiName: "A01",
        kdChukuNumber: "12.500",
      }],
      total: 641,
    });
    expect(state.pool.query).toHaveBeenCalledTimes(2);
    expect(state.pool.query.mock.calls[0][0].sql).toContain("status = ?");
    expect(state.pool.query.mock.calls[0][1]).toEqual(["C", "M-"]);
    expect(state.pool.query.mock.calls[1][1]).toEqual(["C", "M-", 20, 20]);
  });

  it("keeps totals raw and returns the latest sync timestamp as AjaxResult data", async () => {
    state.pool.query
      .mockResolvedValueOnce([[{ xsth: "-115.5", xsch: "1000.25" }], []])
      .mockResolvedValueOnce([[{ syncTime: new Date("2026-08-11T08:20:00.000Z") }], []]);

    await expect(totalsHandler({})).resolves.toEqual({ xsth: -115.5, xsch: 1000.25, total: 884.75 });
    await expect(lastSyncHandler({})).resolves.toEqual({
      code: 200,
      msg: "操作成功",
      data: new Date("2026-08-11T08:20:00.000Z"),
    });
  });

  it("returns detail rows using the same code/msg/rows/total contract", async () => {
    state.query = { pageNum: "1", pageSize: "1000", kdWlbm: "M-001", status: "C" };
    state.pool.query
      .mockResolvedValueOnce([[{ total: 1 }], []])
      .mockResolvedValueOnce([[{ kd_billno: "XSTH001", kd_chuku_number: "-2" }], []]);

    await expect(listHandler({})).resolves.toEqual({
      code: 200,
      msg: "查询成功",
      rows: [{ kdBillno: "XSTH001", kdChukuNumber: "-2" }],
      total: 1,
    });
  });
});

