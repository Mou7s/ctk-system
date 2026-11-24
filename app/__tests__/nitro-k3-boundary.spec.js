import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  config: {
    k3BaseUrl: "https://k3-primary.test",
    k3BaseUrlIntranet: "https://k3-fallback.test",
    k3DbId: "AIS_TEST",
    k3Username: "reader",
    k3AppId: "app",
    k3AppSecret: "secret",
    k3Lcid: 2052,
    k3ConnectTimeoutMs: 1000,
    k3RequestTimeoutMs: 1000,
  },
}));

vi.mock("../../server/utils/runtime.ts", () => ({
  getNitroServerConfig: () => state.config,
}));

vi.mock("../../server/utils/k3-config.ts", () => ({
  getNitroK3Config: async () => state.config,
}));

describe("Nitro K3Cloud dependency boundary", () => {
  let executeBillQuery;
  let saveBill;
  let submitBill;

  beforeEach(async () => {
    state.config.k3BaseUrl = "https://k3-primary.test";
    state.config.k3BaseUrlIntranet = "https://k3-fallback.test";
    globalThis.__nitroK3State = undefined;
    globalThis.__nitroK3Login = undefined;
    ({ executeBillQuery, saveBill, submitBill } = await import("../../server/utils/k3.ts"));
  });

  it("distinguishes missing K3 configuration from an empty query result", async () => {
    state.config.k3BaseUrl = "";
    state.config.k3BaseUrlIntranet = "";

    await expect(executeBillQuery({ formId: "PRD_MO", fieldKeys: ["FBillNo"] }))
      .rejects.toMatchObject({ kind: "config", statusCode: 503 });
  });

  it("classifies a K3 login timeout as a dependency timeout", async () => {
    vi.stubGlobal("fetch", vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("aborted")));
    })));

    await expect(executeBillQuery({ formId: "PRD_MO", fieldKeys: ["FBillNo"] }))
      .rejects.toMatchObject({ kind: "timeout", statusCode: 504 });
    vi.unstubAllGlobals();
  });

  it("classifies a rejected K3 login as an external permission error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ LoginResultType: 2 }), {
      status: 200,
      headers: { "set-cookie": "KDSVC=redacted; Path=/" },
    })));

    await expect(executeBillQuery({ formId: "PRD_MO", fieldKeys: ["FBillNo"] }))
      .rejects.toMatchObject({ kind: "permission", statusCode: 502 });
    vi.unstubAllGlobals();
  });

  it("re-authenticates once when K3 returns a lost-session response body", async () => {
    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
      call += 1;
      if (call === 1) {
        return new Response(JSON.stringify({ LoginResultType: 1 }), {
          status: 200,
          headers: { "set-cookie": "KDSVC=stale-session; Path=/" },
        });
      }
      if (call === 2) {
        return new Response(JSON.stringify({
          Result: {
            ResponseStatus: {
              ErrorCode: 500,
              IsSuccess: false,
              Errors: [{ Message: "会话信息已丢失，请重新登录" }],
            },
          },
        }), { status: 200 });
      }
      if (call === 3) {
        return new Response(JSON.stringify({ LoginResultType: 1 }), {
          status: 200,
          headers: { "set-cookie": "KDSVC=fresh-session; Path=/" },
        });
      }
      return new Response(JSON.stringify([["MO001"]]), { status: 200 });
    }));

    await expect(executeBillQuery({ formId: "PRD_MO", fieldKeys: ["FBillNo"] }))
      .resolves.toEqual([["MO001"]]);
    expect(vi.mocked(fetch).mock.calls).toHaveLength(4);
    expect(vi.mocked(fetch).mock.calls[2][0]).toContain("LoginByAppSecret");
    expect(vi.mocked(fetch).mock.calls[3][0]).toContain("ExecuteBillQuery");
    vi.unstubAllGlobals();
  });

  it("turns structured K3 query failures into safe dependency errors", async () => {
    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return new Response(JSON.stringify({ LoginResultType: 1 }), {
          status: 200,
          headers: { "set-cookie": "KDSVC=valid-session; Path=/" },
        });
      }
      return new Response(JSON.stringify({
        Result: {
          ResponseStatus: {
            ErrorCode: 500,
            IsSuccess: false,
            Errors: [{ Message: "查询字段不存在" }],
          },
        },
      }), { status: 200 });
    }));

    await expect(executeBillQuery({ formId: "STK_Inventory", fieldKeys: ["FBaseQty"] }))
      .rejects.toMatchObject({ kind: "query", message: "K3Cloud 查询失败：查询字段不存在" });
    vi.unstubAllGlobals();
  });

  it("wraps K3 save and submit payloads and exposes the returned entity", async () => {
    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
      call += 1;
      if (call === 1) {
        return new Response(JSON.stringify({ LoginResultType: 1 }), {
          status: 200,
          headers: { "set-cookie": "KDSVC=write-session; Path=/" },
        });
      }
      return new Response(JSON.stringify({
        Result: { ResponseStatus: { IsSuccess: true, Errors: [], SuccessEntitys: [{ Id: 9, Number: "STK0001" }] } },
      }), { status: 200 });
    }));

    const saved = await saveBill("STK_InStock", { Model: { FBillNo: "STK0001" } }, "保存采购入库", true);
    expect(saved.successEntities[0]).toMatchObject({ Id: 9, Number: "STK0001" });
    const saveRequest = JSON.parse(vi.mocked(fetch).mock.calls[1][1].body);
    expect(saveRequest.parameters[0]).toBe("STK_InStock");
    expect(JSON.parse(saveRequest.parameters[1])).toEqual({ Model: { FBillNo: "STK0001" } });

    const submitted = await submitBill("STK_InStock", ["STK0001"], "提交采购入库");
    expect(submitted.responseStatus.IsSuccess).toBe(true);
    const submitRequest = JSON.parse(vi.mocked(fetch).mock.calls.at(-1)[1].body);
    expect(submitRequest.parameters[0]).toBe("STK_InStock");
    expect(JSON.parse(submitRequest.parameters[1])).toEqual({ Numbers: ["STK0001"] });
    vi.unstubAllGlobals();
  });
});
