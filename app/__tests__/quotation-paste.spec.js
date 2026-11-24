import { describe, expect, it } from 'vitest'
import { applyQuotationPasteGrid, applyQuotationGridEdit, parseQuotationPaste, parseQuotationPasteGrid } from '@ctk-system/shared'

describe('quotation Excel paste parser', () => {
  it('keeps the copied Excel row and column positions', () => {
    expect(parseQuotationPasteGrid('NAM0750014\tpcs\nNAM0750016\tpcs')).toEqual([
      ['NAM0750014', 'pcs'],
      ['NAM0750016', 'pcs'],
    ])
  })

  it('writes the first copied cell into the selected first table column', () => {
    const columns = [{ key: 'quoteTo' }, { key: 'endUser' }]
    const lines = applyQuotationPasteGrid(
      [{ quoteTo: '', endUser: '' }],
      parseQuotationPasteGrid('NAM0750014\tpcs\nNAM0750016\tpcs'),
      columns,
      0,
      0,
      (index) => ({ lineNo: index + 1, quoteTo: '', endUser: '' }),
    )

    expect(lines[0]).toMatchObject({ quoteTo: 'NAM0750014', endUser: 'pcs' })
    expect(lines[1]).toMatchObject({ quoteTo: 'NAM0750016', endUser: 'pcs' })
  })

  it('parses a compact Excel selection with common Chinese headers', () => {
    const rows = parseQuotationPaste([
      ['物料编码', '物料名称', '数量', '单位'],
      ['MAT-001', 'CTK-001', 100, 'pcs'],
    ].map((row) => row.join('\t')).join('\n'))

    expect(rows).toHaveLength(1)
    // 当前模板将物料编码与物料名称分别映射到独立字段。
    expect(rows[0]).toMatchObject({
      materialCode: 'MAT-001',
      ctkMpn: 'CTK-001',
      qty: 100,
      unit: 'kpcs',
    })
  })

  it('infers model, description, and quantity when no header is copied', () => {
    const rows = parseQuotationPaste('CTK-002\t蓝色 LED\t250\tpcs')

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ ctkMpn: 'CTK-002', qty: 250, unit: 'kpcs' })
  })

  it('treats compact alphanumeric part numbers as models', () => {
    const rows = parseQuotationPaste('NAM0750014\tpcs\nNAM0750016\tpcs')

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ ctkMpn: 'NAM0750014', unit: 'kpcs' })
    expect(rows[1]).toMatchObject({ ctkMpn: 'NAM0750016', unit: 'kpcs' })
  })

  it('accepts the existing bilingual quotation columns', () => {
    const rows = parseQuotationPaste([
      ['S/N', 'Quote to', 'End User', 'Applicaiton', 'Manufacturer', 'Desprition', 'Qty', 'Unit', 'CTK MPN', 'Package', 'Die Size', 'SPQ/Reel', 'Price/RMB KPCS', 'Price/USD KPCS', 'Datasheet'],
      ['1', '客户A', '终端A', '应用A', '原厂A', '产品A', '10', 'pcs', 'CTK-003', 'SOT23', '1x1', '100', '0.12', '0.02', 'spec.pdf'],
    ].map((row) => row.join('\t')).join('\n'))

    expect(rows[0]).toMatchObject({ quoteTo: '客户A', endUser: '终端A', ctkMpn: 'CTK-003', originalPriceRmb: 0.12 })
  })

  it('maps headerless rows copied from the current A..P template by its new column order', () => {
    const rows = parseQuotationPaste([
      ['1', 'MAT-001', 'CTK-001', 'SOT23', '12.50', 'Fridge', 'Vendor', 'MPN-001', '100', '1x1', '3000', '1.87', '0.00187', '30days', 'spec.pdf', 'remark'].join('\t'),
    ].join('\n'))

    expect(rows[0]).toMatchObject({
      materialCode: 'MAT-001',
      ctkMpn: 'CTK-001',
      packageName: 'SOT23',
      originalPriceRmb: 12.5,
      application: 'Fridge',
      manufacturer: 'Vendor',
      manufacturerMpn: 'MPN-001',
      qty: 100,
      dieSize: '1x1',
      spqReel: '3000',
      unit: 'kpcs',
    })
  })

  it('applies a RevoGrid single-cell edit without mutating the original lines', () => {
    const lines = [{ lineNo: 1, ctkMpn: 'CTK-001', qty: 10, originalPriceRmb: 0.12 }]

    const nextLines = applyQuotationGridEdit(lines, { rowIndex: 0, prop: 'qty', val: '25' })

    expect(nextLines).toEqual([{ lineNo: 1, ctkMpn: 'CTK-001', qty: 25, originalPriceRmb: 0.12 }])
    expect(lines[0].qty).toBe(10)
  })

  it('applies a RevoGrid range edit from changed row models', () => {
    const lines = [
      { lineNo: 1, ctkMpn: 'CTK-001', qty: 10 },
      { lineNo: 2, ctkMpn: 'CTK-002', qty: 20 },
    ]

    const nextLines = applyQuotationGridEdit(lines, {
      models: {
        0: { lineNo: 1, ctkMpn: 'CTK-001', qty: '11' },
        1: { lineNo: 2, ctkMpn: 'CTK-002', qty: '22' },
      },
    })

    expect(nextLines.map((line) => line.qty)).toEqual([11, 22])
  })
})
