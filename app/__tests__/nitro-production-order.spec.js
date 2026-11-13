import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  calls: [],
  executeBillQuery: vi.fn(),
}));

vi.mock("../../server/utils/k3.ts", () => ({
  executeBillQuery: state.executeBillQuery,
}));

const row = (overrides = {}) => [
  "MO001",
  "ENTRY001",
  "MO-001",
  "1",
  "2026-01-02",
  "M001",
  "物料",
  "SOT-23/红色",
  "100",
  "20",
  "10",
  "3",
  "C",
  "2026-01-03",
  "2026-01-04",
  ...[],
].map((value, index) => overrides[index] ?? value);

describe("Nitro K3Cloud production-order queries", () => {
  let queryProductionOrderList;
  let queryProductionOrderSummary;
  let buildProductionOrderFilter;

  beforeEach(async () => {
    state.calls = [];
    state.executeBillQuery.mockReset().mockImplementation(async (input) => {
      state.calls.push(input);
      return [];
    });
    ({ queryProductionOrderList, queryProductionOrderSummary, buildProductionOrderFilter } = await import("../../server/utils/production-order.ts"));
  });

  it("keeps production-order paging, filters, field shape, and K3 source", async () => {
    state.executeBillQuery.mockImplementationOnce(async (input) => {
      state.calls.push(input);
      return [
        row(),
        row({ 2: "MO-002", 13: "2026-01-05", 14: "" }),
      ];
    });

    const result = await queryProductionOrderList({
      pageNum: "2",
      pageSize: "10",
      billNo: "MO'001",
      material: "M001",
      status: "3",
      documentStatus: "c",
      beginDate: "2026-01-01",
      endDate: "2026-01-31",
    });

    expect(result).toMatchObject({ pageNum: 2, pageSize: 10, hasMore: false, source: "K3Cloud / PRD_MO" });
    expect(result.rows[0]).toMatchObject({ billNo: "MO-001", materialNumber: "M001", documentStatus: "C" });
    expect(state.calls[0]).toMatchObject({
      formId: "PRD_MO",
      startRow: 10,
      limit: 11,
      orderString: "FDate DESC,FBillNo DESC,FTreeEntity_FSeq ASC",
    });
    expect(state.calls[0].filterString).toContain("MO''001");
    expect(state.calls[0].filterString).toContain("FStatus='3'");
    expect(state.calls[0].filterString).toContain("FDocumentStatus='C'");
    expect(state.calls[0].fieldKeys).toContain("FMaterialId.FSpecification");
  });

  it("aggregates created and approved events with the Java summary contract", async () => {
    state.executeBillQuery.mockResolvedValueOnce([
      row({ 14: "" }),
      row({ 2: "MO-001", 13: "2026-01-03", 14: "2026-01-06", 7: "SOT-23/蓝色", 8: "50" }),
    ]);

    const result = await queryProductionOrderSummary({ beginDate: "2026-01-01", endDate: "2026-01-31" });

    expect(result.source).toBe("K3Cloud / PRD_MO");
    expect(result.sourceRowCount).toBe(2);
    expect(result.totals).toEqual({
      createdOrderCount: 1,
      createdQty: 150,
      approvedOrderCount: 1,
      approvedQty: 50,
    });
    expect(result.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ date: "2026-01-03", packageName: "SOT-23", createdQty: 150 }),
      expect.objectContaining({ date: "2026-01-06", packageName: "SOT-23", approvedQty: 50 }),
    ]));
  });

  it("rejects unsafe status and date filters before calling K3Cloud", async () => {
    expect(() => buildProductionOrderFilter({ status: "8" })).toThrow("生产状态参数不正确");
    expect(() => buildProductionOrderFilter({ beginDate: "2026-02-01", endDate: "2026-01-01" })).toThrow("结束日期不能早于开始日期");
    expect(state.executeBillQuery).not.toHaveBeenCalled();
  });
});
