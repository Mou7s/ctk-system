import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  requests: [],
  transaction: vi.fn(),
}));

vi.mock("../../server/utils/sqlserver.ts", () => ({
  sqlStringParameter(request, name, value) {
    request.params[name] = value;
    return request;
  },
  withK3SqlServerTransaction: state.transaction,
}));

describe("Nitro updateTimeOfGXLL SQL utility", () => {
  let updateTimeOfGXLL;

  beforeEach(async () => {
    state.requests = [];
    state.transaction.mockReset().mockImplementation(async (callback) => {
      const transaction = {
        request() {
          const request = {
            params: {},
            query: vi.fn(async (query) => {
              state.requests.push({ query, params: { ...request.params } });
              return { rowsAffected: [state.requests.length + 2] };
            }),
          };
          return request;
        },
      };
      return callback(transaction);
    });

    ({ updateTimeOfGXLL } = await import("../../server/utils/execute-sql.ts"));
  });

  it("runs all three updates in one transaction with a parameterized month pattern", async () => {
    await expect(updateTimeOfGXLL("2026-08")).resolves.toEqual({
      date: "2026-08",
      success: true,
      reportDateUpdated: 3,
      llResetCount: 4,
      unpickedMarkedCount: 5,
      message: "执行未领料信息成功",
    });

    expect(state.transaction).toHaveBeenCalledTimes(1);
    expect(state.requests).toHaveLength(3);
    expect(state.requests.every(({ params }) => params.monthPattern === "2026-08%"))
      .toBe(true);
    expect(state.requests.every(({ query }) => query.includes("@monthPattern")))
      .toBe(true);
    expect(state.requests.every(({ query }) => !query.includes("2026-08")))
      .toBe(true);
  });

  it("rejects invalid months before opening a SQL transaction", async () => {
    await expect(updateTimeOfGXLL("2026-13")).rejects.toThrow("月份格式不正确");
    expect(state.transaction).not.toHaveBeenCalled();
  });
});
