// 报价单「从 Excel 粘贴」解析（2026-09-16 新模板口径）。
// 与 app/packages/shared/quotationColumns.js、server/utils/quotation-parser.ts 保持同一套列语义：
// - 报价日期 / 交期是行级字段；新增国家、客户性质、友商型号、汇率、备注；
// - 取消产品描述列（粘贴时忽略）；
// - 美元价不手填：千只美元价 = 人民币单价 ÷ 汇率（粘贴解析时直接算出）。
const EMPTY_MAPPING = {
  sn: -1,
  quoteDate: -1,
  country: -1,
  customerStyle: -1,
  quoteTo: -1,
  endUser: -1,
  application: -1,
  manufacturer: -1,
  manufacturerMpn: -1,
  qty: -1,
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

// 历史模板（A..U 共 21 列）
const TEMPLATE_V2_WITH_SEQUENCE = {
  ...EMPTY_MAPPING,
  sn: 0,
  quoteDate: 1,
  country: 2,
  customerStyle: 3,
  quoteTo: 4,
  endUser: 5,
  application: 6,
  manufacturer: 7,
  manufacturerMpn: 8,
  qty: 9,
  ctkMpn: 10,
  package: 11,
  dieSize: 12,
  spq: 13,
  priceRmb: 14,
  rate: 15,
  priceUsd: 16,
  priceUsdPc: 17,
  leadTime: 18,
  datasheet: 19,
  remark: 20,
}

const TEMPLATE_V2_WITHOUT_SEQUENCE = {
  ...EMPTY_MAPPING,
  quoteDate: 0,
  country: 1,
  customerStyle: 2,
  quoteTo: 3,
  endUser: 4,
  application: 5,
  manufacturer: 6,
  manufacturerMpn: 7,
  qty: 8,
  ctkMpn: 9,
  package: 10,
  dieSize: 11,
  spq: 12,
  priceRmb: 13,
  rate: 14,
  priceUsd: 15,
  priceUsdPc: 16,
  leadTime: 17,
  datasheet: 18,
  remark: 19,
}

// 旧模板（15 列）仍可能有人粘贴：按老位置兜底，产品描述列与手填美元列按新口径忽略
const LEGACY_WITH_SEQUENCE = {
  ...EMPTY_MAPPING,
  sn: 0,
  quoteTo: 1,
  endUser: 2,
  application: 3,
  manufacturer: 4,
  qty: 6,
  ctkMpn: 8,
  package: 9,
  dieSize: 10,
  spq: 11,
  priceRmb: 12,
}

const LEGACY_WITHOUT_SEQUENCE = {
  ...EMPTY_MAPPING,
  quoteTo: 0,
  endUser: 1,
  application: 2,
  manufacturer: 3,
  qty: 5,
  ctkMpn: 7,
  package: 8,
  dieSize: 9,
  spq: 10,
  priceRmb: 11,
}

// 旧版当前 15 列模板（A..O）：保留历史无表头粘贴兼容。
const TEMPLATE_15COL_WITH_SEQUENCE = {
  ...EMPTY_MAPPING,
  sn: 0,
  application: 1,
  manufacturer: 2,
  manufacturerMpn: 3,
  qty: 4,
  ctkMpn: 5,
  package: 6,
  dieSize: 7,
  spq: 8,
  priceRmb: 9,
  priceUsd: 10,
  priceUsdPc: 11,
  leadTime: 12,
  datasheet: 13,
  remark: 14,
}

// 当前外贸模板（A..P）：序号 + 15 个明细字段，物料编码排在物料名称前。
const TEMPLATE_16COL_WITH_SEQUENCE = {
  ...EMPTY_MAPPING,
  sn: 0,
  materialCode: 1,
  ctkMpn: 2,
  package: 3,
  priceRmb: 4,
  application: 5,
  manufacturer: 6,
  manufacturerMpn: 7,
  qty: 8,
  dieSize: 9,
  spq: 10,
  priceUsd: 11,
  priceUsdPc: 12,
  leadTime: 13,
  datasheet: 14,
  remark: 15,
}

const TEMPLATE_15COL_WITHOUT_SEQUENCE_NEW = {
  ...TEMPLATE_16COL_WITH_SEQUENCE,
  sn: -1,
  materialCode: 0,
  ctkMpn: 1,
  package: 2,
  priceRmb: 3,
  application: 4,
  manufacturer: 5,
  manufacturerMpn: 6,
  qty: 7,
  dieSize: 8,
  spq: 9,
  priceUsd: 10,
  priceUsdPc: 11,
  leadTime: 12,
  datasheet: 13,
  remark: 14,
}

const TEMPLATE_15COL_WITHOUT_SEQUENCE = {
  ...EMPTY_MAPPING,
  application: 0,
  manufacturer: 1,
  manufacturerMpn: 2,
  qty: 3,
  ctkMpn: 4,
  package: 5,
  dieSize: 6,
  spq: 7,
  priceRmb: 8,
  priceUsd: 9,
  priceUsdPc: 10,
  leadTime: 11,
  datasheet: 12,
  remark: 13,
}

function normalizeValue(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function normalizeHeader(value) {
  return normalizeValue(value).replace(/\s+/g, '').toLowerCase()
}

function toNumber(value) {
  const raw = normalizeValue(value).replace(/,/g, '')
  if (!raw) return null
  const number = Number(raw)
  return Number.isFinite(number) ? number : null
}

// 单价统一保留两位小数（人民币、美元同口径），显示与入库一致
function roundPrice2(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return value
  return Math.round((number + Number.EPSILON) * 100) / 100
}

function cleanPrice(value) {
  const raw = normalizeValue(value)
  if (!raw || /^(?:waiting|\/|-|待定|null|undefined)$/i.test(raw)) return null
  const number = Number(raw.replace(/[￥¥$,]/g, '').trim())
  return Number.isFinite(number) ? roundPrice2(number) : null
}

/** 汇率：四位小数，必须为正数 */
function cleanRate(value) {
  const raw = normalizeValue(value).replace(/[￥¥$,\s]/g, '')
  if (!raw || /^(?:waiting|\/|-|待定|null|undefined)$/i.test(raw)) return null
  const number = Number(raw)
  if (!Number.isFinite(number) || number <= 0) return null
  return Math.round((number + Number.EPSILON) * 10000) / 10000
}

/** 千只美元价 = 人民币单价 ÷ 汇率（与服务端 computeUsdPriceKpcs 同口径） */
function usdKpcsFrom(rmb, rate) {
  if (rmb == null || rate == null || !Number.isFinite(rate) || rate <= 0) return null
  return roundPrice2(rmb / rate)
}

function cleanQuoteDate(value) {
  const raw = normalizeValue(value)
  if (!raw) return null
  // 用 shared 的同一份日期口径（quotationGrid.js）：粘贴里的 2026/9/18、2026.9.8、「2026-9」、
  // Excel 序列号都归一成 YYYY-MM-DD（服务端只认这个），认不出的写法原样保留。
  return normalizeQuotationDate(value) || raw
}

function isHeaderRow(row) {
  const values = row.map(normalizeHeader)
  const knownLabels = values.filter((value) => (
    value.includes('s/n')
    || value.includes('序号')
    || value.includes('序列')
    || value.includes('mpn')
    || value.includes('型号')
    || value.includes('料号')
    || value.includes('物料编码')
    || value.includes('物料名称')
    || value.includes('物料号')
    || value.includes('partno')
    || value.includes('p/n')
    || value.includes('sku')
    || value === 'quoteto'
    || value === '客户'
    || value === '客户名称'
    || value === '报价客户'
    || value === 'enduser'
    || value === '终端'
    || value === '终端客户'
    || value === '终端客户名称'
    || value.includes('description')
    || value.includes('描述')
    || value.includes('品名')
    || value.includes('产品名称')
    || value.includes('qty')
    || value.includes('数量')
    || value === '数'
    || value.includes('unit')
    || value.includes('单位')
    || value.includes('price')
    || value.includes('价格')
    || value.includes('单价')
    || value.includes('rmb')
    || value.includes('usd')
    || value.includes('汇率')
    || value.includes('rate')
    || value.includes('交期')
  ))
  return knownLabels.length >= 2 || (values.some((value) => value === 's/n' || value === '序号' || value === '序列') && knownLabels.length >= 1)
}

function positionalMapping(width, firstValue) {
  const hasSequence = toNumber(firstValue) != null
  if (width >= 21) return hasSequence ? { ...TEMPLATE_V2_WITH_SEQUENCE } : { ...TEMPLATE_V2_WITHOUT_SEQUENCE }
  if (width >= 20) return { ...TEMPLATE_V2_WITHOUT_SEQUENCE }
  // 无表头剪贴板按当前模板列序解释；旧版本带表头时仍由下方表头识别兼容。
  if (width === 16 && hasSequence) return { ...TEMPLATE_16COL_WITH_SEQUENCE }
  if (width === 15 && !hasSequence) return { ...TEMPLATE_15COL_WITHOUT_SEQUENCE_NEW }
  if (width === 15 && hasSequence) return { ...TEMPLATE_15COL_WITH_SEQUENCE }
  if (width === 14 && !hasSequence) return { ...TEMPLATE_15COL_WITHOUT_SEQUENCE }
  if (width >= 15 || (width >= 14 && hasSequence)) return { ...LEGACY_WITH_SEQUENCE }
  if (width >= 14) return { ...LEGACY_WITHOUT_SEQUENCE }
  return { ...EMPTY_MAPPING }
}

function detectColumnMapping(headers, width) {
  const mapping = positionalMapping(width, headers[0]?.[0])
  for (let column = 0; column < width; column += 1) {
    const label = headers.map((header) => normalizeHeader(header[column])).filter(Boolean).join('|')
    if (!label) continue
    if (label.includes('s/n') || label.includes('序号') || label.includes('序列')) mapping.sn = column
    else if (label.includes('报价日期') || label.includes('quotedate')) mapping.quoteDate = column
    else if (label.includes('国家') || label.includes('country')) mapping.country = column
    else if (label.includes('客户性质') || label.includes('style')) mapping.customerStyle = column
    else if (label.includes('enduser') || label.includes('终端')) mapping.endUser = column
    else if (label.includes('quoteto') || (label.includes('客户') && !label.includes('终端'))) mapping.quoteTo = column
    else if (label.includes('application') || label.includes('applicaiton') || label.includes('应用')) mapping.application = column
    else if (label.includes('友商型号') || (label.includes('mpn') && !label.includes('ctk'))) mapping.manufacturerMpn = column
    else if (label.includes('manufacturer') || label.includes('友商') || label.includes('原厂')) mapping.manufacturer = column
    else if (label.includes('desprition') || label.includes('description') || label.includes('描述') || label.includes('品名') || label.includes('产品名称') || label.includes('产品')) {
      // 新模板已删除产品描述列：忽略
    } else if (label.includes('qty') || label.includes('数量') || label === '数') mapping.qty = column
    else if (label.includes('物料编码') || label.includes('materialcode') || label.includes('itemcode') || label.includes('materialnumber')) mapping.materialCode = column
    else if (label.includes('物料名称') || label.includes('materialname') || label.includes('ctkmpn') || label.includes('ctk型号') || label.includes('型号') || label.includes('料号') || label.includes('物料号') || label.includes('partno') || label.includes('p/n') || label.includes('sku')) mapping.ctkMpn = column
    else if (label.includes('package') || label.includes('封装')) mapping.package = column
    else if (label.includes('diesize') || label.includes('芯片大小') || label.includes('芯片尺寸')) mapping.dieSize = column
    else if (label.includes('spq') || label.includes('reel') || label.includes('包装') || label.includes('(pcs)')) mapping.spq = column
    else if (label.includes('rmb') || label.includes('单价（元）') || label.includes('人民币')) mapping.priceRmb = column
    else if (label.includes('rate') || label.includes('汇率')) mapping.rate = column
    else if (label.includes('1只') || label.includes('usdpc')) mapping.priceUsdPc = column
    else if (label.includes('usd') || label.includes('单价（美元）') || label.includes('美元')) mapping.priceUsd = column
    else if (label.includes('交期') || label.includes('l/t') || label.includes('leadtime')) mapping.leadTime = column
    else if (label.includes('datasheet') || label.includes('规格书') || label.includes('资料')) mapping.datasheet = column
    else if (label.includes('remark') || label.includes('备注')) mapping.remark = column
  }
  return mapping
}

function looksLikeModel(value) {
  const text = normalizeValue(value)
  return Boolean(text && text.length <= 80 && !/\s/.test(text) && /[a-z]/i.test(text) && /\d/.test(text))
}

function inferCompactMapping(rows) {
  const width = Math.max(...rows.map((row) => row.length), 0)
  const mapping = positionalMapping(width, rows[0]?.[0])
  if (mapping.ctkMpn >= 0) return mapping

  const columns = Array.from({ length: width }, (_, index) => rows.map((row) => normalizeValue(row[index])).filter(Boolean))
  const numericColumns = columns
    .map((values, index) => ({ index, values, numbers: values.map(toNumber) }))
    .filter(({ values, numbers }) => values.length > 0 && numbers.filter((value) => value != null).length / values.length >= 0.6)
  const modelColumn = columns
    .map((values, index) => ({ index, score: values.filter(looksLikeModel).length }))
    .sort((left, right) => right.score - left.score)[0]
  const quantityColumn = numericColumns
    .sort((left, right) => {
      const leftInteger = left.numbers.filter((value) => value != null && Number.isInteger(value)).length
      const rightInteger = right.numbers.filter((value) => value != null && Number.isInteger(value)).length
      return rightInteger - leftInteger || left.index - right.index
    })[0]

  if (modelColumn?.score > 0) mapping.ctkMpn = modelColumn.index
  if (quantityColumn) mapping.qty = quantityColumn.index

  return mapping
}

function buildLine(row, mapping, index) {
  const rmb = mapping.priceRmb >= 0 ? cleanPrice(row[mapping.priceRmb]) : null
  const rate = mapping.rate >= 0 ? cleanRate(row[mapping.rate]) : null
  return {
    // 序号按行顺序 1..N：Excel 的 S/N 列可能重复/跳号，入库时序号是唯一键的一半（quotation_id + line_no）
    lineNo: index + 1,
    quoteDate: mapping.quoteDate >= 0 ? cleanQuoteDate(row[mapping.quoteDate]) : null,
    country: mapping.country >= 0 ? normalizeValue(row[mapping.country]) : '',
    customerStyle: mapping.customerStyle >= 0 ? normalizeValue(row[mapping.customerStyle]) : '',
    quoteTo: normalizeValue(row[mapping.quoteTo]),
    endUser: normalizeValue(row[mapping.endUser]),
    application: normalizeValue(row[mapping.application]),
    manufacturer: normalizeValue(row[mapping.manufacturer]),
    manufacturerMpn: mapping.manufacturerMpn >= 0 ? normalizeValue(row[mapping.manufacturerMpn]) : '',
    qty: toNumber(row[mapping.qty]),
    unit: 'kpcs',
    ctkMpn: normalizeValue(row[mapping.ctkMpn]),
    materialCode: mapping.materialCode >= 0 ? normalizeValue(row[mapping.materialCode]) : '',
    packageName: normalizeValue(row[mapping.package]),
    dieSize: normalizeValue(row[mapping.dieSize]),
    spqReel: normalizeValue(row[mapping.spq]),
    originalPriceRmb: rmb,
    rate,
    // 美元价自动算（不采信粘贴进来的美元列）
    originalPriceUsd: usdKpcsFrom(rmb, rate),
    leadTime: mapping.leadTime >= 0 ? normalizeValue(row[mapping.leadTime]) : '',
    datasheet: normalizeValue(row[mapping.datasheet]),
    remark: mapping.remark >= 0 ? normalizeValue(row[mapping.remark]) : '',
  }
}

export function parseQuotationPasteGrid(text) {
  const rows = String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((row) => row.split('\t').map(normalizeValue))
    .filter((row) => row.some((cell) => normalizeValue(cell) !== ''))
  if (!rows.length) throw new Error('请先把 Excel 单元格粘贴到输入区域')
  return rows
}

// 单价单元格粘贴：剥掉 ￥/¥/$ 与千分位后按两位小数归一。
// 保持原样只在解析不出数字时发生（如「待定」），避免把无效文本静默改成空。
function normalizePriceCell(value) {
  const raw = normalizeValue(value)
  if (!raw) return ''
  const number = Number(raw.replace(/[￥¥$,]/g, '').trim())
  return Number.isFinite(number) ? roundPrice2(number) : raw
}

import { normalizeQuotationOptionValue, quotationOptionRule } from './quotationOptions.js'
import { normalizeQuotationDate } from './quotationGrid.js'

export function applyQuotationPasteGrid(existingLines, rows, columns, startRow = 0, startColumn = 0, createLine = () => ({})) {
  const nextLines = (Array.isArray(existingLines) ? existingLines : []).map((line) => ({ ...line }))
  const endRow = startRow + rows.length
  while (nextLines.length < endRow) nextLines.push(createLine(nextLines.length))

  rows.forEach((row, rowOffset) => {
    const line = nextLines[startRow + rowOffset]
    const includesMaterialCode = row.some((_, columnOffset) => columns[startColumn + columnOffset]?.key === 'materialCode')
    row.forEach((value, columnOffset) => {
      const column = columns[startColumn + columnOffset]
      if (!column || column.readonly) return
      if (column.rate) line[column.key] = cleanRate(value)
      else if (column.price) line[column.key] = normalizePriceCell(value)
      else if (quotationOptionRule(column.key)) line[column.key] = String(normalizeQuotationOptionValue(column.key, normalizeValue(value)) ?? '')
      else {
        line[column.key] = normalizeValue(value)
        if (column.key === 'ctkMpn' && !includesMaterialCode) line.materialCode = ''
      }
    })
  })

  return nextLines
}

export function parseQuotationPaste(text) {
  const rows = parseQuotationPasteGrid(text)

  const headerRowIndex = rows.findIndex(isHeaderRow)
  const headerRows = headerRowIndex >= 0
    ? [rows[headerRowIndex], ...(isHeaderRow(rows[headerRowIndex + 1] || []) ? [rows[headerRowIndex + 1]] : [])]
    : []
  const width = Math.max(...rows.map((row) => row.length), 0)
  const mapping = headerRows.length ? detectColumnMapping(headerRows, width) : inferCompactMapping(rows)
  let dataStart = headerRowIndex >= 0 ? headerRowIndex + headerRows.length : 0

  while (dataStart < rows.length && isHeaderRow(rows[dataStart])) dataStart += 1

  const lines = rows
    .slice(dataStart)
    .map((row, index) => buildLine(row, mapping, index))
    .filter((line) => line.ctkMpn || line.materialCode || line.qty != null)

  if (!lines.length) throw new Error('未读取到有效的产品明细，请确认复制区域包含物料名称或数量')
  return lines
}
