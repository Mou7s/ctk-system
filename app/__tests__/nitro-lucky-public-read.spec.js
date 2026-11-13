import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  query: { activityId: "1" },
  params: { id: "1" },
  pool: { query: vi.fn() },
  config: {
    profilePath: "C:/profile",
    wxMpQrCodeUrl: "/profile/upload/lucky/mp-qrcode.png",
  },
}));

vi.mock("h3", () => ({
  getQuery: vi.fn(() => state.query),
  getRouterParam: vi.fn((_event, name) => state.params?.[name]),
  getHeader: vi.fn((event, name) => event?.headers?.[name]),
  getRequestURL: vi.fn(() => new URL("http://127.0.0.1:3001/prod-api/tk_custom/lucky/public/screenConfig")),
}));
vi.mock("node:fs", async (importOriginal) => ({
  ...(await importOriginal()),
  default: { ...(await importOriginal()), existsSync: vi.fn(() => true) },
  existsSync: vi.fn(() => true),
}));
vi.mock("../../server/utils/auth.ts", () => ({ getAuthSession: vi.fn(async () => null) }));
vi.mock("../../server/utils/mysql.ts", () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}));
vi.mock("../../server/utils/runtime.ts", () => ({ getNitroServerConfig: vi.fn(() => state.config) }));

globalThis.defineEventHandler = (handler) => handler;

describe("Nitro lucky public screen config route", () => {
  let handler;
  let activityHandler;
  let winnersHandler;
  let myPrizesHandler;
  let consoleError;

  beforeAll(async () => {
    handler = (await import("../../server/routes/prod-api/tk_custom/lucky/public/screenConfig.get.ts")).default;
    activityHandler = (await import("../../server/routes/prod-api/tk_custom/lucky/public/activity/[id].get.ts")).default;
    winnersHandler = (await import("../../server/routes/prod-api/tk_custom/lucky/public/recentWinners.get.ts")).default;
    myPrizesHandler = (await import("../../server/routes/prod-api/tk_custom/lucky/public/myPrizes.get.ts")).default;
  });

  beforeEach(() => {
    state.query = { activityId: "1" };
    state.params = { id: "1" };
    state.pool.query.mockReset();
    state.pool.query.mockResolvedValueOnce([[{ id: 1, title: "抽奖活动", status: "0" }], []]);
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => consoleError.mockRestore());

  it("returns the public Java-compatible QR configuration without authentication", async () => {
    await expect(handler({ headers: { "x-forwarded-proto": "https", "x-forwarded-host": "example.test" } })).resolves.toEqual({
      code: 200,
      msg: "操作成功",
      data: {
        activityId: 1,
        activityTitle: "抽奖活动",
        useMpQrCode: true,
        qrImageUrl: "/prod-api/profile/upload/lucky/mp-qrcode.png",
        oauthEntryUrl: "https://example.test/prod-api/tk_custom/lucky/public/loginByWx?activityId=1",
      },
    });
  });

  it("rejects invalid or disabled activities without querying unrelated data", async () => {
    state.query = { activityId: "0" };
    await expect(handler({})).resolves.toEqual({ code: 500, msg: "参数不符合规范，不能进行查询" });
    expect(state.pool.query).not.toHaveBeenCalled();

    state.query = { activityId: "2" };
    state.pool.query.mockReset();
    state.pool.query.mockResolvedValueOnce([[{ id: 2, title: "已停用", status: "1" }], []]);
    await expect(handler({})).resolves.toEqual({ code: 500, msg: "抽奖活动不存在或已被禁用" });
  });

  it("maps database failures without exposing connection details", async () => {
    state.pool.query.mockReset().mockRejectedValueOnce(new Error("mysql://user:secret@example.test/app"));
    await expect(handler({})).resolves.toEqual({ code: 500, msg: "获取抽奖大屏配置失败" });
    expect(consoleError.mock.calls.flat().join(" ")).not.toContain("secret");
  });

  it("returns only public activity and prize fields in Java order", async () => {
    state.pool.query
      .mockReset()
      .mockResolvedValueOnce([[{
        id: 1,
        title: "抽奖活动",
        description: "规则",
        start_time: "2026-08-01 00:00:00",
        end_time: "2026-08-31 23:59:59",
        draw_limit: 1,
        status: "0",
        create_by: "admin",
        create_time: "2026-08-01 00:00:00",
        update_by: "admin",
        update_time: "2026-08-01 00:00:00",
        remark: null,
      }], []])
      .mockResolvedValueOnce([[{
        id: 10,
        prize_name: "一等奖",
        prize_level: "一等奖",
        prize_type: "0",
        prize_icon: "gold",
      }, {
        id: 11,
        prize_name: "现金",
        prize_level: "二等奖",
        prize_type: "1",
        prize_icon: "red",
      }], []]);
    await expect(activityHandler({})).resolves.toEqual({
      code: 200,
      msg: "操作成功",
      data: {
        activity: expect.objectContaining({ id: 1, title: "抽奖活动", startTime: "2026-08-01 00:00:00" }),
        prizes: [{ id: 10, prizeName: "一等奖", prizeLevel: "一等奖", prizeType: "0", prizeIcon: "gold" }],
      },
    });
  });

  it("masks recent winner names and phones without exposing raw records", async () => {
    state.query = { activityId: "1" };
    state.pool.query
      .mockReset()
      .mockResolvedValueOnce([[{
        user_name: "张三",
        user_phone: "13812345678",
        prize_name: "一等奖",
        draw_time: "2026-08-11 10:00:00",
      }, {
        user_name: null,
        user_phone: "unknown",
        prize_name: "二等奖",
        draw_time: "2026-08-11 09:00:00",
      }], []]);
    await expect(winnersHandler({})).resolves.toEqual({
      code: 200,
      msg: "操作成功",
      data: [
        { userName: "张*", userPhone: "138****5678", prizeName: "一等奖", drawTime: "2026-08-11 10:00:00" },
        { userName: "粉丝*", userPhone: "1**********", prizeName: "二等奖", drawTime: "2026-08-11 09:00:00" },
      ],
    });
  });

  it("keeps Java's zero activity id behavior for the public winner read", async () => {
    state.query = { activityId: "0" };
    state.pool.query.mockReset().mockResolvedValueOnce([[], []]);
    await expect(winnersHandler({})).resolves.toEqual({
      code: 200,
      msg: "操作成功",
      data: [],
    });
  });

  it("returns Java-compatible personal prize records without requiring authentication", async () => {
    state.query = { activityId: "1", phone: "138123" };
    state.pool.query
      .mockReset()
      .mockResolvedValueOnce([[{
        create_by: null,
        create_time: null,
        update_by: "admin",
        update_time: null,
        remark: null,
        id: 9,
        activity_id: 1,
        user_phone: "13812345678",
        user_name: "张三",
        user_company: "示例企业",
        user_job: "工程师",
        openid: "openid-redacted-in-test",
        prize_id: 10,
        prize_name: "一等奖",
        win_status: "1",
        redeem_code: "CODE-9",
        draw_time: "2026-08-11 10:00:00",
        redeem_time: null,
      }], []]);

    await expect(myPrizesHandler({})).resolves.toEqual({
      code: 200,
      msg: "操作成功",
      data: [{
        createBy: null,
        createTime: null,
        updateBy: "admin",
        updateTime: null,
        remark: null,
        id: 9,
        activityId: 1,
        userPhone: "13812345678",
        userName: "张三",
        userCompany: "示例企业",
        userJob: "工程师",
        openid: "openid-redacted-in-test",
        prizeId: 10,
        prizeName: "一等奖",
        winStatus: "1",
        redeemCode: "CODE-9",
        drawTime: "2026-08-11 10:00:00",
        redeemTime: null,
      }],
    });
    expect(state.pool.query.mock.calls[0][1]).toEqual([1, "138123"]);
    expect(state.pool.query.mock.calls[0][0].sql).toContain("user_phone LIKE CONCAT('%', ?, '%')");
  });

  it("keeps Java's empty-phone validation and safe error boundary", async () => {
    state.query = { activityId: "1", phone: "   " };
    await expect(myPrizesHandler({})).resolves.toEqual({ code: 500, msg: "手机号不能为空" });
    expect(state.pool.query).not.toHaveBeenCalled();

    state.query = { activityId: "1", phone: "138" };
    state.pool.query.mockReset().mockRejectedValueOnce(new Error("mysql://user:secret@example.test/app"));
    await expect(myPrizesHandler({})).resolves.toEqual({ code: 500, msg: "获取我的中奖记录失败" });
    expect(consoleError.mock.calls.flat().join(" ")).not.toContain("secret");
  });
});
