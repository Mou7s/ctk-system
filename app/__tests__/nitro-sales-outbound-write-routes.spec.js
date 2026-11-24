import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  body: null,
  headerRequestId: null,
  pickRow: null,
  documentRows: [],
  documentCall: 0,
  savedQty: 2,
  inventoryRows: [],
  assemblyReady: false,
  assemblyStatus: "A",
  assemblyStock: "S1",
  assemblyLocation: "L1",
  transferReady: false,
  transferStatus: "A",
  transferBillNo: "TR001",
  transferNote: "",
  queryFormRows: [],
  permissionAllowed: true,
  idempotentPermission: null,
  saveBill: vi.fn(),
  submitBill: vi.fn(),
  auditBill: vi.fn(),
  insertOperationLog: vi.fn(),
  connection: { query: vi.fn() },
}));

vi.mock("h3", () => ({
  defineEventHandler: vi.fn((handler) => handler),
  getHeader: vi.fn(() => state.headerRequestId),
  readBody: vi.fn(async () => state.body),
}));

vi.mock("../../server/utils/response.ts", () => ({
  apiSuccess: (data, msg = "操作成功") => ({ code: 200, msg, ...(data === undefined ? {} : { data }) }),
  apiError: (msg, code = 500, data) => ({ code, msg, ...(data === undefined ? {} : { data }) }),
  errorMessage: (error, fallback = "操作失败") => error?.message || fallback,
}));

vi.mock("../../server/utils/mysql.ts", () => ({
  mysqlQueryOptions: (sql) => ({ sql }),
}));

vi.mock("../../server/utils/write.ts", () => {
  class NitroWriteError extends Error {
    constructor(message, statusCode = 500) {
      super(message);
      this.name = "NitroWriteError";
      this.statusCode = statusCode;
    }
  }
  const text = (value) => String(Array.isArray(value) ? value[0] ?? "" : value ?? "").trim();
  return {
    NitroWriteError,
    text,
    writeFail: (message, statusCode = 500) => { throw new NitroWriteError(message, statusCode); },
    queryOne: vi.fn(async () => state.pickRow),
    insertOperationLog: state.insertOperationLog,
    withIdempotentWriteSession: vi.fn(async (_event, _label, permission, _requestId, _body, work) => {
      state.idempotentPermission = permission;
      if (!state.permissionAllowed || !permission) return { code: 403, msg: "没有权限访问该接口" };
      return work(
        { userName: "admin", userId: 1 },
        state.connection,
        { key: "test", requestId: "test", fingerprint: "test" },
      );
    }),
  };
});

vi.mock("../../server/utils/k3.ts", () => ({
  K3CloudError: class K3CloudError extends Error {
    constructor(kind, message, statusCode) {
      super(message);
      this.name = "K3CloudError";
      this.kind = kind;
      this.statusCode = statusCode;
    }
  },
  executeBillQuery: vi.fn(async ({ formId, filterString }) => {
    if (formId === "BD_MATERIAL") {
      const code = String(filterString).includes("MAT1") ? "MAT1" : "MAT2";
      return [[code, `${code} name`, "", "PCS"]];
    }
    if (formId === "BD_FLEXVALUES") {
      return [["100008", "S1", "Stock", "", ""], ["100011", "S2", "Source Stock", "", ""]];
    }
    if (formId === "STK_AssembledApp") {
      if (!state.assemblyReady) return [];
      return [[99, "ASM001", state.assemblyStatus, "note", 1001, "MAT2", "MAT2 name", "", "PCS", 2, state.assemblyStock, state.assemblyLocation, state.assemblyLocation, ""]];
    }
    if (formId === "STK_TransferDirect") {
      if (!state.transferReady) return [];
      return [[101, state.transferBillNo, state.transferStatus, state.transferNote]];
    }
    return state.inventoryRows;
  }),
  saveBill: (...args) => state.saveBill(...args),
  submitBill: (...args) => state.submitBill(...args),
  auditBill: (...args) => state.auditBill(...args),
}));

vi.mock("../../server/utils/stock-document.ts", () => ({
  calculateK3AvailableQty: (baseQty, lockQty, statusNumber, statusName) => {
    if (statusNumber !== "KCZT01_SYS" && statusName !== "可用") return 0;
    return Math.max(0, Number(baseQty || 0) - Number(lockQty || 0));
  },
  queryK3DocumentList: vi.fn(async (_type, params) => {
    if (params.documentStatus === "C") {
      return { rows: state.documentRows.map((row) => ({ ...row, documentStatus: "C", realQty: row.entryId === "11" ? state.savedQty : row.realQty })) };
    }
    state.documentCall += 1;
    if (state.documentCall === 1) return { rows: state.documentRows };
    return { rows: state.documentRows.map((row) => ({ ...row, realQty: row.entryId === "11" ? state.savedQty : row.realQty })) };
  }),
}));

describe("Nitro sales outbound write route", () => {
  let handler;

  beforeEach(async () => {
    globalThis.defineEventHandler = (callback) => callback;
    state.body = {
      billNo: "SO001",
      requestId: "outbound-1",
      items: [{
        entryId: "11",
        materialCode: "MAT1",
        stockNumber: "S1",
        stockLocationNumber: "L1",
        lotNumber: "",
        actualQty: 2,
        picks: [{
          segmentId: "segment-1",
          sourceMaterialCode: "MAT1",
          qty: 2,
          stockNumber: "S1",
          sourceLocationNumber: "L1",
          sourceLotNumber: "",
          businessConfirmed: false,
          businessConfirmReason: "",
        }],
      }],
    };
    state.headerRequestId = null;
    state.pickRow = null;
    state.documentRows = [{
      id: 10,
      entryId: "11",
      billNo: "SO001",
      materialNumber: "MAT1",
      qty: 5,
      realQty: 0,
      documentStatus: "A",
      stockNumber: "S1",
      stockLocationNumber: "L1",
      lotNumber: "",
    }];
    state.documentCall = 0;
    state.savedQty = 2;
    state.inventoryRows = [["MAT1", "MAT1 name", "S1", "Stock", "L1", "Location", "", 10, 10, "KCZT01_SYS", "可用", 0]];
    state.assemblyReady = false;
    state.assemblyStatus = "A";
    state.assemblyStock = "S1";
    state.assemblyLocation = "L1";
    state.transferReady = false;
    state.transferStatus = "A";
    state.transferBillNo = "TR001";
    state.transferNote = "";
    state.permissionAllowed = true;
    state.idempotentPermission = null;
    state.connection.query.mockReset().mockImplementation(async (options, params) => {
      const sql = options.sql || String(options);
      if (/INSERT INTO tk_wms_outbound_pick/i.test(sql)) {
        state.pickRow = {
          bill_no: params[0], request_id: params[1], status: "PROCESSING",
          conversion_result: "", update_time: new Date(),
        };
      }
      if (/SET status = 'SUCCESS'/i.test(sql) && state.pickRow) state.pickRow.status = "SUCCESS";
      if (/SET status = 'FAILED'/i.test(sql) && state.pickRow) state.pickRow.status = "FAILED";
      if (/SET conversion_result/i.test(sql) && state.pickRow) state.pickRow.conversion_result = params[0];
      return [{ affectedRows: 1 }, []];
    });
    state.saveBill.mockReset().mockImplementation(async (formId, payload) => {
      if (formId === "STK_AssembledApp") {
        state.assemblyReady = true;
        return { successEntities: [{ Number: "ASM001" }] };
      }
      if (formId === "STK_TransferDirect") {
        state.transferReady = true;
        state.transferNote = payload?.Model?.FNote || "";
        return { successEntities: [{ Number: state.transferBillNo }] };
      }
      return { successEntities: [] };
    });
    state.submitBill.mockReset().mockImplementation(async (formId) => {
      if (formId === "STK_AssembledApp") state.assemblyStatus = "B";
      if (formId === "STK_TransferDirect") state.transferStatus = "B";
      return { successEntities: [] };
    });
    state.auditBill.mockReset().mockImplementation(async (formId) => {
      if (formId === "STK_AssembledApp") state.assemblyStatus = "C";
      if (formId === "STK_TransferDirect") state.transferStatus = "C";
      return { successEntities: [] };
    });
    state.insertOperationLog.mockReset().mockResolvedValue(undefined);
    handler = (await import("../../server/routes/prod-api/tk_custom/stockDocument/salesOutbound/complete.post.ts")).default;
  });

  it("updates quantities, submits, audits, and records success for ordinary picking", async () => {
    const result = await handler({ node: { req: { method: "POST" } } });

    expect(result).toMatchObject({ code: 200, data: { billNo: "SO001", status: "C", lineCount: 1, conversionCount: 0 } });
    expect(state.saveBill).toHaveBeenCalledWith("SAL_OUTSTOCK", expect.objectContaining({
      Model: expect.objectContaining({ FBillNo: "SO001", FEntity: [{ FEntryID: "11", FRealQty: 2 }] }),
    }), "更新实发数量");
    expect(state.submitBill).toHaveBeenCalledWith("SAL_OUTSTOCK", ["SO001"], "提交销售出库单");
    expect(state.auditBill).toHaveBeenCalledWith("SAL_OUTSTOCK", ["SO001"], "审核销售出库单");
    expect(state.insertOperationLog).toHaveBeenCalledTimes(1);
    expect(state.idempotentPermission).toBe("tk_custom:wmsOutbound:complete");
  });

  it("requires the WMS outbound completion permission", async () => {
    state.permissionAllowed = false;

    const result = await handler({ node: { req: { method: "POST" } } });

    expect(result).toEqual({ code: 403, msg: "没有权限访问该接口" });
    expect(state.saveBill).not.toHaveBeenCalled();
    expect(state.submitBill).not.toHaveBeenCalled();
    expect(state.auditBill).not.toHaveBeenCalled();
  });

  it("does not save or submit a submitted bill whose real quantities are locked", async () => {
    state.documentRows[0].documentStatus = "B";
    state.documentRows[0].realQty = 2;

    const result = await handler({ node: { req: { method: "POST" } } });

    expect(result).toMatchObject({ code: 200, data: { status: "C" } });
    expect(state.saveBill).not.toHaveBeenCalled();
    expect(state.submitBill).not.toHaveBeenCalled();
    expect(state.auditBill).toHaveBeenCalledWith("SAL_OUTSTOCK", ["SO001"], "审核销售出库单");
  });

  it("accepts a zero-quantity line while still requiring every entry", async () => {
    state.documentRows.push({ ...state.documentRows[0], entryId: "12", materialNumber: "MAT2", qty: 3, realQty: 0 });
    state.body.items.push({
      entryId: "12",
      materialCode: "MAT2",
      stockNumber: "S1",
      stockLocationNumber: "",
      lotNumber: "",
      actualQty: 0,
      picks: [],
    });

    const result = await handler({ node: { req: { method: "POST" } } });

    expect(result).toMatchObject({ code: 200, data: { lineCount: 2, status: "C" } });
    expect(state.saveBill).toHaveBeenCalledWith("SAL_OUTSTOCK", expect.objectContaining({
      Model: expect.objectContaining({ FEntity: [
        { FEntryID: "11", FRealQty: 2 },
        { FEntryID: "12", FRealQty: 0 },
      ] }),
    }), "更新实发数量");
  });

  it("replays a successful bill without another K3 write", async () => {
    state.pickRow = {
      bill_no: "SO001", request_id: "previous", status: "SUCCESS", conversion_result: "", update_time: new Date(),
    };

    const result = await handler({ node: { req: { method: "POST" } } });

    expect(result).toMatchObject({ code: 200, data: { billNo: "SO001", status: "C", idempotent: true } });
    expect(state.saveBill).not.toHaveBeenCalled();
    expect(state.submitBill).not.toHaveBeenCalled();
    expect(state.auditBill).not.toHaveBeenCalled();
  });

  it("rejects an active lock owned by another request", async () => {
    state.pickRow = {
      bill_no: "SO001", request_id: "other-request", status: "PROCESSING", conversion_result: "", update_time: new Date(),
    };

    const result = await handler({ node: { req: { method: "POST" } } });

    expect(result).toMatchObject({ code: 409, msg: "该销售出库单正在被其他人员处理，请稍后刷新" });
    expect(state.saveBill).not.toHaveBeenCalled();
  });

  it("rejects an incomplete entry list before K3 writes", async () => {
    state.documentRows.push({ ...state.documentRows[0], entryId: "12", materialNumber: "MAT2" });

    const result = await handler({ node: { req: { method: "POST" } } });

    expect(result).toMatchObject({ code: 400, msg: "必须核对并提交出库单的全部物料明细" });
    expect(state.saveBill).not.toHaveBeenCalled();
    expect(state.auditBill).not.toHaveBeenCalled();
  });

  it("does not audit when the saved quantity differs from the pick result", async () => {
    state.savedQty = 1;

    const result = await handler({ node: { req: { method: "POST" } } });

    expect(result).toMatchObject({ code: 409, msg: "金蝶保存后的实发数量与拣货结果不一致，请勿继续审核" });
    expect(state.saveBill).toHaveBeenCalled();
    expect(state.auditBill).not.toHaveBeenCalled();
    expect(state.pickRow.status).toBe("FAILED");
  });

  it("requires a business reason before mixed-material conversion", async () => {
    state.documentRows[0].materialNumber = "MAT2";
    state.body.items[0].picks[0].sourceMaterialCode = "MAT1";

    const result = await handler({ node: { req: { method: "POST" } } });

    expect(result).toMatchObject({ code: 400, msg: "物料不一致时必须填写业务确认原因：MAT1 → MAT2" });
    expect(state.saveBill).not.toHaveBeenCalled();
    expect(state.auditBill).not.toHaveBeenCalled();
  });

  it("creates, audits, and records a business-confirmed material conversion", async () => {
    state.documentRows[0].materialNumber = "MAT2";
    state.body.items[0].materialCode = "MAT2";
    state.body.items[0].picks[0].sourceMaterialCode = "MAT1";
    state.body.items[0].picks[0].businessConfirmed = true;
    state.body.items[0].picks[0].businessConfirmReason = "业务确认允许混出";
    state.inventoryRows = [["MAT1", "MAT1 name", "S1", "Stock", "L1", "Location", "", 10, 10, "KCZT01_SYS", "可用", 0]];

    const result = await handler({ node: { req: { method: "POST" } } });

    expect(result).toMatchObject({ code: 200, data: { conversionCount: 1, status: "C" } });
    expect(state.saveBill).toHaveBeenCalledWith("STK_AssembledApp", expect.any(Object), "保存组装拆卸单", true);
    expect(state.submitBill).toHaveBeenCalledWith("STK_AssembledApp", ["ASM001"], "提交组装拆卸单");
    expect(state.auditBill).toHaveBeenCalledWith("STK_AssembledApp", ["ASM001"], "审核组装拆卸单");
    expect(state.auditBill).toHaveBeenCalledWith("SAL_OUTSTOCK", ["SO001"], "审核销售出库单");
    expect(state.pickRow.conversion_result).toContain("业务确认允许混出");
  });

  it("assembles in a different source warehouse, transfers to the outbound warehouse, then audits outbound", async () => {
    state.documentRows[0].materialNumber = "MAT2";
    state.body.items[0].materialCode = "MAT2";
    state.body.items[0].picks[0].sourceMaterialCode = "MAT1";
    state.body.items[0].picks[0].stockNumber = "S2";
    state.body.items[0].picks[0].sourceLocationNumber = "L2";
    state.body.items[0].picks[0].sourceLotNumber = "LOT1";
    state.body.items[0].picks[0].businessConfirmed = true;
    state.body.items[0].picks[0].businessConfirmReason = "业务确认允许跨仓转换";
    state.assemblyStock = "S2";
    state.assemblyLocation = "L2";
    state.inventoryRows = [["MAT1", "MAT1 name", "S2", "Source Stock", "L2", "Source Location", "LOT1", 10, 10, "KCZT01_SYS", "可用", 0]];

    const result = await handler({ node: { req: { method: "POST" } } });

    expect(result).toMatchObject({
      code: 200,
      data: {
        conversionCount: 1,
        status: "C",
        conversions: [{
          sourceStockNumber: "S2",
          targetStockNumber: "S1",
          transferBillNo: "TR001",
          transferStatus: "C",
        }],
      },
    });
    const transferSave = state.saveBill.mock.calls.find(([formId]) => formId === "STK_TransferDirect");
    expect(transferSave?.[1]).toMatchObject({
      Model: {
        FNote: expect.stringContaining("SRCSTOCK:S2"),
        FBillEntry: [{
          FSrcStockId: { FNumber: "S2" },
          FDestStockId: { FNumber: "S1" },
          FSrcStockLocId: { FSRCSTOCKLOCID__FF100011: { FNumber: "L2" } },
          FDestStockLocId: { FDESTSTOCKLOCID__FF100008: { FNumber: "L1" } },
        }],
      },
    });
    expect(state.submitBill.mock.calls.map(([formId]) => formId)).toEqual([
      "STK_AssembledApp", "STK_TransferDirect", "SAL_OUTSTOCK",
    ]);
    expect(state.auditBill.mock.calls.map(([formId]) => formId)).toEqual([
      "STK_AssembledApp", "STK_TransferDirect", "SAL_OUTSTOCK",
    ]);
  });

  it("reuses a previously audited assembly conversion instead of creating another one", async () => {
    state.documentRows[0].materialNumber = "MAT2";
    state.body.items[0].materialCode = "MAT2";
    state.body.items[0].picks[0].sourceMaterialCode = "MAT1";
    state.body.items[0].picks[0].businessConfirmed = true;
    state.body.items[0].picks[0].businessConfirmReason = "业务确认允许混出";
    state.assemblyReady = true;
    state.assemblyStatus = "C";
    state.pickRow = {
      bill_no: "SO001",
      request_id: "previous",
      status: "FAILED",
      conversion_result: JSON.stringify([{
        traceKey: "OUTBOUND|SO001|11|0|MAT1|MAT2|2|S1|L1|L1||",
        businessConfirmReason: "业务确认允许混出",
      }]),
      update_time: new Date(),
    };

    const result = await handler({ node: { req: { method: "POST" } } });

    expect(result).toMatchObject({ code: 200, data: { conversionCount: 1, status: "C" } });
    expect(state.saveBill).not.toHaveBeenCalledWith("STK_AssembledApp", expect.anything(), expect.anything(), expect.anything());
    expect(state.submitBill).not.toHaveBeenCalledWith("STK_AssembledApp", expect.anything(), expect.anything());
    expect(state.auditBill).not.toHaveBeenCalledWith("STK_AssembledApp", expect.anything(), expect.anything());
  });
});
