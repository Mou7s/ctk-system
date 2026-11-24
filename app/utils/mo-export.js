// Reuse the list API and its filters; never silently export only the visible page.
export async function collectMoExportRows(fetchPage, filters) {
  const query = { ...filters };
  const rows = [];
  let expectedTotal;
  for (let pageNum = 1; ; pageNum++) {
    const response = await fetchPage({ ...query, pageNum, pageSize: 100 });
    const data = response?.data;
    if (response?.code !== 200 || !Array.isArray(data?.rows)) {
      throw new Error(response?.msg || '读取导出数据失败');
    }
    const total = Number(data.total);
    if (!Number.isInteger(total) || total < 0) throw new Error('导出数据总数无效');
    if (expectedTotal === undefined) expectedTotal = total;
    if (total !== expectedTotal) throw new Error('数据在导出期间发生变化，请重新导出');
    rows.push(...data.rows);
    if (rows.length === total) return rows;
    if (!data.rows.length || rows.length > total) throw new Error('导出数据不完整，请重新导出');
  }
}

export function createMoWorkbook(XLSX, rows) {
  const headers = ['生产订单号', '行号', '流程单号', '物料编码', '物料名称', '封装规格', '工艺路线', '生产数量', '生产部门', '最近汇报时间'];
  const values = (row) => [row.FMONumber ?? '', row.FMOEntrySeq ?? '', row.FBillNo ?? '', row.FNUMBER ?? '', row.FNAME ?? '', row.FSPECIFICATION ?? '', row.gongyiluxian ?? '', row.FOperQty ?? 0, row.FFullName ?? '', row.reportDate ?? ''];
  const orders = [headers, ...rows.map(values)];
  const details = [[...headers, '工序号', '工序名称', '加工车间', '合格数量', '不良数量', '工序汇报时间']];
  for (const row of rows) {
    for (const detail of row.details || []) {
      details.push([...values(row), detail.FOperNumber ?? '', detail.zuoye ?? '', detail.jiagongchejian ?? '', detail.FQualifiedQty ?? 0, detail.FUnqualifiedQty ?? 0, detail.reportDate ?? '']);
    }
  }
  const workbook = XLSX.utils.book_new();
  for (const [name, data] of [['生产订单', orders], ['工序明细', details]]) {
    const sheet = XLSX.utils.aoa_to_sheet(data);
    sheet['!cols'] = data[0].map((_, index) => ({ wch: [0, 2, 3, 4, 5, 6, 9, 15].includes(index) ? 24 : 16 }));
    sheet['!autofilter'] = { ref: sheet['!ref'] };
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  }
  return workbook;
}
