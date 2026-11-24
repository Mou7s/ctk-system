/**
 * 生产入库 / 销售出库单据列表页的展示口径。
 *
 * K3 查询按 1000 行/批拉取，服务端有 20000 行的硬上限（stock-document.ts
 * 的 STOCK_DOCUMENT_MAX_ROWS），命中上限时只会统计「按日期倒序的最近
 * N 行」，因此卡片文案必须同屏说明，不能让用户把它当成全量数字。
 */

export const STOCK_DOCUMENT_ROW_CAP = 20000

export function summaryQuantityHelp(truncated) {
  const cap = STOCK_DOCUMENT_ROW_CAP.toLocaleString('zh-CN')
  return truncated
    ? `仅统计最近 ${cap} 行（已达查询上限，请缩小日期范围）`
    : '当前筛选范围数量合计'
}

export function truncatedBadgeText(truncated) {
  const cap = STOCK_DOCUMENT_ROW_CAP.toLocaleString('zh-CN')
  return truncated
    ? `数据超过 ${cap} 行，仅按日期倒序统计最近 ${cap} 行`
    : ''
}

/**
 * 月度矩阵导出文件名：与后端 targetMonth 口径一致（由开始日期所在月决定，
 * 跨月区间后端会直接拒绝）。
 */
export function matrixExportFileName(beginDate, prefix = '成品入库明细表') {
  const month = String(beginDate || '').slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(month)) {
    const now = new Date()
    return `${prefix}_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}.xlsx`
  }
  return `${prefix}_${month.replace('-', '')}.xlsx`
}
