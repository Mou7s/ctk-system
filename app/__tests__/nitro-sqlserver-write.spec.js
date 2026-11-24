import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  config: {
    sqlServerK3Host: "sql.test",
    sqlServerK3HostFallback: "",
    sqlServerK3TlsServerName: "",
    sqlServerK3Port: 1433,
    sqlServerK3Database: "AIS_TEST",
    sqlServerK3User: "user",
    sqlServerK3Password: "password",
    sqlServerK3ConnectTimeoutMs: 1000,
    sqlServerK3RequestTimeoutMs: 1000,
    sqlServerK3PoolMax: 2,
  },
  transaction: null,
}));

vi.mock("../../server/utils/runtime.ts", () => ({
  getNitroServerConfig: () => state.config,
}));
vi.mock("mssql", () => ({
  default: {
    NVarChar: "nvarchar",
    ConnectionPool: class MockConnectionPool {
      connected = false;
      async connect() { this.connected = true; return this; }
      async close() { this.connected = false; }
      transaction() { return state.transaction; }
      request() { return { input: vi.fn().mockReturnThis(), query: vi.fn() }; }
    },
  },
}));

describe("Nitro SQL Server write boundary", () => {
  let closeK3SqlServerPool;
  let getK3SqlServerPool;
  let withK3SqlServerTransaction;

  beforeEach(async () => {
    globalThis.__nitroSqlServerK3Pool = undefined;
    globalThis.__nitroSqlServerK3Host = undefined;
    globalThis.__nitroSqlServerK3Connect = undefined;
    state.transaction = {
      begin: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
    };
    ({ closeK3SqlServerPool, getK3SqlServerPool, withK3SqlServerTransaction } = await import("../../server/utils/sqlserver.ts"));
  });

  it("commits a successful mutation", async () => {
    const result = await withK3SqlServerTransaction(async () => "done");
    expect(result).toBe("done");
    expect(state.transaction.begin).toHaveBeenCalledTimes(1);
    expect(state.transaction.commit).toHaveBeenCalledTimes(1);
    expect(state.transaction.rollback).not.toHaveBeenCalled();
    await closeK3SqlServerPool();
  });

  it("rolls back and exposes the SQL failure without retrying", async () => {
    await expect(withK3SqlServerTransaction(async () => {
      throw new Error("write failed");
    })).rejects.toMatchObject({ kind: "query", statusCode: 502 });
    expect(state.transaction.begin).toHaveBeenCalledTimes(1);
    expect(state.transaction.commit).not.toHaveBeenCalled();
    expect(state.transaction.rollback).toHaveBeenCalledTimes(1);
    expect((await getK3SqlServerPool())).toBeDefined();
    await closeK3SqlServerPool();
  });
});
