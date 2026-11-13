import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  body: { requestId: "talent-1", name: "张三", nativePlace: "上海", position: "工程师", phoneNumber: "13000000000", eduId: "本科", gender: 1, birthDate: "2000-01-01 00:00:00" },
  params: {},
  authenticated: { token: "test-token", session: { userId: 1, userName: "admin", deptId: 1, user: { userId: 1, userName: "admin", nickName: "管理员" }, roles: [], permissions: [] } },
  connection: { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), query: vi.fn() },
  pool: { getConnection: vi.fn() },
  garnet: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
}));

vi.mock("h3", () => ({
  getHeader: vi.fn((_event, name) => name === "idempotency-key" ? state.body.requestId : "test-agent"),
  getRequestURL: vi.fn(() => new URL("http://test.local/prod-api/tk_custom/talent/addTalentInfo")),
  getRouterParam: vi.fn((_event, name) => state.params[name]),
  getRouterParams: vi.fn(() => state.params),
  readBody: vi.fn(async () => state.body),
}));
vi.mock("../../server/utils/auth.ts", () => ({ getAuthSession: vi.fn(async () => state.authenticated), hasPermission: vi.fn(() => true) }));
vi.mock("../../server/utils/mysql.ts", () => ({ getMysqlPool: vi.fn(() => state.pool), mysqlQueryOptions: vi.fn((sql) => ({ sql })) }));
vi.mock("../../server/utils/redis.ts", () => ({ getGarnet: vi.fn(() => state.garnet) }));

describe("Nitro talent local write routes", () => {
  let createTalentWriteHandler;
  let consoleError;

  beforeEach(async () => {
    ({ createTalentWriteHandler } = await import("../../server/utils/talent-write.ts"));
    state.body = { requestId: "talent-1", name: "张三", nativePlace: "上海", position: "工程师", phoneNumber: "13000000000", eduId: "本科", gender: 1, birthDate: "2000-01-01 00:00:00" };
    state.params = {};
    state.connection.beginTransaction.mockReset(); state.connection.commit.mockReset(); state.connection.rollback.mockReset(); state.connection.release.mockReset(); state.connection.query.mockReset();
    state.pool.getConnection.mockReset().mockResolvedValue(state.connection);
    state.garnet.get.mockReset().mockResolvedValue(null); state.garnet.set.mockReset().mockResolvedValue("OK");
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => consoleError.mockRestore());

  it("returns the generated talent id after inserting metadata", async () => {
    state.connection.query.mockResolvedValueOnce([{ affectedRows: 1, insertId: 42 }, []]).mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    const response = await createTalentWriteHandler("add")({ node: { req: { method: "POST" } } });
    expect(response.code).toBe(200);
    expect(response.data.id).toBe(42);
    expect(state.connection.query.mock.calls[0][0].sql).toContain("INSERT INTO talent_lib");
    expect(state.connection.commit).toHaveBeenCalledTimes(1);
  });

  it("requires the same mandatory fields as Java before opening a write", async () => {
    state.body = { requestId: "talent-2", name: "缺电话" };
    await expect(createTalentWriteHandler("add")({ node: { req: { method: "POST" } } })).resolves.toEqual({ code: 500, msg: "籍贯不能为空" });
    expect(state.connection.query).not.toHaveBeenCalled();
  });
});
