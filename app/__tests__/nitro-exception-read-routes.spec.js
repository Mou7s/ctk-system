import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { withQuery } from "ufo";

const state = vi.hoisted(() => ({
  authenticated: { session: { userId: 1 } },
  query: { pageNum: "1", pageSize: "1", delFlag: "0" },
  body: "",
  id: "id-1",
  setResponseHeader: vi.fn(),
  pool: { query: vi.fn() },
}));

vi.mock("h3", () => ({
  getQuery: vi.fn(() => state.query),
  getRouterParam: vi.fn((_event, name) => name === "id" ? state.id : undefined),
  readBody: vi.fn(async () => state.body),
  setResponseHeader: vi.fn((event, name, value) => state.setResponseHeader(event, name, value)),
}));
vi.mock("../../server/utils/auth.ts", () => ({ getAuthSession: vi.fn(async () => state.authenticated) }));
vi.mock("../../server/utils/mysql.ts", () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}));

globalThis.defineEventHandler = (handler) => handler;

describe("Nitro exception read routes", () => {
  let listHandler;
  let detailHandler;
  let exportHandler;
  let statsHandler;
  let dashboardHandler;
  let consoleError;

  beforeAll(async () => {
    ({ default: listHandler } = await import("../../server/routes/prod-api/tk_custom/exception/list.get.ts"));
    ({ default: detailHandler } = await import("../../server/routes/prod-api/tk_custom/exception/[id].get.ts"));
    ({ default: exportHandler } = await import("../../server/routes/prod-api/tk_custom/exception/export.post.ts"));
    ({ default: statsHandler } = await import("../../server/routes/prod-api/tk_custom/exception/stats.get.ts"));
    ({ default: dashboardHandler } = await import("../../server/routes/prod-api/tk_custom/exception/dashboard.get.ts"));
  });

  beforeEach(() => {
    state.authenticated = { session: { userId: 1 } };
    state.query = { pageNum: "1", pageSize: "1", delFlag: "0" };
    state.body = "";
    state.setResponseHeader.mockReset();
    state.pool.query.mockReset();
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => consoleError.mockRestore());

  it("applies the page's selected date range after GET serialization and clears it on reset", async () => {
    const page = readFileSync(new URL("../pages/tk_custom/exception/index.vue", import.meta.url), "utf8");
    const builder = page.match(/function buildExceptionQuery\(\) \{([\s\S]*?)\n\}/)[1];
    const dates = { value: ["2026-09-01", "2026-09-30"] };
    const buildQuery = new Function("queryParams", "dateRangeArray", builder);
    const queryParams = { value: { pageNum: 1, pageSize: 50, planNo: "MO1" } };
    expect(page).toContain("listException(buildExceptionQuery())");
    expect(page).toContain("const exportParams = buildExceptionQuery()");
    for (const selected of [true, false]) {
      if (!selected) dates.value = [];
      const url = new URL(withQuery("https://example.test/list", buildQuery(queryParams, dates)));
      state.query = Object.fromEntries(url.searchParams);
      state.pool.query.mockReset();
      state.pool.query.mockResolvedValueOnce([[{ total: 0 }], []]).mockResolvedValueOnce([[], []]);
      await listHandler({});
      const [options, values] = state.pool.query.mock.calls[0];
      expect(options.sql.includes("DATE_FORMAT(occur_date, '%Y-%m-%d') >= ?")).toBe(selected);
      expect(options.sql.includes("DATE_FORMAT(occur_date, '%Y-%m-%d') <= ?")).toBe(selected);
      expect(values).toEqual(selected ? ["0", "MO1", "2026-09-01", "2026-09-30"] : ["0", "MO1"]);
    }
  });

  it("keeps list pagination, filters, display fields, and Java-compatible row shape", async () => {
    state.pool.query
      .mockResolvedValueOnce([[{ total: 1 }], []])
      .mockResolvedValueOnce([[{
        id: "id-1",
        report_no: "ER20260811001",
        report_date: "2026-08-11",
        occur_date: "2026-08-11",
        batch_defect_total: "10.000",
        batch_unit: "PCS",
        sample_qty: "100.00",
        sample_unit: null,
        defect_qty: "2.50",
        defect_unit: "PCS",
        defect_rate: "0.0250",
        status: "0",
        del_flag: "0",
      }], []]);
    const result = await listHandler({});
    expect(result).toEqual(expect.objectContaining({ code: 200, msg: "查询成功", total: 1 }));
    expect(result.rows[0]).toEqual(expect.objectContaining({
      id: "id-1",
      batchDefectTotal: 10,
      batchDefectTotalDisplay: "10 PCS",
      sampleQty: 100,
      sampleQtyDisplay: "100 PCS",
      defectQty: 2.5,
      defectQtyDisplay: "2.5 PCS",
      defectRate: 0.025,
      defectRatePercent: "2.50%",
      exportIds: null,
    }));
    const select = state.pool.query.mock.calls[1];
    expect(select[0].sql).toContain("del_flag = ?");
    expect(select[0].sql).toContain("ORDER BY report_no DESC, create_time DESC, id DESC LIMIT ?, ?");
    expect(select[1].slice(-2)).toEqual([0, 1]);
  });

  it("returns Java-compatible dashboard statistics and protects both reads", async () => {
    state.pool.query
      .mockResolvedValueOnce([[{ name: "人", value: 2 }], []])
      .mockResolvedValueOnce([[{ name: "固晶", value: 2 }], []])
      .mockResolvedValueOnce([[{ day: "2026-08-11", value: 2 }], []]);
    await expect(statsHandler({})).resolves.toEqual({
      code: 200,
      msg: "操作成功",
      data: {
        category: [{ name: "人", value: 2 }],
        process: [{ name: "固晶", value: 2 }],
        trend: [{ day: "2026-08-11", value: 2 }],
      },
    });

    state.authenticated = null;
    await expect(listHandler({})).resolves.toEqual({ code: 401, msg: "登录状态已过期" });
    await expect(statsHandler({})).resolves.toEqual({ code: 401, msg: "登录状态已过期" });
  });

  it("returns bounded dashboard aggregates for the selected range", async () => {
    state.query = { days: "7" };
    state.pool.query
      .mockResolvedValueOnce([[{ total: "4", today: "1", pending: "1", processing: "1", resolved: "2" }], []])
      .mockResolvedValueOnce([[{ day: "2026-08-14", total: "2", pending: "1", processing: "1", resolved: "0" }], []])
      .mockResolvedValueOnce([[{ name: "P", total: "2", pending: "1" }], []])
      .mockResolvedValueOnce([[{ name: "固晶", total: "2", pending: "1" }], []])
      .mockResolvedValueOnce([[{ name: "3#", total: "2", pending: "1" }], []])
      .mockResolvedValueOnce([[{ name: "H5119L", total: "2", pending: "1" }], []])
      .mockResolvedValueOnce([[{
        id: "id-1",
        report_no: "ER20260814001",
        plan_no: "TX084273",
        occur_date: "2026-08-14",
        process_name: "固晶",
        machine_no: "3#",
        product_name: "H5119L",
        product_spec: "SOT23-6L",
        defect_item: "偏片",
        defect_category: "P",
        risk_batch: "RB001",
        status: "0",
        create_time: "2026-08-14 09:00:00",
      }], []]);

    const result = await dashboardHandler({});
    expect(result).toEqual(expect.objectContaining({ code: 200, msg: "操作成功" }));
    expect(result.data).toEqual(expect.objectContaining({
      period: expect.objectContaining({ days: 7 }),
      summary: { total: 4, today: 1, pending: 1, processing: 1, resolved: 2, resolutionRate: 0.5 },
      trend: [{ day: "2026-08-14", total: 2, pending: 1, processing: 1, resolved: 0 }],
      category: [{ name: "P", total: 2, pending: 1 }],
      process: [{ name: "固晶", total: 2, pending: 1 }],
      machine: [{ name: "3#", total: 2, pending: 1 }],
      product: [{ name: "H5119L", total: 2, pending: 1 }],
      latest: [expect.objectContaining({ reportNo: "ER20260814001", status: "0" })],
    }));
    const sql = state.pool.query.mock.calls.map(([options]) => options.sql).join("\n");
    expect(sql).toContain("INTERVAL 6 DAY");
    expect(sql).toContain("status IN ('0', '1')");
    expect(sql).toContain("LIMIT 12");
  });

  it("validates dashboard ranges and keeps the authentication boundary", async () => {
    state.query = { days: "14" };
    await expect(dashboardHandler({})).resolves.toEqual({ code: 400, msg: "时间范围只支持 7、30 或 90 天" });
    expect(state.pool.query).not.toHaveBeenCalled();

    state.query = { days: "30" };
    state.authenticated = null;
    await expect(dashboardHandler({})).resolves.toEqual({ code: 401, msg: "登录状态已过期" });
  });

  it("returns Java-compatible detail fields and display values", async () => {
    state.id = "id-1";
    state.pool.query
      .mockReset()
      .mockResolvedValueOnce([[{
        id: "id-1",
        report_no: "ER20260811001",
        report_date: "2026-08-11",
        occur_date: "2026-08-11",
        batch_defect_total: "10.000",
        batch_unit: "PCS",
        sample_qty: "100.00",
        sample_unit: null,
        defect_qty: "2.50",
        defect_unit: "PCS",
        defect_rate: "0.0250",
        del_flag: "0",
      }], []]);

    const result = await detailHandler({});
    expect(result).toEqual(expect.objectContaining({ code: 200, msg: "操作成功" }));
    expect(result.data).toEqual(expect.objectContaining({
      id: "id-1",
      reportNo: "ER20260811001",
      batchDefectTotal: 10,
      batchDefectTotalDisplay: "10 PCS",
      sampleQty: 100,
      sampleQtyDisplay: "100 PCS",
      defectQty: 2.5,
      defectQtyDisplay: "2.5 PCS",
      defectRate: 0.025,
      defectRatePercent: "2.50%",
      exportIds: null,
    }));
    expect(state.pool.query.mock.calls[0][1]).toEqual(["id-1"]);
  });

  it("returns null for a missing detail and keeps the auth boundary", async () => {
    state.id = "missing";
    state.pool.query.mockReset().mockResolvedValueOnce([[], []]);
    await expect(detailHandler({})).resolves.toEqual({ code: 200, msg: "操作成功", data: null });

    state.authenticated = null;
    await expect(detailHandler({})).resolves.toEqual({ code: 401, msg: "登录状态已过期" });
  });

  it("exports the Java-compatible filtered Excel columns and conversions", async () => {
    state.query = { delFlag: "0" };
    state.body = "exportIds=id-1%2Cid-2&status=2";
    state.pool.query
      .mockReset()
      .mockResolvedValueOnce([[{ total: 1 }], []])
      .mockResolvedValueOnce([[{
        id: "id-1",
        report_no: "ER20260811001",
        report_date: "2026-08-11",
        occur_date: "2026-08-11",
        batch_defect_total: "10.000",
        batch_unit: "PCS",
        sample_qty: "100.00",
        sample_unit: null,
        defect_qty: "2.50",
        defect_unit: "PCS",
        defect_rate: "0.0250",
        defect_category: "P",
        status: "2",
        del_flag: "0",
      }], []]);

    const result = await exportHandler({});
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.subarray(0, 2).toString()).toBe("PK");
    expect(state.pool.query.mock.calls[0][1]).toEqual(["0", "2", "id-1", "id-2"]);
    expect(state.pool.query.mock.calls[1][1].slice(-2)).toEqual([0, 5000]);
    expect(state.pool.query.mock.calls[1][0].sql).toContain("ORDER BY report_no DESC, create_time DESC, id DESC LIMIT ?, ?");
  });

  it("maps database failures to safe responses", async () => {
    state.pool.query.mockRejectedValueOnce(new Error("mysql://user:secret@example.test/app"));
    await expect(listHandler({})).resolves.toEqual({ code: 500, msg: "获取异常单列表失败" });
    expect(consoleError.mock.calls.flat().join(" ")).not.toContain("secret");
  });
});
