import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  authenticated: { session: { userId: 1 } },
  keys: ["login_tokens:one", "login_tokens:two", "login_tokens:bad"],
  values: [
    JSON.stringify({ token: "one", loginTime: 100, ipaddr: "192.0.2.1", user: { userName: "admin", dept: { deptName: "总公司" } }, browser: "Chrome", os: "Windows" }),
    JSON.stringify({ token: "two", loginTime: 200, ipaddr: "192.0.2.2", user: { userName: "tester" }, browser: "Safari", os: "iOS" }),
    '{"token":"fallback","loginTime":300,"ipaddr":"192.0.2.3","user":{"userName":"fallback"}',
  ],
  garnet: null,
}));

vi.mock("../../server/utils/auth.ts", () => ({
  getAuthSession: vi.fn(async () => state.authenticated),
}));

vi.mock("../../server/utils/redis.ts", () => ({
  getGarnet: vi.fn(() => state.garnet),
}));

vi.mock("h3", () => ({
  getQuery: vi.fn((event) => event.query || {}),
}));

globalThis.defineEventHandler = (handler) => handler;

describe("Nitro monitor online read route", () => {
  let handler;

  beforeAll(async () => {
    handler = (await import("../../server/routes/prod-api/monitor/online/list.get.ts")).default;
  });

  beforeEach(() => {
    state.authenticated = { session: { userId: 1 } };
    state.garnet = {
      keys: vi.fn(async () => state.keys),
      mget: vi.fn(async () => state.values),
    };
  });

  it("requires an authenticated session", async () => {
    state.authenticated = null;
    await expect(handler({})).resolves.toEqual({ code: 401, msg: "登录状态已过期" });
  });

  it("maps compatibility sessions and preserves Java-style filters", async () => {
    const result = await handler({ query: { ipaddr: "192.0.2.1", userName: "admin" } });
    expect(result).toEqual({
      code: 200,
      msg: "操作成功",
      rows: [{
        tokenId: "one",
        deptName: "总公司",
        userName: "admin",
        ipaddr: "192.0.2.1",
        loginLocation: "",
        browser: "Chrome",
        os: "Windows",
        loginTime: 100,
      }],
      total: 1,
    });
    expect(state.garnet.mget).toHaveBeenCalledWith("login_tokens:one", "login_tokens:two", "login_tokens:bad");
  });

  it("returns reverse key order for the unfiltered list", async () => {
    const result = await handler({ query: {} });
    expect(result.rows.map((row) => row.tokenId)).toEqual(["fallback", "two", "one"]);
    expect(result.total).toBe(3);
  });
});
