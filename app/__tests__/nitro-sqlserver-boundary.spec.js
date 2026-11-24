import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  config: {
    sqlServerK3Host: "primary.test",
    sqlServerK3HostFallback: "fallback.test",
    sqlServerK3TlsServerName: "",
    sqlServerK3Port: 1433,
    sqlServerK3Database: "AIS_TEST",
    sqlServerK3User: "reader",
    sqlServerK3Password: "secret",
    sqlServerK3ConnectTimeoutMs: 1000,
    sqlServerK3RequestTimeoutMs: 1000,
    sqlServerK3PoolMax: 2,
  },
  connectPlan: [],
  pools: [],
  request: null,
}));

vi.mock("../../server/utils/runtime.ts", () => ({
  getNitroServerConfig: () => state.config,
}));

vi.mock("mssql", () => ({
  default: {
    NVarChar: () => "nvarchar",
    Date: "date",
    Int: "int",
    ConnectionPool: class MockConnectionPool {
      connected = false;
      config;
      constructor(config) {
        this.config = config;
        state.pools.push(this);
      }
      async connect() {
        const result = state.connectPlan.shift();
        if (result instanceof Error) throw result;
        this.connected = true;
        return this;
      }
      async close() {
        this.connected = false;
      }
      request() {
        return state.request;
      }
    },
  },
}));

describe("Nitro SQL Server connection boundary", () => {
  let getK3SqlServerPool;
  let queryK3SqlServer;
  let SqlServerError;

  beforeEach(async () => {
    state.config.sqlServerK3Host = "primary.test";
    state.config.sqlServerK3HostFallback = "fallback.test";
    state.config.sqlServerK3TlsServerName = "";
    state.connectPlan = [];
    state.pools = [];
    state.request = { query: vi.fn() };
    globalThis.__nitroSqlServerK3Pool = undefined;
    globalThis.__nitroSqlServerK3Host = undefined;
    globalThis.__nitroSqlServerK3Connect = undefined;
    ({ getK3SqlServerPool, queryK3SqlServer, SqlServerError } = await import("../../server/utils/sqlserver.ts"));
  });

  it("reports missing configuration separately from no-data results", async () => {
    state.config.sqlServerK3Host = "";
    state.config.sqlServerK3HostFallback = "";
    await expect(getK3SqlServerPool()).rejects.toMatchObject({ kind: "config", statusCode: 503 });
  });

  it("uses the configured fallback host after a connection failure", async () => {
    const failure = Object.assign(new Error("socket failure"), { code: "ESOCKET" });
    state.connectPlan = [failure, undefined];

    const pool = await getK3SqlServerPool();

    expect(pool.config.server).toBe("fallback.test");
    expect(state.pools.map((item) => item.config.server)).toEqual(["primary.test", "fallback.test"]);
  });

  it("passes an explicit TLS server name when an IP endpoint needs SNI", async () => {
    state.config.sqlServerK3TlsServerName = "sqlserver.internal.test";
    state.connectPlan = [undefined];

    await getK3SqlServerPool();

    expect(state.pools[0].config.options.serverName).toBe("sqlserver.internal.test");
  });

  it("classifies a request timeout as a 504 dependency error", async () => {
    const timeout = Object.assign(new Error("request timeout"), { code: "ETIMEOUT" });
    state.connectPlan = [undefined];
    state.request.query.mockRejectedValue(timeout);

    await expect(queryK3SqlServer((request) => request.query("SELECT 1")))
      .rejects.toMatchObject({ kind: "timeout", statusCode: 504 });
    await expect(queryK3SqlServer((request) => request.query("SELECT 1")))
      .rejects.toBeInstanceOf(SqlServerError);
  });
});
