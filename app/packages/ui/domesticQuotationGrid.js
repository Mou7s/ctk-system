
// Only explicit packaging segments are authoritative; purchase minimums are not reel quantities.
export function domesticPackCountFromSpec(specification) {
  const segments = String(specification || '').normalize('NFKC').split(/[\/／]/)
  const counts = segments.flatMap(segment => {
    const match = segment.trim().match(/^(\d+(?:\.\d+)?)\s*(K|KPCS|PCS|只|个|粒)\s*(?:每)?(?:盘|卷|袋|盒|包)$/iu)
    if (!match) return []
    const value = /^(K|KPCS)$/iu.test(match[2]) ? Number(match[1]) * 1000 : Number(match[1])
    return Number.isFinite(value) && value > 0 ? [value] : []
  })
  return counts.length && new Set(counts).size === 1 ? String(counts[0]) : ''
}


export const DOMESTIC_QUOTATION_INITIAL_LINES = 5

// 内贸在线录入、详情与审核共用列序（不含最左侧序号列）；新版 Excel 同步相同列序，旧模板走兼容映射。
export const DOMESTIC_QUOTATION_COLUMNS = Object.freeze([
  { key: 'customerMaterialName', label: '客户物料名称', minWidth: '220px' },
  { key: 'ctkMpn', label: 'CTK物料名称', minWidth: '220px', required: true },
  { key: 'packageName', label: '封装', minWidth: '140px' },
  { key: 'originalPriceRmb', label: '含税单价（元/PCS）', minWidth: '170px', type: 'price', required: true },
  { key: 'minPackCount', label: '最小包装数（PCS）', minWidth: '160px', type: 'number' },
  { key: 'remark', label: '备注', minWidth: '240px' },
])

export function blankDomesticQuotationLine(lineNo = 1) {
  return {
    lineNo,
    application: '',
    customerMaterialName: '',
    minPackCount: '',
    ctkMpn: '',
    packageName: '',
    unit: 'PCS',
    originalPriceRmb: '',
    remark: '',
  }
}

export function hasDomesticQuotationLineData(line = {}) {
  return DOMESTIC_QUOTATION_COLUMNS.some(({ key }) => key !== 'unit' && String(line?.[key] ?? '').trim() !== '')
}

export function formatDomesticMaterialValue(value) {
  if (value == null) return ''
  if (typeof value === 'object') {
    return String(value.ctkMpn || value.value || value.name || value.number || '').trim()
  }
  return String(value).trim()
}

export function mapDomesticMaterialOption(material = {}) {
  const ctkMpn = String(material.ctkMpn || material.name || material.number || material.value || '').trim()
  if (!ctkMpn) return null
  const number = String(material.number || '').trim()
  const packageName = String(material.packageName || '').trim()
  const numberSuffix = number && number !== ctkMpn ? ` (${number})` : ''
  const packageSuffix = packageName ? ` · ${packageName}` : ''

  return {
    ...material,
    label: `${ctkMpn}${numberSuffix}${packageSuffix}`,
    value: ctkMpn,
    ctkMpn,
    packageName,
    number,
    name: String(material.name || '').trim(),
    spec: String(material.spec || '').trim(),
    minPackCount: domesticPackCountFromSpec(material.spec),
    minPackUnit: 'PCS',
  }
}

export function resolveDomesticMaterialSelection(value, options = []) {
  const ctkMpn = formatDomesticMaterialValue(value)
  const selected = value && typeof value === 'object'
    ? mapDomesticMaterialOption(value)
    : options.find((option) => String(option?.value || option?.ctkMpn || '').toUpperCase() === ctkMpn.toUpperCase())

  return {
    ctkMpn,
    packageName: String(selected?.packageName || '').trim(),
    minPackCount: selected?.minPackCount || '',
  }
}

export function normalizeDomesticCustomerKey(customerName) {
  return String(customerName ?? '').trim() || '未填写'
}

function quotationSortTimestamp(row) {
  const timeText = String(row?.updateTime || row?.createTime || '').trim()
  const parsed = timeText ? Date.parse(timeText.replace(' ', 'T')) : NaN
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * 将内贸报价单列表按客户名称聚合收录：
 * - 同一客户（首尾去空格，空值归入「未填写」）自动归拢为一组；
 * - 组内报价单按最近更新时间降序、ID 降序排列；
 * - 客户分组之间按各客户最新报价单的更新时间降序排列；
 * - 汇总该客户总报价单数、总明细行数、业务员列表、最新单据及待审统计。
 */
export function groupDomesticQuotationsByCustomer(rows = []) {
  const sortedRows = (Array.isArray(rows) ? rows : [])
    .filter((row) => row && typeof row === 'object')
    .slice()
    .sort((a, b) => {
      const timeDiff = quotationSortTimestamp(b) - quotationSortTimestamp(a)
      if (timeDiff !== 0) return timeDiff
      return Number(b.id || 0) - Number(a.id || 0)
    })

  const groups = new Map()
  for (const row of sortedRows) {
    const customerName = normalizeDomesticCustomerKey(row.customerName)
    let group = groups.get(customerName)
    if (!group) {
      group = {
        customerKey: customerName,
        customerName,
        quotations: [],
        quoteCount: 0,
        totalLineCount: 0,
        salespersonNames: [],
        latestQuotation: row,
        latestQuoteNo: row.quoteNo || '',
        latestStatus: row.status || '',
        latestStatusLabel: row.statusLabel || '',
        latestUpdateTime: row.updateTime || row.createTime || '',
        pendingCount: 0,
        reviewableCount: 0,
        approvedCount: 0,
      }
      groups.set(customerName, group)
    }
    group.quotations.push(row)
    group.quoteCount += 1
    group.totalLineCount += Number(row.lineCount || 0)
    const salesperson = String(row.salespersonName || '').trim()
    if (salesperson && !group.salespersonNames.includes(salesperson)) {
      group.salespersonNames.push(salesperson)
    }
    if (String(row.status || '').startsWith('PENDING_')) {
      group.pendingCount += 1
    }
    if (row.canInitialReview || row.canSecondReview || row.canFinalReview) {
      group.reviewableCount += 1
    }
    if (row.status === 'APPROVED') {
      group.approvedCount += 1
    }
  }
  return Array.from(groups.values())
}
