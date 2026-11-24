import { describe, expect, it } from 'vitest'
import {
  IT_ASSET_LABEL_SPEC,
  buildItAssetLabelRows,
  buildItAssetPrintHtml,
  buildItAssetQrPayload,
  formatItAssetHardwareSummary,
  formatItAssetLabelFields,
  formatItAssetModelText,
  normalizeItAssetTopReserveMm,
} from '../packages/shared/index.js'

describe('IT asset shared helpers and 70x50mm label builder', () => {
  it('builds QR payload in asset_no and summary modes', () => {
    const asset = {
      assetNo: 'TK-PC-0012',
      assetName: '办公台式机',
      useDept: '工程部',
      userName: '张三',
    }
    expect(buildItAssetQrPayload(asset, 'asset_no')).toBe('TK-PC-0012')
    expect(buildItAssetQrPayload(asset, 'summary')).toBe(
      '编号:TK-PC-0012\n名称:办公台式机\n部门:工程部\n使用人:张三',
    )
    expect(buildItAssetQrPayload({}, 'asset_no')).toBe('IT-ASSET')
  })

  it('formats brand + model without duplicating brand prefix and summarizes hardware', () => {
    expect(formatItAssetModelText({ brand: '联想', model: 'ThinkCentre M740t' })).toBe('联想 ThinkCentre M740t')
    expect(formatItAssetModelText({ brand: 'ThinkPad', model: 'ThinkPad X1 Carbon' })).toBe('ThinkPad X1 Carbon')
    expect(formatItAssetModelText({ brand: '戴尔', model: '' })).toBe('戴尔')
    expect(formatItAssetHardwareSummary({ cpuSpec: 'i5-13400', memorySpec: '16GB', diskSpec: '512GB SSD' })).toBe(
      'i5-13400 / 16GB / 512GB SSD',
    )
  })

  it('normalizes label display fields with safe fallbacks and clamps top reserve mm', () => {
    const fields = formatItAssetLabelFields({
      asset_no: 'TK-PC-0001',
      asset_name: '笔记本电脑',
      device_type: 'laptop',
      brand: '华为',
      model: 'MateBook 14',
      use_dept: '研发中心',
      user_name: '李四',
      location: '',
      purchase_date: '2026-08-15',
      serial_no: 'SN123456',
    })
    expect(fields).toEqual({
      assetNo: 'TK-PC-0001',
      assetName: '笔记本电脑',
      deviceTypeLabel: '笔记本',
      modelText: '华为 MateBook 14',
      useDept: '研发中心',
      userName: '李四',
      location: '—',
      purchaseDate: '2026-08-15',
      serialNo: 'SN123456',
    })

    expect(IT_ASSET_LABEL_SPEC.defaultTopReserveMm).toBe(14)
    expect(IT_ASSET_LABEL_SPEC.defaultBadgeText).toBe('IT资产')
    expect(normalizeItAssetTopReserveMm(undefined)).toBe(14)
    expect(normalizeItAssetTopReserveMm(0)).toBe(0)
    expect(normalizeItAssetTopReserveMm(-3)).toBe(0)
    expect(normalizeItAssetTopReserveMm(30)).toBe(22)
    expect(normalizeItAssetTopReserveMm(13.5)).toBe(13.5)
    expect(normalizeItAssetTopReserveMm('invalid')).toBe(14)
  })

  it('omits empty optional rows such as location and purchaseDate while preserving non-empty rows', () => {
    const compactRows = buildItAssetLabelRows({
      assetNo: 'TK-PC-0072',
      assetName: '办公笔记本',
      brand: '小米',
      model: 'Redmi Book 16 2024',
      useDept: '总经办',
      userName: '刘楚歌',
      location: '',
      purchaseDate: '',
    })
    expect(compactRows).toEqual([
      { key: 'assetName', label: '名称', value: '办公笔记本' },
      { key: 'model', label: '型号', value: '小米 Redmi Book 16 2024', multiline: true },
      { key: 'useDept', label: '部门', value: '总经办' },
      { key: 'userName', label: '使用人', value: '刘楚歌' },
    ])

    const fullRows = buildItAssetLabelRows({
      assetName: '研发工作站',
      brand: '戴尔',
      model: 'Precision 3660',
      useDept: '研发部',
      userName: '王工',
      location: 'A栋3楼',
      purchaseDate: '2026-03-15',
    })
    expect(fullRows).toEqual([
      { key: 'assetName', label: '名称', value: '研发工作站' },
      { key: 'model', label: '型号', value: '戴尔 Precision 3660', multiline: true },
      { key: 'useDept', label: '部门', value: '研发部' },
      { key: 'userName', label: '使用人', value: '王工' },
      { key: 'location', label: '位置', value: 'A栋3楼' },
      { key: 'purchaseDate', label: '日期', value: '2026-03-15', mono: true },
    ])
  })

  it('renders pre-printed 70x50mm print HTML with 14mm top reserve, enlarged fonts, hidden empty location/date and XSS escaping', () => {
    const html = buildItAssetPrintHtml(
      [
        {
          assetNo: 'TK-PC-0001',
          assetName: '工程机<script>alert(1)</script>',
          deviceType: 'desktop',
          brand: '联想',
          model: 'M740t',
          useDept: '工程部',
          userName: '王五',
          location: '',
          purchaseDate: '',
          serialNo: 'SN001',
        },
        {
          assetNo: 'TK-PC-0002',
          assetName: '财务笔记本',
          deviceType: 'laptop',
          brand: '戴尔',
          model: 'Latitude 5440',
          useDept: '财务部',
          userName: '赵六',
          location: 'A栋2楼',
          purchaseDate: '2026-05-20',
        },
      ],
      {
        badgeText: 'IT资产<img src=x>',
        qrSvgs: ['<svg viewBox="0 0 180 180"><rect width="10" height="10"/></svg>', '<svg viewBox="0 0 180 180"></svg>'],
      },
    )

    expect(IT_ASSET_LABEL_SPEC.widthMm).toBe(70)
    expect(IT_ASSET_LABEL_SPEC.heightMm).toBe(50)
    expect(html).toContain('size: 70mm 50mm;')
    expect(html).toContain('margin: 0;')
    expect(html).toContain('width: 70mm;')
    expect(html).toContain('height: 50mm;')
    expect(html).toContain('padding: 14mm 2.6mm 2mm 2.6mm;')
    expect(html).toContain('.asset-label:last-child')
    expect(html).toContain('page-break-after: auto;')
    expect(html).toContain('font-size: 10.5pt;')
    expect(html).toContain('font-size: 7.8pt;')
    expect(html).toContain('font-size: 7.2pt;')
    expect(html).toContain('font-size: 6.2pt;')
    expect(html).toContain('font-weight: 400;')
    expect(html).toContain('class="v is-multiline"')
    expect(html).not.toContain('<header class="label-header">')
    expect(html).not.toContain('示例企业有限公司')
    expect(html).toContain('工程机&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('IT资产&lt;img src=x&gt;')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('<svg viewBox="0 0 180 180"><rect width="10" height="10"/></svg>')
    expect(html.match(/<article class="asset-label">/g)).toHaveLength(2)
    expect(html).toContain('SN: SN001')
    expect(html).toContain('类别: 笔记本')

    const labels = html.split('<article class="asset-label">').slice(1)
    expect(labels[0]).toContain('<div class="info-list">')
    expect(labels[0]).not.toContain('>位置<')
    expect(labels[0]).not.toContain('>日期<')
    expect(labels[1]).toContain('<div class="info-list is-compact">')
    expect(labels[1]).toContain('>位置<')
    expect(labels[1]).toContain('>日期<')
  })

  it('renders company header when topReserveMm is set to 0 for blank label rolls', () => {
    const html = buildItAssetPrintHtml(
      [
        {
          assetNo: 'TK-PC-0099',
          assetName: '测试主机',
          deviceType: 'desktop',
        },
      ],
      {
        companyTitle: '示例测试公司 & Co',
        badgeText: 'IT 固定资产',
        topReserveMm: 0,
      },
    )

    expect(html).toContain('padding: 2.2mm 2.6mm 2mm 2.6mm;')
    expect(html).toContain('<header class="label-header">')
    expect(html).toContain('示例测试公司 &amp; Co')
    expect(html).toContain('<span class="asset-badge">IT 固定资产</span>')
  })
})
