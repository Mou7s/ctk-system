import { describe, expect, it } from "vitest";
import {
  matrixExportFileName,
  summaryQuantityHelp,
  truncatedBadgeText,
  STOCK_DOCUMENT_ROW_CAP,
} from "../utils/stock-document-view.js";

describe("stock document list wording", () => {
  it("flags the truncated summary window instead of claiming a full total", () => {
    expect(summaryQuantityHelp(false)).toBe("当前筛选范围数量合计");
    expect(summaryQuantityHelp(true)).toContain("最近 20,000 行");
    expect(summaryQuantityHelp(true)).toContain("缩小日期范围");
  });

  it("returns no badge text when the result set is complete", () => {
    expect(truncatedBadgeText(false)).toBe("");
    expect(truncatedBadgeText(true)).toContain(`超过 ${STOCK_DOCUMENT_ROW_CAP.toLocaleString("zh-CN")} 行`);
  });

  it("names the monthly matrix file after the begin date month", () => {
    expect(matrixExportFileName("2026-09-01")).toBe("成品入库明细表_202609.xlsx");
    expect(matrixExportFileName("2026-09-01", "成品出库明细表")).toBe("成品出库明细表_202609.xlsx");
  });

  it("falls back to the current month when the range is cleared", () => {
    const now = new Date();
    const expected = `成品入库明细表_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}.xlsx`;
    expect(matrixExportFileName("")).toBe(expected);
    expect(matrixExportFileName(undefined)).toBe(expected);
  });
});
