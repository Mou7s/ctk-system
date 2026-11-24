export const IT_ASSET_DEVICE_TYPES = [
  { value: 'desktop', label: '台式机' },
  { value: 'laptop', label: '笔记本' },
  { value: 'all_in_one', label: '一体机' },
  { value: 'workstation', label: '工作站' },
  { value: 'monitor', label: '显示器' },
  { value: 'server', label: '服务器' },
  { value: 'other', label: '其他设备' },
]

export const IT_ASSET_STATUSES = [
  { value: 'in_use', label: '在用', color: 'success' },
  { value: 'idle', label: '闲置', color: 'info' },
  { value: 'repair', label: '维修中', color: 'warning' },
  { value: 'scrapped', label: '已报废', color: 'neutral' },
]

export const IT_ASSET_LABEL_SPEC = {
  widthMm: 70,
  heightMm: 50,
  defaultCompanyTitle: '示例企业有限公司',
  defaultBadgeText: 'IT资产',
  defaultTopReserveMm: 14,
}

export const IT_ASSET_QR_MODES = [
  { value: 'asset_no', label: '仅资产编号（推荐，扫码最快）' },
  { value: 'summary', label: '资产编号 + 名称 + 使用人' },
]

const DEVICE_TYPE_LABEL_MAP = new Map(IT_ASSET_DEVICE_TYPES.map((item) => [item.value, item.label]))
const STATUS_META_MAP = new Map(IT_ASSET_STATUSES.map((item) => [item.value, item]))

function cleanText(value) {
  return String(value ?? '').trim()
}

export function normalizeItAssetTopReserveMm(value, fallback = IT_ASSET_LABEL_SPEC.defaultTopReserveMm) {
  if (value === undefined || value === null || value === '') return fallback
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(22, Math.max(0, Number(num.toFixed(1))))
}

export function getItAssetDeviceTypeLabel(value) {
  const key = cleanText(value)
  return DEVICE_TYPE_LABEL_MAP.get(key) || (key || '其他设备')
}

export function getItAssetStatusMeta(value) {
  const key = cleanText(value)
  return STATUS_META_MAP.get(key) || { value: key || 'in_use', label: key || '未知', color: 'neutral' }
}

export function formatItAssetModelText(asset = {}) {
  const brand = cleanText(asset?.brand)
  const model = cleanText(asset?.model)
  if (!brand && !model) return ''
  if (!brand) return model
  if (!model) return brand
  if (model.toLowerCase().includes(brand.toLowerCase())) return model
  return `${brand} ${model}`
}

export function formatItAssetHardwareSummary(asset = {}) {
  return [cleanText(asset?.cpuSpec), cleanText(asset?.memorySpec), cleanText(asset?.diskSpec)]
    .filter(Boolean)
    .join(' / ')
}

export function buildItAssetQrPayload(asset = {}, mode = 'asset_no') {
  const assetNo = cleanText(asset?.assetNo || asset?.asset_no)
  if (mode !== 'summary') {
    return assetNo || 'IT-ASSET'
  }
  const assetName = cleanText(asset?.assetName || asset?.asset_name)
  const useDept = cleanText(asset?.useDept || asset?.use_dept)
  const userName = cleanText(asset?.userName || asset?.user_name)
  const lines = [
    assetNo ? `编号:${assetNo}` : '',
    assetName ? `名称:${assetName}` : '',
    useDept ? `部门:${useDept}` : '',
    userName ? `使用人:${userName}` : '',
  ].filter(Boolean)
  return lines.length > 0 ? lines.join('\n') : 'IT-ASSET'
}

export function formatItAssetLabelFields(asset = {}) {
  const assetNo = cleanText(asset?.assetNo || asset?.asset_no) || '—'
  const assetName = cleanText(asset?.assetName || asset?.asset_name) || '—'
  const deviceTypeLabel = getItAssetDeviceTypeLabel(asset?.deviceType || asset?.device_type)
  const modelText = formatItAssetModelText(asset) || '—'
  const useDept = cleanText(asset?.useDept || asset?.use_dept) || '—'
  const userName = cleanText(asset?.userName || asset?.user_name) || '—'
  const location = cleanText(asset?.location) || '—'
  const purchaseDate = cleanText(asset?.purchaseDate || asset?.purchase_date) || '—'
  const serialNo = cleanText(asset?.serialNo || asset?.serial_no)

  return {
    assetNo,
    assetName,
    deviceTypeLabel,
    modelText,
    useDept,
    userName,
    location,
    purchaseDate,
    serialNo,
  }
}

export function buildItAssetLabelRows(asset = {}) {
  const fields = formatItAssetLabelFields(asset)
  const rawModel = formatItAssetModelText(asset)
  const rawDept = cleanText(asset?.useDept || asset?.use_dept)
  const rawUser = cleanText(asset?.userName || asset?.user_name)
  const rawLocation = cleanText(asset?.location)
  const rawPurchaseDate = cleanText(asset?.purchaseDate || asset?.purchase_date)

  const rows = [
    { key: 'assetName', label: '名称', value: fields.assetName },
  ]
  if (rawModel) {
    rows.push({ key: 'model', label: '型号', value: rawModel, multiline: true })
  }
  if (rawDept) {
    rows.push({ key: 'useDept', label: '部门', value: rawDept })
  }
  if (rawUser) {
    rows.push({ key: 'userName', label: '使用人', value: rawUser })
  }
  if (rawLocation) {
    rows.push({ key: 'location', label: '位置', value: rawLocation })
  }
  if (rawPurchaseDate) {
    rows.push({ key: 'purchaseDate', label: '日期', value: rawPurchaseDate, mono: true })
  }
  return rows
}

export function escapeItAssetHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function buildItAssetPrintHtml(assets = [], options = {}) {
  const items = Array.isArray(assets) ? assets : []
  const companyTitle = cleanText(options.companyTitle) || IT_ASSET_LABEL_SPEC.defaultCompanyTitle
  const badgeText = cleanText(options.badgeText) || IT_ASSET_LABEL_SPEC.defaultBadgeText
  const qrSvgs = Array.isArray(options.qrSvgs) ? options.qrSvgs : []
  const title = cleanText(options.title) || 'IT资产标签 (70×50mm)'
  const topReserveMm = normalizeItAssetTopReserveMm(options.topReserveMm)
  const showHeader = topReserveMm === 0
  const paddingTopMm = showHeader ? 2.2 : topReserveMm

  const labelsHtml = items
    .map((asset, index) => {
      const fields = formatItAssetLabelFields(asset)
      const rows = buildItAssetLabelRows(asset)
      const qrSvg = cleanText(qrSvgs[index])
      const footerLeft = fields.serialNo
        ? `SN: ${fields.serialNo}`
        : `类别: ${fields.deviceTypeLabel}`

      const rowsHtml = rows
        .map((row) => {
          const valClasses = ['v']
          if (row.multiline) valClasses.push('is-multiline')
          if (row.mono) valClasses.push('is-mono')
          return `<div class="info-row"><span class="k">${escapeItAssetHtml(row.label)}</span><span class="${valClasses.join(' ')}">${escapeItAssetHtml(row.value)}</span></div>`
        })
        .join('')

      const headerHtml = showHeader
        ? `
        <header class="label-header">
          <span class="company-title">${escapeItAssetHtml(companyTitle)}</span>
          <span class="asset-badge">${escapeItAssetHtml(badgeText)}</span>
        </header>`
        : ''

      const inlineBadgeHtml = showHeader
        ? ''
        : `<span class="asset-badge">${escapeItAssetHtml(badgeText)}</span>`

      return `
      <article class="asset-label">${headerHtml}
        <div class="label-body">
          <section class="info-col">
            <div class="asset-no-row">
              <div class="asset-no">${escapeItAssetHtml(fields.assetNo)}</div>
              ${inlineBadgeHtml}
            </div>
            <div class="info-list${rows.length >= 5 ? ' is-compact' : ''}">
              ${rowsHtml}
            </div>
          </section>
          <section class="qr-col">
            <div class="qr-box">${qrSvg || '<div class="qr-empty">NO QR</div>'}</div>
            <div class="qr-code-text">${escapeItAssetHtml(fields.assetNo)}</div>
            <div class="qr-hint">扫码核对 · 请勿撕毁</div>
          </section>
        </div>
        <footer class="label-footer">
          <span class="footer-left">${escapeItAssetHtml(footerLeft)}</span>
          <span class="footer-right">公司财产 妥善保管</span>
        </footer>
      </article>`
    })
    .join('')

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeItAssetHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #000000;
      font-family: "Microsoft YaHei", "PingFang SC", Arial, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .asset-label {
      width: 70mm;
      height: 50mm;
      padding: ${paddingTopMm}mm 2.6mm 2mm 2.6mm;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
      background: #ffffff;
      color: #000000;
      page-break-after: always;
      break-after: page;
    }
    .label-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1.5mm;
      border-bottom: 0.45mm solid #000000;
      padding-bottom: 1mm;
      margin-bottom: 1mm;
      flex: none;
    }
    .company-title {
      font-size: 8.5pt;
      font-weight: 700;
      color: #000000;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }
    .asset-badge {
      font-size: 6.5pt;
      font-weight: 700;
      color: #000000;
      border: 0.3mm solid #000000;
      padding: 0.25mm 0.9mm;
      line-height: 1.1;
      white-space: nowrap;
      flex: none;
    }
    .label-body {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 21.5mm;
      gap: 1.8mm;
      flex: 1;
      min-height: 0;
      ${showHeader ? '' : 'border-top: 0.4mm solid #000000; padding-top: 1.2mm;'}
    }
    .info-col {
      min-width: 0;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .asset-no-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1.2mm;
      padding-bottom: 0.7mm;
      margin-bottom: 0.7mm;
      border-bottom: 0.25mm solid #000000;
      flex: none;
      min-width: 0;
    }
    .asset-no {
      font-family: Consolas, "Courier New", monospace;
      font-size: 10.5pt;
      font-weight: 800;
      color: #000000;
      line-height: 1.12;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
      flex: 1;
    }
    .info-list {
      display: flex;
      flex-direction: column;
      justify-content: space-evenly;
      padding: 0.4mm 0;
      flex: 1;
      min-height: 0;
    }
    .info-row {
      display: flex;
      align-items: flex-start;
      gap: 1mm;
      font-size: 7.8pt;
      line-height: 1.28;
      min-width: 0;
    }
    .info-list.is-compact .info-row {
      font-size: 7.2pt;
      line-height: 1.2;
    }
    .info-row .k {
      width: 9.8mm;
      flex: none;
      font-weight: 700;
      color: #000000;
    }
    .info-list.is-compact .info-row .k {
      width: 9.2mm;
    }
    .info-row .v {
      flex: 1;
      min-width: 0;
      font-weight: 400;
      color: #000000;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .info-row .v.is-multiline {
      white-space: normal;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      overflow: hidden;
      word-break: break-word;
    }
    .info-row .v.is-mono {
      font-family: Consolas, "Courier New", monospace;
    }
    .qr-col {
      min-width: 0;
      border-left: 0.25mm solid #000000;
      padding-left: 1.6mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
    }
    .qr-box {
      width: 18.5mm;
      height: 18.5mm;
      display: flex;
      align-items: center;
      justify-content: center;
      flex: none;
    }
    .qr-box svg {
      display: block;
      width: 100%;
      height: 100%;
    }
    .qr-empty {
      width: 100%;
      height: 100%;
      border: 0.25mm dashed #000000;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 6.5pt;
    }
    .qr-code-text {
      margin-top: 0.8mm;
      font-family: Consolas, "Courier New", monospace;
      font-size: 6.8pt;
      font-weight: 700;
      color: #000000;
      max-width: 100%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .qr-hint {
      margin-top: 0.4mm;
      font-size: 5.8pt;
      font-weight: 400;
      color: #000000;
      white-space: nowrap;
    }
    .label-footer {
      border-top: 0.2mm solid #000000;
      padding-top: 0.7mm;
      margin-top: 0.7mm;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1.5mm;
      font-size: 6.2pt;
      font-weight: 400;
      line-height: 1.1;
      flex: none;
    }
    .footer-left {
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .footer-right {
      flex: none;
      font-weight: 700;
      white-space: nowrap;
    }
    @page {
      size: 70mm 50mm;
      margin: 0;
    }
    @media print {
      .asset-label:last-child {
        page-break-after: auto;
        break-after: auto;
      }
    }
  </style>
</head>
<body>${labelsHtml}<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),180))<\/script></body>
</html>`
}
