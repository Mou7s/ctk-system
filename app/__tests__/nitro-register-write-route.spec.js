import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  body: { requestId: "reg-1", username: "new-user", password: "secret1", code: "123", uuid: "captcha-1" },
  authenticated: null,
  connection: { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), query: vi.fn() },
  pool: { getConnection: vi.fn() },
  garnet: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
}));

vi.mock("h3", () => ({
  getHeader: vi.fn((_event, name) => name === "idempotency-key" ? state.body.requestId : "test-agent"),
  getRequestIP: vi.fn(() => "127.0.0.1"),
  readBody: vi.fn(async () => state.body),
}));
vi.mock("../../server/utils/mysql.ts", () => ({ getMysqlPool: vi.fn(() => state.pool), mysqlQueryOptions: vi.fn((sql) => ({ sql })) }));
vi.mock("../../server/utils/redis.ts", () => ({ getGarnet: vi.fn(() => state.garnet) }));
vi.mock("../../server/utils/user-repository.ts", () => ({
  getConfigValue: vi.fn(async (key) => key === "sys.account.registerUser" ? "true" : key === "sys.account.captchaEnabled" ? "false" : null),
  recordLoginInfo: vi.fn(async () => {}),
}));

describe("Nitro public register route", () => {
  let register;
  let consoleError;
  beforeEach(async () => {
    ({ default: register } = await import("../../server/utils/register-write.ts"));
    state.body = { requestId: "reg-1", username: "new-user", password: "secret1", code: "123", uuid: "captcha-1" };
    state.connection.beginTransaction.mockReset(); state.connection.commit.mockReset(); state.connection.rollback.mockReset(); state.connection.release.mockReset(); state.connection.query.mockReset();
    state.pool.getConnection.mockReset().mockResolvedValue(state.connection);
    state.garnet.get.mockReset().mockResolvedValue(null); state.garnet.set.mockReset().mockResolvedValue("OK"); state.garnet.del.mockReset().mockResolvedValue(1);
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => consoleError.mockRestore());

  it("registers a pending user without requiring an authenticated session", async () => {
    state.connection.query.mockResolvedValueOnce([[], []]).mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    await expect(register({ node: { req: { method: "POST" } } })).resolves.toEqual({ code: 200, msg: "操作成功" });
    expect(state.connection.query.mock.calls[1][0].sql).toContain("status, create_time");
    expect(state.connection.query.mock.calls[1][1][2]).not.toBe("secret1");
    expect(state.connection.commit).toHaveBeenCalledTimes(1);
  });

  it("rejects duplicate usernames before insert", async () => {
    state.connection.query.mockResolvedValueOnce([[{ user_id: 9 }], []]);
    await expect(register({ node: { req: { method: "POST" } } })).resolves.toEqual({ code: 500, msg: "保存用户'new-user'失败，注册账号已存在" });
    expect(state.connection.query).toHaveBeenCalledTimes(1);
    expect(state.connection.rollback).toHaveBeenCalledTimes(1);
  });
});
