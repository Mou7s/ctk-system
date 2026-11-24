import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  body: { requestId: "wms-1", locationCode: " loc:a-01 ", status: "1" },
  authenticated: { token: "test-token", session: { userId: 1, userName: "admin", deptId: 1, user: { userId: 1, userName: "admin", nickName: "管理员" }, roles: [], permissions: [] } },
  permissionAllowed: true,
  connection: { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), query: vi.fn() },
  pool: { getConnection: vi.fn() },
  garnet: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
}));

vi.mock("h3", () => ({
  getHeader: vi.fn((_event, name) => name === "idempotency-key" ? state.body.requestId : "test-agent"),
  readBody: vi.fn(async () => state.body),
}));
vi.mock("../../server/utils/auth.ts", () => ({ getAuthSession: vi.fn(async () => state.authenticated), hasPermission: vi.fn(() => state.permissionAllowed) }));
vi.mock("../../server/utils/mysql.ts", () => ({ getMysqlPool: vi.fn(() => state.pool), mysqlQueryOptions: vi.fn((sql) => ({ sql })) }));
vi.mock("../../server/utils/redis.ts", () => ({ getGarnet: vi.fn(() => state.garnet) }));

describe("Nitro WMS location status route", () => {
  let updateWmsLocationStatus;
  let consoleError;
  beforeEach(async () => {
    ({ updateWmsLocationStatus } = await import("../../server/utils/wms-write.ts"));
    state.body = { requestId: "wms-1", locationCode: " loc:a-01 ", status: "1" };
    state.permissionAllowed = true;
    state.connection.beginTransaction.mockReset(); state.connection.commit.mockReset(); state.connection.rollback.mockReset(); state.connection.release.mockReset(); state.connection.query.mockReset();
    state.pool.getConnection.mockReset().mockResolvedValue(state.connection);
    state.garnet.get.mockReset().mockResolvedValue(null); state.garnet.set.mockReset().mockResolvedValue("OK");
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => consoleError.mockRestore());

  it("normalizes the location and blocks disabling an occupied slot", async () => {
    state.connection.query.mockResolvedValueOnce([[{ location_code: "A-01" }], []]).mockResolvedValueOnce([[{ occupied: 2 }], []]);
    await expect(updateWmsLocationStatus({ node: { req: { method: "PUT" } } })).resolves.toEqual({ code: 500, msg: "库位仍有库存，不能停用：A-01" });
    expect(state.connection.commit).not.toHaveBeenCalled();
    expect(state.connection.rollback).toHaveBeenCalledTimes(1);
  });

  it("updates an empty slot and records the audit", async () => {
    state.body.status = "0";
    state.connection.query.mockResolvedValueOnce([[{ location_code: "A-01" }], []]).mockResolvedValueOnce([{ affectedRows: 1 }, []]).mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    await expect(updateWmsLocationStatus({ node: { req: { method: "PUT" } } })).resolves.toEqual({ code: 200, msg: "操作成功" });
    expect(state.connection.query.mock.calls[1][1]).toEqual(["0", "admin", "A-01"]);
    expect(state.connection.commit).toHaveBeenCalledTimes(1);
  });

  it("requires the WMS location edit permission", async () => {
    state.permissionAllowed = false;

    await expect(updateWmsLocationStatus({ node: { req: { method: "PUT" } } })).resolves.toEqual({
      code: 403,
      msg: "没有权限访问该接口",
    });
    expect(state.pool.getConnection).not.toHaveBeenCalled();
  });
});
