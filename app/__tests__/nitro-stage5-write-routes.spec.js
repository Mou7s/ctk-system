import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  body: {},
  params: {},
  authenticated: {
    token: "test-token",
    session: {
      userId: 1,
      deptId: 1,
      userName: "admin",
      user: { userId: 1, userName: "admin", nickName: "管理员" },
      roles: [],
      permissions: [],
    },
  },
  connection: {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi.fn(),
  },
  pool: { getConnection: vi.fn() },
  garnet: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock("h3", () => ({
  getHeader: vi.fn((_event, name) => name === "idempotency-key" ? state.body.requestId : "test-agent"),
  getRequestURL: vi.fn(() => new URL("http://test.local/prod-api/tk_custom/suggest")),
  getRouterParam: vi.fn((_event, name) => state.params[name]),
  getRouterParams: vi.fn(() => state.params),
  readBody: vi.fn(async () => state.body),
}));

vi.mock("../../server/utils/auth.ts", () => ({
  getAuthSession: vi.fn(async () => state.authenticated),
  hasPermission: vi.fn(() => true),
}));

vi.mock("../../server/utils/mysql.ts", () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}));

vi.mock("../../server/utils/redis.ts", () => ({
  getGarnet: vi.fn(() => state.garnet),
}));

describe("Nitro stage five local write routes", () => {
  let createStage5WriteHandler;
  let consoleError;

  beforeEach(async () => {
    ({ createStage5WriteHandler } = await import("../../server/utils/stage5-write.ts"));
    state.body = { requestId: "suggest-1", suggestText: "测试建议" };
    state.params = {};
    state.authenticated = {
      token: "test-token",
      session: {
        userId: 1,
        deptId: 1,
        userName: "admin",
        user: { userId: 1, userName: "admin", nickName: "管理员" },
        roles: [],
        permissions: [],
      },
    };
    state.connection.beginTransaction.mockReset();
    state.connection.commit.mockReset();
    state.connection.rollback.mockReset();
    state.connection.release.mockReset();
    state.connection.query.mockReset();
    state.pool.getConnection.mockReset().mockResolvedValue(state.connection);
    state.garnet.get.mockReset().mockResolvedValue(null);
    state.garnet.set.mockReset().mockResolvedValue("OK");
    state.garnet.del.mockReset().mockResolvedValue(1);
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => consoleError.mockRestore());

  it("requires authentication before claiming a write key", async () => {
    state.authenticated = null;
    await expect(createStage5WriteHandler("suggest-add")({})).resolves.toEqual({
      code: 401,
      msg: "登录状态已过期",
    });
    expect(state.garnet.get).not.toHaveBeenCalled();
    expect(state.pool.getConnection).not.toHaveBeenCalled();
  });

  it("commits suggest and operation log, then stores the idempotent response", async () => {
    state.connection.query
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    await expect(createStage5WriteHandler("suggest-add")({ node: { req: { method: "POST" } } })).resolves.toEqual({
      code: 200,
      msg: "操作成功",
    });
    expect(state.connection.commit).toHaveBeenCalledTimes(1);
    expect(state.connection.rollback).not.toHaveBeenCalled();
    expect(state.connection.query.mock.calls[0][0].sql).toContain("INSERT INTO tk_suggest");
    expect(state.connection.query.mock.calls[1][0].sql).toContain("INSERT INTO sys_oper_log");
    expect(state.garnet.set).toHaveBeenCalledWith(
      "nitro:write:stage5:suggest-add:1:suggest-1",
      expect.stringContaining('"status":"done"'),
      "EX",
      900,
    );
  });

  it("replays a completed request without opening a database transaction", async () => {
    state.garnet.get.mockResolvedValueOnce(JSON.stringify({
      status: "done",
      fingerprint: "25f1f2b1",
      response: { code: 200, msg: "操作成功" },
    }));

    // The fingerprint is intentionally obtained from the same implementation
    // through the first request, so this test only asserts the replay boundary.
    state.garnet.get.mockReset().mockResolvedValue(null);
    state.connection.query
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    await createStage5WriteHandler("suggest-add")({ node: { req: { method: "POST" } } });
    const stored = JSON.parse(state.garnet.set.mock.calls.at(-1)[1]);
    state.garnet.get.mockReset().mockResolvedValueOnce(JSON.stringify(stored));
    state.connection.query.mockReset();
    state.pool.getConnection.mockClear();

    await expect(createStage5WriteHandler("suggest-add")({})).resolves.toEqual({
      code: 200,
      msg: "操作成功",
    });
    expect(state.pool.getConnection).not.toHaveBeenCalled();
    expect(state.connection.query).not.toHaveBeenCalled();
  });

  it("rejects duplicate WeCom member ids before insert", async () => {
    state.body = { requestId: "wx-1", userid: "u100", name: "重复" };
    state.connection.query.mockResolvedValueOnce([[{ userid: "u100" }], []]);

    await expect(createStage5WriteHandler("wxuser-add")({ node: { req: { method: "POST" } } })).resolves.toEqual({
      code: 500,
      msg: "企业微信成员已存在",
    });
    expect(state.connection.commit).not.toHaveBeenCalled();
    expect(state.connection.rollback).toHaveBeenCalledTimes(1);
  });
});
