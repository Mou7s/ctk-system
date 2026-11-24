import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  body: { requestId: "approve-1", spNo: "SP001", spName: "物品放行", spStatus: "2", applyDataContents: "{}" },
  params: {},
  authenticated: { token: "test-token", session: { userId: 1, userName: "admin", deptId: 1, user: { userId: 1, userName: "admin", nickName: "管理员" }, roles: [], permissions: [] } },
  connection: { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), query: vi.fn() },
  pool: { getConnection: vi.fn() },
  garnet: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
}));

vi.mock("h3", () => ({
  getHeader: vi.fn((_event, name) => name === "idempotency-key" ? state.body.requestId : "test-agent"),
  getRequestURL: vi.fn(() => new URL("http://test.local/prod-api/tk_custom/WXApprove")),
  getRouterParam: vi.fn((_event, name) => state.params[name]),
  getRouterParams: vi.fn(() => state.params),
  readBody: vi.fn(async () => state.body),
}));
vi.mock("../../server/utils/auth.ts", () => ({ getAuthSession: vi.fn(async () => state.authenticated), hasPermission: vi.fn(() => true) }));
vi.mock("../../server/utils/mysql.ts", () => ({ getMysqlPool: vi.fn(() => state.pool), mysqlQueryOptions: vi.fn((sql) => ({ sql })) }));
vi.mock("../../server/utils/redis.ts", () => ({ getGarnet: vi.fn(() => state.garnet) }));

describe("Nitro WXApprove local CRUD routes", () => {
  let createWxApproveWriteHandler;
  let consoleError;
  beforeEach(async () => {
    ({ createWxApproveWriteHandler } = await import("../../server/utils/wx-approve-write.ts"));
    state.body = { requestId: "approve-1", spNo: "SP001", spName: "物品放行", spStatus: "2", applyDataContents: "{}" };
    state.params = {};
    state.connection.beginTransaction.mockReset(); state.connection.commit.mockReset(); state.connection.rollback.mockReset(); state.connection.release.mockReset(); state.connection.query.mockReset();
    state.pool.getConnection.mockReset().mockResolvedValue(state.connection);
    state.garnet.get.mockReset().mockResolvedValue(null); state.garnet.set.mockReset().mockResolvedValue("OK");
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => consoleError.mockRestore());

  it("writes approval metadata locally", async () => {
    state.connection.query.mockResolvedValueOnce([{ affectedRows: 1 }, []]).mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    await expect(createWxApproveWriteHandler("add")({ node: { req: { method: "POST" } } })).resolves.toEqual({ code: 200, msg: "操作成功" });
    expect(state.connection.query.mock.calls[0][0].sql).toContain("INSERT INTO wx_approve");
    expect(state.connection.commit).toHaveBeenCalledTimes(1);
  });

  it("deletes only the requested approval numbers", async () => {
    state.params = { spNos: "SP001,SP002" };
    state.body = { requestId: "approve-2" };
    state.connection.query.mockResolvedValueOnce([{ affectedRows: 2 }, []]).mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    await expect(createWxApproveWriteHandler("delete")({ node: { req: { method: "DELETE" } } })).resolves.toEqual({ code: 200, msg: "操作成功" });
    expect(state.connection.query.mock.calls[0][0].sql).toContain("DELETE FROM wx_approve WHERE sp_no IN (?, ?)");
  });
});
