import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";

import { renderWarningWorkbookBuffer } from "../../server/utils/kucun-warning-export";

const rows = [
  { stock_org_code: "100", stock_org_name: "示例企业有限公司", material_code: "N103010004", material_name: "黑胶 SOD-123/523", specification: "EMG", unit: "千克", safe_stock: 1350, actual_total: 755.9853, warning_status: "低于安全库存 (偏低)" },
  { stock_org_code: "100", stock_org_name: "示例企业有限公司", material_code: "N105040001", material_name: "裸铜框架", specification: "", unit: "千克", safe_stock: 3000, actual_total: 11304.976, warning_status: "正常" },
];

function readSheet(buffer, index) {
  const files = unzipSync(buffer);
  return strFromU8(files[`xl/worksheets/sheet${index + 1}.xml`]);
}

describe("金蝶库存预警 OOXML 生成器", () => {
  const buffer = renderWarningWorkbookBuffer(rows);

  it("zip 结构完整（workbook/styles/两张表/docProps）", () => {
    const files = Object.keys(unzipSync(buffer));
    for (const need of ["[Content_Types].xml", "xl/workbook.xml", "xl/styles.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml", "docProps/core.xml"]) {
      expect(files).toContain(need);
    }
  });

  it("全部表：标题/KPI/表头/偏低置顶/页脚", () => {
    const xml = readSheet(buffer, 0);
    expect(xml).toContain("金蝶库存预警报表");
    expect(xml).toContain("物料总数");
    expect(xml).toContain(">2</v>");      // 物料总数=2
    expect(xml).toContain(">1</v>");      // 偏低=1
    expect(xml).toContain("库存组织");     // 表头
    // 偏低行在正常行前（N103 在 N105 前）
    expect(xml.indexOf("N103010004")).toBeLessThan(xml.indexOf("N105040001"));
    expect(xml).toContain("低于安全库存 (偏低)");
    expect(xml).toContain("缺口 = max(0");
    expect(xml).toContain('<pane ySplit="6"');
    expect(xml).toContain("<autoFilter ref=");
    expect(xml).toContain('<tabColor rgb="FF1D4ED8"/>');
  });

  it("偏低明细表：只有偏低行、KPI 显示偏低占比", () => {
    const xml = readSheet(buffer, 1);
    expect(xml).toContain("偏低明细");
    expect(xml).toContain("偏低占比");
    expect(xml).toContain(">100</v>");
    expect(xml).toContain("N103010004");
    expect(xml).not.toContain("N105040001");
    expect(xml).toContain('<tabColor rgb="FFDC2626"/>');
  });

  it("XML 合法性：worksheet 子元素顺序符合 schema（sheetPr < dimension < sheetViews < sheetData < mergeCells < autoFilter < pageMargins）", () => {
    const xml = readSheet(buffer, 0);
    const order = ["<sheetPr>", "<dimension", "<sheetViews>", "<sheetFormatPr", "<cols>", "<sheetData>", "<autoFilter", "<mergeCells", "<pageMargins"];
    const idx = order.map((t) => xml.indexOf(t));
    expect(idx.every((i) => i >= 0)).toBe(true);
    for (let i = 1; i < idx.length; i++) expect(idx[i]).toBeGreaterThan(idx[i - 1]);
  });

  it("数字单元格 t=\"n\"、文本 inlineStr、样式索引递增可用", () => {
    const xml = readSheet(buffer, 0);
    expect(xml).toMatch(/<c r="G\d+" s="\d+" t="n"><v>1350<\/v><\/c>/);
    expect(xml).toMatch(/t="inlineStr"/);
  });
});