import { checkQuotationPrices } from '@/api/tk_custom/quotation'

export async function fetchQuotationLowPrices({ businessType = 'FOREIGN', lines = [], id = 0, file = null, customerName = '' }) {
  let data = { lines, id, customerName }
  if (file) {
    data = new FormData()
    data.append('file', file)
    if (id) data.append('id', String(id))
  }
  const response = await checkQuotationPrices(data, businessType)
  if (response?.code !== 200) throw new Error(response?.msg || '历史报价比价失败，请重试')
  return Array.isArray(response.data) ? response.data : []
}

export function quotationLowPriceText(warning) {
  return `第${warning.lineNo}行 ${warning.ctkMpn}：本次 ¥${warning.currentPrice.toFixed(2)}/KPCS，历史 ¥${warning.previousPrice.toFixed(2)}/KPCS，降低 ${warning.decreasePercent}%；客户：${warning.customerName || '—'}，单号：${warning.quoteNo || '—'}`
}

export async function confirmQuotationLowPrices(input) {
  const warnings = await fetchQuotationLowPrices(input)
  return !warnings.length || window.confirm(`发现低于同一客户、同一业务员最近一次终审价格的报价：\n\n${warnings.slice(0, 10).map(quotationLowPriceText).join('\n')}${warnings.length > 10 ? `\n另有 ${warnings.length - 10} 行低价，请查看明细提醒。` : ''}\n\n已核对，仍继续提交吗？`)
}
