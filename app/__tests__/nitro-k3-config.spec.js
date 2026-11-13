import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  config: {
    mysqlHost: "mysql.test",
    mysqlUrl: "",
    mysqlQueryTimeoutMs: 1000,
    k3BaseUrl: "",
    k3BaseUrlIntranet: "",
    k3DbId: "",
    k3Username: "",
    k3AppId: "",
    k3AppSecret: "",
    k3Lcid: 2052,
    k3ConnectTimeoutMs: 5000,
    k3RequestTimeoutMs: 30000,
  },
  pool: { query: vi.fn() },
}));

vi.mock("../../server/utils/runtime.ts", () => ({
  getNitroServerConfig: () => state.config,
}));

vi.mock("../../server/utils/mysql.ts", () => ({
  getMysqlPool: () => state.pool,
  mysqlQueryOptions: (sql) => ({ sql }),
}));

describe("Nitro K3 configuration fallback", () => {
  beforeEach(() => {
    state.config = {
      ...state.config,
      k3BaseUrl: "",
      k3BaseUrlIntranet: "",
      k3DbId: "",
      k3Username: "",
      k3AppId: "",
      k3AppSecret: "",
      k3Lcid: 2052,
      k3ConnectTimeoutMs: 5000,
      k3RequestTimeoutMs: 30000,
    };
    state.pool.query.mockReset();
    globalThis.__nitroK3ConfigPromise = undefined;
  });

  it("loads only the Java-compatible K3 keys from sys_config", async () => {
    state.pool.query.mockResolvedValueOnce([[
      { config_key: "kingdee.serverUrl", config_value: "https://k3.test/K3Cloud" },
      { config_key: "kingdee.dCID", config_value: "AIS_TEST" },
      { config_key: "kingdee.lCID", config_value: "2052" },
      { config_key: "kingdee.userName", config_value: "reader" },
      { config_key: "kingdee.appId", config_value: "app-id" },
      { config_key: "kingdee.appSecret", config_value: "app-secret" },
      { config_key: "kingdee.connectTimeout", config_value: "7000" },
    ], []]);

    const { getNitroK3Config } = await import("../../server/utils/k3-config.ts");
    await expect(getNitroK3Config()).resolves.toMatchObject({
      k3BaseUrl: "https://k3.test/K3Cloud",
      k3DbId: "AIS_TEST",
      k3Username: "reader",
      k3AppId: "app-id",
      k3AppSecret: "app-secret",
      k3Lcid: 2052,
      k3ConnectTimeoutMs: 7000,
    });
    expect(state.pool.query).toHaveBeenCalledTimes(1);
  });

  it("does not query sys_config when environment/runtime config is complete", async () => {
    state.config = {
      ...state.config,
      k3BaseUrl: "https://env-k3.test",
      k3DbId: "ENV_DB",
      k3Username: "env-user",
      k3AppId: "env-app",
      k3AppSecret: "env-secret",
    };
    const { getNitroK3Config } = await import("../../server/utils/k3-config.ts");
    await expect(getNitroK3Config()).resolves.toMatchObject({ k3BaseUrl: "https://env-k3.test", k3DbId: "ENV_DB" });
    expect(state.pool.query).not.toHaveBeenCalled();
  });
});
