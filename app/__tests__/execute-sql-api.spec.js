import { describe, expect, it, vi } from "vitest";
import { createExecuteSqlApi } from "../../app/packages/api/modules/executeSql.js";

describe("executeSql API client", () => {
  it("passes the standard request body to every Nitro operation", async () => {
    const request = vi.fn().mockResolvedValue({ code: 200, msg: "ok", data: { status: "success" } });
    const api = createExecuteSqlApi(request);
    const body = { requestId: "execute-1", reason: "测试维护", dateStr: "2026-08" };

    await api.updateTimeOfGXLL(body);
    await api.handleCBData(body);
    await api.writeToMO(body);
    await api.buildIndexOfKingdee(body);
    await api.deletePZ(body);

    expect(request).toHaveBeenCalledTimes(5);
    expect(request.mock.calls.map(([config]) => config.data)).toEqual([body, body, body, body, body]);
  });

  it("keeps only the temporary Java scalar-response adapter", async () => {
    const request = vi.fn().mockResolvedValue(1);
    const response = await createExecuteSqlApi(request).writeToMO({ requestId: "legacy-1", reason: "回滚兼容" });
    expect(response).toMatchObject({ code: 200, data: { status: "success", legacyFallback: true } });
  });
});
