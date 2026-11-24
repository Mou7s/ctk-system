import { describe, expect, it, vi, beforeEach } from "vitest";

// mock mysql pool：readWarningReceivers / 快照查询共用
const state = vi.hoisted(() => ({ queries: [] }));

vi.mock("../../server/utils/mysql", () => ({
  getMysqlPool: () => ({
    query: async (sql) => {
      const hit = state.queries.find((q) => sql.includes(q.sql));
      const rows = hit ? hit.rows : [];
      return [rows];
    },
  }),
  mysqlQueryOptions: (sql) => sql,
}));

vi.mock("../../server/utils/kucun-warning-export", async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    renderWarningWorkbookBuffer: () => new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
    warningExcelFileName: () => "金蝶库存预警报表_测试.xlsx",
  };
});

const fetchCalls = [];
vi.stubGlobal("fetch", async (url, init) => {
  fetchCalls.push({ url, init });
  if (url.includes("gettoken")) {
    return { ok: true, json: async () => ({ errcode: 0, access_token: "T", expires_in: 7200 }) };
  }
  if (url.includes("media/upload")) {
    return { ok: true, json: async () => ({ errcode: 0, media_id: "MEDIA1" }) };
  }
  if (url.includes("message/send")) {
    const body = JSON.parse(init.body);
    // tester02 模拟发送失败
    const errcode = body.touser === "tester02" ? 81013 : 0;
    return { ok: true, json: async () => ({ errcode, errmsg: errcode ? "user not found" : "ok" }) };
  }
  return { ok: true, json: async () => ({ errcode: -1, errmsg: "unknown" }) };
});

import { runKucunWarningPush, readWarningReceivers } from "../../server/utils/nitro-jobs/kucun-warning-send";

describe("kucun-warning-send（112 推送）", () => {
  beforeEach(() => {
    fetchCalls.length = 0;
    state.queries = [
      {
        sql: "config_value FROM sys_config WHERE config_key = ?",
        rows: [{ config_value: "tester01,reviewer01,tester02" }],
      },
      {
        sql: "FROM kucun_warning",
        rows: [
          { stock_org_code: "100", stock_org_name: "示例企业有限公司", material_code: "N103010004", material_name: "黑胶", specification: "S", unit: "千克", safe_stock: 1350, actual_total: 755.98, warning_status: "低于安全库存 (偏低)" },
          { stock_org_code: "100", stock_org_name: "示例企业有限公司", material_code: "N105040001", material_name: "框架", specification: "", unit: "千克", safe_stock: 3000, actual_total: 11304.98, warning_status: "正常" },
        ],
      },
      {
        sql: "config_key IN",
        rows: [
          { config_key: "wx.work.corpId", config_value: "corp" },
          { config_key: "wx.work.corpSecret", config_value: "sec" },
          { config_key: "wx.work.agentId", config_value: "1000025" },
        ],
      },
    ];
  });

  it("读取接收人列表（逗号分隔，去空格）", async () => {
    expect(await readWarningReceivers()).toEqual(["tester01", "reviewer01", "tester02"]);
  });

  it("真实发送：逐人发送，部分失败不影响他人", async () => {
    const r = await runKucunWarningPush();
    expect(r.totalCount).toBe(2);
    expect(r.belowCount).toBe(1);
    expect(r.sent).toEqual(["tester01", "reviewer01"]);
    expect(r.failed).toEqual([{ userId: "tester02", error: expect.stringContaining("81013") }]);
    expect(r.ok).toBe(false); // 有失败即不 ok
    const sendBodies = fetchCalls.filter((c) => c.url.includes("message/send")).map((c) => JSON.parse(c.init.body));
    expect(sendBodies.map((b) => b.touser)).toEqual(["tester01", "reviewer01", "tester02"]);
    expect(sendBodies.every((b) => b.msgtype === "file" && b.file.media_id === "MEDIA1")).toBe(true);
  });

  it("接收人为空：跳过不发送", async () => {
    state.queries[0].rows = [{ config_value: "" }];
    const r = await runKucunWarningPush();
    expect(r.skipped).toContain("未配置接收人");
    expect(fetchCalls.length).toBe(0);
  });

  it("快照为空：跳过不发送", async () => {
    state.queries[1].rows = [];
    const r = await runKucunWarningPush();
    expect(r.skipped).toContain("快照为空");
    expect(fetchCalls.length).toBe(0);
  });
});