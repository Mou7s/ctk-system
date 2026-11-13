import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  config: {
    k3BaseUrl: "https://k3.test",
    k3BaseUrlIntranet: "",
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

describe("Nitro K3 unAudit/delete boundary", () => {
  let unAuditBill;
  let deleteBill;

  beforeEach(async () => {
    globalThis.__nitroK3State = undefined;
    globalThis.__nitroK3Login = undefined;
    ({ unAuditBill, deleteBill } = await import("../../server/utils/k3.ts"));
  });

  it("sends the form and numbers to UnAudit and Delete in order", async () => {
    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
      call += 1;
      if (call === 1) return new Response(JSON.stringify({ LoginResultType: 1 }), { status: 200, headers: { "set-cookie": "KDSVC=session; Path=/" } });
      return new Response(JSON.stringify({ Result: { ResponseStatus: { IsSuccess: true, Errors: [], SuccessEntitys: [{ Number: "CB001" }] } } }), { status: 200 });
    }));

    const unAudited = await unAuditBill("CB_ENDPROCOSTADJ", ["CB001"], "反审核测试");
    const unAuditCall = vi.mocked(fetch).mock.calls.find(([url]) => String(url).includes("UnAudit.common.kdsvc"));
    const unAuditPayload = JSON.parse(unAuditCall[1].body);
    expect(unAudited.successEntities).toHaveLength(1);
    expect(unAuditCall[0]).toContain("UnAudit.common.kdsvc");
    expect(unAuditPayload.parameters[0]).toBe("CB_ENDPROCOSTADJ");
    expect(JSON.parse(unAuditPayload.parameters[1])).toEqual({ Numbers: ["CB001"] });

    const deleted = await deleteBill("CB_ENDPROCOSTADJ", ["CB001"], "删除测试");
    const deleteCall = vi.mocked(fetch).mock.calls.find(([url]) => String(url).includes("Delete.common.kdsvc"));
    const deletePayload = JSON.parse(deleteCall[1].body);
    expect(deleted.successEntities).toHaveLength(1);
    expect(deleteCall[0]).toContain("Delete.common.kdsvc");
    expect(deletePayload.parameters[0]).toBe("CB_ENDPROCOSTADJ");
    expect(JSON.parse(deletePayload.parameters[1])).toEqual({ Numbers: ["CB001"] });
    vi.unstubAllGlobals();
  });

  it("does not retry a mutating call after an expired K3 session", async () => {
    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      call += 1;
      if (call === 1) return new Response(JSON.stringify({ LoginResultType: 1 }), { status: 200, headers: { "set-cookie": "KDSVC=session; Path=/" } });
      return new Response("not login", { status: 401 });
    }));

    await expect(unAuditBill("CB_ENDPROCOSTADJ", ["CB001"])).rejects.toMatchObject({ kind: "permission" });
    expect(call).toBe(2);
    vi.unstubAllGlobals();
  });
});
