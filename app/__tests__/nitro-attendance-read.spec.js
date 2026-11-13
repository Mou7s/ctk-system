import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  query: {},
  session: {
    userId: 1,
    permissions: ["tk_custom:attendance:query"],
  },
  pool: { query: vi.fn() },
}));

vi.mock("h3", () => ({
  getQuery: vi.fn(() => state.query),
}));

vi.mock("../../server/utils/auth.ts", () => ({
  getAuthSession: vi.fn(async () => ({ session: state.session })),
  hasPermission: vi.fn((session, permission) =>
    session.userId === 1 || (session.permissions || []).includes(permission),
  ),
}));

vi.mock("../../server/utils/attendance-mysql.ts", () => ({
  getAttendanceMysqlPool: vi.fn(() => state.pool),
  attendanceQueryOptions: vi.fn((sql) => ({ sql })),
}));

globalThis.defineEventHandler = (handler) => handler;

describe("Nitro attendance read utils", () => {
  let attendance;
  let consoleError;

  beforeEach(async () => {
    if (!attendance) {
      attendance = await import("../../server/utils/attendance-read.ts");
    }
    state.query = {};
    state.session = { userId: 7, permissions: ["tk_custom:attendance:query"] };
    state.pool.query.mockReset();
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => consoleError.mockRestore());

  function eventWith(query) {
    state.query = query;
    return {};
  }

  it("queries the yearly record table with date range and pagination", async () => {
    state.pool.query
      .mockResolvedValueOnce([[{ id: 1, user_name: "罗锋平" }], []])
      .mockResolvedValueOnce([[{ total: 42 }], []]);

    await expect(
      attendance.listAttendanceRecords(
        eventWith({ year: "2026", dateFrom: "2026-09-04", dateTo: "2026-09-04", pageNum: "1", pageSize: "20" }),
      ),
    ).resolves.toEqual({
      code: 200,
      msg: "查询成功",
      rows: [{ id: 1, userName: "罗锋平" }],
      total: 42,
    });

    const select = state.pool.query.mock.calls[0];
    expect(select[0].sql).toContain("FROM device_record2026");
    expect(select[0].sql).toContain("ORDER BY id DESC");
    expect(select[1]).toEqual(["2026-09-04", "2026-09-04", 20, 0]);
  });

  it("rejects forged table names by falling back to the current year table", async () => {
    state.pool.query
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[{ total: 0 }], []]);

    await attendance.listAttendanceRecords(eventWith({ year: "2026; DROP TABLE userinfo" }));
    const select = state.pool.query.mock.calls[0];
    expect(select[0].sql).toMatch(/FROM device_record\d{4} /);
    expect(select[0].sql).not.toContain("DROP TABLE");
  });

  it("keeps SQL-ish keywords as bound parameters instead of injecting them", async () => {
    state.pool.query
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[{ total: 0 }], []]);

    const keyword = "DELETE FROM userinfo";
    await attendance.listAttendanceRecords(eventWith({ keyword }));

    const select = state.pool.query.mock.calls[0];
    expect(select[0].sql).not.toContain(keyword);
    // 关键字只能作为绑定参数出现，绝不能拼进 SQL 文本
    expect(select[1]).toContain(keyword);
  });

  it("blocks callers without the attendance query permission", async () => {
    state.session = { userId: 7, permissions: [] };
    await expect(attendance.listAttendanceRecords(eventWith({}))).resolves.toMatchObject({ code: 403 });
    expect(state.pool.query).not.toHaveBeenCalled();
  });

  it("maps database failures without exposing connection details", async () => {
    state.pool.query.mockRejectedValueOnce(new Error("mysql://root:secret@192.0.2.239/app_db"));
    await expect(attendance.getAttendanceSummary(eventWith({}))).resolves.toEqual({
      code: 500,
      msg: "查询考勤汇总失败",
    });
    expect(consoleError.mock.calls.flat().join(" ")).not.toContain("secret");
  });
});
