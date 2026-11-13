import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
}));

vi.mock("h3", () => ({
  getRouterParam: vi.fn((_event, name) => state.params[name]),
  getHeader: vi.fn(() => "test-agent"),
  getRequestURL: vi.fn(() => new URL("http://test.local/prod-api/system/config")),
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

vi.mock("../../server/utils/read.ts", () => ({
  dataScopeFragment: vi.fn(async () => ({ sql: "", params: [] })),
}));

describe("Nitro pure-MySQL write routes", () => {
  let createSystemWriteHandler;
  let createCustomWriteHandler;
  let consoleError;

  beforeAll(async () => {
    ({ createSystemWriteHandler } = await import("../../server/utils/system-write.ts"));
    ({ createCustomWriteHandler } = await import("../../server/utils/custom-write.ts"));
  });

  beforeEach(() => {
    state.body = {};
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
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => consoleError.mockRestore());

  it("rejects an unauthenticated write before opening a database transaction", async () => {
    state.authenticated = null;
    await expect(createSystemWriteHandler("config-add")({})).resolves.toEqual({
      code: 401,
      msg: "登录状态已过期",
    });
    expect(state.pool.getConnection).not.toHaveBeenCalled();
  });

  it("checks a unique key before insert and rolls back a duplicate request", async () => {
    state.body = { configName: "重复参数", configKey: "test.duplicate", configValue: "1" };
    state.connection.query.mockResolvedValueOnce([[{ config_id: 9 }], []]);

    await expect(createSystemWriteHandler("config-add")({ node: { req: { method: "POST" } } })).resolves.toEqual({
      code: 500,
      msg: "新增参数配置'重复参数'失败，参数键名已存在",
    });
    expect(state.connection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(state.connection.query).toHaveBeenCalledTimes(1);
    expect(state.connection.commit).not.toHaveBeenCalled();
    expect(state.connection.rollback).toHaveBeenCalledTimes(1);
    expect(state.connection.release).toHaveBeenCalledTimes(1);
  });

  it("commits the business write and audit row together", async () => {
    state.body = { configName: "测试参数", configKey: "test.write", configValue: "1", remark: "只用于测试" };
    state.connection.query
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    await expect(createSystemWriteHandler("config-add")({ node: { req: { method: "POST" } } })).resolves.toEqual({
      code: 200,
      msg: "操作成功",
    });
    expect(state.connection.commit).toHaveBeenCalledTimes(1);
    expect(state.connection.rollback).not.toHaveBeenCalled();
    expect(state.connection.query.mock.calls[1][0].sql).toContain("INSERT INTO sys_config");
    expect(state.connection.query.mock.calls[2][0].sql).toContain("INSERT INTO sys_oper_log");
  });

  it("rolls back after a database failure and does not expose the connection string", async () => {
    state.body = { configName: "失败参数", configKey: "test.failure", configValue: "1" };
    state.connection.query
      .mockResolvedValueOnce([[], []])
      .mockRejectedValueOnce(new Error("mysql://user:secret@example.test/app"));

    await expect(createSystemWriteHandler("config-add")({ node: { req: { method: "POST" } } })).resolves.toEqual({
      code: 500,
      msg: "操作失败",
    });
    expect(state.connection.rollback).toHaveBeenCalledTimes(1);
    expect(state.connection.commit).not.toHaveBeenCalled();
    expect(consoleError.mock.calls.flat().join(" ")).not.toContain("secret");
  });

  it("validates custom staff dates before any business SQL", async () => {
    state.body = { reportDate: "not-a-date", processName: "固晶", staffCount: 3 };
    await expect(createCustomWriteHandler("process-staff-save")({ node: { req: { method: "POST" } } })).resolves.toEqual({
      code: 500,
      msg: "统计日期格式不正确",
    });
    expect(state.connection.query).not.toHaveBeenCalled();
    expect(state.connection.rollback).toHaveBeenCalledTimes(1);
  });
});
