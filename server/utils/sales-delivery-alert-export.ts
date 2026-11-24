import XLSX from 'xlsx-js-style'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import type { DeliveryRow } from './sales-delivery-alert-model'

const PRODUCTION_COLORS: Record<string, string> = {
  '已入库待发货': 'DCFCE7',
  '生产未完成': 'FEF3C7',
  '待核实': 'E2E8F0',
}

export function renderDeliveryAlertExcel(rows: DeliveryRow[], title: string, fetchedAt: string): Uint8Array {
  const columns = ['紧急程度','剩余天数','生产回复交期','客户','销售订单','行号','物料编码','物料名称','单位','订单数量','已出库数量','未出库数量','退货数量','业务员','跟单员1','跟单员2','异常说明','生产分类','生产状态','累计合格入库数量','入库待发数量','生产未完成数量','物料规格','生产订单号']
  const data = rows.map(r => [r.urgency, r.daysLeft ?? '', r.dueDate || '', r.customer, r.billNo, r.seq,
    r.materialCode, r.materialName, r.unit, r.qty, r.shippedQty, r.remainingQty, r.returnedQty, r.seller, r.follow1, r.follow2, r.issues.join('；'),
    r.productionGroup, r.productionStatus, r.instockedQty ?? '', r.readyQty ?? '', r.unfinishedQty ?? '', r.specification, r.productionOrderNos])
  const sheet = XLSX.utils.aoa_to_sheet([[title], [`数据时间：${new Date(fetchedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}；数量统一为销售单位；入库待发=关联合格入库扣已出货，不代表实时可用库存；退货/无关联/异常待核实；已关闭/终止订单不纳入\n颜色：绿色=已入库待发货，黄色=生产未完成，灰色=待核实；交期前三列另以红色标注逾期、黄色标注今天到期`], columns, ...data])
  sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: columns.length - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: columns.length - 1 } }]
  sheet['!cols'] = [14,10,16,30,20,8,22,38,10,15,15,15,15,14,14,14,48,18,18,20,18,20,38,36].map(wch => ({ wch }))
  sheet['!rows'] = [{ hpt: 32 }, { hpt: 48 }, { hpt: 26 }]
  sheet['!autofilter'] = { ref: `A3:X${Math.max(3, data.length + 3)}` }
  for (let r = 0; r < data.length + 3; r++) for (let c = 0; c < columns.length; c++) {
    const address = XLSX.utils.encode_cell({ r, c })
    const cell = sheet[address]
    if (!cell) continue
    const row = rows[r - 3]
    const productionColor = PRODUCTION_COLORS[row?.productionStatus || '待核实'] || PRODUCTION_COLORS['待核实']!
    const color = r < 3 ? (r === 1 ? 'F1F5F9' : '1E3A8A')
      : c < 3 && row!.urgency === '逾期' ? 'FEE2E2'
        : c < 3 && row!.urgency === '今天到期' ? 'FEF3C7' : productionColor
    cell.s = { font: { name: '微软雅黑', sz: r === 0 ? 16 : 10, bold: r === 0 || r === 2 || r >= 3 && (c === 17 || c === 18), color: { rgb: r === 0 || r === 2 ? 'FFFFFF' : '334155' } },
      fill: { fgColor: { rgb: color } }, alignment: { vertical: 'center', wrapText: true } }
    if (r >= 3 && (c >= 9 && c <= 12 || c >= 19 && c <= 21)) cell.z = '#,##0.######'
  }
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, '销售交期预警')
  const files = unzipSync(new Uint8Array(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' })))
  // SheetJS 不提供冻结窗格写入；仅补标准 OOXML sheetViews，保持生成器与数据类型不变。
  const views = '<sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A4" sqref="A4"/></sheetView></sheetViews>'
  const xml = strFromU8(files['xl/worksheets/sheet1.xml']!)
  files['xl/worksheets/sheet1.xml'] = strToU8(xml.replace(/<sheetViews[\s\S]*?<\/sheetViews>/, views))
  return zipSync(files, { level: 6 })
}
