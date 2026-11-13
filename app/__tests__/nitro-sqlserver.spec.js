import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [],
  requests: [],
  query: vi.fn(),
  sqlDateParameter: vi.fn((request, name, value) => request.input(name, "date", value)),
  sqlStringParameter: vi.fn((request, name, value) => request.input(name, "string", value)),
}));

vi.mock("../../server/utils/sqlserver.ts", () => ({
  queryK3SqlServer: state.query,
  sqlDateParameter: state.sqlDateParameter,
  sqlStringParameter: state.sqlStringParameter,
  sqlParameterName: (prefix, index) => `${prefix}${index}`,
}));

describe("Nitro sales price trend SQL Server queries", () => {
  let querySalesPriceTrendOptions;
  let querySalesPriceTrend;

  beforeEach(async () => {
    state.rows = [];
    state.requests = [];
    state.query.mockReset().mockImplementation(async (execute) => {
      const request = {
        input: vi.fn().mockReturnThis(),
        query: vi.fn().mockResolvedValue({ recordset: state.rows }),
      };
      state.requests.push(request);
      const result = await execute(request);
      return result.recordset || [];
    });
    ({ querySalesPriceTrendOptions, querySalesPriceTrend } = await import("../../server/utils/sales-price-trend.ts"));
  });

  it("rejects invalid filters before opening SQL Server", async () => {
    await expect(querySalesPriceTrend({ beginDate: "2026-01-01", endDate: "2026-01-31" }))
      .rejects.toThrow("客户和物料至少选择一项");
    expect(state.query).not.toHaveBeenCalled();
  });

  it("keeps option keywords parameterized and maps empty results", async () => {
    const result = await querySalesPriceTrendOptions({ type: "customer", keyword: "客户'1", limit: "50" });
    const sql = state.requests[0].query.mock.calls[0][0];

    expect(result).toEqual([]);
    expect(sql).toContain("@keyword");
    expect(sql).not.toContain("客户'1");
    expect(state.sqlStringParameter).toHaveBeenCalledWith(expect.anything(), "keyword", "%客户'1%");
  });

  it("preserves the trend response shape and decimal changes", async () => {
    state.rows = [
      { billNo: "SO001", orderDate: "2026-01-01", customerNumber: "C001", customerName: "客户", materialNumber: "M001", materialName: "物料", qty: "10", preTaxPrice: "20", taxPrice: "22.6", amount: "226" },
      { billNo: "SO002", orderDate: "2026-01-15", customerNumber: "C001", customerName: "客户", materialNumber: "M001", materialName: "物料", qty: "8", preTaxPrice: "21", taxPrice: "23.73", amount: "189.84" },
    ];

    const result = await querySalesPriceTrend({
      customerNumbers: " C001 ",
      materialNumbers: "M001",
      beginDate: "2026-01-01",
      endDate: "2026-01-31",
    });
    const sql = state.requests[0].query.mock.calls[0][0];

    expect(result.seriesCount).toBe(1);
    expect(result.pointCount).toBe(2);
    expect(result.series[0].change).toEqual({
      preTax: 1,
      tax: 1.13,
      preTaxPercent: 5,
      taxPercent: 5,
    });
    expect(sql).toContain("@customer0");
    expect(sql).toContain("@material0");
    expect(sql).not.toContain("C001");
  });

  it("rejects an excessive customer-material combination before SQL Server", async () => {
    await expect(querySalesPriceTrend({
      customerNumbers: Array.from({ length: 15 }, (_, index) => `C${index}`).join(","),
      materialNumbers: Array.from({ length: 14 }, (_, index) => `M${index}`).join(","),
      beginDate: "2026-01-01",
      endDate: "2026-01-31",
    })).rejects.toThrow("最多查询 200 条曲线");
    expect(state.query).not.toHaveBeenCalled();
  });
});
