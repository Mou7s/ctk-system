import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  body: { requestId: "pd-1", flowNo: "TW001", number: 5, pdNumber: 5 },
  params: {},
  authenticated: { token: "test-token", session: { userId: 1, userName: "admin", deptId: 1, user: { userId: 1, userName: "admin", nickName: "管理员" }, roles: [], permissions: [] } },
  connection: { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), query: vi.fn() },
  pool: { getConnection: vi.fn() },
  garnet: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
}));

vi.mock("h3", () => ({
  getHeader: vi.fn((_event, name) => name === "idempotency-key" ? state.body.requestId : "test-agent"),
  getRequestURL: vi.fn(() => new URL("http://test.local/prod-api/tk_custom/pd")),
  getRouterParam: vi.fn((_event, name) => state.params[name]),
  getRouterParams: vi.fn(() => state.params),
  readBody: vi.fn(async () => state.body),
}));
vi.mock("../../server/utils/auth.ts", () => ({ getAuthSession: vi.fn(async () => state.authenticated), hasPermission: vi.fn(() => true) }));
vi.mock("../../server/utils/mysql.ts", () => ({ getMysqlPool: vi.fn(() => state.pool), mysqlQueryOptions: vi.fn((sql) => ({ sql })) }));
vi.mock("../../server/utils/redis.ts", () => ({ getGarnet: vi.fn(() => state.garnet) }));

describe("Nitro pd and pd_ck local write routes", () => {
  let createPdWriteHandler;
  let consoleError;

  beforeEach(async () => {
    ({ createPdWriteHandler } = await import("../../server/utils/pd-write.ts"));
    state.body = { requestId: "pd-1", flowNo: "TW001", number: 5, pdNumber: 5 };
    state.params = {};
    state.connection.beginTransaction.mockReset(); state.connection.commit.mockReset(); state.connection.rollback.mockReset(); state.connection.release.mockReset(); state.connection.query.mockReset();
    state.pool.getConnection.mockReset().mockResolvedValue(state.connection);
    state.garnet.get.mockReset().mockResolvedValue(null); state.garnet.set.mockReset().mockResolvedValue("OK");
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => consoleError.mockRestore());

  it("writes a pd record in a transaction", async () => {
    // body 无 process -> 不做当日查重，直接 INSERT -> 操作日志
    state.connection.query
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    await expect(createPdWriteHandler("pd-add")({ node: { req: { method: "POST" } } })).resolves.toEqual({ code: 200, msg: "操作成功" });
    expect(state.connection.query.mock.calls.some(([q]) => String(q.sql).includes("flowNo = ? AND process = ?"))).toBe(false);
    expect(state.connection.query.mock.calls[0][0].sql).toContain("INSERT INTO pd (id, pdDate, flowNo, number, pd_number)");
    expect(state.connection.commit).toHaveBeenCalledTimes(1);
  });

  it("checks the same-day duplicate before inserting a full scan payload", async () => {
    state.body = { requestId: "pd-1b", flowNo: "TW001", process: "焊线部", number: 5, pdNumber: 5 };
    // 查重 SELECT(未命中) -> INSERT -> 操作日志；pdDate 缺省已兜底
    state.connection.query
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    await expect(createPdWriteHandler("pd-add")({ node: { req: { method: "POST" } } })).resolves.toEqual({ code: 200, msg: "操作成功" });
    expect(state.connection.query.mock.calls[0][0].sql).toContain("SELECT id FROM pd WHERE flowNo = ? AND process = ? AND pdDate = ?");
    expect(state.connection.query.mock.calls[1][0].sql).toContain("INSERT INTO pd");
  });

  it("defaults a missing pdDate to the workshop day (UTC+8)", async () => {
    state.body = { requestId: "pd-1c", flowNo: "TW002", process: "玻封", number: 5, pdNumber: 5 };
    state.connection.query
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    await createPdWriteHandler("pd-add")({ node: { req: { method: "POST" } } });
    const insertCall = state.connection.query.mock.calls[1];
    expect(insertCall[0].sql).toContain("pdDate");
    const params = insertCall[1];
    const expected = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
    expect(params).toContain(expected);
  });

  it("converts a same-day duplicate scan (flowNo+process+pdDate) into an update", async () => {
    state.body = { requestId: "pd-2", flowNo: "TW001", process: "测试分选", pdDate: "2026-08-30", number: 5, pdNumber: 8.8 };
    // 查重 SELECT(命中) -> 存在性 SELECT -> UPDATE -> 操作日志
    state.connection.query
      .mockResolvedValueOnce([[{ id: "existing-row" }], []])
      .mockResolvedValueOnce([[{ id: "existing-row" }], []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    const result = await createPdWriteHandler("pd-add")({ node: { req: { method: "POST" } } });
    expect(result).toEqual({ code: 200, msg: "该单今日已盘点，已覆盖更新上一次记录" });
    const updateCall = state.connection.query.mock.calls[2];
    expect(updateCall[0].sql).toContain("UPDATE pd SET");
    expect(updateCall[1]).toContain("existing-row");
    expect(state.connection.query.mock.calls.some(([q]) => String(q.sql).includes("INSERT INTO pd"))).toBe(false);
  });

  it("keeps the warehouse table separate from the process table", async () => {
    state.body = { requestId: "pd-ck-1", mertiralid: "M001", kuwei: "A-01", number: 3 };
    // pd_cangku 不参与查重/日期兜底：INSERT -> 操作日志
    state.connection.query.mockResolvedValueOnce([{ affectedRows: 1 }, []]).mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    await expect(createPdWriteHandler("pd-ck-add")({ node: { req: { method: "POST" } } })).resolves.toEqual({ code: 200, msg: "操作成功" });
    expect(state.connection.query.mock.calls[0][0].sql).toContain("INSERT INTO pd_cangku (id, mertiralid, kuwei, number)");
  });
});
