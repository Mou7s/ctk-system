import { afterEach, describe, expect, it, vi } from "vitest";

const sqlServerEnvNames = [
  "NUXT_SQLSERVER_K3_HOST",
  "NUXT_SQLSERVER_K3_HOST_FALLBACK",
  "TK_SQLSERVER_HOST",
  "TK_SQLSERVER_HOST_FALLBACK",
  "NUXT_SQLSERVER_K3_DATABASE",
  "TK_SQLSERVER_DATABASE",
  "TK_SQLSERVER_USERNAME",
  "TK_SQLSERVER_PASSWORD",
];

describe("Nitro SQL Server runtime defaults", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("defaults SQL Server host, fallback, and database to empty strings when unconfigured", async () => {
    for (const name of sqlServerEnvNames) vi.stubEnv(name, "");
    vi.stubGlobal("useRuntimeConfig", () => ({}));

    const { getNitroServerConfig } = await import("../../server/utils/runtime.ts");
    const config = getNitroServerConfig();

    expect(config.sqlServerK3Host).toBe("");
    expect(config.sqlServerK3HostFallback).toBe("");
    expect(config.sqlServerK3Database).toBe("");
  });

  it("prefers an explicitly configured host and fallback", async () => {
    vi.stubEnv("TK_SQLSERVER_HOST", "primary.test");
    vi.stubEnv("TK_SQLSERVER_HOST_FALLBACK", "fallback.test");
    vi.stubGlobal("useRuntimeConfig", () => ({}));

    const { getNitroServerConfig } = await import("../../server/utils/runtime.ts");
    const config = getNitroServerConfig();

    expect(config.sqlServerK3Host).toBe("primary.test");
    expect(config.sqlServerK3HostFallback).toBe("fallback.test");
  });
});
