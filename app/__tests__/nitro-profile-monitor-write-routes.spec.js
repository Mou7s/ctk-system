import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  body: { requestId: "profile-1", nickName: "新昵称", email: "new@example.com", phonenumber: "13800000000", sex: "1" },
  query: { oldPassword: "old-pass", newPassword: "new-pass" },
  params: {},
  authenticated: { token: "test-token", session: { userId: 1, userName: "admin", deptId: 1, user: { userId: 1, userName: "admin", nickName: "管理员" }, roles: [], permissions: [] } },
  connection: { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), query: vi.fn() },
  pool: { getConnection: vi.fn() },
  garnet: { get: vi.fn(), set: vi.fn(), del: vi.fn(), keys: vi.fn(), scan: vi.fn() },
  compare: vi.fn(),
  hashSync: vi.fn(),
  deleteAuthSession: vi.fn(),
}));

vi.mock("h3", () => ({
  getHeader: vi.fn((_event, name) => name === "idempotency-key" ? state.body.requestId : "test-agent"),
  getQuery: vi.fn(() => state.query),
  getRequestURL: vi.fn(() => new URL("http://test.local/prod-api/monitor/cache/clearCacheAll")),
  getRouterParam: vi.fn((_event, name) => state.params[name]),
  getRouterParams: vi.fn(() => state.params),
  readBody: vi.fn(async () => state.body),
}));
vi.mock("bcryptjs", () => ({
  compare: state.compare,
  hashSync: state.hashSync,
}));
vi.mock("../../server/utils/auth.ts", () => ({
  getAuthSession: vi.fn(async () => state.authenticated),
  hasPermission: vi.fn(() => true),
  deleteAuthSession: state.deleteAuthSession,
  SESSION_KEY_PREFIXES: ["auth_sessions:", "login_tokens:"],
}));
vi.mock("../../server/utils/mysql.ts", () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}));
vi.mock("../../server/utils/redis.ts", () => ({ getGarnet: vi.fn(() => state.garnet) }));

describe("Nitro profile and monitor write routes", () => {
  let updateProfile;
  let updatePassword;
  let createMonitorWriteHandler;
  let consoleError;

  beforeEach(async () => {
    ({ updateProfile, updatePassword } = await import("../../server/utils/profile-write.ts"));
    ({ createMonitorWriteHandler } = await import("../../server/utils/monitor-write.ts"));
    state.body = { requestId: "profile-1", nickName: "新昵称", email: "new@example.com", phonenumber: "13800000000", sex: "1" };
    state.query = { oldPassword: "old-pass", newPassword: "new-pass" };
    state.params = {};
    state.connection.beginTransaction.mockReset();
    state.connection.commit.mockReset();
    state.connection.rollback.mockReset();
    state.connection.release.mockReset();
    state.connection.query.mockReset();
    state.pool.getConnection.mockReset().mockResolvedValue(state.connection);
    state.garnet.get.mockReset().mockResolvedValue(null);
    state.garnet.set.mockReset().mockResolvedValue("OK");
    state.garnet.del.mockReset().mockResolvedValue(1);
    state.garnet.keys.mockReset().mockResolvedValue([]);
    state.garnet.scan.mockReset().mockResolvedValue(["0", []]);
    state.compare.mockReset().mockResolvedValue(false);
    state.hashSync.mockReset().mockReturnValue("$2a$10$hashed-password");
    state.deleteAuthSession.mockReset().mockResolvedValue(true);
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => consoleError.mockRestore());

  it("updates profile fields only after uniqueness checks and records an audit", async () => {
    state.connection.query
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    await expect(updateProfile({ node: { req: { method: "PUT" } } })).resolves.toEqual({ code: 200, msg: "操作成功" });
    expect(state.connection.query.mock.calls[2][0].sql).toContain("UPDATE sys_user SET nick_name");
    expect(state.connection.commit).toHaveBeenCalledTimes(1);
    expect(state.garnet.set).toHaveBeenCalledWith("nitro:write:system-profile:update:1:profile-1", expect.stringContaining('"status":"done"'), "EX", 900);
  });

  it("changes password with a bcrypt hash and keeps the password out of the audit SQL", async () => {
    state.compare.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    state.connection.query
      .mockResolvedValueOnce([[{ password: "$2a$10$old-hash" }], []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    await expect(updatePassword({ node: { req: { method: "PUT" } } })).resolves.toEqual({ code: 200, msg: "操作成功" });
    expect(state.hashSync).toHaveBeenCalledWith("new-pass", 10);
    expect(state.connection.query.mock.calls[1][0].sql).toContain("UPDATE sys_user SET password");
    expect(state.connection.query.mock.calls[2][1]).not.toContain("new-pass");
  });

  it("deletes all cache keys through Garnet and records the operation", async () => {
    state.garnet.keys.mockResolvedValueOnce(["cache:a", "cache:b"]);
    state.garnet.del.mockResolvedValueOnce(2);
    state.body = { requestId: "cache-1" };
    await expect(createMonitorWriteHandler("cache-all")({ node: { req: { method: "DELETE" } } })).resolves.toEqual({ code: 200, msg: "操作成功", data: { deleted: 2 } });
    expect(state.garnet.del).toHaveBeenCalledWith("cache:a", "cache:b");
    expect(state.connection.commit).toHaveBeenCalledTimes(1);
  });

  it("never deletes session keys when clearing all cache", async () => {
    state.garnet.keys.mockResolvedValueOnce([
      "auth_sessions:live-1",
      "login_tokens:live-1",
      "captcha_codes:abc",
      "nitro:write:label:1:req-1",
    ]);
    state.garnet.del.mockResolvedValueOnce(2);
    state.body = { requestId: "cache-2" };
    await expect(createMonitorWriteHandler("cache-all")({ node: { req: { method: "DELETE" } } })).resolves.toEqual({
      code: 200,
      msg: "操作成功",
      data: { deleted: 2, skipped: 2 },
    });
    expect(state.garnet.del).toHaveBeenCalledWith("captcha_codes:abc", "nitro:write:label:1:req-1");
  });

  it("force logs out the selected online token without exposing its value", async () => {
    state.params = { tokenId: "session-token-1" };
    state.body = { requestId: "online-1" };
    await expect(createMonitorWriteHandler("online-force")({ node: { req: { method: "DELETE" } } })).resolves.toEqual({ code: 200, msg: "操作成功", data: { deleted: 1 } });
    expect(state.deleteAuthSession).toHaveBeenCalledWith("session-token-1");
    expect(state.connection.query.mock.calls.at(-1)?.[1] || []).not.toContain("session-token-1");
    expect(state.connection.commit).toHaveBeenCalledTimes(1);
  });
});
