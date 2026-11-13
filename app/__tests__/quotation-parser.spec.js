import * as XLSX from 'xlsx/xlsx.mjs'
import { describe, expect, it } from 'vitest'
import { parseDomesticQuotationWorkbook, parseQuotationWorkbook } from '../../server/utils/quotation-parser.ts'
import { DOMESTIC_QUOTATION_COLUMNS } from '../packages/ui/domesticQuotationGrid.js'

function workbookBytes(rows) {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), '8-14')
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
}

describe('quotation workbook parser', () => {
  it('keeps domestic workbook mapping compatible with the reordered online columns', () => {
    const parsed = parseDomesticQuotationWorkbook(workbookBytes([
      ['内贸报价单'],
      [],
      [],
      [],
      [],
      ['客户：内贸客户'],
      ['联系人：王先生', null, null, null, '日期：2026-09-27'],
      [],
      ['序号', '品名', '型号', '封装', '单位', '含税单价', '备注'],
      [1, '电源产品', 'CTK-DOM-1', 'SOT-23', '只', 1.25, '内贸备注'],
    ]), '内贸销售报价单模板.xlsx')

    expect(DOMESTIC_QUOTATION_COLUMNS.map(({ key }) => key)).toEqual([
      'customerMaterialName', 'ctkMpn', 'packageName', 'originalPriceRmb', 'minPackCount', 'remark',
    ])
    expect(parsed.customerName).toBe('内贸客户')
    expect(parsed.contact).toBe('王先生')
    expect(parsed.quoteDate).toBe('2026-09-27')
    expect(parsed.lines[0]).toMatchObject({
      application: '电源产品',
      ctkMpn: 'CTK-DOM-1',
      packageName: 'SOT-23',
      unit: 'KPCS',
      originalPriceRmb: 1250,
      remark: '内贸备注',
    })
  })

  it('reads the template metadata and the line-level fields', () => {
    const bytes = workbookBytes([
      ['ignored'],
      ['Quotation Sheet'],
      ['Delivery terms:', null, 'FOB Shenzhen', null, 'Lead time:', '1-30days', 'Warranty:', '2 years', 'Quote day:', new Date('2026-08-15'), 'Valid:', null, '7days', 'Payment Term:30% deposit,70%before shipping.'],
      ['S/N', 'Quote to', 'End User', 'Applicaiton', 'Manufacturer', 'Desprition', 'Qty', 'Unit', 'CTK MPN', 'Package', 'Die Size', 'SPQ/Reel', 'Price/RMB KPCS', 'Price/USD KPCS', 'Datasheet'],
      ['序列', '客户', '终端客户', '应用', '友商', '产品描述', '数量', '单位', 'CTK 型号', '封装', '芯片大小', '(pcs)', '单价（元）', '单价（美元）', '规格书'],
      [1, '客户A', '终端A', '应用A', '友商A', '产品A', 1000, 'KPCS', 'CTK-001', 'SOP', '1x1', '1000', 1.25, 0.18, 'spec.pdf'],
    ])

    const parsed = parseQuotationWorkbook(bytes, '报价单.xlsx')
    expect(parsed.sheetName).toBe('8-14')
    expect(parsed.customerName).toBe('客户A')
    expect(parsed.lines).toHaveLength(1)
    expect(parsed.lines[0]).toMatchObject({
      quoteTo: '客户A',
      ctkMpn: 'CTK-001',
      originalPriceRmb: 1.25,
    })
    // 旧模板没有汇率列：美元价算不出来，保持 null（不再直接采信表格里的美元列）
    expect(parsed.lines[0].originalPriceUsd).toBeNull()
  })

  it('locates metadata immediately above the shifted bilingual headers', () => {
    const parsed = parseQuotationWorkbook(workbookBytes([
      ['CTK'],
      [null, null, null, '示例企业有限公司'],
      [null, null, null, 'Example Electronics Co., Ltd'],
      [null, null, null, 'Add:No.1, Example Rd'],
      ['Quotation Sheet'],
      ['Delivery terms:', null, 'FOB Shenzhen', null, 'Lead time:', '1-30days', 'Warranty:', '2 years', 'Quote day:', new Date('2026-08-18'), 'Valid:', null, '30days', 'Payment Term:Net 30 days'],
      ['S/N', 'Quote to', 'End User', 'Applicaiton', 'Manufacturer', 'Desprition', 'Qty', 'Unit', 'CTK MPN', 'Package', 'Die Size', 'SPQ/Reel', 'Price/RMB KPCS', 'Price/USD KPCS', 'Datasheet'],
      ['序列', '客户', '终端客户', '应用', '友商', '产品描述', '数量', '单位', 'CTK 型号', '封装', '芯片大小', '(pcs)', '单价（元）', '单价（美元）', '规格书'],
      [1, '客户B', '终端B', '应用B', '友商B', '产品B', 25, 'pcs', 'CTK-002', 'SOD32', '1x1', '25', 2.5, 0.35, 'spec-b.pdf'],
    ]), 'quotation-template-content.xlsx')
    expect(parsed.deliveryTerms).toBe('FOB Shenzhen')
    expect(parsed.validity).toBe('30days')
    expect(parsed.paymentTerm).toBe('Net 30 days')
    expect(parsed.lines[0]).toMatchObject({ quoteTo: '客户B', ctkMpn: 'CTK-002', packageName: 'SOD32' })
  })

  it('reads the manually adjusted split validity and payment cells', () => {
    const parsed = parseQuotationWorkbook(workbookBytes([
      ['示例企业有限公司'],
      ['Example Electronics Co., Ltd'],
      ['Add:No.1, Example Rd'],
      ['Web:www.example.com'],
      ['Quotation Sheet'],
      ['Delivery terms:', null, 'FOB Shenzhen', null, 'Lead time:', '1-30days', 'Warranty:', '2 years', 'Quote day:', new Date('2026-08-18'), null, '15days', '30% deposit, 70% before shipment'],
      ['S/N', 'Quote to', 'End User', 'Applicaiton', 'Manufacturer', 'Desprition', 'Qty', 'Unit', 'CTK MPN', 'Package', 'SPQ/Reel', 'Price/RMB KPCS', 'Price/USD KPCS', 'Datasheet'],
      ['序列', '客户', '终端客户', '应用', '友商', '产品描述', '数量', '单位', 'CTK 型号', '封装', '(pcs)', '单价（元）', '单价（美元）', '规格书'],
      [1, '客户C', '终端C', '应用C', '友商C', '产品C', 10, 'pcs', 'CTK-003', 'SOT23', '3000', '￥30.00', '$4.50', 'spec-c.pdf'],
    ]), 'manual-split.xlsx')
    expect(parsed.validity).toBe('15days')
    expect(parsed.paymentTerm).toBe('30% deposit, 70% before shipment')
    expect(parsed.lines[0]).toMatchObject({
      originalPriceRmb: 30,
      // 没有汇率列 => 美元价 null
      originalPriceUsd: null,
    })
  })

  it('reads the current compact bilingual quotation template layout', () => {
    const parsed = parseQuotationWorkbook(workbookBytes([
      ['CO', null, '示例企业有限公司　报价单\nExample Electronics Co., Ltd　Quotation Sheet'],
      ['地址\nAddress:', '示例省示例市示例区示例路1号\nNo.1, Example Rd', null, null, null, null, null, '网址\nWebsite:', 'www.example.com'],
      ['客户\nCustomer:', '客户甲', null, '终端客户\nEnd User:', '终端甲', null, '国家\nCountry:', '印度', null, '客户性质\nCustomer Type:', '分销商', null, '汇率\nExchange Rate:', 7.2, '报价日期\nQuote Date:', '2026-09-27'],
      ['贸易条款\nTrading Terms:', null, 'FOB Shenzhen', null, null, '报价有效期\nQuotation Valid:', null, '30days', null, '付款方式\nPayment Terms:', '30% deposit, 70% before shipping'],
      ['联系人\nContact:', '张三', null, '邮箱\nEmail:', 'sales@example.com', null, '电话\nPhone:', '+8613800000000'],
      ['S/N\n序号', 'Application\n应用', 'Manufacturer\n友商', 'MPN\n友商型号', 'Qty\n数量', 'CTK MPN\nCTK 型号', 'Package\n封装', 'Die Size\n芯片大小', 'SPQ/Reel\n(pcs)', 'Price/RMB (KPCS)\n单价（元）', 'Price/USD KPCS\n千只单价（美元）', 'Price/USD PC\n1只单价（美元）', 'L/T\n交期', 'Datasheet\n规格书', 'Remark\n备注'],
      [1, '电源产品', 'Nexperia', 'BC857', 1200, 'TKBC857', 'SOT-23', '1x1', 3000, 12.5, null, null, '30days', 'spec.pdf', '优先排产'],
    ]), '外贸销售报价单模板.xlsx')

    expect(parsed).toMatchObject({
      customerName: '客户甲',
      endUser: '终端甲',
      country: '印度',
      customerStyle: '分销商',
      rate: 7.2,
      quoteDate: '2026-09-27',
      deliveryTerms: 'FOB Shenzhen',
      validity: '30days',
      paymentTerm: '30% deposit, 70% before shipping',
      contact: '张三',
    })
    expect(parsed.lines).toHaveLength(1)
    expect(parsed.lines[0]).toMatchObject({
      quoteTo: '客户甲',
      endUser: '',
      application: '电源产品',
      manufacturer: 'Nexperia',
      manufacturerMpn: 'BC857',
      qty: 1200,
      ctkMpn: 'TKBC857',
      packageName: 'SOT-23',
      originalPriceRmb: 12.5,
      rate: 7.2,
    })
  })

  // 新模板（2026-09-16）：报价日期/交期改为行级，新增国家、客户性质、友商型号、汇率、备注，
  // 美元价由「人民币单价 ÷ 汇率」自动算出，不采信表格里的美元列。
  it('reads the row-level fields of the v2 template and derives the USD price from the rate', () => {
    const parsed = parseQuotationWorkbook(workbookBytes([
      ['示例企业有限公司'],
      ['Quotation Sheet'],
      ['Trading Terms: EXW City    Quotation Valid: 30 days    Payment terms: 30% deposit,and 70% before shipping    Contact: Alice Chen    Email:alice@example.com'],
      ['S/N', 'Quote Date', 'Country', 'Style', 'Quote to', 'End User', 'Applicaiton', 'Manufacturer',
        'MPN', 'Qty', 'CTK MPN', 'Package', 'Die Size', 'SPQ/Reel',
        'Price/RMB', 'Rate', 'Price/USD KPCS', 'Price/USD PC', 'L/T', 'Datasheet', 'Remark'],
      ['序列', '报价日期', '国家', '客户性质', '客户', '终端客户', '应用', '友商', '友商型号', '数量',
        'CTK 型号', '封装', '芯片大小', '(pcs)', '单价（元）', '汇率', '千只单价（美元）', '1只单价（美元）',
        '交期', '规格书', '备注'],
      [1, new Date('2026-09-16'), '印度', '分销商', 'HPL', 'HPL', 'EV Charger', 'Vishay', 'MBR20100',
        50, 'MBR20100CT', 'TO-220', 'Standard', '1000', 54, 7.2, 999, 0.999, '30days', 'spec.pdf', '优先排产'],
    ]), '报价单.xlsx')

    expect(parsed.deliveryTerms).toBe('EXW City')
    expect(parsed.validity).toBe('30days')
    expect(parsed.paymentTerm).toBe('30% deposit,and 70% before shipping')
    expect(parsed.contact).toBe('Alice Chen')
    expect(parsed.lines[0]).toMatchObject({
      quoteDate: '2026-09-16',
      country: '印度',
      customerStyle: '分销商',
      quoteTo: 'HPL',
      manufacturer: 'Vishay',
      manufacturerMpn: 'MBR20100',
      ctkMpn: 'MBR20100CT',
      leadTime: '30days',
      remark: '优先排产',
      originalPriceRmb: 54,
      rate: 7.2,
      // 54 ÷ 7.2 = 7.5（表格里写的 999 是公式缓存，不采信）
      originalPriceUsd: 7.5,
    })
  })

  it('rejects a workbook that does not contain the quotation header', () => {
    expect(() => parseQuotationWorkbook(workbookBytes([
      ['invalid'],
      ['headers', 'only'],
    ]), 'invalid.xlsx')).toThrow('未找到报价单明细表头，请使用标准报价单模板')
  })

  // LO 单实测（2026-09-15）：客户自己表格里的 S/N 列重复且乱序（37、39 各出现两次）。
  // 以前把 S/N 当 line_no 入库，撞上 UNIQUE(quotation_id, line_no) 直接让整单上传报「报价单上传失败」，
  // 且导出模板按 line_no 定位行时会互相覆盖。序号必须固定按行顺序 1..N。
  it('numbers lines 1..N even when the S/N column repeats, skips or is blank', () => {
    const parsed = parseQuotationWorkbook(workbookBytes([
      ['示例企业有限公司'],
      ['Quotation Sheet'],
      ['Delivery terms:', null, 'FOB Shenzhen', null, 'Lead time:', '1-30days', 'Warranty:', '2 years', 'Quote day:', new Date('2026-09-15'), 'Valid:', null, '30days', 'Payment Term:30% deposit'],
      ['S/N', 'Quote to', 'End User', 'Applicaiton', 'Manufacturer', 'Desprition', 'Qty', 'Unit', 'CTK MPN', 'Package', 'Die Size', 'SPQ/Reel', 'Price/RMB KPCS', 'Price/USD KPCS', 'Datasheet'],
      ['序列', '客户', '终端客户', '应用', '友商', '产品描述', '数量', '单位', 'CTK 型号', '封装', '芯片大小', '(pcs)', '单价（元）', '单价（美元）', '规格书'],
      [35, 'LO', '库存备货', '消费级', null, 'BZV55Cxxx SOD-80 (3V9-39V)', 1, 'kpcs', 'BZV55Cxxx SOD-80 (3V9-39V)', 'LL-34', 'STANDARD', null, 22, 3.28, null],
      [36, 'LO', '库存备货', '消费级', null, 'BZV55Cxxx SOD-80 (<3V9)', null, 'kpcs', 'BZV55Cxxx SOD-80 (<3V9)', null, null, null, 30.8, 4.59, null],
      [39, 'LO', '库存备货', '消费级', null, 'BZX84Cxxx SOT-23', 1, 'kpcs', 'BZX84Cxxx SOT-23', 'SOT-23', 'STANDARD', null, 32.4, 4.83, null],
      [37, 'LO', '库存备货', '消费级', null, 'SS34A SMA', 30, 'kpcs', 'SS34A SMA', 'SMA', 'STANDARD', null, 66, 9.85, null],
      [null, 'LO', '库存备货', '消费级', null, 'SS54 SMC', 5, 'kpcs', 'SS54 SMC', 'SMA', 'STANDARD', null, 144, 21.49, null],
    ]), '标准报价单模板 LO.xlsx')

    expect(parsed.lines.map((line) => line.lineNo)).toEqual([1, 2, 3, 4, 5])
    expect(parsed.lines.map((line) => line.ctkMpn)).toEqual([
      'BZV55Cxxx SOD-80 (3V9-39V)',
      'BZV55Cxxx SOD-80 (<3V9)',
      'BZX84Cxxx SOT-23',
      'SS34A SMA',
      'SS54 SMC',
    ])
  })

  // 用户口径（2026-09-16 / 09-17）：国家 / 客户性质是选项列，Excel 里随便写的值不允许导入；
  // 单位列已取消（数量固定 kpcs），上传件里的单位列被忽略

  function optionBytes({ country = '印度', customerStyle = '分销商' } = {}) {

    const workbook = XLSX.utils.book_new()

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([

      ['Quotation Sheet'],

      ['S/N', 'Quote Date', 'Country', 'Style', 'Quote to', 'End User', 'Applicaiton', 'Manufacturer',

        'MPN', 'Qty', 'CTK MPN', 'Package', 'Die Size', 'SPQ/Reel',

        'Price/RMB', 'Rate', 'Price/USD KPCS', 'Price/USD PC', 'L/T', 'Datasheet', 'Remark'],

      ['序列', '报价日期', '国家', '客户性质', '客户', '终端客户', '应用', '友商', '友商型号', '数量',

        'CTK 型号', '封装', '芯片大小', '(pcs)', '单价（元）', '汇率', '千只单价（美元）', '1只单价（美元）',

        '交期', '规格书', '备注'],

      [1, null, country, customerStyle, '客户A', 'END USER', '应用A', '友商A', 'MPN-A', 500, 'CTK-001', 'SOD-123FL', 'Standard', '3000', 54, 7.2, null, null, '30days', 'spec.pdf', ''],

    ]), '8-14')

    return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })

  }

  it('选项列不在清单内直接拒绝导入，并指出具体行与列', () => {

    expect(() => parseQuotationWorkbook(optionBytes({ country: '印度X' }), '报价单.xlsx'))

      .toThrow(/第1行国家「印度X」/)

    expect(() => parseQuotationWorkbook(optionBytes({ customerStyle: '无效性质' }), '报价单.xlsx'))

      .toThrow(/第1行客户性质「无效性质」/)

  })

  it('选项列合规时正常解析（国家与客户性质都在清单内，单位固定 kpcs）', () => {

    const parsed = parseQuotationWorkbook(optionBytes(), '报价单.xlsx')

    expect(parsed.lines).toHaveLength(1)

    expect(parsed.lines[0]).toMatchObject({ country: '印度', customerStyle: '分销商', unit: 'kpcs' })

    const agentParsed = parseQuotationWorkbook(optionBytes({ customerStyle: '代理商' }), '报价单.xlsx')
    expect(agentParsed.lines[0]).toMatchObject({ country: '印度', customerStyle: '代理商', unit: 'kpcs' })

  })

  it('条款包含下划线填空残留时自动剥离为规范文本（_FOB_______ → FOB）', () => {
    const bytes = workbookBytes([
      ['ignored'],
      ['Quotation Sheet'],
      ['Trading Terms: _FOB_______ ; Quotation Valid: 30days Payment terms: 30% deposit,and 70% before shipping Contact: _______'],
      ['S/N', 'Quote to', 'End User', 'Applicaiton', 'Manufacturer', 'Desprition', 'Qty', 'Unit', 'CTK MPN', 'Package', 'Die Size', 'SPQ/Reel', 'Price/RMB KPCS', 'Price/USD KPCS', 'Datasheet'],
      ['序列', '客户', '终端客户', '应用', '友商', '产品描述', '数量', '单位', 'CTK 型号', '封装', '芯片大小', '(pcs)', '单价（元）', '单价（美元）', '规格书'],
      [1, '客户A', '终端A', '应用A', '友商A', '产品A', 1000, 'KPCS', 'CTK-001', 'SOP', '1x1', '1000', 1.25, 0.18, 'spec.pdf'],
    ])

    const parsed = parseQuotationWorkbook(bytes, '报价单.xlsx')
    expect(parsed.deliveryTerms).toBe('FOB')
    expect(parsed.validity).toBe('30days')
    expect(parsed.contact).toBe('')
  })
})
