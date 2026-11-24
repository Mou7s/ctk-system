import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx/xlsx.mjs";

const state = vi.hoisted(() => ({
  authenticated: { session: { userId: 1 } },
  query: {},
  body: "",
  report: { details: [] },
  hasFilter: vi.fn((query) => Boolean(query?.processName || query?.moNumber || query?.billNo || query?.materialKeyword)),
  weakMessage: null,
  runReport: vi.fn(async () => state.report),
  weakFilter: vi.fn(() => state.weakMessage),
  setResponseHeader: vi.fn(),
  SqlServerError: class SqlServerError extends Error {
    kind = "unavailable";
    statusCode = 502;
  },
}));

vi.mock("h3", () => ({
  getQuery: vi.fn(() => state.query),
  readBody: vi.fn(async () => state.body),
  setResponseHeader: state.setResponseHeader,
}));
vi.mock("../../server/utils/auth.ts", () => ({ getAuthSession: vi.fn(async () => state.authenticated) }));
vi.mock("../../server/utils/wip.ts", () => ({
  WipQueryLimitError: class WipQueryLimitError extends Error {},
  hasWipFilter: state.hasFilter,
  weakWipFilterMessage: state.weakFilter,
  WIP_FILTER_REQUIRED_MESSAGE: "请至少填写一个筛选条件后查询",
  queryWipReport: state.runReport,
}));
vi.mock("../../server/utils/sqlserver.ts", () => ({ SqlServerError: state.SqlServerError }));

globalThis.defineEventHandler = (handler) => handler;

function rowsOf(result) {
  const workbook = XLSX.read(Buffer.from(result), { type: "buffer" });
  return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, raw: true, defval: "" });
}

describe("Nitro WIP Excel export route", () => {
  let handler;

  beforeAll(async () => {
    handler = (await import("../../server/routes/prod-api/tk_custom/wip/export.post.ts")).default;
  });

  beforeEach(() => {
    state.authenticated = { session: { userId: 1 } };
    state.query = { processName: "固晶" };
    state.body = "onlyPositive=true";
    state.weakMessage = null;
    state.runReport.mockClear();
    state.report = {
      details: [{
        processNumber: "10", processName: "固晶", materialNumber: "M001", materialName: "物料", specification: "规格",
        wipQty: 40, moNumber: "MO001", moEntrySeq: "1", billNo: "OP001", operQty: 100, qualifiedQty: 100,
        transInQty: 0, transOutQty: 0, nextReceivedQty: 60, departmentName: "车间", routeName: "路线", lastReportTime: "2026-08-12",
      }],
    };
    state.setResponseHeader.mockReset();
  });

  it("keeps Java WipDetailVo columns, adds the package type, and merges filters", async () => {
    const result = await handler({});

    expect(rowsOf(result)).toEqual([
      ["工序号", "当前工序", "物料编码", "物料名称", "规格型号", "封装类型", "在制数量", "生产订单号", "生产订单行号", "流程单号", "工序数量", "合格数量", "转入数量", "转出数量", "下一工序已接收", "加工车间", "工艺路线", "最后汇报时间", "汇报状态"],
      ["10", "固晶", "M001", "物料", "规格", "", 40, "MO001", "1", "OP001", 100, 100, 0, 0, 60, "车间", "路线", "2026-08-12", "已汇报"],
    ]);
    expect(decodeURIComponent(state.setResponseHeader.mock.calls[1][2])).toContain("车间半成品在制明细.xlsx");
  });

  it("marks unreported operation rows in the exported status column", async () => {
    state.report = {
      details: [
        { processNumber: "10", processName: "固晶", wipQty: 65.82, packageType: "玻封", moNumber: "MO002", moEntrySeq: "1", billNo: "TX001", operQty: 65.82, qualifiedQty: 0, transInQty: 0, transOutQty: 0, nextReceivedQty: 0, unreported: true },
      ],
    };

    const rows = rowsOf(await handler({}));
    expect(rows[1][5]).toBe("玻封");
    expect(rows[1][6]).toBe(65.82);
    expect(rows[1][18]).toBe("未汇报");
  });

  it("enforces authentication and hides SQL Server failures", async () => {
    state.authenticated = null;
    await expect(handler({})).resolves.toEqual({ code: 401, msg: "登录状态已过期" });

    state.authenticated = { session: { userId: 1 } };
    state.report = Promise.reject(new state.SqlServerError("SQL Server unavailable"));
    await expect(handler({})).resolves.toMatchObject({ code: 502, msg: "SQL Server unavailable" });
  });

  it("rejects an empty export filter before querying SQL Server", async () => {
    state.query = { onlyPositive: "true" };
    state.body = "";

    await expect(handler({})).resolves.toEqual({
      code: 400,
      msg: "请至少填写一个筛选条件后查询",
    });
  });

  it("rejects a weak export filter and ignores list pagination", async () => {
    state.query = { materialKeyword: "1", page: "2", pageSize: "10" };
    state.body = "";
    state.weakMessage = "筛选条件太宽泛，请至少输入2个字符后再查询";

    await expect(handler({})).resolves.toEqual({
      code: 400,
      msg: "筛选条件太宽泛，请至少输入2个字符后再查询",
    });
    expect(state.runReport).not.toHaveBeenCalled();
  });

  it("exports the full filtered set without pagination truncation", async () => {
    state.query = { moNumber: "MO001", page: "2", pageSize: "1" };
    state.body = "";

    const result = await handler({});
    expect(state.runReport).toHaveBeenCalledWith(
      expect.not.objectContaining({ page: expect.anything(), pageSize: expect.anything() }),
      { fullExport: true },
    );
    expect(rowsOf(result).length).toBe(2);
  });
});
