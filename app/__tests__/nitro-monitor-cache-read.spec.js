import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  authenticated: { session: { userId: 1 } },
  cache: {
    info: vi.fn(),
    dbsize: vi.fn(),
    keys: vi.fn(),
  },
}));

vi.mock("../../server/utils/auth.ts", () => ({
  getAuthSession: vi.fn(async () => state.authenticated),
}));
vi.mock("../../server/utils/redis.ts", () => ({
  getGarnet: vi.fn(() => state.cache),
}));

globalThis.defineEventHandler = (handler) => handler;

describe("Nitro monitor cache name read route", () => {
  let handler;
  let infoHandler;

  beforeAll(async () => {
    handler = (await import("../../server/routes/prod-api/monitor/cache/getNames.get.ts")).default;
    infoHandler = (await import("../../server/routes/prod-api/monitor/cache/index.get.ts")).default;
  });

  beforeEach(() => {
    state.authenticated = { session: { userId: 1 } };
    state.cache.info.mockReset();
    state.cache.dbsize.mockReset();
    state.cache.keys.mockReset().mockResolvedValue([]);
  });

  it("requires an authenticated session", async () => {
    state.authenticated = null;
    await expect(handler({})).resolves.toEqual({ code: 401, msg: "登录状态已过期" });
    await expect(infoHandler({})).resolves.toEqual({ code: 401, msg: "登录状态已过期" });
  });

  it("parses the sys_cache INFO payload and groups live keys by prefix", async () => {
    state.cache.info.mockResolvedValueOnce(
      "# Server\r\nengine:mysql\r\nengine_version:8.4.0\r\nredis_mode:standalone\r\ntcp_port:3306\r\n# sys_cache\r\ncache_rows:44\r\ncache_expired_rows:2\r\n",
    );
    state.cache.dbsize.mockResolvedValueOnce(42);
    state.cache.keys.mockResolvedValueOnce([
      "auth_sessions:a",
      "auth_sessions:b",
      "login_tokens:a",
      "captcha_codes:x",
      "nitro:write:label:1:req",
      "some:legacy-key",
    ]);

    await expect(infoHandler({})).resolves.toEqual({
      code: 200,
      msg: "操作成功",
      data: {
        info: {
          engine: "mysql",
          engine_version: "8.4.0",
          redis_mode: "standalone",
          tcp_port: "3306",
          cache_rows: "44",
          cache_expired_rows: "2",
        },
        dbSize: 42,
        commandStats: [
          { name: "会话（Nitro）", value: "2" },
          { name: "会话（Java 兼容）", value: "1" },
          { name: "验证码", value: "1" },
          { name: "写请求幂等键", value: "1" },
          { name: "其他", value: "1" },
        ],
      },
    });
    expect(state.cache.keys).toHaveBeenCalledWith("*");
  });

  it("returns an empty key breakdown when nothing is stored", async () => {
    state.cache.info.mockResolvedValueOnce("# Server\r\nengine:mysql\r\nengine_version:8.4.0\r\n");
    state.cache.dbsize.mockResolvedValueOnce(0);

    await expect(infoHandler({})).resolves.toMatchObject({
      code: 200,
      data: { dbSize: 0, commandStats: [] },
    });
  });

  it("still returns INFO when the key breakdown read fails", async () => {
    state.cache.info.mockResolvedValueOnce("# Server\r\nengine:mysql\r\nengine_version:8.4.0\r\n");
    state.cache.dbsize.mockResolvedValueOnce(3);
    state.cache.keys.mockRejectedValueOnce(new Error("sys_cache unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(infoHandler({})).resolves.toMatchObject({
      code: 200,
      data: { dbSize: 3, commandStats: [] },
    });
    consoleError.mockRestore();
  });

  it("hides state-store dependency failures behind a safe error", async () => {
    state.cache.info.mockRejectedValueOnce(new Error("mysql://secret-host:3306"));
    await expect(infoHandler({})).resolves.toEqual({ code: 500, msg: "获取缓存信息失败" });
  });

  it("returns the real sys_cache prefix catalog without reading cache values", async () => {
    const result = await handler({});
    expect(result).toEqual({
      code: 200,
      msg: "操作成功",
      data: [
        { cacheName: "auth_sessions:", cacheKey: "", cacheValue: "", remark: "会话（Nitro 权威副本）" },
        { cacheName: "login_tokens:", cacheKey: "", cacheValue: "", remark: "会话（Java 兼容副本）" },
        { cacheName: "captcha_codes:", cacheKey: "", cacheValue: "", remark: "图形验证码" },
        { cacheName: "pwd_err_cnt:", cacheKey: "", cacheValue: "", remark: "登录失败次数锁" },
        { cacheName: "nitro:write:", cacheKey: "", cacheValue: "", remark: "高危写请求幂等键" },
        { cacheName: "tk:video:play-token:", cacheKey: "", cacheValue: "", remark: "视频播放票据" },
      ],
    });
  });
});
