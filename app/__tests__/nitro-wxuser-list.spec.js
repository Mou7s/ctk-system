import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  session: { userId: 2 },
  query: {},
  pool: { query: vi.fn() },
}));

vi.mock("h3", () => ({
  getQuery: vi.fn(() => state.query),
}));

vi.mock("../../server/utils/auth.ts", () => ({
  getAuthSession: vi.fn(async () => state.session),
}));

vi.mock("../../server/utils/mysql.ts", () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}));

globalThis.defineEventHandler = (handler) => handler;

describe("Nitro wxuser list route", () => {
  let handler;
  let consoleError;

  beforeAll(async () => {
    handler = (await import("../../server/routes/prod-api/tk_custom/wxuser/list.get.ts")).default;
  });

  beforeEach(() => {
    state.session = { userId: 2 };
    state.query = {};
    state.pool.query.mockReset();
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("keeps Java filters, pagination, sorting, and rows/total fields", async () => {
    state.query = {
      pageNum: "2",
      pageSize: "2",
      name: "Alice",
      dept: "生产",
      position: "操作员",
      orderByColumn: "name",
      isAsc: "descending",
    };
    state.pool.query
      .mockResolvedValueOnce([[{ total: "3" }], []])
      .mockResolvedValueOnce([[{
        userid: "alice-1",
        name: "Alice",
        dept: "生产",
        position: "操作员",
      }], []]);

    const result = await handler({});

    expect(result).toEqual({
      code: 200,
      msg: "查询成功",
      rows: [{ userid: "alice-1", name: "Alice", dept: "生产", position: "操作员" }],
      total: 3,
    });
    expect(state.pool.query).toHaveBeenCalledTimes(2);
    expect(state.pool.query.mock.calls[0][1]).toEqual(["Alice", "生产", "操作员"]);
    expect(state.pool.query.mock.calls[1][1]).toEqual(["Alice", "生产", "操作员", 2, 2]);
    expect(state.pool.query.mock.calls[1][0].sql).toContain("ORDER BY name DESC");
  });

  it("returns an empty paged result without treating it as a failure", async () => {
    state.pool.query
      .mockResolvedValueOnce([[{ total: 0 }], []])
      .mockResolvedValueOnce([[], []]);

    await expect(handler({})).resolves.toEqual({
      code: 200,
      msg: "查询成功",
      rows: [],
      total: 0,
    });
  });

  it("rejects unauthenticated, unsafe sort, and database-failure requests explicitly", async () => {
    state.session = null;
    await expect(handler({})).resolves.toEqual({ code: 401, msg: "登录状态已过期" });
    expect(state.pool.query).not.toHaveBeenCalled();

    state.session = { userId: 2 };
    state.query = { orderByColumn: "name;DROP TABLE wxuser" };
    await expect(handler({})).resolves.toEqual({
      code: 500,
      msg: "参数不符合规范，不能进行查询",
    });
    expect(state.pool.query).not.toHaveBeenCalled();

    state.query = {};
    state.pool.query.mockRejectedValueOnce(new Error("mysql://user:secret@example.test/app"));
    await expect(handler({})).resolves.toEqual({
      code: 500,
      msg: "获取企业微信成员列表失败",
    });
    expect(consoleError.mock.calls.flat().join(" ")).not.toContain("secret");
  });
});
