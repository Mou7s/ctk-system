import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [],
  query: vi.fn(),
  pool: { query: vi.fn() },
}));

vi.mock("../../server/utils/mysql.ts", () => ({
  getMysqlPool: () => state.pool,
  mysqlQueryOptions: (sql) => ({ sql }),
}));

describe("Nitro executeSql WeCom notification", () => {
  let notifyExecuteSql;

  beforeEach(async () => {
    globalThis.__executeSqlWecomToken = undefined;
    state.rows = [];
    state.pool.query.mockReset().mockResolvedValue([state.rows]);
    vi.unstubAllGlobals();
    ({ notifyExecuteSql } = await import("../../server/utils/execute-sql-wecom.ts"));
  });

  it("skips without a complete sys_config entry", async () => {
    await expect(notifyExecuteSql("ops", "success", 1000)).resolves.toEqual({
      status: "skipped",
      message: "未配置企业微信通知",
    });
  });

  it("sends success text using config values without logging secrets", async () => {
    state.rows = [
      { config_key: "wx.work.corpId", config_value: "corp" },
      { config_key: "wx.work.corpSecret", config_value: "secret-value" },
      { config_key: "wx.work.agentId", config_value: "1000025" },
      { config_key: "wx.work.opsNotifyRecipients", config_value: "ops-user" },
    ];
    state.pool.query.mockResolvedValueOnce([state.rows]);
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      if (String(url).includes("gettoken")) return new Response(JSON.stringify({ errcode: 0, access_token: "token-value", expires_in: 7200 }), { status: 200 });
      return new Response(JSON.stringify({ errcode: 0 }), { status: 200 });
    }));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(notifyExecuteSql("ops", "success", 2000)).resolves.toEqual({ status: "sent" });
    const sendCall = vi.mocked(fetch).mock.calls.find(([url]) => String(url).includes("message/send"));
    expect(sendCall).toBeTruthy();
    expect(JSON.parse(sendCall[1].body).text.content).toContain("重建索引成功");
    expect(error).not.toHaveBeenCalled();
    expect(error.mock.calls.flat()).not.toContain("secret-value");
    error.mockRestore();
    vi.unstubAllGlobals();
  });

  it("turns an API timeout/failure into a notification status", async () => {
    state.rows = [
      { config_key: "wx.work.corpId", config_value: "corp" },
      { config_key: "wx.work.corpSecret", config_value: "secret-value" },
      { config_key: "wx.work.agentId", config_value: "1000025" },
      { config_key: "wx.work.costOptimizeNotifyUserId", config_value: "cost-user" },
    ];
    state.pool.query.mockResolvedValueOnce([state.rows]);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network timeout") }));
    await expect(notifyExecuteSql("cost", "failure", 1000)).resolves.toEqual({
      status: "failed",
      message: "企业微信通知失败",
    });
    vi.unstubAllGlobals();
  });
});
