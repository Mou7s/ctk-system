function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function valueOrBlank(value) {
  const text = String(value ?? '').trim()
  return text === '-' ? '' : text
}

function formatQty(value) {
  const number = Number(value || 0)
  return Number.isFinite(number)
    ? number.toLocaleString('zh-CN', { maximumFractionDigits: 4 })
    : ''
}

function reportPage(order, item) {
  const incomingDate = valueOrBlank(order.approveDate) || valueOrBlank(order.deliveryDate)
  const purchaseOrderNo = Array.isArray(order.purchaseOrderNo)
    ? order.purchaseOrderNo.map(valueOrBlank).filter(Boolean).join('、')
    : Array.isArray(order.purchaseOrderNos)
      ? order.purchaseOrderNos.map(valueOrBlank).filter(Boolean).join('、')
      : valueOrBlank(order.purchaseOrderNo)
  const qty = formatQty(item.planQty)


  return `
    <article class="inspection-page">
      <header class="report-header">
        <h1>企业质量管理中心</h1>
        <h2>来料检验报告</h2>
      </header>

      <table class="report-table top-table">
        <colgroup>
          <col class="top-side"><col class="top-date"><col class="top-material">
          <col class="top-supplier-label"><col class="top-supplier"><col class="top-spec-label"><col class="top-spec">
        </colgroup>
        <tbody>
          <tr><th rowspan="3" class="vertical">收货信息</th><th>来料日期</th><td>${escapeHtml(incomingDate)}</td><th>产品名称</th><td>${escapeHtml(item.materialName)}</td><th>规格型号</th><td>${escapeHtml(item.specification)}</td></tr>
          <tr><th>物料编号</th><td>${escapeHtml(item.materialNumber)}</td><th>供应商</th><td>${escapeHtml(order.supplierName)}</td><th>产品批号</th><td></td></tr>
          <tr><th>订单号</th><td>${escapeHtml(purchaseOrderNo)}</td><th>来料数量</th><td>${qty}</td><th>收货人</th><td></td></tr>
          <tr><th rowspan="4">AQL</th><th>MIL-STD-105E（Ⅱ）</th><td colspan="2">C=0</td><td>MAJ:0.4</td><td colspan="2">MIN:0.65</td></tr>
          <tr><th>AC/RE</th><td colspan="3"></td><td colspan="2"></td></tr>
          <tr><th>检查日期</th><td></td><th>IQC</th><td></td><th>总数量</th><td>${qty}</td></tr>
          <tr><th>检查数</th><td></td><th>不合格数</th><td></td><th>不良率</th><td></td></tr>
          <tr><th colspan="7" class="section-title inspection-title">检验项目</th></tr>
          <tr><th colspan="7" class="section-title">1.外观检查</th></tr>
          <tr><th></th><th colspan="2" class="text-left">检查项目</th><th colspan="2" class="text-left">检查方式</th><th class="text-left">不良数</th><th class="text-left">判定结果：OK或NG</th></tr>
          <tr><th rowspan="4">外观检查</th><td colspan="2" class="left">1.产品外观有无脏污、变形、断裂；</td><td colspan="2" class="text-left">目视</td><td class="text-left"></td><td class="text-left"></td></tr>
          <tr><td colspan="2" class="left">2.产品外观无氧化、色斑、色差</td><td colspan="2" class="text-left">目视</td><td class="text-left"></td><td class="text-left"></td></tr>
          <tr><td colspan="2" class="left">3.产品标签丝印清晰，名称、型号规格无异常</td><td colspan="2" class="text-left">目视</td><td class="text-left"></td><td class="text-left"></td></tr>
          <tr><td colspan="2" class="left">4.产品来料规格型号、数量与订单一致</td><td colspan="2" class="text-left">目视</td><td class="text-left"></td><td class="text-left"></td></tr>
          <tr><th colspan="7" class="section-title">2.尺寸检查（产品图纸尺寸）</th></tr>
        </tbody>
      </table>

      <table class="dimension-table">
        <thead>
          <tr><th rowspan="2" class="dimension-index"><svg class="dimension-index-diagonal" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="0" x2="100" y2="50"></line><line x1="0" y1="0" x2="50" y2="100"></line></svg><span class="dimension-index-project">项目</span><span class="dimension-index-sequence">序号</span><span class="dimension-index-standard">标准</span></th><th></th><th></th><th></th><th></th><th></th><th></th><th></th><th></th></tr>
          <tr><th></th><th></th><th></th><th></th><th></th><th></th><th></th><th></th></tr>
        </thead>
        <tbody>
          ${Array.from({ length: 6 }, () => '<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>').join('')}
          <tr><th>判定OK或NG</th><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        </tbody>
      </table>

      <table class="report-table lower-table">
        <colgroup>
          <col class="lower-side"><col class="lower-disposition"><col class="lower-qty"><col class="lower-note">
        </colgroup>
        <tbody>
          <tr><th colspan="4" class="section-title">3.电性能或其它参数：</th></tr>
          <tr><th colspan="4" class="section-title">4.环保　　HSF：　　　　　　HS：</th></tr>
          <tr><th colspan="4" class="final-result">最终判定：　结果　　□合格　　　　□不合格　　　　□送供应商　　　　□特采</th></tr>
          <tr><th colspan="4">Approval批核/品质部　　　　Approval批核/仓库　　　　Approval批核/采购部</th></tr>
          <tr><th rowspan="6" class="vertical">审核</th><th class="disposition-cell">处理方式</th><th class="disposition-cell">Qty.数量</th><th class="disposition-cell">Disposition note 处理注意事项</th></tr>
          <tr><td class="disposition-cell">Rework   返工</td><td class="disposition-cell"></td><td class="disposition-cell"></td></tr>
          <tr><td class="disposition-cell">Sort     特采</td><td class="disposition-cell"></td><td class="disposition-cell"></td></tr>
          <tr><td class="disposition-cell">RTV    退回供应商</td><td class="disposition-cell"></td><td class="disposition-cell"></td></tr>
          <tr><td class="disposition-cell">Scrap    报废</td><td class="disposition-cell"></td><td class="disposition-cell"></td></tr>
          <tr><th colspan="3" class="lower-remark">备注：</th></tr>
        </tbody>
      </table>

      <table class="approval-table">
        <colgroup>
          <col class="approval-side">
          <col class="approval-stat-1"><col class="approval-stat-2"><col class="approval-stat-3"><col class="approval-stat-4"><col class="approval-stat-5">
          <col class="approval-sign-1"><col class="approval-sign-2"><col class="approval-sign-3">
        </colgroup>
        <tbody>
          <tr><th colspan="6">Approval核批/品质部</th><th colspan="3">Approval 核 批</th></tr>
          <tr><th rowspan="3">入仓</th><th>总数</th><th>合格数</th><th>合格率</th><th>退货数</th><th>退货率</th><th>品 质</th><th>采 购</th><th>仓库</th></tr>
          <tr><td>${qty}</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
          <tr><th colspan="8" class="approval-remark">备注：</th></tr>
        </tbody>
      </table>

      <footer><span>（本报表一式3页：白色-品质　蓝色-采购　红色-财务）</span><span>表单编号/版次：QR-QA-096/A1</span></footer>
    </article>`
}

export function buildIncomingInspectionReportDocument(order, selectedItems = order?.items || []) {
  const items = Array.isArray(selectedItems) ? selectedItems : []
  if (!order || items.length === 0) {
    throw new Error('没有可打印的采购入库明细')
  }

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>来料检验报告-${escapeHtml(order.billNo)}</title>
<style>
  @page{size:A4 portrait;margin:5mm 6.8mm 5mm 5mm}
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:#fff;color:#000;font-family:"SimSun","宋体",serif}
  .inspection-page{width:195.6mm;min-height:287mm;margin:0 auto;break-after:page;page-break-after:always}
  .inspection-page:last-child{break-after:auto;page-break-after:auto}
  .report-header{position:relative;text-align:center;height:22mm}
  .report-logo{position:absolute;left:2mm;top:1mm;width:25mm;height:auto}
  h1,h2{margin:0;font-weight:700;line-height:1.25} h1{font-size:18pt} h2{font-size:16pt}
  table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:9pt}
  th,td{border:0.35mm solid #000;height:7mm;padding:0.7mm 1mm;text-align:center;vertical-align:middle;font-weight:400;line-height:1.15}
  .top-table col.top-side{width:4.22%}.top-table col.top-date{width:21.098%}.top-table col.top-material{width:16.743%}.top-table col.top-supplier-label{width:16.265%}.top-table col.top-supplier{width:13.948%}.top-table col.top-spec-label{width:14.715%}.top-table col.top-spec{width:13.011%}
  .lower-table col.lower-side{width:4.22%}.lower-table col.lower-disposition{width:38.689%}.lower-table col.lower-qty{width:15.418%}.lower-table col.lower-note{width:41.673%}
  .vertical{writing-mode:vertical-rl;letter-spacing:1mm}
  .section-title{height:6.5mm;font-size:10pt;text-align:left;padding-right:9.9mm}.inspection-title{padding-left:3mm}.text-left{text-align:left}.left{text-align:left;padding-left:3mm}
  .dimension-table{font-size:8.5pt}.dimension-table th,.dimension-table td{height:6.2mm}.dimension-table .dimension-index{position:relative;width:auto;height:12.4mm;padding:0;overflow:hidden}.dimension-index-diagonal{position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none}.dimension-index-diagonal line{stroke:#000;stroke-width:1.2;vector-effect:non-scaling-stroke}.dimension-index-project,.dimension-index-sequence,.dimension-index-standard{position:absolute;z-index:1;line-height:1}.dimension-index-project{top:1.5mm;right:2.5mm}.dimension-index-sequence{left:2.5mm;bottom:1.5mm}.dimension-index-standard{right:2.5mm;bottom:1.5mm}
  .lower-table th,.lower-table td{height:6.3mm}.final-result{text-align:justify;padding-left:0;padding-right:9.9mm}.disposition-cell{text-align:left}.lower-remark{text-align:left;padding-left:3mm}
  .approval-table{font-size:9pt}.approval-table th,.approval-table td{height:6.3mm}.approval-side{width:6.167%}.approval-stat-1{width:11.036%}.approval-stat-2{width:11.225%}.approval-stat-3{width:14.48%}.approval-stat-4{width:15.274%}.approval-stat-5{width:9.332%}.approval-sign-1{width:9.738%}.approval-sign-2{width:9.738%}.approval-sign-3{width:13.011%}.approval-remark{text-align:left;padding-left:3mm}
  footer{display:flex;justify-content:space-between;padding:2mm 1mm 0;font-size:8pt}
  @media screen{body{background:#e5e7eb;padding:10mm}.inspection-page{background:#fff;box-shadow:0 2mm 8mm #0002;padding:0}}
  @media print{body{background:#fff}.inspection-page{margin:0}}
</style></head><body>${items.map(item => reportPage(order, item)).join('')}</body></html>`
}
