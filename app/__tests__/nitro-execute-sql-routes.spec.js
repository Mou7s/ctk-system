import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  body: { dateStr: "2026-08", requestId: "execute-1", reason: "测试未领料维护" },
  authenticated: { session: { userId: 2 } },
  requestId: "execute-1",
  claim: { key: "nitro:write:kingdee:update-time-of-gxll:2:execute-1", requestId: "execute-1", fingerprint: "test" },
  update: vi.fn(async () => ({
    date: "2026-08",
    success: true,
    reportDateUpdated: 3,
    llResetCount: 4,
    unpickedMarkedCount: 5,
    message: "执行未领料信息成功",
  })),
  InputError: class ExecuteSqlInputError extends Error {
    statusCode = 400;
  },
  SqlServerError: class SqlServerError extends Error {
    kind = "unavailable";
    statusCode = 502;
  },
}));

vi.mock("h3", () => ({
  getHeader: vi.fn((_event, name) => name === "idempotency-key" ? state.requestId : ""),
  readBody: vi.fn(async () => state.body),
}));
vi.mock("../../server/utils/auth.ts", () => ({
  getAuthSession: vi.fn(async () => state.authenticated),
}));
vi.mock("../../server/utils/execute-sql.ts", () => ({
  ExecuteSqlInputError: state.InputError,
  updateTimeOfGXLL: state.update,
}));
vi.mock("../../server/utils/sqlserver.ts", () => ({
  SqlServerError: state.SqlServerError,
}));
vi.mock("../../server/utils/write.ts", () => ({
  NitroWriteError: class NitroWriteError extends Error {
    constructor(message, statusCode = 500) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  claimWriteRequest: vi.fn(async () => state.claim),
  finishWriteRequest: vi.fn(async () => {}),
  recordStandaloneOperationLog: vi.fn(async () => {}),
  releaseWriteRequest: vi.fn(async () => {}),
  text: (value) => String(value ?? "").trim(),
}));
vi.mock("../../server/utils/response.ts", () => ({
  apiSuccess: (data, msg = "操作成功") => ({ code: 200, msg, data }),
  apiError: (msg, code = 500) => ({ code, msg }),
  errorMessage: (error) => error?.message || "unknown error",
}));

describe("Nitro updateTimeOfGXLL route", () => {
  let handler;

  beforeAll(async () => {
    globalThis.defineEventHandler = (eventHandler) => eventHandler;
    handler = (await import("../../server/routes/prod-api/kingdee/updateTimeOfGXLL.post.ts")).default;
  });

  beforeEach(() => {
    state.body = { dateStr: "2026-08", requestId: "execute-1", reason: "测试未领料维护" };
    state.requestId = "execute-1";
    state.claim = { key: "nitro:write:kingdee:update-time-of-gxll:2:execute-1", requestId: "execute-1", fingerprint: "test" };
    state.authenticated = { session: { userId: 2 } };
    state.update.mockReset().mockResolvedValue({
      date: "2026-08",
      success: true,
      reportDateUpdated: 3,
      llResetCount: 4,
      unpickedMarkedCount: 5,
      message: "执行未领料信息成功",
    });
  });

  it("requires an authenticated Nitro session", async () => {
    state.authenticated = null;
    await expect(handler({})).resolves.toEqual({ code: 401, msg: "登录状态已过期" });
    expect(state.update).not.toHaveBeenCalled();
  });

  it("returns the standard Nitro response with the business detail", async () => {
    await expect(handler({})).resolves.toEqual({
      code: 200,
      msg: "更新未领料信息成功",
      data: {
        operation: "update-time-of-gxll",
        status: "success",
        durationMs: expect.any(Number),
        date: "2026-08",
        success: true,
        reportDateUpdated: 3,
        llResetCount: 4,
        unpickedMarkedCount: 5,
        message: "执行未领料信息成功",
      },
    });
    expect(state.update).toHaveBeenCalledWith("2026-08");
  });

  it("claims and audits the SQL Server mutation with the supplied request id", async () => {
    await handler({});
    const { claimWriteRequest, finishWriteRequest, recordStandaloneOperationLog } = await import("../../server/utils/write.ts");
    expect(claimWriteRequest).toHaveBeenCalledWith(
      state.authenticated.session,
      "kingdee:update-time-of-gxll",
      "execute-1",
      expect.objectContaining({ dateStr: "2026-08", requestId: "execute-1", reason: "测试未领料维护" }),
    );
    expect(finishWriteRequest).toHaveBeenCalledWith(state.claim, expect.objectContaining({ code: 200 }));
    expect(recordStandaloneOperationLog).toHaveBeenCalledWith(
      expect.anything(),
      state.authenticated.session,
      "更新未领料信息",
      2,
      expect.objectContaining({ requestId: "execute-1" }),
      expect.objectContaining({ code: 200 }),
    );
  });

  it("maps input and SQL Server failures without falling back to Java", async () => {
    state.update.mockRejectedValueOnce(new state.InputError("月份格式不正确"));
    await expect(handler({})).resolves.toEqual({ code: 400, msg: "月份格式不正确" });

    state.update.mockRejectedValueOnce(new state.SqlServerError("K3 SQL Server 暂不可用"));
    await expect(handler({})).resolves.toEqual({ code: 502, msg: "K3 SQL Server 暂不可用" });
  });
});
