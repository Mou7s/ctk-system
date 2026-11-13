// 报价明细「手机卡片」的展示模型（纯函数，唯一来源）。
// 手机端明细表从 24 列 RevoGrid 换成卡片：审核人在手机上要回答的问题其实只有一个
// —— 这几列价格对不对、有没有 0 价，所以卡片首屏只放决策字段，其余模板列收进「全部字段」。
// 这里不复制任何价格/汇率口径：美元两列继续走 quotationGrid.js 的换算，
// 保证卡片显示与网格、与落库值完全一致。
import {
  computeQuotationUsdKpcs,
  computeQuotationUsdPc,
  formatQuotationDate,
  formatQuotationLeadTime,
  formatQuotationPrice,
  formatQuotationUsdPc,
  roundQuotationRate,
} from './quotationGrid.js'

/**
 * 卡片首屏字段：顺序即显示顺序（单价 → 汇率 → 千只美元价 → 数量 → 交期）。
 * 只有 5 格 —— `1只单价(美元)` 是千只价 ÷1000 的派生值，首屏不参与核价判断，收进「全部字段」。
 * 标签写「(人民币/千只)」是因为模板列本来就是 Price/RMB KPCS：只写「单价(人民币)」会被读成单只价。
 * kind 决定取值与格式化方式，页面不另写格式化。
 */
// label = 完整口径（给 title/无障碍与 0 价文案），short = 卡片密排用的短标签（一行两列放得下）
export const QUOTATION_LINE_CARD_METRICS = [
  { key: 'originalPriceRmb', label: '单价(人民币/千只)', short: '单价/千只', kind: 'priceRmb' },
  { key: 'rate', label: '汇率', short: '汇率', kind: 'rate' },
  { key: 'usdKpcs', label: '千只单价(美元)', short: '千只$', kind: 'priceUsd' },
  { key: 'qty', label: '数量', short: '数量', kind: 'qty' },
  { key: 'leadTime', label: '交期', short: '交期', kind: 'text' },
]

/** 展开「全部字段」后补全的其余模板列（A..U 里方便手机阅读的部分） */
export const QUOTATION_LINE_CARD_DETAIL_FIELDS = [
  { key: 'quoteDate', label: '报价日期', mono: true, date: true },
  { key: 'usdPc', label: '1只单价(美元)', mono: false, priceUsdPc: true },
  { key: 'country', label: '国家' },
  { key: 'customerStyle', label: '客户性质' },
  { key: 'quoteTo', label: '客户' },
  { key: 'endUser', label: '终端客户' },
  { key: 'application', label: '应用' },
  { key: 'manufacturer', label: '友商' },
  { key: 'manufacturerMpn', label: '友商型号', mono: true },
  { key: 'materialCode', label: '物料编码', mono: true },
  { key: 'dieSize', label: '芯片大小', mono: true },
  { key: 'spqReel', label: 'SPQ / Reel', mono: true },
  { key: 'datasheet', label: '规格书', mono: true },
  { key: 'finalPriceRmb', label: '最终报价(人民币)', mono: false, priceRmb: true },
  { key: 'finalPriceUsd', label: '最终报价(美元)', mono: false, priceUsd: true },
  { key: 'remark', label: '备注' },
]

/**
 * 0 是合法数值，但报价单里最常见的含义是「还没核价」——与页面 isZeroPrice 同口径，
 * 空值/非数值不算 0 价，否则未核价的空列会被误报。
 */
export function isQuotationZeroPriceValue(value) {
  return value != null && String(value).trim() !== '' && Number(value) === 0
}

function textOrDash(value, empty = '-') {
  const text = value == null ? '' : String(value).trim()
  return text === '' ? empty : text
}

function metricValue(kind, line, usdKpcs) {
  switch (kind) {
    case 'priceRmb': {
      const price = line?.reviewPriceRmb ?? line?.originalPriceRmb
      const text = formatQuotationPrice(price)
      return { value: text === '' ? '待核价' : `￥${text}`, missing: text === '', zero: isQuotationZeroPriceValue(price) }
    }
    case 'rate': {
      if (line?.rate == null || String(line.rate).trim() === '') return { value: '未填', missing: true, zero: false }
      return { value: String(roundQuotationRate(line.rate)), missing: false, zero: isQuotationZeroPriceValue(line.rate) }
    }
    case 'priceUsd': {
      const text = formatQuotationPrice(usdKpcs)
      return { value: text === '' ? '待算' : `$${text}`, missing: text === '', zero: false }
    }
    case 'priceUsdPc': {
      const text = formatQuotationUsdPc(computeQuotationUsdPc(usdKpcs))
      return { value: text === '' ? '待算' : `$${text}`, missing: text === '', zero: false }
    }
    case 'qty': {
      if (line?.qty == null || String(line.qty).trim() === '') return { value: '未填', missing: true, zero: false }
      const amount = Number(line.qty)
      // 报价单数量动辄 80000 起：加千分位，否则手机上数不清几个零
      const text = Number.isFinite(amount) ? amount.toLocaleString('en-US') : String(line.qty)
      return { value: `${text} ${line.unit || ''}`.trim(), missing: false, zero: false }
    }
    case 'leadTime':
      // 交期是日期时显示成 Excel 的 dd-mmm-yy（和模板/打印件一致），文本交期（"30days"）原样
      return { value: textOrDash(formatQuotationLeadTime(line?.leadTime), '未填'), missing: false, zero: false }
    default:
      // 空值统一写「未填」（原来这里显示 '-'、汇率显示「未填」，两套写法让人以为是两种状态）
      return { value: textOrDash(line?.leadTime, '未填'), missing: false, zero: false }
  }
}

/**
 * 单行 → 卡片模型。
 * - zeroPriceLabels：本行哪些价格列是 0（审核人要拦的就是这些）
 * - metrics / detailFields 都已经是可直接渲染的文本，页面不做二次格式化
 */
export function buildQuotationLineCardModel(line) {
  const usdKpcs = computeQuotationUsdKpcs(line?.reviewPriceRmb ?? line?.originalPriceRmb, line?.rate)
  const metrics = QUOTATION_LINE_CARD_METRICS.map((metric) => {
    const resolved = metricValue(metric.kind, line, usdKpcs)
    return { key: metric.key, label: metric.label, short: metric.short || metric.label, ...resolved }
  })
  // 徽章要短：手机上一行放不下「单价(人民币/千只) 为 0」
  const zeroPriceLabels = metrics.filter((metric) => metric.zero)
    .map((metric) => (metric.key === 'originalPriceRmb' ? '单价' : metric.label))
  const detailFields = QUOTATION_LINE_CARD_DETAIL_FIELDS.map((field) => {
    let value
    if (field.priceRmb) value = formatQuotationPrice(line?.[field.key])
    else if (field.priceUsd) value = formatQuotationPrice(line?.[field.key])
    else if (field.priceUsdPc) {
      // 与首屏的美元列同格式：金额前带 $，算不出来时留空（下面统一转成「未填」）
      const text = formatQuotationUsdPc(computeQuotationUsdPc(usdKpcs))
      value = text === '' ? '' : `$${text}`
    }
    // 报价日期：与网格/库同一口径（YYYY-MM-DD），认不出来的写法原样显示
    else if (field.date) value = formatQuotationDate(line?.[field.key])
    else value = textOrDash(line?.[field.key], '未填')
    return { key: field.key, label: field.label, mono: Boolean(field.mono), value: value === '' ? '未填' : value }
  })

  return {
    key: line?.id != null ? `id:${line.id}` : `line:${line?.lineNo}`,
    lineNo: line?.lineNo ?? '',
    reviewPriceRmb: line?.reviewPriceRmb,
    title: textOrDash(line?.ctkMpn),
    packageName: textOrDash(line?.packageName),
    hasZeroPrice: zeroPriceLabels.length > 0,
    zeroPriceLabels,
    metrics,
    detailFields,
  }
}

export function buildQuotationLineCardModels(lines) {
  return (Array.isArray(lines) ? lines : []).map(buildQuotationLineCardModel)
}
