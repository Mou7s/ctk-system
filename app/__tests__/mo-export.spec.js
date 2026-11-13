import { describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx/xlsx.mjs';
import { collectMoExportRows, createMoWorkbook } from '../utils/mo-export';

describe('生产进度 XLSX 导出', () => {
  it('收集全部分页，并固定开始导出时的筛选条件', async () => {
    const filters = { FNAME: '测试物料' };
    const fetchPage = vi.fn(async ({ pageNum }) => {
      filters.FNAME = '已修改';
      return { code: 200, data: { total: 2, rows: [{ FBillNo: String(pageNum) }] } };
    });
    expect(await collectMoExportRows(fetchPage, filters)).toHaveLength(2);
    expect(fetchPage).toHaveBeenNthCalledWith(2, { FNAME: '测试物料', pageNum: 2, pageSize: 100 });
  });

  it('中途失败或数量变化时拒绝生成残缺报表', async () => {
    const fetchPage = vi.fn()
      .mockResolvedValueOnce({ code: 200, data: { total: 2, rows: [{}] } })
      .mockResolvedValueOnce({ code: 502, msg: '查询失败' });
    await expect(collectMoExportRows(fetchPage, {})).rejects.toThrow('查询失败');
    await expect(collectMoExportRows(async () => ({ code: 200, data: { total: 1, rows: [] } }), {})).rejects.toThrow('不完整');
    const changed = vi.fn()
      .mockResolvedValueOnce({ code: 200, data: { total: 2, rows: [{}] } })
      .mockResolvedValueOnce({ code: 200, data: { total: 3, rows: [{}] } });
    await expect(collectMoExportRows(changed, {})).rejects.toThrow('发生变化');
  });

  it('空结果不继续翻页', async () => {
    const fetchPage = vi.fn(async () => ({ code: 200, data: { total: 0, rows: [] } }));
    expect(await collectMoExportRows(fetchPage, {})).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('生成可回读的两张表，保留编码文本、数值和每单各自的工序', () => {
    const rows = [{ FMONumber: '00012', FNUMBER: '=MODEL', FOperQty: 123.5, reportDate: '2026-10-29 10:20:00', details: [
      { FOperNumber: '10', zuoye: '封装', FQualifiedQty: 100.25, FUnqualifiedQty: 0, reportDate: '2026-10-29 10:20:00' },
      { FOperNumber: '20', zuoye: '测试', FQualifiedQty: 90, FUnqualifiedQty: 2 },
    ] }, { FMONumber: '00013', details: [] }];
    const book = createMoWorkbook(XLSX, rows);
    const restored = XLSX.read(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
    expect(restored.SheetNames).toEqual(['生产订单', '工序明细']);
    const orders = XLSX.utils.sheet_to_json(restored.Sheets['生产订单']);
    const details = XLSX.utils.sheet_to_json(restored.Sheets['工序明细']);
    expect(orders).toHaveLength(2);
    expect(orders[0]).toMatchObject({ '生产订单号': '00012', '物料编码': '=MODEL', '生产数量': 123.5 });
    expect(restored.Sheets['生产订单'].D2.f).toBeUndefined();
    expect(details).toHaveLength(2);
    expect(details[0]).toMatchObject({ '合格数量': 100.25, '不良数量': 0, '工序汇报时间': '2026-10-29 10:20:00' });
  });
});
