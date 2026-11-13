import { describe, expect, it } from 'vitest';
import {
  formatDecimalRate,
  formatNumber,
  getPackageStorageLocation,
  getPackageShelfCandidates,
  expandShelfRange,
  isLocationInSuggestedRange,
  DEFAULT_PAGE_NUM,
  parseLegacyStockLabelBarcode,
  PROCESS_YIELD_THRESHOLD,
  buildDashboardSummary,
  metricRow,
  normalizeDashboardResponse,
  percentOf,
  buildIncomingInspectionReportDocument,
} from '@ctk-system/shared';

describe('@ctk-system/shared', () => {
  it('formatNumber trims trailing zeros', () => {
    expect(formatNumber(5.5)).toBe('5.5');
    expect(formatNumber('10.0000')).toBe('10');
    expect(formatNumber(null)).toBe('');
  });

  it('formatDecimalRate renders percent', () => {
    expect(formatDecimalRate(0.0523)).toBe('5.23%');
    expect(formatDecimalRate('bad')).toBe('0.00%');
  });

  it('DEFAULT_PAGE_NUM is 1', () => {
    expect(DEFAULT_PAGE_NUM).toBe(1);
  });

  it('maps package specifications to warehouse locations', () => {
    expect(getPackageStorageLocation('SOT-23/6R')).toBe('A1-A9');
    expect(getPackageStorageLocation('TO 252')).toBe('A10-A12');
    expect(getPackageStorageLocation('DFN1006')).toBe('A13');
    expect(getPackageStorageLocation('SOD-523')).toBe('A14-A15');
    expect(getPackageStorageLocation('sod323')).toBe('B1-B6');
    expect(getPackageStorageLocation('SOD-123')).toBe('B7-B11');
    expect(getPackageStorageLocation('插件产品')).toBe('B12');
    expect(getPackageStorageLocation('SOT-89')).toBe('B13');
    expect(getPackageStorageLocation('SMB')).toBe('B13-B14');
    expect(getPackageStorageLocation('SMA')).toBe('B15');
    expect(getPackageStorageLocation('未知封装')).toBe('');
  });

  it('checks shelf code against suggested range', () => {
    expect(isLocationInSuggestedRange('A5', 'A1-A9')).toBe(true);
    expect(isLocationInSuggestedRange('A13', 'A13')).toBe(true);
    expect(isLocationInSuggestedRange('A5', 'A5')).toBe(true);
    expect(isLocationInSuggestedRange('B1', 'A1-A9')).toBe(false);
    expect(isLocationInSuggestedRange('A-01', 'A-01')).toBe(true);
  });

  it('expands shelf ranges to exact shelves', () => {
    expect(expandShelfRange('A13')).toEqual(['A13']);
    expect(expandShelfRange('A1-A3')).toEqual(['A1', 'A2', 'A3']);
    expect(getPackageShelfCandidates('SOT-23')).toEqual([
      'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9'
    ]);
  });

  it('parses the 1.13 legacy stock label protocol', () => {
    expect(parseLegacyStockLabelBarcode('{"编码":"nad0040009","名称":"TK1N4148WS","封装":"SOD-323","印字":"T4"}')).toMatchObject({
      kind: 'legacy-material',
      legacy: true,
      materialCode: 'NAD0040009',
      qty: null,
    });
  });

  it('keeps process-yield metric definitions aligned with the dashboard contract', () => {
    expect(PROCESS_YIELD_THRESHOLD).toBe(97.5);
    expect(percentOf(975, 1000)).toBe(97.5);
    expect(percentOf(1, 0)).toBeNull();

    const result = normalizeDashboardResponse({
      rows: [{
        packageName: 'LL-34',
        packagingInputQty: 1000,
        packagingQualifiedQty: 980,
        packagingPlanCount: 2,
        packagingPassedPlanCount: 1,
        testingInputQty: 800,
        testingQualifiedQty: 792,
        testingPlanCount: 1,
        testingPassedPlanCount: 1,
      }],
    });

    expect(metricRow(result.rows[0], {
      mode: 'quantity',
      inputKey: 'packagingInputQty',
      qualifiedKey: 'packagingQualifiedQty',
      planKey: 'packagingPlanCount',
      passedKey: 'packagingPassedPlanCount',
    })).toMatchObject({ rate: 98, inputQty: 1000, qualifiedQty: 980 });
    expect(metricRow(result.rows[0], {
      mode: 'plans',
      inputKey: 'packagingPlanCount',
      qualifiedKey: 'packagingPassedPlanCount',
      planKey: 'packagingPlanCount',
      passedKey: 'packagingPassedPlanCount',
    })).toMatchObject({ rate: 50, planCount: 2, passedPlanCount: 1 });
    expect(buildDashboardSummary(result.rows)).toMatchObject({
      packageCount: 1,
      packagingPlanCount: 2,
      testingPlanCount: 1,
      testingPassedPlanCount: 1,
    });
  });

  it('builds one escaped incoming-inspection report page per inbound item', () => {
    const html = buildIncomingInspectionReportDocument({
      billNo: 'RKD001',
      purchaseOrderNo: 'PO001',
      supplierName: '供应商<A>',
      deliveryDate: '2026-07-27',
      items: [
        { materialNumber: 'MAT001', materialName: '物料一', specification: 'SOT-23', planQty: 100, stockName: '原材料仓' },
        { materialNumber: 'MAT002', materialName: '物料二', specification: 'SMA', planQty: 50, stockName: '原材料仓' },
      ],
    });

    expect(html.match(/class="inspection-page"/g)).toHaveLength(2);
    expect(html).toContain('来料检验报告');
    expect(html).toContain('PO001');
    expect(html).toContain('RKD001');
    expect(html).toContain('供应商&lt;A&gt;');
    expect(html).toContain('@page{size:A4 portrait');
    expect(html).toContain('<th colspan="7" class="section-title inspection-title">检验项目</th>');
    expect(html).toContain('.section-title{height:6.5mm;font-size:10pt;text-align:left;padding-right:9.9mm}');
    expect(html).toContain('.final-result{text-align:justify;padding-left:0;padding-right:9.9mm}');
    expect(html).toContain('<th rowspan="4">AQL</th>');
    expect(html).not.toContain('抽样数据');
    expect(html).toContain('<th rowspan="2" class="dimension-index">');
    expect(html).toContain('<tr><th></th><th></th><th></th><th></th><th></th><th></th><th></th><th></th></tr>');
    expect(html).not.toContain('<th>1</th><th>2</th><th>3</th>');
    expect(html).toContain('<line x1="0" y1="0" x2="100" y2="50"></line>');
    expect(html).toContain('<table class="approval-table">');
    expect(html).toContain('<tr><th colspan="6">Approval核批/品质部</th><th colspan="3">Approval 核 批</th></tr>');
    expect(html).toContain('<th rowspan="3">入仓</th><th>总数</th><th>合格数</th><th>合格率</th><th>退货数</th><th>退货率</th><th>品 质</th><th>采 购</th><th>仓库</th>');
    expect(html).toContain('<th colspan="8" class="approval-remark">备注：</th>');
    expect(html).not.toContain('品质　采购　仓库');
    expect(html).toContain('<th rowspan="6" class="vertical">审核</th><th class="disposition-cell">处理方式</th><th class="disposition-cell">Qty.数量</th><th class="disposition-cell">Disposition note 处理注意事项</th>');
    expect(html).toContain('Rework   返工');
    expect(html).toContain('Sort     特采');
    expect(html).toContain('RTV    退回供应商');
    expect(html).toContain('Scrap    报废');
    expect(html).toContain('<th colspan="3" class="lower-remark">备注：</th>');
    expect(html).not.toContain('RTV　退回供应商　/　Scrap　报废');
  });

  it('prefers approve date and joins multiple source order numbers on the report', () => {
    const html = buildIncomingInspectionReportDocument({
      billNo: 'RKD002',
      purchaseOrderNos: ['PO001', 'PO002'],
      supplierName: '供应商',
      approveDate: '2026-07-28 10:00',
      deliveryDate: '2026-07-27',
      items: [{ materialNumber: 'MAT001', materialName: '物料一', specification: '', planQty: 10 }],
    });

    expect(html).toContain('2026-07-28 10:00');
    expect(html).toContain('PO001、PO002');
  });
});
