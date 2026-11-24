import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [],
  // 路线全量工序（queryRouteProcessOps 的返回），默认空 → 退回「按返回行推顺序」的老口径
  routeOps: [],
  requests: [],
  query: vi.fn(),
  sqlStringParameter: vi.fn((request, name, value) => request.input(name, "string", value)),
}));

vi.mock("../../server/utils/sqlserver.ts", () => ({
  queryK3SqlServer: state.query,
  sqlStringParameter: state.sqlStringParameter,
}));

function operationRow(overrides) {
  return {
    moNumber: "MO001", moEntrySeq: "1", billNo: "OP001", materialNumber: "M001",
    materialName: "物料", specification: "规格", packageName: "PDFN5X6", processNumber: "10", processName: "固晶",
    routeName: "路线", operQty: "100", reportQty: "0", qualifiedQty: "100", transInQty: "0",
    transOutQty: "0", departmentName: "车间", lastReportTime: "2026-01-01",
    ...overrides,
  };
}

describe("Nitro WIP SQL Server query", () => {
  let queryWipReport;

  beforeEach(async () => {
    state.rows = [
      operationRow({}),
      operationRow({ processNumber: "20", processName: "测试", operQty: "60", qualifiedQty: "70", transInQty: "60", lastReportTime: "2026-01-02" }),
    ];
    state.requests = [];
    state.routeOps = [];
    state.query.mockReset().mockImplementation(async (execute) => {
      const request = {
        input: vi.fn().mockReturnThis(),
        // 按 SQL 分流：主查询给工序行，路线骨架那条（T_ENG_ROUTEOPERSEQ）给 routeOps
        query: vi.fn(async (sql) => ({
          recordset: String(sql).includes("T_ENG_ROUTEOPERSEQ") ? state.routeOps : state.rows,
        })),
      };
      state.requests.push(request);
      const result = await execute(request);
      return result.recordset || [];
    });
    ({ queryWipReport } = await import("../../server/utils/wip.ts"));
  });

  it.each([{}, { processName: "固晶" }, { all: "true" }])("requires an existing upstream sales order and excludes business-closed orders before calculating WIP (%j)", async (query) => {
    await queryWipReport(query);
    const sql = state.requests[0].query.mock.calls[0][0];
    const condition = "NOT EXISTS (SELECT 1 FROM T_SAL_ORDER sale_order WHERE sale_order.FID = moe.FSALEORDERID AND sale_order.FCLOSESTATUS = 'B' AND sale_order.FMANUALCLOSE = '0')";
    expect(sql.split(condition)).toHaveLength(query.processName ? 3 : 2);
    const sourceCondition = "EXISTS (SELECT 1 FROM T_SAL_ORDER sale_source WHERE sale_source.FID = moe.FSALEORDERID)";
    expect(sql.split(sourceCondition)).toHaveLength(query.processName ? 3 : 2);
    expect(sql).not.toContain("JOIN T_SAL_ORDER sale_order");
  });

  it("uses produced-minus-received and exposes over-production gaps", async () => {
    const result = await queryWipReport({ moNumber: "MO001", onlyPositive: "false" });

    expect(result.operationRowCount).toBe(2);
    expect(result.scannedMoCount).toBeUndefined();
    expect(result.orderCount).toBe(1);
    expect(result.details.map((item) => item.wipQty)).toEqual([40, 70]);
    expect(result.totalQty).toBe(110);
    expect(result.summaries.map((item) => item.orderCount)).toEqual([1, 1]);
  });

  it("leaves rows whose WIP is exactly zero out of the detail list", async () => {
    // 料已经走完的工序不是「在制品」：这种行会把真正的在制明细淹掉
    state.rows = [
      operationRow({ processNumber: "10", processName: "固晶部", operQty: "100", qualifiedQty: "100", transOutQty: "100" }),
      operationRow({ processNumber: "20", processName: "测试分选", operQty: "100", qualifiedQty: "100", transInQty: "100", transOutQty: "40" }),
    ];

    const zeroHidden = await queryWipReport({ moNumber: "MO001", onlyPositive: "false" });
    // 固晶部：产出 100 - 下道已接收 100 = 0 → 不在清单里；测试分选：产出 100 - 转出 40 = 60 → 留着
    expect(zeroHidden.details.map((item) => item.processName)).toEqual(["测试分选"]);
    expect(zeroHidden.details.map((item) => item.wipQty)).toEqual([60]);
    // 合计口径不受影响（0 行加不加都不改总数）
    expect(zeroHidden.totalQty).toBe(60);

    const zeroKept = await queryWipReport({ moNumber: "MO001", onlyPositive: "false", hideZeroWip: "false" });
    expect(zeroKept.details.map((item) => item.wipQty)).toEqual([0, 60]);
  });

  it("表头排序：三列可正序倒序，排在分页之前（第 1 页就是全场最大的），不认识的字段回到默认顺序", async () => {
    // 三个独立订单，各自停在唯一一道工序上：wipQty = 本道产出 - 转出
    state.rows = [
      operationRow({ moNumber: "MO001", billNo: "OP003", qualifiedQty: "10", transOutQty: "0" }),
      operationRow({ moNumber: "MO002", billNo: "OP002", qualifiedQty: "50", transOutQty: "0" }),
      operationRow({ moNumber: "MO003", billNo: "OP001", qualifiedQty: "30", transOutQty: "0" }),
    ];

    const desc = await queryWipReport({ sortBy: "wipQty", sortDir: "desc", pageSize: "2" });
    expect(desc.details.map((item) => item.wipQty)).toEqual([50, 30]);
    expect(desc.pageCount).toBe(2);
    // 排序只改行序，不改口径
    expect(desc.totalQty).toBe(90);
    expect(desc.orderCount).toBe(3);

    // 全量先排再分页：第 2 页接得上第 1 页，不是「本页内的最大值」
    const secondPage = await queryWipReport({ sortBy: "wipQty", sortDir: "desc", pageSize: "2", page: "2" });
    expect(secondPage.details.map((item) => item.wipQty)).toEqual([10]);

    const asc = await queryWipReport({ sortBy: "wipQty", sortDir: "asc" });
    expect(asc.details.map((item) => item.wipQty)).toEqual([10, 30, 50]);

    const byMo = await queryWipReport({ sortBy: "moNumber", sortDir: "desc" });
    expect(byMo.details.map((item) => item.moNumber)).toEqual(["MO003", "MO002", "MO001"]);

    // 流程单（工序计划号）：billNo 与订单号反序，排它能看出换的是哪一列
    const byBill = await queryWipReport({ sortBy: "billNo", sortDir: "asc" });
    expect(byBill.details.map((item) => item.billNo)).toEqual(["OP001", "OP002", "OP003"]);

    // 不认识的排序字段（大小写、多出来的列都算）当作没排：保持默认顺序 工序-物料-订单号
    const ignored = await queryWipReport({ sortBy: "processName", sortDir: "desc" });
    expect(ignored.details.map((item) => item.moNumber)).toEqual(["MO001", "MO002", "MO003"]);
    const caseMiss = await queryWipReport({ sortBy: "WIPQTY", sortDir: "desc" });
    expect(caseMiss.details.map((item) => item.wipQty)).toEqual([10, 50, 30]);
  });

  it("all=true 一次返回全部明细（不分页），排序仍然全量生效；不带 all 照常分页", async () => {
    // 三个独立订单，各自停在唯一一道工序上：wipQty = 本道产出 - 转出
    state.rows = [
      operationRow({ moNumber: "MO001", billNo: "OP003", qualifiedQty: "10", transOutQty: "0" }),
      operationRow({ moNumber: "MO002", billNo: "OP002", qualifiedQty: "50", transOutQty: "0" }),
      operationRow({ moNumber: "MO003", billNo: "OP001", qualifiedQty: "30", transOutQty: "0" }),
    ];

    const all = await queryWipReport({ all: "true", sortBy: "wipQty", sortDir: "desc" });
    expect(all.details.map((item) => item.wipQty)).toEqual([50, 30, 10]);
    expect(all.details).toHaveLength(all.detailsTotal);
    expect(all.pageSize).toBe(all.detailsTotal);
    expect(all.page).toBe(1);
    expect(all.pageCount).toBe(1);
    // 一次性加载下汇总只回数字：明细已经在 details 里，再嵌一份会让响应凭空翻倍
    expect(all.summaries.every((item) => !("details" in item))).toBe(true);

    // page/pageSize 在 all 模式下不生效
    const ignored = await queryWipReport({ all: "1", page: "3", pageSize: "1" });
    expect(ignored.details).toHaveLength(3);

    // 不带 all 的照常分页（矩阵首屏、翻页靠它），汇总里仍带明细
    const paged = await queryWipReport({ pageSize: "2" });
    expect(paged.details).toHaveLength(2);
    expect(paged.pageCount).toBe(2);
    expect(paged.summaries.every((item) => Array.isArray(item.details))).toBe(true);
  });

  it("hides non-positive rows by default but keeps raw negatives on request", async () => {
    state.rows = [
      operationRow({ qualifiedQty: "30" }),
      operationRow({ processNumber: "20", processName: "测试", operQty: "60", qualifiedQty: "70", transInQty: "60", lastReportTime: "2026-01-02" }),
    ];

    const hidden = await queryWipReport({ moNumber: "MO001", onlyPositive: "true" });
    expect(hidden.details.map((item) => item.wipQty)).toEqual([70]);

    const exposed = await queryWipReport({ moNumber: "MO001", onlyPositive: "false" });
    expect(exposed.details.map((item) => item.wipQty)).toEqual([-30, 70]);
  });

  it("keeps MO status scope and locale filters on filtered queries", async () => {
    await queryWipReport({ moNumber: "MO'001", processName: "固晶", onlyPositive: "false" });
    const sql = state.requests[0].query.mock.calls[0][0];

    expect(sql).toContain("mo.FDOCUMENTSTATUS = 'C'");
    expect(sql).toContain("moe_a.FSTATUS IN (3, 4, 5)");
    expect(sql).toContain("FLOCALEID = 2052");
    expect(sql).toContain("op.FMONumber LIKE @moNumber");
    expect(sql).toContain("proc_l.FNAME LIKE @processName");
    expect(sql).not.toContain("op.FProcessName");
    expect(sql).not.toContain("MO'001");
    expect(state.sqlStringParameter).toHaveBeenCalledWith(expect.anything(), "moNumber", "%MO'001%");
  });

  it("expands the full chain for process filters but only shows matched processes", async () => {
    state.rows = [
      operationRow({ processNumber: "10", processName: "固晶部", qualifiedQty: "100", transInQty: "0", transOutQty: "100" }),
      operationRow({ processNumber: "20", processName: "焊线部", qualifiedQty: "60", transInQty: "60", transOutQty: "60" }),
    ];

    const result = await queryWipReport({ processName: "固晶", onlyPositive: "false" });
    const sql = state.requests[0].query.mock.calls[0][0];

    expect(sql).toContain("WITH matched AS");
    expect(sql).toContain("JOIN matched m ON");
    expect(result.details.map((item) => item.processName)).toEqual(["固晶部"]);
    expect(result.details.map((item) => item.wipQty)).toEqual([40]);
  });

  it("counts received-but-unprocessed quantity as WIP on the last operation", async () => {
    state.rows = [
      operationRow({ processNumber: "10", processName: "固晶部", qualifiedQty: "102.4", transInQty: "0", transOutQty: "102.4" }),
      operationRow({ processNumber: "90", processName: "测试分选", qualifiedQty: "0", transInQty: "102.4", transOutQty: "0" }),
    ];

    const result = await queryWipReport({ moNumber: "MO001", onlyPositive: "true" });
    expect(result.details.map((item) => [item.processName, item.wipQty])).toEqual([["测试分选", 102.4]]);
  });

  it("counts a fully unreported flow bill at its first operation using the planned quantity", async () => {
    state.rows = [
      operationRow({ processNumber: "10", processName: "固晶部", operQty: "65.82", qualifiedQty: "0", transInQty: "0", transOutQty: "0" }),
      operationRow({ processNumber: "20", processName: "焊线部", operQty: "65.82", qualifiedQty: "0", transInQty: "0", transOutQty: "0" }),
      operationRow({ processNumber: "110", processName: "包装入库", operQty: "65.82", qualifiedQty: "0", transInQty: "0", transOutQty: "0" }),
    ];

    const result = await queryWipReport({ moNumber: "MO001", onlyPositive: "true" });

    expect(result.details.map((item) => [item.processName, item.wipQty, item.unreported])).toEqual([["固晶部", 65.82, true]]);
    expect(result.totalQty).toBe(65.82);
    expect(result.unreportedBillCount).toBe(1);
  });

  it("keeps produced quantity visible when the next operation has not reported yet", async () => {
    state.rows = [
      operationRow({ processNumber: "10", processName: "固晶部", qualifiedQty: "100", transInQty: "0", transOutQty: "100" }),
      operationRow({ processNumber: "20", processName: "焊线部", operQty: "100", qualifiedQty: "0", transInQty: "0", transOutQty: "0" }),
    ];

    const onlyPositive = await queryWipReport({ moNumber: "MO001", onlyPositive: "true" });
    expect(onlyPositive.details.map((item) => [item.processName, item.wipQty, item.unreported])).toEqual([["固晶部", 100, false]]);

    // 本用例同样看行级数量与标记，不是「要不要进在制清单」，所以显式保留 0 行
    const all = await queryWipReport({ moNumber: "MO001", onlyPositive: "false", hideZeroWip: "false" });
    expect(all.details.map((item) => [item.processName, item.wipQty, item.unreported])).toEqual([
      ["固晶部", 100, false],
      ["焊线部", 0, true],
    ]);
    expect(all.unreportedBillCount).toBe(1);
  });

  it("stops filtering zero-quantity operations out of the SQL conditions", async () => {
    await queryWipReport({ moNumber: "MO001", onlyPositive: "false" });
    const sql = state.requests[0].query.mock.calls[0][0];

    expect(sql).not.toContain("b.FQualifiedQty, 0) > 0");
    expect(sql).toContain("moe_a.FSTATUS IN (3, 4, 5)");
  });

  it("skips chain expansion when no process filter is given", async () => {
    await queryWipReport({ moNumber: "MO001", onlyPositive: "false" });
    const sql = state.requests[0].query.mock.calls[0][0];

    expect(sql).not.toContain("WITH matched AS");
  });

  it("paginates detail rows while keeping totals over the full filtered set", async () => {
    state.rows = ["MO001", "MO002", "MO003", "MO004", "MO005"].map((moNumber) => operationRow({ moNumber }));

    const result = await queryWipReport({ moNumber: "MO00", page: "2", pageSize: "2", onlyPositive: "false" });

    expect(result.details).toHaveLength(2);
    expect(result.detailsTotal).toBe(5);
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(2);
    expect(result.pageCount).toBe(3);
    expect(result.totalQty).toBe(500);
    expect(result.orderCount).toBe(5);
    expect(result.details.map((item) => item.moNumber)).toEqual(["MO003", "MO004"]);
  });

  it("clamps out-of-range pages and page sizes", async () => {
    state.rows = ["MO001", "MO002"].map((moNumber) => operationRow({ moNumber }));

    const overflow = await queryWipReport({ moNumber: "MO00", page: "99", onlyPositive: "false" });
    expect(overflow.page).toBe(1);
    expect(overflow.details).toHaveLength(2);

    const capped = await queryWipReport({ moNumber: "MO00", pageSize: "999999", onlyPositive: "false" });
    expect(capped.pageSize).toBe(1000);
    expect(capped.details).toHaveLength(2);
  });

  it("rejects single-character filters as too weak", async () => {
    const { weakWipFilterMessage } = await import("../../server/utils/wip.ts");

    expect(weakWipFilterMessage({})).toBeNull();
    expect(weakWipFilterMessage({ materialKeyword: "12" })).toBeNull();
    expect(weakWipFilterMessage({ materialKeyword: "1", moNumber: "MO001" })).toBeNull();
    expect(weakWipFilterMessage({ materialKeyword: "1" })).toBe("筛选条件太宽泛，请至少输入2个字符后再查询");
    expect(weakWipFilterMessage({ processName: "固" })).toBe("筛选条件太宽泛，请至少输入2个字符后再查询");
  });

  it("returns the full set for exports regardless of pagination params", async () => {
    state.rows = ["MO001", "MO002", "MO003"].map((moNumber) => operationRow({ moNumber }));

    const result = await queryWipReport({ moNumber: "MO00", page: "2", pageSize: "1", onlyPositive: "false" }, { fullExport: true });

    expect(result.details).toHaveLength(3);
    expect(result.detailsTotal).toBe(3);
    expect(result.page).toBe(1);
    expect(result.pageCount).toBe(1);
  });

  it("builds the package × process matrix over every filtered row, not just the current page", async () => {
    state.rows = [
      operationRow({ moNumber: "MO001", packageName: "PDFN5X6", processNumber: "10", processName: "固晶部", qualifiedQty: "100", transInQty: "0", transOutQty: "100" }),
      operationRow({ moNumber: "MO001", packageName: "PDFN5X6", processNumber: "20", processName: "焊线部", qualifiedQty: "60", transInQty: "60", transOutQty: "0" }),
      operationRow({ moNumber: "MO002", materialNumber: "M002", packageName: "SOD-123", processNumber: "10", processName: "固晶部", qualifiedQty: "50", transInQty: "0", transOutQty: "0" }),
    ];

    const result = await queryWipReport({ moNumber: "MO00", page: "1", pageSize: "2", onlyPositive: "true" });

    // 明细分页只给 2 行，矩阵必须覆盖全部 3 行
    expect(result.details).toHaveLength(2);
    expect(result.matrix.packageCount).toBe(2);
    expect(result.matrix.processCount).toBe(2);
    expect(result.matrix.packages.map((item) => [item.name, item.wipQty])).toEqual([["PDFN5X6", 100], ["SOD-123", 50]]);
    expect(result.matrix.processes.map((item) => item.name)).toEqual(["固晶部", "焊线部"]);
    // 单元格按「工序号 → 封装在行轴上的次序」稳定返回，前端只做查表
    expect(result.matrix.cells.map((cell) => [cell.packageName, cell.processName, cell.wipQty])).toEqual([
      ["PDFN5X6", "固晶部", 40],
      ["SOD-123", "固晶部", 50],
      ["PDFN5X6", "焊线部", 60],
    ]);
    expect(result.matrix.totalQty).toBe(result.totalQty);
    expect(result.matrix.maxCellQty).toBe(60);
    expect(result.matrix.cellCount).toBe(3);
  });

  it("orders matrix columns by the 工艺路线 sequence instead of the smallest operation number", async () => {
    // 真实形状：塑封线（骨架，工序号大）、反编返工线（测试分选从这里打头）、玻封线（自成一族）
    const plasticRoute = [
      ["10", "固晶部"], ["20", "焊线部"], ["30", "模压部"], ["40", "切筋成型"],
      ["90", "测试分选"], ["100", "外观全检"], ["110", "包装入库"],
    ]
    state.rows = [
      ...plasticRoute.map(([processNumber, processName]) => operationRow({ routeId: "R1", routeName: "点胶(SOT-23-27R)", processNumber, processName, qualifiedQty: "10", transInQty: "0", transOutQty: "0" })),
      // 反编返工：同一道「测试分选」在这里是 10，按最小工序号排会被顶到最前面
      ...["10:测试分选", "20:外观全检", "30:包装入库"].map((item) => {
        const [processNumber, processName] = item.split(":");
        return operationRow({ routeId: "R2", routeName: "(塑封)反编加工", processNumber, processName, qualifiedQty: "1", transInQty: "0", transOutQty: "0" });
      }),
      // 玻封：整套工序都不在塑封线上，按本路线顺序整段尾接
      ...["10:组装", "20:烧结", "30:玻封上锡"].map((item) => {
        const [processNumber, processName] = item.split(":");
        return operationRow({ routeId: "R3", routeName: "玻封(LL-34)", processNumber, processName, qualifiedQty: "1", transInQty: "0", transOutQty: "0" });
      }),
      // 只有这条路线有的「外发切割」：贴着它的后继工序（测试分选）插进去
      ...["10:模压部", "20:外发切割", "30:测试分选"].map((item) => {
        const [processNumber, processName] = item.split(":");
        return operationRow({ routeId: "R4", routeName: "点胶(DFN-1006)", processNumber, processName, qualifiedQty: "1", transInQty: "0", transOutQty: "0" });
      }),
    ];

    const result = await queryWipReport({ moNumber: "MO00", onlyPositive: "true" });

    expect(result.matrix.processes.map((item) => item.name)).toEqual([
      "固晶部", "焊线部", "模压部", "切筋成型", "外发切割", "测试分选", "外观全检", "包装入库",
      "组装", "烧结", "玻封上锡",
    ]);
    // 单元格顺序跟列头一致（前端只查表，接口自己得可核对）
    expect(result.matrix.cells.map((cell) => cell.processName)).toEqual([...new Set(result.matrix.cells.map((cell) => cell.processName))]
      .sort((left, right) => result.matrix.processes.findIndex((item) => item.name === left) - result.matrix.processes.findIndex((item) => item.name === right)));
  });

  it("keeps each route's own operation order when merging routes into the column axis", async () => {
    const { buildRouteProcessOrder } = await import("../../server/utils/wip.ts");
    const rows = [
      // 每条路线自己的工序号都从 10 开始，跨路线不可比
      ...[["10", "固晶部"], ["20", "焊线部"], ["30", "模压部"], ["40", "测试分选"]].map(([processNumber, processName]) => ({ routeId: "R1", routeName: "塑封", processNumber, processName })),
      ...[["10", "组装"], ["20", "烧结"], ["30", "打印"], ["40", "上带"]].map(([processNumber, processName]) => ({ routeId: "R2", routeName: "玻封", processNumber, processName })),
      // 支线：贴 CLIP 在固晶与焊线之间
      ...[["10", "固晶部"], ["20", "贴CLIP"], ["30", "焊线部"]].map(([processNumber, processName]) => ({ routeId: "R3", routeName: "半CLIP", processNumber, processName })),
    ];

    const order = buildRouteProcessOrder(rows);

    expect(order).toEqual(["固晶部", "贴CLIP", "焊线部", "模压部", "测试分选", "组装", "烧结", "打印", "上带"]);
    expect(order.indexOf("测试分选")).toBeGreaterThan(order.indexOf("模压部"));
    // 同一个输入必须给同一个顺序（列头不能在两次查询之间跳来跳去）
    expect(buildRouteProcessOrder([...rows].reverse())).toEqual(order);
    expect(buildRouteProcessOrder([])).toEqual([]);
  });

  it("K3 在路线上标「不用汇报」(226304) 的工序按标记剔，标 111586 的照常显示", async () => {
    // 一条链：固晶部 → 固化 → 切筋成型，固化在 K3 里是 226304「不用汇报」
    state.rows = [
      operationRow({ routeId: "1001", processNumber: "10", processName: "固晶部", qualifiedQty: "100", transInQty: "0", transOutQty: "100" }),
      operationRow({ routeId: "1001", processNumber: "40", processName: "固化", qualifiedQty: "90", transInQty: "100", transOutQty: "90" }),
      operationRow({ routeId: "1001", processNumber: "90", processName: "切筋成型", qualifiedQty: "80", transInQty: "90", transOutQty: "80" }),
    ];
    state.routeOps = [
      { routeId: 1001, operNumber: 10, processName: "固晶部", optCtrlCode: 111586 },
      { routeId: 1001, operNumber: 40, processName: "固化", optCtrlCode: 226304 },
      { routeId: 1001, operNumber: 90, processName: "切筋成型", optCtrlCode: 111610 },
    ];

    const result = await queryWipReport({ onlyPositive: "false" });

    // 固化被标记剔掉，链断在它身上：数量归到上一道，整单合计不丢
    expect(result.details.map((item) => item.processName)).toEqual(["切筋成型", "固晶部"]);
    expect(result.matrix.processes.map((item) => item.name)).toEqual(["固晶部", "切筋成型"]);
    expect(result.totalQty).toBe(20);
    expect(result.orderCount).toBe(1);
  });

  it("不回报的工序（银胶固化 / PLASMA / 回流焊）不进明细、矩阵和合计，料归到上一道", async () => {
    state.rows = [
      operationRow({ processNumber: "10", processName: "固晶部", qualifiedQty: "100", transInQty: "0", transOutQty: "100" }),
      operationRow({ processNumber: "20", processName: "银胶固化", qualifiedQty: "80", transInQty: "100", transOutQty: "80" }),
      operationRow({ processNumber: "30", processName: "PLASMA", qualifiedQty: "70", transInQty: "80", transOutQty: "70" }),
      operationRow({ processNumber: "40", processName: "回流焊", qualifiedQty: "65", transInQty: "70", transOutQty: "65" }),
      operationRow({ processNumber: "50", processName: "焊线部", qualifiedQty: "60", transInQty: "65", transOutQty: "60" }),
    ];

    const result = await queryWipReport({ onlyPositive: "false" });

    // 三道不回报的工序从流程链里消失，剩下的还是同一条链
    expect(result.details.map((item) => item.processName)).toEqual(["固晶部", "焊线部"]);
    expect(result.matrix.processes.map((item) => item.name)).toEqual(["固晶部", "焊线部"]);
    expect(result.matrix.cellCount).toBe(2);
    // 剔掉的是链中间一段，料归到上一道：整单合计不丢不重
    expect(result.totalQty).toBe(40);
    expect(result.orderCount).toBe(1);
  });

  it("列轴按路线全量工序排：没有在制的工序也当锚点，返工线的工序不再被甩到包装后面", async () => {
    // 玻封线的在制只停在 组装 / 烧结 / 玻封包装，路线（含历史）里还有 外观全检；
    // 另一张单跑在 (塑封)反编返工线上，停在 测试分选
    state.rows = [
      operationRow({ routeId: "1001", routeName: "玻封(LL-34)", processNumber: "10", processName: "组装", qualifiedQty: "10", transOutQty: "0" }),
      operationRow({ moNumber: "MO002", billNo: "OP002", routeId: "1001", routeName: "玻封(LL-34)", processNumber: "20", processName: "烧结", qualifiedQty: "20", transOutQty: "0" }),
      operationRow({ moNumber: "MO003", billNo: "OP003", routeId: "1001", routeName: "玻封(LL-34)", processNumber: "70", processName: "玻封包装", qualifiedQty: "30", transOutQty: "0" }),
      operationRow({ moNumber: "MO004", billNo: "OP004", routeId: "1002", routeName: "(塑封)反编返工", processNumber: "10", processName: "测试分选", qualifiedQty: "40", transOutQty: "0" }),
    ];
    state.routeOps = [
      { routeId: 1001, operNumber: 10, processName: "组装" },
      { routeId: 1001, operNumber: 20, processName: "烧结" },
      { routeId: 1001, operNumber: 30, processName: "外观全检" },
      { routeId: 1001, operNumber: 70, processName: "玻封包装" },
      { routeId: 1002, operNumber: 10, processName: "测试分选" },
      { routeId: 1002, operNumber: 20, processName: "外观全检" },
      { routeId: 1002, operNumber: 30, processName: "包装入库" },
    ];

    const withRouteOps = await queryWipReport({ onlyPositive: "false" });
    // 外观全检、包装入库没有在制 → 不占列；但它们在骨架里当锚点，
    // 于是「测试分选」插到 外观全检 之前，而不是尾接到「玻封包装」之后
    expect(withRouteOps.matrix.processes.map((item) => item.name)).toEqual([
      "组装", "烧结", "测试分选", "玻封包装",
    ]);
    // 路线骨架是补的一条 SQL，主查询仍然是第一条（后面有按 requests[0] 断言的用例）
    expect(state.requests[0].query.mock.calls[0][0]).toContain("T_SFC_OPERPLANNING op");
    expect(state.requests[1].query.mock.calls[0][0]).toContain("T_ENG_ROUTEOPERSEQ");

    // 取不到路线骨架（老口径）时退回按返回行推：测试分选没有锚点，只能尾接
    state.routeOps = [];
    const withoutRouteOps = await queryWipReport({ onlyPositive: "false" });
    expect(withoutRouteOps.matrix.processes.map((item) => item.name)).toEqual([
      "组装", "烧结", "玻封包装", "测试分选",
    ]);
  });

  it("counts orders, materials and rows sitting on an unreported operation per cell", async () => {
    state.rows = [
      operationRow({ moNumber: "MO001", packageName: "PDFN5X6", processNumber: "10", processName: "固晶部", operQty: "65.82", qualifiedQty: "0", transInQty: "0", transOutQty: "0" }),
      operationRow({ moNumber: "MO002", packageName: "PDFN5X6", processNumber: "10", processName: "固晶部", materialNumber: "M009", operQty: "34.18", qualifiedQty: "0", transInQty: "0", transOutQty: "0" }),
    ];

    const result = await queryWipReport({ moNumber: "MO00", onlyPositive: "true" });
    const cell = result.matrix.cells[0];

    expect([cell.packageName, cell.processName]).toEqual(["PDFN5X6", "固晶部"]);
    expect(cell.wipQty).toBe(100);
    expect(cell.unreportedQty).toBe(100);
    expect(cell.unreportedCount).toBe(2);
    expect(cell.orderCount).toBe(2);
    expect(cell.materialCount).toBe(2);
  });

  it("files materials without a specification under 未维护封装", async () => {
    state.rows = [
      operationRow({ packageName: null, qualifiedQty: "10", transInQty: "0", transOutQty: "0" }),
    ];

    const result = await queryWipReport({ moNumber: "MO001", onlyPositive: "true" });

    expect(result.matrix.packages.map((item) => item.name)).toEqual(["未维护封装"]);
    expect(result.packageCount).toBe(1);
  });

  it("filters by package name on the same expression used for the matrix axis", async () => {
    await queryWipReport({ packageName: "PDFN5X6", onlyPositive: "false" });
    const sql = state.requests[0].query.mock.calls[0][0];

    expect(sql).toContain("AS packageName");
    expect(sql).toContain("LIKE @packageName");
    expect(sql).not.toContain("PDFN5X6");
    expect(state.sqlStringParameter).toHaveBeenCalledWith(expect.anything(), "packageName", "%PDFN5X6%");
  });

  it("searches one keyword across order, flow bill, material and package in a single OR group", async () => {
    await queryWipReport({ keyword: "TX031463", onlyPositive: "false" });
    const sql = state.requests[0].query.mock.calls[0][0];

    // 顶部搜索框：一个关键词横扫订单 / 流程单 / 物料编码 · 名称 · 规格 / 封装
    expect(sql).toContain("op.FMONumber LIKE @keyword");
    expect(sql).toContain("op.FBillNo LIKE @keyword");
    expect(sql).toContain("mat.FNUMBER LIKE @keyword");
    expect(sql).toContain("mat_l.FNAME LIKE @keyword");
    expect(sql).toContain("mat_l.FSPECIFICATION LIKE @keyword");
    expect(sql).toContain("LIKE @keyword");
    // 关键词里不能直接拼进 SQL
    expect(sql).not.toContain("TX031463");
    expect(state.sqlStringParameter).toHaveBeenCalledWith(expect.anything(), "keyword", "%TX031463%");

    // 关键词不是工序：不应触发「带出整条流程链」的展开（那条路径只给工序筛选）
    expect(sql).not.toContain("WITH matched AS");
  });

  it("treats the search keyword as a real filter, and still rejects single characters", async () => {
    const { hasWipFilter, weakWipFilterMessage } = await import("../../server/utils/wip.ts");

    expect(hasWipFilter({ keyword: "MO2609" })).toBe(true);
    expect(weakWipFilterMessage({ keyword: "MO" })).toBeNull();
    expect(weakWipFilterMessage({ keyword: "M" })).toBe("筛选条件太宽泛，请至少输入2个字符后再查询");
  });

  it("judges the operation status by its own report quantity, not by material received from the previous operation", async () => {
    // TX031463 实单形状：包装入库只接住了上道转入 111，自己一道都没汇报
    state.rows = [
      operationRow({ processNumber: "100", processName: "外观全检", operQty: "129.6", reportQty: "111", qualifiedQty: "111", transInQty: "111", transOutQty: "111", lastReportTime: " " }),
      operationRow({ processNumber: "110", processName: "包装入库", operQty: "129.6", reportQty: "0", qualifiedQty: "0", transInQty: "111", transOutQty: "0", lastReportTime: " " }),
    ];

    // 这三条看的是行级状态/数量，不是「要不要进在制清单」，所以显式保留在制为 0 的行
    const result = await queryWipReport({ moNumber: "MO001", onlyPositive: "false", hideZeroWip: "false" });
    const packing = result.details.find((item) => item.processName === "包装入库");

    expect(packing.wipStatus).toBe("received");
    expect(packing.unreported).toBe(false);
    expect(packing.wipQty).toBe(111);
    expect(packing.transInQty).toBe(111);
    expect(packing.reportQty).toBe(0);
    expect(result.details.find((item) => item.processName === "外观全检").wipStatus).toBe("reported");
  });

  it("flags operations that produced or moved material without a report of their own", async () => {
    // 外发上锡：没有汇报单，但合格/转入/转出都有数（转移单带进来的）
    state.rows = [
      operationRow({ processNumber: "60", processName: "塑封外发上锡", operQty: "129.6", reportQty: "0", qualifiedQty: "129.5", transInQty: "129.5", transOutQty: "129.5" }),
    ];

    // 末道且已全额转出 → 在制 0，默认只看有量时会被隐藏，这里放开看状态
    const result = await queryWipReport({ moNumber: "MO001", onlyPositive: "false", hideZeroWip: "false" });

    expect(result.details[0].wipStatus).toBe("produced");
    expect(result.details[0].unreported).toBe(false);
  });

  it("keeps the untouched operation as 未汇报 and counts every not-reported row in the matrix cell", async () => {
    state.rows = [
      operationRow({ processNumber: "110", processName: "包装入库", operQty: "129.6", reportQty: "0", qualifiedQty: "0", transInQty: "111", transOutQty: "0" }),
      operationRow({ processNumber: "120", processName: "入库复核", operQty: "40", reportQty: "0", qualifiedQty: "0", transInQty: "0", transOutQty: "0" }),
    ];

    const result = await queryWipReport({ moNumber: "MO001", onlyPositive: "false", hideZeroWip: "false" });
    const untouched = result.details.find((item) => item.processName === "入库复核");

    expect(untouched.wipStatus).toBe("unreported");
    expect(untouched.unreported).toBe(true);
    // 矩阵格子的「未汇报」= 本工序没有汇报（含上道已转入），与明细状态同一件事
    expect(result.matrix.cells.every((cell) => cell.unreportedCount === 1)).toBe(true);
  });

  it("treats a package filter as a usable and non-weak condition", async () => {
    const { hasWipFilter, weakWipFilterMessage } = await import("../../server/utils/wip.ts");

    expect(hasWipFilter({ packageName: "SOD-123" })).toBe(true);
    expect(weakWipFilterMessage({ packageName: "SOD-123" })).toBeNull();
    expect(weakWipFilterMessage({ packageName: "S" })).toBe("筛选条件太宽泛，请至少输入2个字符后再查询");
  });

  it("filters 玻封 / 塑封 on the same expression the package axis is built from", async () => {
    await queryWipReport({ packageType: "玻封", onlyPositive: "false" });
    const sql = state.requests[0].query.mock.calls[0][0];

    // 工艺分类也是规格口径（含 LL / DO- 算玻封），跟封装名共用同一列
    expect(sql).toContain("AS packageType");
    expect(sql).toContain("LIKE '%LL%'");
    expect(sql).toContain("LIKE '%DO-%'");
    expect(sql).toContain("= @packageType");
    // 工艺名不能直接拼进 SQL（CASE 里的 N'玻封' 是固定文案，这里要的是筛选值没被拼接）
    expect(sql).not.toContain("= N'玻封'");
    expect(state.sqlStringParameter).toHaveBeenCalledWith(expect.anything(), "packageType", "玻封");
  });

  it("keeps every row when no package type is given, and ignores an unknown one", async () => {
    const { normalizePackageType } = await import("../../server/utils/wip.ts");

    expect(normalizePackageType("玻封")).toBe("玻封");
    expect(normalizePackageType(" 塑封 ")).toBe("塑封");
    expect(normalizePackageType("")).toBe("");
    expect(normalizePackageType("玻璃封装")).toBe("");

    await queryWipReport({ moNumber: "MO001", onlyPositive: "false" });
    expect(state.requests[0].query.mock.calls[0][0]).not.toContain("= @packageType");

    await queryWipReport({ moNumber: "MO001", packageType: "玻璃封装", onlyPositive: "false" });
    expect(state.requests[1].query.mock.calls[0][0]).not.toContain("= @packageType");
  });

  it("carries the package type down to the detail rows so the export can show it", async () => {
    state.rows = [
      operationRow({ packageName: "LL-34", packageType: "玻封", qualifiedQty: "10", transInQty: "0", transOutQty: "0" }),
      operationRow({ moNumber: "MO002", materialNumber: "M002", packageName: "SOD-123", packageType: "塑封", qualifiedQty: "5", transInQty: "0", transOutQty: "0" }),
    ];

    const result = await queryWipReport({ moNumber: "MO00", onlyPositive: "true" });

    expect(result.details.map((item) => [item.packageName, item.packageType])).toEqual([["LL-34", "玻封"], ["SOD-123", "塑封"]]);
  });
});
