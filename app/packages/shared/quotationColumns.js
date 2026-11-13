// 报价单 Excel 表头 → 字段列的映射规则（2026-09-17 标准报价单模板，A..U 共 21 列）。
// 单位列已取消：数量一律按 kpcs 计（DEFAULT_QUOTATION_UNIT），上传件里的单位列会被忽略。
// 必须与 server/utils/quotation-parser.ts 的 detectColumnMapping 保持一致：
// 上传预览用本模块，入库用服务端解析器，两边分叉会出现「预览的客户 ≠ 入库的客户」。
// app/__tests__/quotation-columns.spec.js 会逐字段对比两者。
//
// 判定顺序即优先级，三个必须靠前的：
// - 「客户性质」先于「客户」，否则会被 quoteTo 抢走；
// - 「友商型号 / MPN」先于「友商 / Manufacturer」，且 MPN 规则排除 CTK MPN；
// - 「1只单价（美元）」先于「千只单价（美元）」，否则两列都落进 priceUsd。
// 上传入口另行校验当前模板的完整表头；此映射只按明确识别到的列填值。
const DEFAULT_MAPPING = {
  sn: 0,
  quoteDate: -1,
  country: -1,
  customerStyle: -1,
  quoteTo: -1,
  endUser: -1,
  application: -1,
  manufacturer: -1,
  manufacturerMpn: -1,
  qty: -1,
  unit: -1,
  ctkMpn: -1,
  materialCode: -1,
  package: -1,
  dieSize: -1,
  spq: -1,
  priceRmb: -1,
  rate: -1,
  priceUsd: -1,
  priceUsdPc: -1,
  leadTime: -1,
  datasheet: -1,
  remark: -1,
}

const CURRENT_QUOTATION_TEMPLATE_HEADERS = [
  'S/N\n序号',
  'Material Code\n物料编码',
  'Material Name\n物料名称',
  'Package\n封装',
  'Price/RMB (KPCS)\n单价（元）',
  'Application\n应用',
  'Manufacturer\n友商',
  'MPN\n友商型号',
  'Qty\n数量',
  'Die Size\n芯片大小',
  'SPQ/Reel\n(pcs)',
  'Price/USD KPCS\n千只单价（美元）',
  'Price/USD PC\n1只单价（美元）',
  'L/T\n交期',
  'Datasheet\n规格书',
  'Remark\n备注',
]

const DEFAULT_MIN_COLUMNS = CURRENT_QUOTATION_TEMPLATE_HEADERS.length

function normalizeHeader(value) {
  return String(value ?? '').replace(/\s+/gu, '').toLowerCase()
}

export function isCurrentQuotationTemplateHeader(header) {
  return Array.isArray(header)
    && header.length === CURRENT_QUOTATION_TEMPLATE_HEADERS.length
    && CURRENT_QUOTATION_TEMPLATE_HEADERS.every((expected, index) => normalizeHeader(header[index]) === normalizeHeader(expected))
}

/**
 * headerRows: 当前模板的单行中英双语表头，逐列按标签名识别。
 * 返回的 dieSize 为 -1 表示该表没有「芯片大小」列，取值处需按 -1 兜底成空串。
 */
export function detectQuotationColumnMapping(headerRows, { minColumns = DEFAULT_MIN_COLUMNS } = {}) {
  const mapping = { ...DEFAULT_MAPPING }
  const headers = (Array.isArray(headerRows) ? headerRows : []).filter((row) => Array.isArray(row))
  const maxColumns = Math.max(...headers.map((row) => row.length), minColumns)

  for (let column = 0; column < maxColumns; column += 1) {
    const label = headers.map((row) => normalizeHeader(row[column])).filter(Boolean).join('|')
    if (!label) continue
    if (label.includes('s/n') || label.includes('序号') || label.includes('序列')) mapping.sn = column
    else if (label.includes('报价日期') || label.includes('quotedate')) mapping.quoteDate = column
    else if (label.includes('国家') || label.includes('country')) mapping.country = column
    else if (label.includes('客户性质') || label.includes('style')) mapping.customerStyle = column
    // 终端客户必须先判，且「客户」判定要排除「终端客户」，否则终端客户列会被抢成 quoteTo
    else if (label.includes('enduser') || label.includes('终端')) mapping.endUser = column
    else if (label.includes('quoteto') || (label.includes('客户') && !label.includes('终端'))) mapping.quoteTo = column
    else if (label.includes('applicaiton') || label.includes('application') || label.includes('应用')) mapping.application = column
    // 友商型号先于友商，且不能把 CTK MPN 抢走
    else if (label.includes('友商型号') || (label.includes('mpn') && !label.includes('ctk'))) mapping.manufacturerMpn = column
    else if (label.includes('manufacturer') || label.includes('友商') || label.includes('原厂')) mapping.manufacturer = column
    else if (label.includes('qty') || label.includes('数量')) mapping.qty = column
    else if (label.includes('物料编码') || label.includes('materialcode') || label.includes('itemcode') || label.includes('materialnumber')) mapping.materialCode = column
    else if (label.includes('物料名称') || label.includes('materialname') || label.includes('ctkmpn') || label.includes('ctk型号') || label.includes('型号')) mapping.ctkMpn = column
    else if (label.includes('package') || label.includes('封装')) mapping.package = column
    // 芯片大小必须在 spq 之前判断
    else if (label.includes('diesize') || label.includes('芯片大小') || label.includes('芯片尺寸')) mapping.dieSize = column
    else if (label.includes('spq') || label.includes('reel') || label.includes('包装') || label.includes('(pcs)')) mapping.spq = column
    else if (label.includes('rmb') || label.includes('单价（元）') || label.includes('人民币')) mapping.priceRmb = column
    else if (label.includes('rate') || label.includes('汇率')) mapping.rate = column
    // 1 只单价（美元）必须在千只单价之前判定
    else if (label.includes('1只') || label.includes('usdpc')) mapping.priceUsdPc = column
    else if (label.includes('usd') || label.includes('美元')) mapping.priceUsd = column
    else if (label.includes('l/t') || label.includes('交期') || label.includes('leadtime')) mapping.leadTime = column
    else if (label.includes('datasheet') || label.includes('规格书') || label.includes('资料')) mapping.datasheet = column
    else if (label.includes('remark') || label.includes('备注')) mapping.remark = column
  }

  return mapping
}

/**
 * 明细落库字段的展示顺序（新模板 A..U 去掉序号、派生列与忽略列后的顺序）：
 * 报价日期 → 国家 → 客户性质 → 客户 → 终端客户 → 应用 → 友商 → 友商型号 → 数量 → 单位 →
 * 物料编码 → 物料名称 → 封装 → 芯片大小 → SPQ/Reel → 人民币单价 → 汇率 → 交期 → 规格书 → 备注。
 * 页面表格、粘贴映射与网格列都按这个顺序，避免再次错位。
 */
export const QUOTATION_LINE_FIELD_ORDER = [
  'quoteDate',
  'country',
  'customerStyle',
  'quoteTo',
  'endUser',
  'application',
  'manufacturer',
  'manufacturerMpn',
  'qty',
  'materialCode',
  'ctkMpn',
  'packageName',
  'dieSize',
  'spqReel',
  'originalPriceRmb',
  'rate',
  'leadTime',
  'datasheet',
  'remark',
]
