import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  body: { requestId: "execute-1", reason: "测试维护操作", dateStr: "2026-08" },
  authenticated: { session: { userId: 2, userName: "admin" } },
  replay: null,
  update: vi.fn(async () => ({ date: "2026-08", success: true, reportDateUpdated: 1 })),
  cost: vi.fn(async () => ({ success: true, steps: [{ name: "索引", success: true }] })),
  index: vi.fn(async () => ({ success: true, durationMs: 12, steps: [{ name: "全库", success: true }] })),
  write: vi.fn(async () => ({ success: true, affectedRows: 4, steps: [{ name: "反写", success: true, affectedRows: 4 }] })),
  query: vi.fn(async () => []),
  unAudit: vi.fn(async () => ({ successEntities: [{ Number: "CB001" }] })),
  delete: vi.fn(async () => ({ successEntities: [{ Number: "CB001" }] })),
  notify: vi.fn(async () => ({ status: "sent" })),
  NitroWriteError: class NitroWriteError extends Error {
    constructor(message, statusCode = 500) { super(message); this.statusCode = statusCode; }
  },
  claim: vi.fn(async () => state.replay ? { ...state.claim, replay: state.replay } : state.claim),
  finish: vi.fn(async () => {}),
  release: vi.fn(async () => {}),
  audit: vi.fn(async () => {}),
}));

vi.mock("h3", () => ({
  getHeader: vi.fn((_event, name) => name === "idempotency-key" ? state.body.requestId : ""),
  readBody: vi.fn(async () => state.body),
}));
vi.mock("../../server/utils/auth.ts", () => ({
  getAuthSession: vi.fn(async () => state.authenticated),
}));
vi.mock("../../server/utils/execute-sql.ts", () => ({
  ExecuteSqlInputError: class ExecuteSqlInputError extends Error { statusCode = 400; },
  updateTimeOfGXLL: state.update,
  handleCBData: state.cost,
  buildIndexOfKingdee: state.index,
  writeToMO: state.write,
  normalizeExecuteSqlMonth: (value) => String(value),
}));
vi.mock("../../server/utils/execute-sql-wecom.ts", () => ({
  notifyExecuteSql: state.notify,
}));
vi.mock("../../server/utils/k3.ts", () => ({
  K3CloudError: class K3CloudError extends Error { statusCode = 502; },
  executeBillQuery: state.query,
  unAuditBill: state.unAudit,
  deleteBill: state.delete,
}));
vi.mock("../../server/utils/sqlserver.ts", () => ({
  SqlServerError: class SqlServerError extends Error { statusCode = 502; },
}));
vi.mock("../../server/utils/write.ts", () => ({
  NitroWriteError: state.NitroWriteError,
  claimWriteRequest: state.claim,
  finishWriteRequest: state.finish,
  releaseWriteRequest: state.release,
  recordStandaloneOperationLog: state.audit,
  text: (value) => String(value ?? "").trim(),
}));
vi.mock("../../server/utils/response.ts", () => ({
  apiSuccess: (data, msg = "操作成功") => ({ code: 200, msg, data }),
  apiError: (msg, code = 500, data) => ({ code, msg, ...(data === undefined ? {} : { data }) }),
  errorMessage: (error) => error?.message || "unknown error",
}));

describe("Nitro executeSql migration routes", () => {
  let handlers;

  beforeAll(async () => {
    globalThis.defineEventHandler = (handler) => handler;
    handlers = {
      update: (await import("../../server/routes/prod-api/kingdee/updateTimeOfGXLL.post.ts")).default,
      cost: (await import("../../server/routes/prod-api/kingdee/handleCBData.post.ts")).default,
      index: (await import("../../server/routes/prod-api/kingdee/buildIndexOfKingdee.post.ts")).default,
      write: (await import("../../server/routes/prod-api/kingdee/writeToMO.post.ts")).default,
      delete: (await import("../../server/routes/prod-api/kingdee/deletePZ.post.ts")).default,
    };
  });

  beforeEach(() => {
    state.body = { requestId: "execute-1", reason: "测试维护操作", dateStr: "2026-08" };
    state.authenticated = { session: { userId: 2, userName: "admin" } };
    state.replay = null;
    for (const fn of [state.update, state.cost, state.index, state.write, state.query, state.unAudit, state.delete, state.notify, state.claim, state.finish, state.release, state.audit]) fn.mockClear();
    state.update.mockResolvedValue({ date: "2026-08", success: true, reportDateUpdated: 1 });
    state.cost.mockResolvedValue({ success: true, steps: [{ name: "索引", success: true }] });
    state.index.mockResolvedValue({ success: true, durationMs: 12, steps: [{ name: "全库", success: true }] });
    state.write.mockResolvedValue({ success: true, affectedRows: 4, steps: [{ name: "反写", success: true, affectedRows: 4 }] });
    state.query.mockResolvedValue([]);
    state.unAudit.mockResolvedValue({ successEntities: [{ Number: "CB001" }] });
    state.delete.mockResolvedValue({ successEntities: [{ Number: "CB001" }] });
    state.notify.mockResolvedValue({ status: "sent" });
    state.claim.mockImplementation(async () => state.replay ? { ...state.claim, replay: state.replay } : state.claim);
  });

  it("rejects all five operations before any dependency call when unauthenticated", async () => {
    state.authenticated = null;
    for (const handler of Object.values(handlers)) {
      await expect(handler({})).resolves.toEqual({ code: 401, msg: "登录状态已过期" });
    }
    expect(state.update).not.toHaveBeenCalled();
    expect(state.cost).not.toHaveBeenCalled();
    expect(state.index).not.toHaveBeenCalled();
    expect(state.write).not.toHaveBeenCalled();
    expect(state.query).not.toHaveBeenCalled();
    expect(state.claim).not.toHaveBeenCalled();
  });

  it("requires an operation reason and a request id", async () => {
    state.body = { dateStr: "2026-08", requestId: "execute-1" };
    await expect(handlers.update({})).resolves.toEqual({ code: 400, msg: "操作原因不能为空" });
    state.body = { dateStr: "2026-08", reason: "测试维护操作" };
    await expect(handlers.update({})).resolves.toEqual({ code: 400, msg: "幂等键不能为空" });
    expect(state.claim).not.toHaveBeenCalled();
  });

  it("uses standard responses for the four SQL operations and no-op delete", async () => {
    await expect(handlers.update({})).resolves.toMatchObject({ code: 200, data: { operation: "update-time-of-gxll", status: "success" } });
    await expect(handlers.cost({})).resolves.toMatchObject({ code: 200, data: { operation: "handle-cb-data", status: "success", notificationStatus: "sent" } });
    await expect(handlers.index({})).resolves.toMatchObject({ code: 200, data: { operation: "build-index-of-kingdee", durationMs: 12, notificationStatus: "sent" } });
    await expect(handlers.write({})).resolves.toMatchObject({ code: 200, data: { operation: "write-to-mo", affectedRows: 4 } });
    await expect(handlers.delete({})).resolves.toMatchObject({ code: 200, data: { status: "noop", matchedBillCount: 0, deletedBillCount: 0 } });
    expect(state.query).toHaveBeenCalledTimes(1);
    expect(state.query.mock.calls[0][0].filterString).toEqual([
      { Left: "", FieldName: "FYEAR", Compare: "76", Value: "2026", Right: "", Logic: 0 },
      { Left: "", FieldName: "FPERIOD", Compare: "76", Value: "8", Right: "", Logic: 0 },
    ]);
    expect(state.audit).toHaveBeenCalledTimes(5);
  });

  it("replays an idempotent response without executing SQL or K3", async () => {
    state.replay = { code: 200, msg: "历史结果", data: { operation: "write-to-mo", status: "success" } };
    await expect(handlers.write({})).resolves.toEqual(state.replay);
    expect(state.write).not.toHaveBeenCalled();
    expect(state.audit).not.toHaveBeenCalled();
    expect(state.finish).not.toHaveBeenCalled();
  });

  it("returns a stable conflict for an idempotency-key fingerprint collision", async () => {
    state.claim.mockRejectedValueOnce(new state.NitroWriteError("同一幂等键对应的请求内容不一致", 409));
    const result = await handlers.write({});
    expect(result).toEqual({ code: 409, msg: "同一幂等键对应的请求内容不一致" });
    expect(state.write).not.toHaveBeenCalled();
    expect(state.audit).not.toHaveBeenCalled();
  });

  it("keeps a successful business response when audit logging fails", async () => {
    state.audit.mockRejectedValueOnce(new Error("audit database unavailable"));
    await expect(handlers.write({})).resolves.toMatchObject({
      code: 200,
      data: { operation: "write-to-mo", status: "success" },
    });
    expect(state.write).toHaveBeenCalledTimes(1);
  });

  it("does not call Delete when UnAudit fails", async () => {
    state.query.mockResolvedValue([["CB001"]]);
    state.unAudit.mockRejectedValue(new Error("unAudit failed"));
    const result = await handlers.delete({});
    expect(result).toMatchObject({ code: 502, data: { status: "partial", stage: "unAudit", manualReviewRequired: true } });
    expect(state.delete).not.toHaveBeenCalled();
    expect(state.finish).toHaveBeenCalled();
  });

  it("rejects a paginated query that exceeds the safe bill-count limit", async () => {
    state.query.mockImplementation(async ({ startRow }) => {
      if (startRow === 0) return Array.from({ length: 5000 }, (_, index) => [`CB${index}`]);
      if (startRow === 5000) return Array.from({ length: 5000 }, (_, index) => [`CB${index + 5000}`]);
      return [["CB10000"]];
    });
    const result = await handlers.delete({});
    expect(result).toMatchObject({ code: 400, msg: "指定期间单据数量超过安全上限 10000，已停止执行", data: { status: "failed", operation: "delete-pz" } });
    expect(state.unAudit).not.toHaveBeenCalled();
    expect(state.delete).not.toHaveBeenCalled();
  });

  it("returns partial success when K3 delete fails after unAudit", async () => {
    state.query.mockResolvedValue([["CB001"]]);
    state.unAudit.mockResolvedValue({ successEntities: [{ Number: "CB001" }] });
    state.delete.mockRejectedValue(new Error("delete failed"));
    const result = await handlers.delete({});
    expect(result).toMatchObject({ code: 502, data: { status: "partial", stage: "delete", manualReviewRequired: true } });
    expect(state.unAudit).toHaveBeenCalledWith("CB_ENDPROCOSTADJ", ["CB001"], "反审核期末成本调整单");
    expect(state.delete).toHaveBeenCalledWith("CB_ENDPROCOSTADJ", ["CB001"], "删除期末成本调整单");
    expect(state.finish).toHaveBeenCalled();
    expect(state.release).not.toHaveBeenCalled();
  });
});
