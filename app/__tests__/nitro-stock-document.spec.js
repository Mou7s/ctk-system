import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  executeBillQuery: vi.fn(),
  calls: [],
}));

vi.mock("../../server/utils/k3.ts", () => ({
  executeBillQuery: state.executeBillQuery,
}));

describe("Nitro K3Cloud stock-document read queries", () => {
  let queryK3Warehouses;
  let queryK3Locations;
  let queryK3Inventory;
  let queryK3DocumentList;
  let queryK3SalesOutboundPicking;
  let calculateK3AvailableQty;
  let buildInventoryFilter;
  let buildDocumentFilter;
  let assertDocumentFilterUsable;
  let StockDocumentInputError;

  beforeEach(async () => {
    state.calls = [];
    state.executeBillQuery.mockReset().mockImplementation(async (input) => {
      state.calls.push(input);
      return [];
    });
    ({ queryK3Warehouses, queryK3Locations, queryK3Inventory, queryK3DocumentList, queryK3SalesOutboundPicking, calculateK3AvailableQty, buildInventoryFilter, buildDocumentFilter, assertDocumentFilterUsable, StockDocumentInputError } = await import("../../server/utils/stock-document.ts"));
  });

  it("filters forbidden materials before paging and summary even with client scope overrides", async () => {
    state.executeBillQuery.mockResolvedValue([
      ["RAW", "原材料", "", "K", "K", "W", "仓", "L", "库位", "", 100, 100, "KCZT01_SYS", "可用", 0],
      ["FIN", "成品", "", "K", "K", "W", "仓", "L", "库位", "", 2, 2, "KCZT01_SYS", "可用", 0],
    ]);
    const result = await queryK3Inventory({ allowedMaterials: ["RAW"] }, ["FIN"]);
    expect(result.total).toBe(1);
    expect(result.rows.map(row => row.materialNumber)).toEqual(["FIN"]);
    expect(result.summary).toEqual({ lineCount: 1, materialCount: 1 });
    const empty = await queryK3Inventory({}, []);
    expect(empty.total).toBe(0);
    expect(empty.rows).toEqual([]);
  });

  it("maps warehouse and non-zero location selectors while preserving empty results", async () => {
    state.executeBillQuery
      .mockImplementationOnce(async (input) => {
        state.calls.push(input);
        return [["W001", "一号仓"], ["", "无编码"]];
      })
      .mockImplementationOnce(async (input) => {
        state.calls.push(input);
        return [["L001", "一号库位"], ["L001", ""], ["L002", ""]];
      });

    await expect(queryK3Warehouses()).resolves.toEqual([{ label: "一号仓（W001）", value: "W001" }]);
    await expect(queryK3Locations()).resolves.toEqual([
      { label: "一号库位（L001）", value: "L001" },
      { label: "L002", value: "L002" },
    ]);
    expect(state.calls[0]).toMatchObject({ formId: "BD_Stock", filterString: "", orderString: "FNumber ASC" });
    expect(state.calls[1]).toMatchObject({ formId: "STK_Inventory", filterString: "FBaseQty<>0" });
  });

  it("scopes location options by selected warehouses", async () => {
    state.executeBillQuery.mockImplementationOnce(async (input) => {
      state.calls.push(input);
      return [["L001", "一号库位"]];
    });

    await expect(queryK3Locations({ stock: "W001,W002" })).resolves.toEqual([
      { label: "一号库位（L001）", value: "L001" },
    ]);
    expect(state.calls[0]).toMatchObject({
      formId: "STK_Inventory",
      filterString: "FBaseQty<>0 and FStockID.FNumber in ('W001','W002')",
    });

    state.executeBillQuery.mockImplementationOnce(async (input) => {
      state.calls.push(input);
      return [["L009", "单仓库位"]];
    });

    await expect(queryK3Locations({ stock: ["W009"] })).resolves.toEqual([
      { label: "单仓库位（L009）", value: "L009" },
    ]);
    expect(state.calls[1].filterString).toContain("FStockID.FNumber='W009'");
  });

  it("maps realtime inventory, pagination, summary, and parameterized-safe K3 filters", async () => {
    state.executeBillQuery.mockImplementationOnce(async (input) => {
      state.calls.push(input);
      return [
        ["M001", "物料", "规格", "PCS", "个", "W001", "仓库", "L001", "库位", "LOT1", "12.5", "0", "KCZT01_SYS", "可用", "0"],
        ["M001", "物料", "规格", "PCS", "个", "W001", "仓库", "L002", "库位", "LOT2", "2", "0", "KCZT01_SYS", "可用", "0"],
      ];
    });

    const result = await queryK3Inventory({ pageNum: "2", pageSize: "10", material: "M'001", stock: "W001" });

    expect(result).toMatchObject({ pageNum: 2, pageSize: 10, total: 2, source: "K3Cloud / STK_Inventory" });
    expect(result.summary).toEqual({ lineCount: 2, materialCount: 1 });
    expect(result.rows).toEqual([]);
    expect(result.queriedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(state.calls[0].filterString).toContain("M''001");
    expect(state.calls[0].filterString).toContain("FStockID.FNumber='W001'");
    expect(state.calls[0].filterString).not.toContain("M'001");
  });

  it("builds multi-select warehouse and location filter clauses", () => {
    const filterArray = buildInventoryFilter({ stock: ["W001", "W002"], location: ["L001", "L002"] });
    expect(filterArray).toContain("FStockID.FNumber in ('W001','W002')");
    expect(filterArray).toContain("FStockLocID.FF100008.FNumber in ('L001','L002')");

    const filterComma = buildInventoryFilter({ stock: "W001,W002,W003", location: "L001,L002" });
    expect(filterComma).toContain("FStockID.FNumber in ('W001','W002','W003')");
    expect(filterComma).toContain("FStockLocID.FF100008.FNumber in ('L001','L002')");

    const filterSingle = buildInventoryFilter({ stock: ["W001"], location: "L001" });
    expect(filterSingle).toContain("FStockID.FNumber='W001'");
    expect(filterSingle).toContain("FStockLocID.FF100008.FNumber='L001'");
  });

  it("ignores K3Cloud extension columns appended after requested fields", async () => {
    state.executeBillQuery.mockImplementationOnce(async (input) => {
      state.calls.push(input);
      return [["M001", "物料", "规格", "PCS", "个", "W001", "仓库", "L001", "库位", "LOT1", "12.5", "扩展列"]];
    });

    const result = await queryK3Inventory();

    expect(result.rows).toEqual([expect.objectContaining({
      materialNumber: "M001",
      stockNumber: "W001",
      baseQty: "12.5",
    })]);
  });

  it("fills omitted trailing optional inventory fields", async () => {
    state.executeBillQuery.mockImplementationOnce(async (input) => {
      state.calls.push(input);
      return [["M002", "物料二", "规格二", "PCS", "个", "W002", "仓库二"]];
    });

    const result = await queryK3Inventory();

    expect(result.rows[0]).toMatchObject({
      materialNumber: "M002",
      stockNumber: "W002",
      stockLocationNumber: null,
      lotNumber: null,
      baseQty: null,
    });
  });

  it("rejects control characters before contacting K3Cloud", async () => {
    expect(() => buildInventoryFilter({ material: "M001\nOR 1=1" })).toThrow("非法字符");
    expect(state.executeBillQuery).not.toHaveBeenCalled();
  });

  it("derives selectable quantity from available status and lock quantity", () => {
    expect(calculateK3AvailableQty(135, 0, "KCZT01_SYS", "可用")).toBe(135);
    expect(calculateK3AvailableQty(135, 10, "KCZT01_SYS", "可用")).toBe(125);
    expect(calculateK3AvailableQty(135, 0, "KCZT02_SYS", "冻结")).toBe(0);
  });

  it("uses the warehouse-specific flex dimension for selectable inventory", async () => {
    state.executeBillQuery
      .mockImplementationOnce(async (input) => {
        state.calls.push(input);
        return [["M002", "实际物料", "规格", "PCS", "个", "W001", "仓库", null, null, "LOT1", "21", "18"]];
      })
      .mockImplementationOnce(async (input) => {
        state.calls.push(input);
        return [["100010", "CTK13", "CK成品仓", "1", "外购仓"]];
      })
      .mockImplementationOnce(async (input) => {
        state.calls.push(input);
        return [["M002", "实际物料", "规格", "PCS", "个", "W001", "仓库", "1", "外购仓", "LOT1", "21", "18", "KCZT01_SYS", "可用", "0"]];
      });

    const result = await queryK3Inventory({ material: "M002", stock: "W001", availableOnly: "true" });

    expect(result.rows[0]).toMatchObject({
      materialNumber: "M002",
      stockLocationNumber: "1",
      stockLocationName: "外购仓",
      lotNumber: "LOT1",
      availableQty: 21,
    });
    expect(state.calls[0].filterString).toContain("FBaseQty<>0");
    expect(state.calls[2].fieldKeys).toContain("FStockLocID.FF100010.FNumber");
  });

  it("preserves K3 document list mappings, summaries, and read-only filters", async () => {
    state.executeBillQuery.mockImplementationOnce(async (input) => {
      state.calls.push(input);
      return [[
        "ID1", "ENTRY1", "SO001", "1", "2026-01-02", "M001", "物料", "SOT-23",
        "10", "8", "C", "2026-01-03", "C001", "客户", "W001", "仓库", "L001", "库位", "LOT1",
      ]];
    });

    const result = await queryK3DocumentList("salesOutbound", {
      pageNum: "1",
      pageSize: "10",
      billNo: "SO'001",
      documentStatus: "c",
      beginDate: "2026-01-01",
      endDate: "2026-01-31",
    });

    expect(result).toMatchObject({ total: 1, source: "K3Cloud / SAL_OUTSTOCK" });
    expect(result.rows[0]).toMatchObject({ billNo: "SO001", qty: "10", realQty: "8", stockNumber: "W001", lotNumber: "LOT1" });
    expect(result.summary).toEqual({ billCount: 1, lineCount: 1, totalQty: 10, approvedBillCount: 1, approvedQty: 10 });
    expect(state.calls[0].filterString).toContain("SO''001");
    expect(state.calls[0].filterString).toContain("FDocumentStatus='C'");

    expect(buildDocumentFilter("purchaseOrder", { remainOnly: "true", material: "M'001" }))
      .toContain("FRemainStockINQty > 0");
    expect(() => buildDocumentFilter("purchaseInbound", { documentStatus: "Q" })).toThrow("单据状态参数不正确");
    expect(buildDocumentFilter("purchaseInbound", { beginApproveDate: "2026-06-01" }))
      .toContain("FApproveDate>='2026-06-01'");
    expect(() => buildDocumentFilter("purchaseInbound", { beginApproveDate: "2026-13-01" })).toThrow("审核开始日期格式不正确");
  });

  it("reads outbound picking rows and attaches current lot inventory without writing", async () => {
    state.executeBillQuery
      .mockImplementationOnce(async (input) => {
        state.calls.push(input);
        return [[
          "ID1", "ENTRY1", "SO001", "1", "2026-01-02", "M001", "物料", "SOT-23",
          "10", "8", "A", "", "C001", "客户", "W001", "仓库", "L001", "库位", "LOT1",
        ]];
      })
      .mockImplementationOnce(async (input) => {
        state.calls.push(input);
        return [["M001", "物料", "W001", "仓库", "L001", "库位", "LOT1", "7", "7", "KCZT01_SYS", "可用", "0"]];
      });

    const result = await queryK3SalesOutboundPicking("SO001");

    expect(result.billNo).toBe("SO001");
    expect(result.rows[0].inventoryOptions).toEqual([expect.objectContaining({ materialNumber: "M001", availableQty: 7, lotNumber: "LOT1" })]);
    expect(state.calls[1].filterString).toContain("FMaterialId.FNumber='M001'");
    expect(state.calls[1].filterString).toContain("FLot.FNumber='LOT1'");
  });

  it("resolves outbound locations from the warehouse-specific flex dimension", async () => {
    state.executeBillQuery
      .mockImplementationOnce(async (input) => {
        state.calls.push(input);
        return [[
          "ID1", "ENTRY1", "SO001", "1", "2026-01-02", "M001", "物料", "SOT-23",
          "10", "8", "A", "", "C001", "客户", "W001", "仓库", null, null, "LOT1",
        ]];
      })
      .mockImplementationOnce(async (input) => {
        state.calls.push(input);
        return [["100010", "CTK13", "CK成品仓", "1", "外购仓"]];
      })
      .mockImplementationOnce(async (input) => {
        state.calls.push(input);
        return [[
          "ID1", "ENTRY1", "SO001", "1", "2026-01-02", "M001", "物料", "SOT-23",
          "10", "8", "A", "", "C001", "客户", "W001", "仓库", "1", "外购仓", "LOT1",
        ]];
      })
      .mockImplementationOnce(async (input) => {
        state.calls.push(input);
        return [["M001", "物料", "W001", "仓库", "1", "外购仓", "LOT1", "7", "7", "KCZT01_SYS", "可用", "0"]];
      });

    const result = await queryK3SalesOutboundPicking("SO001");

    expect(result.rows[0]).toMatchObject({ stockLocationNumber: "1", stockLocationName: "外购仓" });
    expect(state.calls[2].fieldKeys).toContain("FStockLocID.FF100010.FNumber");
    expect(state.calls[3].filterString).toContain("FMaterialId.FNumber='M001'");
  });

  it("maps PRD_INSTOCK production receipt rows onto order no, location, and summary", async () => {
    state.executeBillQuery.mockImplementationOnce(async (input) => {
      state.calls.push(input);
      return [[
        "ID1", "ENTRY1", "SCRK260910063", "1", "2026-09-10T14:46:23.523",
        "NBE0090015", "TPESD0504S6-1 单芯", "SOT23-6L/3K盘/无/ .V05", "96",
        "C", "2026-09-10T15:46:01.693", "CTK11", "OEM成品仓", "1", "封装位一号", "MO260825005",
      ]];
    });

    const result = await queryK3DocumentList("productionReceipt", {
      pageNum: "1",
      pageSize: "10",
      beginDate: "2026-09-01",
      endDate: "2026-09-10",
    });

    expect(result.source).toBe("K3Cloud / PRD_INSTOCK");
    expect(result.rows[0]).toMatchObject({
      billNo: "SCRK260910063",
      seq: "1",
      materialNumber: "NBE0090015",
      specification: "SOT23-6L/3K盘/无/ .V05",
      qty: "96",
      realQty: "96",
      documentStatus: "C",
      stockNumber: "CTK11",
      stockLocationNumber: "1",
      stockLocationName: "封装位一号",
      relatedNumber: "MO260825005",
      relatedName: "",
    });
    expect(result.summary).toEqual({
      billCount: 1,
      lineCount: 1,
      totalQty: 96,
      approvedBillCount: 1,
      approvedQty: 96,
    });
    expect(state.calls[0]).toMatchObject({
      formId: "PRD_INSTOCK",
      filterString: "1=1 and FDate>='2026-09-01' and FDate<'2026-09-11'",
      orderString: "FDate DESC,FBillNo DESC,FEntity_FSeq ASC",
    });
  });

  it("requires at least one usable condition for list queries", () => {
    expect(() => assertDocumentFilterUsable("productionReceipt", {})).toThrow("请至少填写日期范围或关键字");
    expect(() => assertDocumentFilterUsable("productionReceipt", { documentStatus: "C" })).toThrow(StockDocumentInputError);
    expect(() => assertDocumentFilterUsable("productionReceipt", { pageNum: "1", pageSize: "10" })).toThrow(StockDocumentInputError);
    expect(() => assertDocumentFilterUsable("productionReceipt", { beginDate: "2026-09-01" })).not.toThrow();
    expect(() => assertDocumentFilterUsable("productionReceipt", { material: "M001" })).not.toThrow();
    // WMS 出库页只按单据状态拉待出库列表（不传日期），必须放行
    expect(() => assertDocumentFilterUsable("salesOutbound", { documentStatus: "B" })).not.toThrow();
    expect(() => assertDocumentFilterUsable("purchaseOrder", {})).not.toThrow();
    expect(() => assertDocumentFilterUsable("purchaseInbound", { beginApproveDate: "2026-06-01" })).not.toThrow();
  });
});
