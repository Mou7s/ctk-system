import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  calls: [],
  executeBillQuery: vi.fn(),
}));

vi.mock("../../server/utils/k3.ts", () => ({ executeBillQuery: state.executeBillQuery }));

describe("Nitro K3Cloud QA shipping report", () => {
  let queryQaShippingReport;

  beforeEach(async () => {
    state.calls = [];
    state.executeBillQuery.mockReset().mockImplementation(async (input) => {
      state.calls.push(input);
      if (input.formId === "SAL_OUTSTOCK") {
        return [
          ["SO001", "10", "2026-02-01 09:00:00", "TO-252", "MAT001", "CUST0001"],
          ["SO002", "3", "2026-02-02 09:00:00", "LL-41", "NA001", "CUST0118"],
        ];
      }
      return [
        ["SR001", "2", "2026-02-01 10:00:00", "TO252", "MAT001", "CUST0001"],
        ["SR002", "1", "2026-02-03 10:00:00", "SOT-23", "MAT002", "CUST0001"],
      ];
    });
    ({ queryQaShippingReport } = await import("../../server/utils/qa-shipping.ts"));
  });

  it("keeps monthly rows, outbound/return classification, and K3 filters", async () => {
    const result = await queryQaShippingReport({ month: "2026-02" });

    expect(result.month).toBe("2026-02");
    expect(result.rows).toHaveLength(28);
    expect(result.rows[0]).toMatchObject({ date: "2026-02-01", to252: 8, total: 8 });
    expect(result.rows[1]).toMatchObject({ date: "2026-02-02", glassCK: 3, total: 3 });
    expect(result.rows[2]).toMatchObject({ date: "2026-02-03", plasticOut: -1, total: -1 });
    expect(result.sumRow).toMatchObject({ date: "月度累计", to252: 8, glassCK: 3, plasticOut: -1, total: 10 });
    expect(state.calls).toHaveLength(2);
    expect(state.calls[0]).toMatchObject({ formId: "SAL_OUTSTOCK", startRow: 0, limit: 1000 });
    expect(state.calls[1]).toMatchObject({ formId: "SAL_RETURNSTOCK", startRow: 0, limit: 1000 });
    expect(state.calls[0].filterString).toBe("FDate >= '2026-02-01 00:00:00' and FDate <= '2026-02-28 23:59:59' and FDocumentStatus = 'C'");
  });

  it("rejects malformed months before K3Cloud and preserves empty query results", async () => {
    await expect(queryQaShippingReport({ month: "2026-13" })).rejects.toThrow("月份格式不正确");
    expect(state.executeBillQuery).not.toHaveBeenCalled();

    state.executeBillQuery.mockResolvedValue([]);
    const result = await queryQaShippingReport({ month: "2026-02" });
    expect(result.rows.every((row) => row.total === 0)).toBe(true);
    expect(result.sumRow.total).toBe(0);
  });

  it("keeps Java classification semantics for untrimmed K3 fields", async () => {
    state.executeBillQuery.mockImplementation(async (input) => {
      if (input.formId === "SAL_OUTSTOCK") {
        return [
          ["SO003", "4", "2026-02-04 09:00:00", "SOT-23", " NA001", "CUST0001"],
          ["SO004", "5", "2026-02-05 09:00:00", " LL-41", "MAT003", " CUST0118"],
        ];
      }
      return [];
    });

    const result = await queryQaShippingReport({ month: "2026-02" });

    expect(result.rows[3]).toMatchObject({ plasticOut: 4, glassOut: 0, total: 4 });
    expect(result.rows[4]).toMatchObject({ glassOut: 5, glassCK: 0, total: 5 });
  });
});
