import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  query: {},
  params: {},
  authenticated: {
    token: "test-token",
    session: {
      userId: 1,
      deptId: 1,
      user: { userId: 1 },
      roles: [],
      permissions: [],
    },
  },
  pool: { query: vi.fn() },
}));

vi.mock("h3", () => ({
  getQuery: vi.fn(() => state.query),
  getRouterParam: vi.fn((_event, name) => state.params[name]),
}));

vi.mock("../../server/utils/auth.ts", () => ({
  getAuthSession: vi.fn(async () => state.authenticated),
}));

vi.mock("../../server/utils/mysql.ts", () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}));

describe("Nitro pure-MySQL read routes", () => {
  let createSystemReadHandler;
  let createCustomReadHandler;
  let consoleError;

  beforeAll(async () => {
    ({ createSystemReadHandler } = await import("../../server/utils/system-read.ts"));
    ({ createCustomReadHandler } = await import("../../server/utils/custom-read.ts"));
  });

  beforeEach(() => {
    state.query = {};
    state.params = {};
    state.authenticated = {
      token: "test-token",
      session: {
        userId: 1,
        deptId: 1,
        user: { userId: 1 },
        roles: [],
        permissions: [],
      },
    };
    state.pool.query.mockReset();
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("keeps system list pagination, filters, and allow-listed sorting", async () => {
    state.query = {
      pageNum: "2",
      pageSize: "3",
      configName: "业务",
      orderByColumn: "configId",
      isAsc: "descending",
    };
    state.pool.query
      .mockResolvedValueOnce([[{ total: "4" }], []])
      .mockResolvedValueOnce([[{ config_id: 9, config_name: "业务参数" }], []]);

    const result = await createSystemReadHandler("config-list")({});

    expect(result).toEqual({
      code: 200,
      msg: "查询成功",
      rows: [{ configId: 9, configName: "业务参数" }],
      total: 4,
    });
    expect(state.pool.query).toHaveBeenCalledTimes(2);
    expect(state.pool.query.mock.calls[0][1]).toEqual(["业务"]);
    expect(state.pool.query.mock.calls[1][1]).toEqual(["业务", 3, 3]);
    expect(state.pool.query.mock.calls[1][0].sql).toContain("ORDER BY config_id DESC");

    state.query = { orderByColumn: "config_id;DROP TABLE sys_config" };
    await expect(createSystemReadHandler("config-list")({})).resolves.toEqual({
      code: 500,
      msg: "参数不符合规范，不能进行查询",
    });
    expect(state.pool.query).toHaveBeenCalledTimes(2);
  });

  it("allows the anonymous dictionary-data lookup and preserves an empty result", async () => {
    state.authenticated = null;
    state.params = { dictType: "sys_user_sex" };
    state.pool.query.mockResolvedValueOnce([[], []]);

    await expect(createSystemReadHandler("dict-data-type")({})).resolves.toEqual({
      code: 200,
      msg: "操作成功",
      data: [],
    });
    expect(state.pool.query.mock.calls[0][1]).toEqual(["sys_user_sex"]);
  });

  it("returns the Java-compatible menu tree shape for the administrator", async () => {
    state.pool.query.mockResolvedValueOnce([[
      { menu_id: 1, parent_id: 0, menu_name: "系统", menu_type: "M" },
      { menu_id: 2, parent_id: 1, menu_name: "用户", menu_type: "C" },
    ], []]);

    await expect(createSystemReadHandler("menu-tree")({})).resolves.toEqual({
      code: 200,
      msg: "操作成功",
      data: [{ id: 1, label: "系统", menuType: "M", children: [{ id: 2, label: "用户", menuType: "C" }] }],
    });
    expect(state.pool.query.mock.calls[0][1]).toEqual([]);
  });

  it("includes function permissions in role authorization without adding them to page menus", async () => {
    state.params = { roleId: "12" };
    state.pool.query
      .mockResolvedValueOnce([[
        { menu_id: 1, parent_id: 0, menu_name: "销售报价单", menu_type: "C" },
        { menu_id: 2, parent_id: 1, menu_name: "报价单初审", menu_type: "F" },
      ], []])
      .mockResolvedValueOnce([[{ menu_id: 2 }], []]);

    const result = await createSystemReadHandler("menu-role-tree")({});

    expect(result).toMatchObject({
      code: 200,
      checkedKeys: [2],
      menus: [{
        id: 1,
        label: "销售报价单",
        menuType: "C",
        children: [{ id: 2, label: "报价单初审", menuType: "F" }],
      }],
    });
    expect(state.pool.query.mock.calls[0][0].sql).toContain("m.menu_type IN ('M', 'C', 'F')");
    expect(state.pool.query.mock.calls[1][0].sql).toContain("m.menu_type IN ('M', 'C', 'F')");
  });

  it("uses parameterized custom queries and maps database errors to safe messages", async () => {
    state.query = { pageNum: "1", pageSize: "5", packageName: "封装" };
    state.pool.query
      .mockResolvedValueOnce([[{ total: 0 }], []])
      .mockResolvedValueOnce([[], []]);

    await expect(createCustomReadHandler("process-target-list")({})).resolves.toEqual({
      code: 200,
      msg: "查询成功",
      rows: [],
      total: 0,
    });
    expect(state.pool.query.mock.calls[0][1]).toEqual(["封装"]);
    expect(state.pool.query.mock.calls[1][1]).toEqual(["封装", 0, 5]);
    expect(state.pool.query.mock.calls[1][0].sql).not.toContain("封装");

    state.pool.query.mockReset();
    state.params = { userid: "wx-user-1" };
    state.pool.query.mockRejectedValueOnce(new Error("mysql://user:secret@example.test/app"));
    await expect(createCustomReadHandler("wxuser-detail")({})).resolves.toEqual({
      code: 500,
      msg: "获取企业微信成员详情失败",
    });
    expect(consoleError.mock.calls.flat().join(" ")).not.toContain("secret");
  });

  it("preserves Java base-entity fields for message configuration details", async () => {
    state.params = { id: "1" };
    state.pool.query.mockResolvedValueOnce([[
      {
        id: 1,
        type: "通知",
        isSend: "0",
        receiverIds: null,
        createtime: null,
        parentid: null,
        msg: "测试消息",
      },
    ], []]);

    await expect(createCustomReadHandler("msgtowx-detail")({})).resolves.toEqual({
      code: 200,
      msg: "操作成功",
      data: {
        createBy: null,
        createTime: null,
        updateBy: null,
        updateTime: null,
        id: 1,
        type: "通知",
        isSend: "0",
        receiverIds: null,
        createtime: null,
        parentid: null,
        msg: "测试消息",
      },
    });
  });
});
