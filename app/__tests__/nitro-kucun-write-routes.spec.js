import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  body: { requestId: "kucun-1", kdBillno: "XSTH001", kdWlbm: "M-1", kdChukuNumber: 2 },
  params: {},
  authenticated: {
    token: "test-token",
    session: { userId: 1, userName: "admin", deptId: 1, user: { userId: 1, userName: "admin", nickName: "管理员" }, roles: [], permissions: [] },
  },
  connection: { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), query: vi.fn() },
  pool: { getConnection: vi.fn() },
  garnet: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
}));

vi.mock("h3", () => ({
  getHeader: vi.fn((_event, name) => name === "idempotency-key" ? state.body.requestId : "test-agent"),
  getRequestURL: vi.fn(() => new URL("http://test.local/prod-api/tk_custom/kucun")),
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

describe("Nitro kucun local write routes", () => {
  let createKucunWriteHandler;
  let consoleError;

  beforeEach(async () => {
    ({ createKucunWriteHandler } = await import("../../server/utils/kucun-write.ts"));
    state.body = { requestId: "kucun-1", kdBillno: "XSTH001", kdWlbm: "M-1", kdChukuNumber: 2 };
    state.params = {};
    state.authenticated = {
      token: "test-token",
      session: { userId: 1, userName: "admin", deptId: 1, user: { userId: 1, userName: "admin", nickName: "管理员" }, roles: [], permissions: [] },
    };
    state.connection.beginTransaction.mockReset();
    state.connection.commit.mockReset();
    state.connection.rollback.mockReset();
    state.connection.release.mockReset();
    state.connection.query.mockReset();
    state.pool.getConnection.mockReset().mockResolvedValue(state.connection);
    state.garnet.get.mockReset().mockResolvedValue(null);
    state.garnet.set.mockReset().mockResolvedValue("OK");
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => consoleError.mockRestore());

  it("inserts only supplied snapshot fields and records an operation log", async () => {
    state.connection.query
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    await expect(createKucunWriteHandler("add")({ node: { req: { method: "POST" } } })).resolves.toEqual({ code: 200, msg: "操作成功" });
    expect(state.connection.query.mock.calls[0][0].sql).toContain("INSERT INTO kucun (id, kd_billno, kd_wlbm, kd_chuku_number)");
    expect(state.connection.commit).toHaveBeenCalledTimes(1);
    expect(state.garnet.set).toHaveBeenCalledWith("nitro:write:kucun:add:1:kucun-1", expect.stringContaining('"status":"done"'), "EX", 900);
  });

  it("checks the current row before editing and rejects a missing row", async () => {
    state.body = { requestId: "kucun-2", id: "missing", kdWumc: "新名称" };
    state.connection.query.mockResolvedValueOnce([[], []]);

    await expect(createKucunWriteHandler("edit")({ node: { req: { method: "PUT" } } })).resolves.toEqual({ code: 500, msg: "库存记录不存在" });
    expect(state.connection.commit).not.toHaveBeenCalled();
    expect(state.connection.rollback).toHaveBeenCalledTimes(1);
  });

  it("deletes a validated id list in one transaction", async () => {
    state.params = { ids: "a,b" };
    state.body = { requestId: "kucun-3" };
    state.connection.query
      .mockResolvedValueOnce([{ affectedRows: 2 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    await expect(createKucunWriteHandler("delete")({ node: { req: { method: "DELETE" } } })).resolves.toEqual({ code: 200, msg: "操作成功" });
    expect(state.connection.query.mock.calls[0][0].sql).toContain("DELETE FROM kucun WHERE id IN (?, ?)");
    expect(state.connection.commit).toHaveBeenCalledTimes(1);
  });
});
