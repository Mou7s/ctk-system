import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ queries: [], mysql: { rows: [], affectedRows: 0 } }));

vi.mock("../../server/utils/sqlserver", () => ({
  queryK3SqlServer: vi.fn(async (execute) => {
    const request = makeK3Request();
    const result = await execute(request);
    return result.recordset ?? result;
  }),
  withK3SqlServerTransaction: vi.fn(async (execute) => {
    const txRequest = {
      input: vi.fn(),
      query: vi.fn(async () => ({ rowsAffected: [1] })),
    };
    return execute({ request: () => txRequest });
  }),
  sqlBigIntParameter: vi.fn((req, _name, value) => req.input("materialId", value)),
}));

vi.mock("mssql", () => ({ default: { Decimal: vi.fn(() => "DEC") } }));

vi.mock("../../server/utils/mysql", () => ({
  getMysqlPool: () => ({
    query: vi.fn(async (sql) => {
      if (String(sql).includes("DELETE FROM kucun_warning")) return [{ affectedRows: 1 }]
      return [[{ actual_total: 731.5111 }]]
    }),
  }),
  mysqlQueryOptions: (s) => s,
}));

function makeK3Request() {
  return {
    input: vi.fn(),
    query: vi.fn(async (sql) => {
      const idx = state.queries.findIndex((q) => sql.includes(q.match));
      if (idx === -1) return { recordset: [], rowsAffected: [0] };
      const hit = state.queries.splice(idx, 1)[0];
      if (hit.reject) throw hit.reject;
      return { recordset: hit.rows, rowsAffected: hit.rowsAffected ?? [hit.rows.length] };
    }),
  };
}

import {
  updateMaterialSafeStock,
  disableMaterialSafeStockWarning,
} from "../../server/utils/kucun-warning-write";

const MATERIAL_ROW = {
  FMATERIALID: 249627, FNUMBER: "N103010004", ORGNUMBER: "100",
  FDOCUMENTSTATUS: "C", FFORBIDSTATUS: "A", FSAFESTOCK: 1350, FISENABLESAFESTOCK: "1",
};

describe("金蝶安全库存写入（还原退役 Java 口径）", () => {
  beforeEach(() => {
    state.queries = [];
    state.mysql = { rows: [], affectedRows: 0 };
  });

  it("修改安全库存：UPDATE 后回读一致 + 更新本地快照", async () => {
    state.queries.push(
      { match: "FROM T_BD_MATERIAL m", rows: [{ ...MATERIAL_ROW }] },
      { match: "FROM T_BD_MATERIALSTOCK WHERE FMATERIALID = @materialId", rows: [{ FSAFESTOCK: 1400, FISENABLESAFESTOCK: "1" }] },
    );
    state.mysql = { rows: [{ actual_total: 731.5111 }], affectedRows: 1 };

    const r = await updateMaterialSafeStock("N103010004", "100", 1400);
    expect(r.materialId).toBe(249627);
    expect(r.safeStock).toBe(1400);
    expect(r.warningStatus).toBe("低于安全库存 (偏低)");
  });

  it("回读不一致：抛错（金蝶被占用等场景）", async () => {
    state.queries.push(
      { match: "FROM T_BD_MATERIAL m", rows: [{ ...MATERIAL_ROW }] },
      { match: "FROM T_BD_MATERIALSTOCK WHERE FMATERIALID = @materialId", rows: [{ FSAFESTOCK: 1350, FISENABLESAFESTOCK: "1" }] },
    );
    await expect(updateMaterialSafeStock("N103010004", "100", 1400)).rejects.toThrow("未更新成功");
  });

  it("物料未审核/已禁用：拒绝写入", async () => {
    state.queries.push({ match: "FROM T_BD_MATERIAL m", rows: [{ ...MATERIAL_ROW, FDOCUMENTSTATUS: "B" }] });
    await expect(updateMaterialSafeStock("N103010004", "100", 1400)).rejects.toThrow("未审核");

    state.queries.push({ match: "FROM T_BD_MATERIAL m", rows: [{ ...MATERIAL_ROW, FFORBIDSTATUS: "B" }] });
    await expect(updateMaterialSafeStock("N103010004", "100", 1400)).rejects.toThrow("已禁用");
  });

  it("负数安全库存：拒绝", async () => {
    await expect(updateMaterialSafeStock("N103010004", "100", -1)).rejects.toThrow("不能为负数");
  });

  it("移除预警：关闭开关回读为 0 + 删除本地行", async () => {
    state.queries.push(
      { match: "FROM T_BD_MATERIAL m", rows: [{ ...MATERIAL_ROW }] },
      { match: "FROM T_BD_MATERIALSTOCK WHERE FMATERIALID = @materialId", rows: [{ FSAFESTOCK: 1350, FISENABLESAFESTOCK: "0" }] },
    );
    state.mysql.affectedRows = 1;

    const r = await disableMaterialSafeStockWarning("N103010004", "100");
    expect(r.materialId).toBe(249627);
    expect(r.localDeleted).toBe(true);
  });

  it("移除预警：开关没关掉（回读仍为 1）抛错，不删本地行", async () => {
    state.queries.push(
      { match: "FROM T_BD_MATERIAL m", rows: [{ ...MATERIAL_ROW }] },
      { match: "FROM T_BD_MATERIALSTOCK WHERE FMATERIALID = @materialId", rows: [{ FSAFESTOCK: 1350, FISENABLESAFESTOCK: "1" }] },
    );
    await expect(disableMaterialSafeStockWarning("N103010004", "100")).rejects.toThrow("未关闭成功");
  });
});