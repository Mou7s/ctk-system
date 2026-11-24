import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  body: { requestId: "video-1", id: 7, title: "新标题", category: "培训" },
  params: { id: "7" },
  authenticated: { token: "test-token", session: { userId: 2, userName: "u2", deptId: 1, user: { userId: 2, userName: "u2", nickName: "用户2" }, roles: [], permissions: [] } },
  connection: { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), query: vi.fn() },
  pool: { getConnection: vi.fn() },
  garnet: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
}));

vi.mock("h3", () => ({
  getHeader: vi.fn((_event, name) => name === "idempotency-key" ? state.body.requestId : "test-agent"),
  getRouterParam: vi.fn((_event, name) => state.params[name]),
  readBody: vi.fn(async () => state.body),
}));
vi.mock("../../server/utils/auth.ts", () => ({ getAuthSession: vi.fn(async () => state.authenticated), hasPermission: vi.fn(() => true) }));
vi.mock("../../server/utils/mysql.ts", () => ({ getMysqlPool: vi.fn(() => state.pool), mysqlQueryOptions: vi.fn((sql) => ({ sql })) }));
vi.mock("../../server/utils/redis.ts", () => ({ getGarnet: vi.fn(() => state.garnet) }));

describe("Nitro video metadata write routes", () => {
  let createVideoWriteHandler;
  let consoleError;

  beforeEach(async () => {
    ({ createVideoWriteHandler } = await import("../../server/utils/video-write.ts"));
    state.body = { requestId: "video-1", id: 7, title: "新标题", category: "培训" };
    state.params = { id: "7" };
    state.connection.beginTransaction.mockReset(); state.connection.commit.mockReset(); state.connection.rollback.mockReset(); state.connection.release.mockReset(); state.connection.query.mockReset();
    state.pool.getConnection.mockReset().mockResolvedValue(state.connection);
    state.garnet.get.mockReset().mockResolvedValue(null); state.garnet.set.mockReset().mockResolvedValue("OK");
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => consoleError.mockRestore());

  it("checks uploader ownership before metadata update", async () => {
    state.connection.query.mockResolvedValueOnce([[{ id: 7, uploader_id: 2, status: "0" }], []]).mockResolvedValueOnce([{ affectedRows: 1 }, []]).mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    await expect(createVideoWriteHandler("edit")({ node: { req: { method: "PUT" } } })).resolves.toEqual({ code: 200, msg: "操作成功" });
    expect(state.connection.query.mock.calls[1][0].sql).toContain("UPDATE tk_video_library SET title");
    expect(state.connection.commit).toHaveBeenCalledTimes(1);
  });

  it("rejects deleting another user's video before update", async () => {
    state.connection.query.mockResolvedValueOnce([[{ id: 7, uploader_id: 3, status: "0" }], []]);
    await expect(createVideoWriteHandler("delete")({ node: { req: { method: "DELETE" } } })).resolves.toEqual({ code: 403, msg: "只能删除自己上传的视频" });
    expect(state.connection.commit).not.toHaveBeenCalled();
    expect(state.connection.rollback).toHaveBeenCalledTimes(1);
  });
});
