import { zipSync, strToU8 } from 'fflate'
import { setResponseHeader, type H3Event } from 'h3'
import { buildWarningSheetFiles } from './kucun-warning-ooxml'

/**
 * 金蝶库存预警报表导出：原生 OOXML 生成（参照退役 Java POI 结构，零修复提示），
 * 样式为 2026-09 设计版（KPI 卡片条 / 深蓝横幅 / 斑马纹+偏低淡红 / 冻结筛选 / Sheet 标签着色）。
 */

export function buildWarningWorkbook(dbRows: Array<Record<string, unknown>>) {
  // 兼容旧测试：返回 { SheetNames, Sheets } 形状由测试直接断言 XML 生成器，导出层只负责打包。
  throw new Error('use buildWarningSheetFiles/renderWarningWorkbookBuffer instead')
}

export function renderWarningWorkbookBuffer(dbRows: Array<Record<string, unknown>>): Uint8Array {
  return zipSync(buildWarningSheetFiles(dbRows), { level: 6 })
}

export function warningExcelFileName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `金蝶库存预警报表_${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.xlsx`
}

export function sendKucunWarningExcel(event: H3Event, dbRows: Array<Record<string, unknown>>) {
  const buffer = renderWarningWorkbookBuffer(dbRows)
  setResponseHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(warningExcelFileName())}`)
  setResponseHeader(event, 'Access-Control-Expose-Headers', 'Content-Disposition')
  return buffer
}
