import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  demo: false,
  failHosts: [],
  connectionAttempts: [],
  createdPools: [],
  config: {
    mysqlUrl: "",
    mysqlHost: "192.0.2.10",
    mysqlHostFallback: "198.51.100.10",
    mysqlPort: 3306,
    mysqlUser: "app",
    mysqlPassword: "secret",
    mysqlDatabase: "wfs",
    mysqlConnectTimeoutMs: 5000,
    // demo 分支未在本用例触发，但保持一致以免遗漏字段。
    demoMysqlUrl: "",
    demoMysqlHost: "",
    demoMysqlPort: 3306,
    demoMysqlUser: "",
    demoMysqlPassword: "",
    demoMysqlDatabase: "",
  },
}));

vi.mock("../../server/utils/runtime.ts", () => ({
  getNitroServerConfig: () => state.config,
}));

vi.mock("../../server/utils/data-scope.ts", () => ({
  isDemoScope: () => state.demo,
}));

vi.mock("mysql2/promise", () => ({
  default: {
    createConnection: vi.fn(async (options) => {
      state.connectionAttempts.push(options.host);
      if (state.failHosts.includes(options.host)) {
        const error = new Error("connect ETIMEDOUT");
        error.code = "ETIMEDOUT";
        throw error;
      }
      return { ping: vi.fn(async () => {}), end: vi.fn(async () => {}) };
    }),
    createPool: vi.fn((options) => {
      const pool = {
        options,
        query: vi.fn(),
        execute: vi.fn(),
        getConnection: vi.fn(),
        end: vi.fn(async () => {}),
      };
      state.createdPools.push(pool);
      return pool;
    }),
  },
}));

async function loadMysql() {
  return import("../../server/utils/mysql.ts");
}

describe("Nitro MySQL host fallback", () => {
  beforeEach(() => {
    state.demo = false;
    state.failHosts = [];
    state.connectionAttempts = [];
    state.createdPools = [];
    state.config = {
      ...state.config,
      mysqlHost: "192.0.2.10",
      mysqlHostFallback: "198.51.100.10",
    };
    delete globalThis.__nitroMysqlPool;
    delete globalThis.__nitroMysqlDemoPool;
    delete globalThis.__nitroMysqlHost;
    delete globalThis.__nitroMysqlResolve;
  });

  it("dedupes and trims candidate hosts", async () => {
    state.config.mysqlHost = " 192.0.2.10 ";
    state.config.mysqlHostFallback = "192.0.2.10";
    const { mysqlHostCandidates } = await loadMysql();
    expect(mysqlHostCandidates()).toEqual(["192.0.2.10"]);
  });

  it("does not probe when no fallback is configured", async () => {
    state.config.mysqlHostFallback = "";
    const { resolveMysqlPoolHost } = await loadMysql();
    await expect(resolveMysqlPoolHost()).resolves.toBe("192.0.2.10");
    expect(state.connectionAttempts).toEqual([]);
  });

  it("keeps the primary host when it is reachable", async () => {
    const { getMysqlPool, resolveMysqlPoolHost } = await loadMysql();
    await expect(resolveMysqlPoolHost()).resolves.toBe("192.0.2.10");
    expect(state.connectionAttempts).toEqual(["192.0.2.10"]);
    expect(getMysqlPool().options.host).toBe("192.0.2.10");
  });

  it("falls back when the primary host is unreachable", async () => {
    state.failHosts = ["192.0.2.10"];
    const { getMysqlPool, resolveMysqlPoolHost } = await loadMysql();
    await expect(resolveMysqlPoolHost()).resolves.toBe("198.51.100.10");
    expect(state.connectionAttempts).toEqual(["192.0.2.10", "198.51.100.10"]);
    expect(getMysqlPool().options.host).toBe("198.51.100.10");
  });

  it("keeps the primary host when both endpoints fail", async () => {
    state.failHosts = ["192.0.2.10", "198.51.100.10"];
    const { getMysqlPool, resolveMysqlPoolHost } = await loadMysql();
    await expect(resolveMysqlPoolHost()).resolves.toBe("");
    expect(state.connectionAttempts).toEqual(["192.0.2.10", "198.51.100.10"]);
    expect(getMysqlPool().options.host).toBe("192.0.2.10");
  });

  it("shares a single probe across concurrent calls", async () => {
    const { resolveMysqlPoolHost } = await loadMysql();
    await Promise.all([resolveMysqlPoolHost(), resolveMysqlPoolHost()]);
    expect(state.connectionAttempts).toEqual(["192.0.2.10"]);
  });
});
