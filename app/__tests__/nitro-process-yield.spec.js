import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  query: vi.fn(),
  requests: [],
}));

vi.mock("../../server/utils/sqlserver.ts", () => ({
  queryK3SqlServer: state.query,
  sqlStringParameter: vi.fn((request, name, value) => request.input(name, "string", value)),
  sqlBigIntParameter: vi.fn((request, name, value) => request.input(name, "bigint", value)),
}));

describe("Nitro SQL Server process-yield dashboard", () => {
  let queryProcessYieldDashboard;
  let queryProcessYieldPlanDetails;
  let queryProcessYieldData;
  let queryStockInAchievementData;
  let normalizeProcessYieldThreshold;

  beforeEach(async () => {
    state.requests = [];
    state.query.mockReset().mockImplementation(async (execute) => {
      const request = { input: vi.fn().mockReturnThis(), query: vi.fn().mockResolvedValue({ recordset: [
        {
          packageName: "SOT-23",
          packagingInputQty: "100",
          packagingReportInputQty: "90",
          packagingQualifiedQty: "88",
          packagingPlanCount: 2,
          packagingPassedPlanCount: 1,
          testingPreviousInputQty: "80",
          testingStraightThroughQty: "78",
          testingInputQty: "80",
          testingQualifiedQty: "78",
          testingPlanCount: 1,
          testingPassedPlanCount: 1,
        },
      ] }) };
      state.requests.push(request);
      const result = await execute(request);
      return result.recordset || [];
    });
    ({ queryProcessYieldDashboard, queryProcessYieldPlanDetails, queryProcessYieldData, queryStockInAchievementData, normalizeProcessYieldThreshold } = await import("../../server/utils/process-yield.ts"));
  });

  it("keeps SQL Server dashboard metrics, threshold binding, and summary shape", async () => {
    const result = await queryProcessYieldDashboard({
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      threshold: "98.5",
    });

    expect(result.rows).toEqual([expect.objectContaining({ packageName: "SOT-23", packagingQualifiedQty: 88, testingQualifiedQty: 78 })]);
    expect(result.summary).toMatchObject({ packageCount: 1, packagingInputQty: 100, testingInputQty: 80 });
    const request = state.requests[0];
    expect(request.input).toHaveBeenCalledWith("startDate", "string", "2026-01-01 00:00:00");
    expect(request.input).toHaveBeenCalledWith("endDate", "string", "2026-01-31 23:59:59");
    expect(request.input).toHaveBeenCalledWith("thresholdRatio", "string", "0.985");
    expect(request.query.mock.calls[0][0]).toContain("T_SFC_OPTRPT");
    expect(request.query.mock.calls[0][0]).toContain("F_UNW_QTY_83G");
  });

  it("sums decimal dashboard quantities without binary floating-point drift", async () => {
    state.query.mockReset().mockImplementation(async (execute) => {
      const request = {
        input: vi.fn().mockReturnThis(),
        query: vi.fn().mockResolvedValue({ recordset: [
          { packageName: "SOT-23", packagingInputQty: "0.1", packagingReportInputQty: "0", packagingQualifiedQty: "0", testingPreviousInputQty: "0", testingStraightThroughQty: "0", testingInputQty: "0", testingQualifiedQty: "0" },
          { packageName: "SOD-323", packagingInputQty: "0.2", packagingReportInputQty: "0", packagingQualifiedQty: "0", testingPreviousInputQty: "0", testingStraightThroughQty: "0", testingInputQty: "0", testingQualifiedQty: "0" },
        ] }),
      };
      const result = await execute(request);
      return result.recordset || [];
    });

    const result = await queryProcessYieldDashboard({ startDate: "2026-01-01", endDate: "2026-01-31" });

    expect(result.summary.packagingInputQty).toBe(0.3);
  });

  it("normalizes threshold bounds and rejects reversed dates before SQL Server", async () => {
    expect(normalizeProcessYieldThreshold("-3")).toBe(0);
    expect(normalizeProcessYieldThreshold("120")).toBe(100);
    expect(normalizeProcessYieldThreshold("not-a-number")).toBe(97.5);
    await expect(queryProcessYieldDashboard({ startDate: "2026-02-01", endDate: "2026-01-01" }))
      .rejects.toThrow("结束日期不能早于开始日期");
    expect(state.query).not.toHaveBeenCalled();
  });

  it("keeps paged packaging plan details, metrics, statuses, and bound parameters", async () => {
    state.query.mockReset().mockImplementation(async (execute) => {
      const request = {
        input: vi.fn().mockReturnThis(),
        query: vi.fn().mockResolvedValue({ recordset: [{
          planId: "101",
          planNo: "OP202601001",
          moNumber: "MO202601001",
          moEntrySeq: "2",
          orderDate: "2026-01-01",
          materialNumber: "MAT001",
          materialName: "测试物料",
          packageName: "SOT-23",
          solidCrystalInputQty: "100",
          packagingInputQty: "95",
          packagingQualifiedQty: "90",
          packagingReportDate: "2026-01-02 10:00:00",
          totalCount: "21",
        }] }),
      };
      state.requests.push(request);
      const result = await execute(request);
      return result.recordset || [];
    });

    const result = await queryProcessYieldPlanDetails({
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      packageName: "SOT-23",
      planNo: "202601",
      pageNum: 2,
      pageSize: 10,
      threshold: "98.5",
    });

    expect(result).toMatchObject({ total: 21, pageNum: 2, pageSize: 10 });
    expect(result.rows[0]).toMatchObject({
      planId: 101,
      moEntrySeq: 2,
      packagingQualifiedRate: 94.7368,
      packagingRate: 90,
      packagingStatus: "已汇报未达标",
      testingStatus: "无投入数据",
      overallStatus: "已汇报未达标",
    });
    const request = state.requests[0];
    expect(request.input).toHaveBeenCalledWith("packageName", "string", "SOT-23");
    expect(request.input).toHaveBeenCalledWith("planNo", "string", "202601");
    expect(request.input).toHaveBeenCalledWith("offset", "bigint", 10);
    expect(request.input).toHaveBeenCalledWith("endRow", "bigint", 20);
    expect(request.query.mock.calls[0][0]).toContain("T_SFC_OPERPLANNINGDETAIL");
    expect(request.query.mock.calls[0][0]).not.toContain("T_SFC_OPTRPT rpt");
  });

  it("switches plan detail SQL to testing and exposes testing quantities", async () => {
    state.query.mockReset().mockImplementation(async (execute) => {
      const request = {
        input: vi.fn().mockReturnThis(),
        query: vi.fn().mockResolvedValue({ recordset: [{
          planId: 102,
          planNo: "OP202601002",
          packageName: "LL-34",
          testingReportQualifiedQty: "80",
          testingTailQty: "3",
          testingIncreaseQty: "1",
          testingPreviousInputQty: "100",
          testingStraightThroughQty: "82",
          testingReportDate: "2026-01-03 10:00:00",
          totalCount: 1,
        }] }),
      };
      state.requests.push(request);
      const result = await execute(request);
      return result.recordset || [];
    });

    const result = await queryProcessYieldPlanDetails({ metricKey: "testing", pageSize: 10 });

    expect(result.rows[0]).toMatchObject({
      testingReportQualifiedQty: 80,
      testingTailQty: 3,
      testingIncreaseQty: 1,
      testingStraightThroughQty: 82,
      testingRate: 82,
      testingStatus: "已汇报",
    });
    expect(requestQuery(state.requests[0])).toContain("T_SFC_OPTRPT rpt");
    expect(requestQuery(state.requests[0])).toContain("F_UNW_QTY_YIU");
  });

  it("keeps the legacy process-yield array fields and optional filters", async () => {
    state.query.mockReset().mockImplementation(async (execute) => {
      const request = {
        input: vi.fn().mockReturnThis(),
        query: vi.fn().mockResolvedValue({ recordset: [
          { reportDate: "2026-01-03", packageType: "玻封", processName: "测试分选", totalQua: "80.5", totalFail: "2" },
          { reportDate: "2026-01-03", packageType: "塑封", processName: "", totalQua: "1", totalFail: "0" },
        ] }),
      };
      state.requests.push(request);
      const result = await execute(request);
      return result.recordset || [];
    });

    const result = await queryProcessYieldData({
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      processName: "测试",
      packageType: "玻封",
    });

    expect(result).toEqual([{ reportDate: "2026-01-03", packageType: "玻封", processName: "测试分选", totalQua: 80.5, totalFail: 2 }]);
    const request = state.requests[0];
    expect(request.input).toHaveBeenCalledWith("processName", "string", "测试");
    expect(request.input).toHaveBeenCalledWith("packageType", "string", "玻封");
    expect(requestQuery(request)).toContain("T_SFC_OPTRPTENTRY_A");
    expect(requestQuery(request)).toContain("ORDER BY reportDate DESC");
  });

  it("keeps stock-in achievement plan quantities and package normalization", async () => {
    state.query.mockReset().mockImplementation(async (execute) => {
      const request = {
        input: vi.fn().mockReturnThis(),
        query: vi.fn().mockResolvedValue({ recordset: [{
          planId: "1001",
          billNo: "GX202601001",
          packageName: "LL-34",
          inputQty: "100",
          stockInQty: "98",
          csfxInputQty: "90",
          csfxQualifiedQty: "88",
        }] }),
      };
      state.requests.push(request);
      const result = await execute(request);
      return result.recordset || [];
    });

    const result = await queryStockInAchievementData({ startDate: "2026-01-01", endDate: "2026-01-31" });

    expect(result).toEqual([{
      planId: 1001,
      billNo: "GX202601001",
      packageName: "LL-34",
      inputQty: 100,
      stockInQty: 98,
      csfxInputQty: 90,
      csfxQualifiedQty: 88,
    }]);
    const request = state.requests[0];
    expect(request.input).toHaveBeenCalledWith("startDate", "string", "2026-01-01 00:00:00");
    expect(request.input).toHaveBeenCalledWith("endDate", "string", "2026-01-31 23:59:59");
    expect(requestQuery(request)).toContain("WITH query_params");
    expect(requestQuery(request)).toContain("date_plans");
  });
});

function requestQuery(request) {
  return request.query.mock.calls[0][0];
}
