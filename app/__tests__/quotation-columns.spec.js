import { describe, expect, it } from 'vitest'
import { detectQuotationColumnMapping } from '@ctk-system/shared'
import { detectColumnMapping } from '../../server/utils/quotation-parser.ts'

// 服务端解析器（入库）与前端上传预览各有一套表头映射，这里同时校验两边，
// 防止「终端客户」「友商型号」「1只美元价」这类列再次分叉导致预览 ≠ 入库。
// 表头按 2026-09-16 新模板「标准报价单模板-v2」（A..V 共 22 列）准备。
const V2_EN = [
  'S/N', 'Quote Date', 'Country', 'Style', 'Quote to', 'End User', 'Applicaiton', 'Manufacturer',
  'MPN', 'Qty', 'CTK MPN', 'Package', 'Die Size', 'SPQ/Reel',
  'Price/RMB\n（KPCS)', 'Rate', 'Price/USD\nKPCS', 'Price/USD\nPC', 'L/T', 'Datasheet', 'Remark',
]
const V2_CN = [
  '序列', '报价日期', '国家', '客户性质', '客户', '终端客户', '应用', '友商', '友商型号', '数量',
  'CTK 型号', '封装', '芯片大小', '(pcs)', '单价（元）', '汇率', '千只单价（美元）', '1只单价（美元）',
  '交期', '规格书', '备注',
]

// 当前外贸下载模板（A..P）：核心物料字段与人民币单价在最左侧。
const CURRENT_16_EN = [
  'S/N\n序号', 'Material Code\n物料编码', 'Material Name\n物料名称', 'Package\n封装',
  'Price/RMB (KPCS)\n单价（元）', 'Application\n应用', 'Manufacturer\n友商', 'MPN\n友商型号',
  'Qty\n数量', 'Die Size\n芯片大小', 'SPQ/Reel\n(pcs)', 'Price/USD KPCS\n千只单价（美元）',
  'Price/USD PC\n1只单价（美元）', 'L/T\n交期', 'Datasheet\n规格书', 'Remark\n备注',
]

// 旧模板（15 列，含产品描述列）仍要能读：新增列必须全部落 -1，产品描述列按新口径忽略
const LEGACY_EN = [
  'S/N', 'Quote to', 'End User', 'Applicaiton', 'Manufacturer', 'Desprition', 'Qty', 'Unit',
  'CTK MPN', 'Package', 'Die Size', 'SPQ/Reel', 'Price/RMB KPCS', 'Price/USD KPCS', 'Datasheet',
]
const LEGACY_CN = [
  '序列', '客户', '终端客户', '应用', '友商', '产品描述', '数量', '单位',
  'CTK 型号', '封装', '芯片大小', '(pcs)', '单价（元）', '单价（美元）', '规格书',
]

const NEW_COLUMN_KEYS = ['quoteDate', 'country', 'customerStyle', 'manufacturerMpn', 'rate', 'priceUsdPc', 'leadTime', 'remark']

describe('quotation workbook column mapping', () => {
  it('maps the current 16-column template after moving code, name, package, and RMB price first', () => {
    const mapping = detectQuotationColumnMapping([CURRENT_16_EN])

    expect(mapping).toMatchObject({
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
    })
  })

  it('maps the v2 template columns to the new line fields', () => {
    const mapping = detectQuotationColumnMapping([V2_EN, V2_CN])

    expect(mapping).toMatchObject({
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
    })
  })

  it('keeps 客户性质 away from 客户 and 友商型号 away from 友商', () => {
    const mapping = detectQuotationColumnMapping([V2_EN, V2_CN])

    expect(mapping.customerStyle).toBe(3)
    expect(mapping.quoteTo).toBe(4)
    expect(mapping.manufacturer).toBe(7)
    expect(mapping.manufacturerMpn).toBe(8)
    expect(mapping.ctkMpn).toBe(10)
  })

  it('keeps the 1只美元价 column away from the 千只美元价 column', () => {
    const mapping = detectQuotationColumnMapping([V2_EN, V2_CN])

    expect(mapping.priceUsd).toBe(16)
    expect(mapping.priceUsdPc).toBe(17)
  })

  it('disables every new column (-1) for the legacy 15-column template', () => {
    const mapping = detectQuotationColumnMapping([LEGACY_EN, LEGACY_CN])

    for (const key of NEW_COLUMN_KEYS) {
      expect(mapping[key], key).toBe(-1)
    }
    expect(mapping.quoteTo).toBe(1)
    expect(mapping.dieSize).toBe(10)
    expect(mapping.priceRmb).toBe(12)
    expect(mapping.priceUsd).toBe(13)
  })

  it('matches the server parser mapping for both templates', () => {
    for (const header of [[CURRENT_16_EN], [V2_EN, V2_CN], [LEGACY_EN, LEGACY_CN], [V2_CN], [LEGACY_CN]]) {
      expect(detectQuotationColumnMapping(header), JSON.stringify(header)).toEqual(detectColumnMapping(header))
    }
  })
})
