import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  body: { billNo: "PO001", autoAudit: true, requestId: "purchase-1" },
  connection: {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi.fn(),
  },
  pool: { getConnection: vi.fn() },
  garnet: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
  queryK3DocumentList: vi.fn(),
  pushBill: vi.fn(),
  submitBill: vi.fn(),
  auditBill: vi.fn(),
}));

vi.mock("h3", () => ({
  defineEventHandler: vi.fn((handler) => handler),
  getHeader: vi.fn((_event, name) => name === "idempotency-key" ? state.body.requestId : "test-agent"),
  getRequestURL: vi.fn(() => new URL("http://test.local/prod-api/tk_custom/stockDocument/purchaseOrder/inbound")),
  readBody: vi.fn(async () => state.body),
}));

vi.mock("../../server/utils/auth.ts", () => ({
  getAuthSession: vi.fn(async () => ({
    token: "test-token",
    session: {
      userId: 1,
      deptId: 1,
      userName: "admin",
      user: { userId: 1, userName: "admin", nickName: "管理员" },
      roles: [],
      permissions: [],
    },
  })),
  hasPermission: vi.fn(() => true),
}));

vi.mock("../../server/utils/mysql.ts", () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}));

vi.mock("../../server/utils/redis.ts", () => ({
  getGarnet: vi.fn(() => state.garnet),
}));

vi.mock("../../server/utils/stock-document.ts", () => ({
  queryK3DocumentList: (...args) => state.queryK3DocumentList(...args),
}));

vi.mock("../../server/utils/k3.ts", () => ({
  K3CloudError: class K3CloudError extends Error {
    constructor(kind, message, statusCode) {
      super(message);
      this.kind = kind;
      this.statusCode = statusCode;
    }
  },
  pushBill: (...args) => state.pushBill(...args),
  submitBill: (...args) => state.submitBill(...args),
  auditBill: (...args) => state.auditBill(...args),
}));

describe("Nitro stock write route", () => {
  let handler;
  let consoleError;

  beforeEach(async () => {
    globalThis.defineEventHandler = (callback) => callback;
    state.body = { billNo: "PO001", autoAudit: true, requestId: "purchase-1" };
    state.connection.beginTransaction.mockReset();
    state.connection.commit.mockReset();
    state.connection.rollback.mockReset();
    state.connection.release.mockReset();
    state.connection.query.mockReset().mockResolvedValue([{ affectedRows: 1 }, []]);
    state.pool.getConnection.mockReset().mockResolvedValue(state.connection);
    state.garnet.get.mockReset().mockResolvedValue(null);
    state.garnet.set.mockReset().mockResolvedValue("OK");
    state.garnet.del.mockReset().mockResolvedValue(1);
    state.queryK3DocumentList.mockReset().mockImplementation(async (type) => type === "purchaseOrder"
      ? { rows: [{ billNo: "PO001", entryId: "11" }, { billNo: "PO001", entryId: "12" }] }
      : { rows: [{ billNo: "IN001", documentStatus: "C" }] });
    state.pushBill.mockReset().mockResolvedValue({
      successEntities: [{ Id: 99, Number: "IN001" }],
      responseStatus: { IsSuccess: true },
    });
    state.submitBill.mockReset().mockResolvedValue({ responseStatus: { IsSuccess: true } });
    state.auditBill.mockReset().mockResolvedValue({ responseStatus: { IsSuccess: true } });
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    handler = (await import("../../server/routes/prod-api/tk_custom/stockDocument/purchaseOrder/inbound.post.ts")).default;
  });

  afterEach(() => consoleError.mockRestore());

  it("checks the current order before push, then submits and audits the returned inbound bill", async () => {
    await expect(handler({ node: { req: { method: "POST" } } })).resolves.toMatchObject({
      code: 200,
      data: { purchaseOrderNo: "PO001", inboundBillNo: "IN001", status: "C" },
    });
    expect(state.queryK3DocumentList).toHaveBeenNthCalledWith(1, "purchaseOrder", expect.objectContaining({ billNo: "PO001" }));
    expect(state.pushBill).toHaveBeenCalledWith("PUR_PurchaseOrder", expect.objectContaining({
      Numbers: ["PO001"],
      TargetFormId: "STK_InStock",
    }), "下推采购入库", true);
    expect(state.submitBill).toHaveBeenCalledWith("STK_InStock", ["IN001"], "提交采购入库单");
    expect(state.auditBill).toHaveBeenCalledWith("STK_InStock", ["IN001"], "审核采购入库单");
    expect(state.connection.commit).toHaveBeenCalledTimes(1);
  });

  it("rejects a changed entry list before any K3 write", async () => {
    state.body = { billNo: "PO001", entryIds: ["999"], requestId: "purchase-invalid" };
    await expect(handler({ node: { req: { method: "POST" } } })).resolves.toMatchObject({
      code: 500,
      msg: "采购订单明细已变化，请刷新后重试",
    });
    expect(state.pushBill).not.toHaveBeenCalled();
    expect(state.submitBill).not.toHaveBeenCalled();
    expect(state.connection.rollback).toHaveBeenCalledTimes(1);
  });
});
