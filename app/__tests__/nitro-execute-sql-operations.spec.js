import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  transaction: vi.fn(),
  transactionRequests: [],
  poolRequest: { query: vi.fn() },
  pool: { request: vi.fn() },
  getPool: vi.fn(),
}));

vi.mock("../../server/utils/sqlserver.ts", () => ({
  getK3SqlServerPool: state.getPool,
  sqlStringParameter: (request, name, value) => {
    request.params ||= {};
    request.params[name] = value;
    return request;
  },
  withK3SqlServerTransaction: state.transaction,
}));

describe("Nitro executeSql SQL operations", () => {
  let handleCBData;
  let buildIndexOfKingdee;
  let writeToMO;

  beforeEach(async () => {
    state.transactionRequests = [];
    state.poolRequest = { query: vi.fn() };
    state.pool.request.mockReset().mockReturnValue(state.poolRequest);
    state.getPool.mockReset().mockResolvedValue(state.pool);
    state.transaction.mockReset().mockImplementation(async (callback) => {
      const transaction = {
        request: vi.fn(() => {
          const request = {
            params: {},
            query: vi.fn(async (query) => {
              state.transactionRequests.push({ query, request });
              return { rowsAffected: [state.transactionRequests.length] };
            }),
          };
          return request;
        }),
      };
      return callback(transaction);
    });
    ({ handleCBData, buildIndexOfKingdee, writeToMO } = await import("../../server/utils/execute-sql.ts"));
  });

  it("runs both cost optimization statements in one transaction", async () => {
    const result = await handleCBData();
    expect(result).toMatchObject({ success: true, steps: [
      { name: "重建成本相关表索引", success: true },
      { name: "更新成本相关表统计信息", success: true },
    ] });
    expect(state.transaction).toHaveBeenCalledTimes(1);
    expect(state.transactionRequests).toHaveLength(2);
    expect(state.transactionRequests[0].query).toContain("ALTER INDEX ALL");
    expect(state.transactionRequests[1].query).toContain("UPDATE STATISTICS");
  });

  it("propagates the second SQL error so the transaction wrapper can roll back", async () => {
    state.transaction.mockImplementationOnce(async (callback) => callback({
      request: vi.fn()
        .mockImplementationOnce(() => ({ query: vi.fn().mockResolvedValue({ rowsAffected: [1] }) }))
        .mockImplementationOnce(() => ({ query: vi.fn().mockRejectedValue(new Error("statistics failed")) })),
    }));
    await expect(handleCBData()).rejects.toThrow("statistics failed");
  });

  it("returns the writeToMO affected row count and preserves the original predicate", async () => {
    const result = await writeToMO();
    expect(result).toMatchObject({ success: true, affectedRows: 1, steps: [{ affectedRows: 1 }] });
    expect(state.transactionRequests[0].query).toContain("F_GONGXUHAO IS NOT NULL");
  });

  it("uses one pool request for index rebuild and does not retry a query error", async () => {
    state.poolRequest.query.mockResolvedValueOnce({});
    const result = await buildIndexOfKingdee();
    expect(result).toMatchObject({ success: true, steps: [{ success: true }] });
    expect(state.getPool).toHaveBeenCalledTimes(1);
    expect(state.pool.request).toHaveBeenCalledTimes(1);
    expect(state.poolRequest.query).toHaveBeenCalledTimes(1);

    state.poolRequest.query.mockReset().mockRejectedValueOnce(new Error("DBCC failed"));
    await expect(buildIndexOfKingdee()).rejects.toThrow("DBCC failed");
    expect(state.poolRequest.query).toHaveBeenCalledTimes(1);
  });
});
