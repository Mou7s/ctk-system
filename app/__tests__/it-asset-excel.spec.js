import * as XLSX from 'xlsx/xlsx.mjs'
import * as XLSXStyleModule from 'xlsx-js-style'
import { describe, expect, it } from 'vitest'
import {
  buildItAssetExportWorkbook,
  buildItAssetImportTemplateWorkbook,
  parseItAssetImportBuffer,
} from '../../server/utils/it-asset-excel'

const XLSXStyle = XLSXStyleModule.default || XLSXStyleModule

describe('IT asset Excel template, import parser and export workbook', () => {
  it('ignores the default sample row when round-tripping the generated import template', () => {
    const templateWb = buildItAssetImportTemplateWorkbook()
    const buf = XLSXStyle.write(templateWb, { type: 'buffer', bookType: 'xlsx' })
    const parsed = parseItAssetImportBuffer(buf)
    expect(parsed.rows).toEqual([])
    expect(parsed.errors).toEqual([])
  })

  it('parses Chinese aliases, pc_manage-compatible headers, numeric Excel dates without off-by-one drift, and reports missing required fields', () => {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([
      ['编号', '名称', '类型', '品牌', '型号', 'SN', '部门', '领用人', '存放地', '购置日期', '状态', '保修到期日'],
      // Excel serial 45884 === 2025-08-15
      ['TK-PC-0088', '测试笔记本', '笔记本', '联想', 'ThinkPad T14', 'SN888', '工程部', '张三', 'A栋201', 45884, '在用', '2028/8/14'],
      ['', '测试台式机', 'desktop', '戴尔', 'OptiPlex 7010', '', '财务部', '李四', 'A栋102', '2026-01-05', '闲置', ''],
      ['TK-PC-0099', '', '台式机', '', '', '', '', '', '', '', '', ''],
    ])
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    const parsed = parseItAssetImportBuffer(buf)
    expect(parsed.rows).toHaveLength(2)
    expect(parsed.rows[0]).toMatchObject({
      rowNo: 2,
      assetNo: 'TK-PC-0088',
      assetName: '测试笔记本',
      deviceType: 'laptop',
      brand: '联想',
      model: 'ThinkPad T14',
      serialNo: 'SN888',
      useDept: '工程部',
      userName: '张三',
      location: 'A栋201',
      purchaseDate: '2025-08-15',
      status: 'in_use',
      warrantyDate: '2028-08-14',
    })
    expect(parsed.rows[1]).toMatchObject({
      rowNo: 3,
      assetNo: '',
      assetName: '测试台式机',
      deviceType: 'desktop',
      purchaseDate: '2026-01-05',
      status: 'idle',
    })
    expect(parsed.errors).toEqual([{ rowNo: 4, message: '资产名称不能为空' }])
  })

  it('builds styled export workbook with title row, Chinese labels and all fields', () => {
    const wb = buildItAssetExportWorkbook([
      {
        assetNo: 'TK-PC-0001',
        assetName: '办公台式机',
        deviceType: 'desktop',
        brand: '联想',
        model: 'M740t',
        serialNo: 'SN001',
        useDept: '工程部',
        userName: '王五',
        location: 'A栋3楼',
        purchaseDate: '2026-03-15',
        status: 'in_use',
        cpuSpec: 'i5-13400',
        memorySpec: '16GB',
        diskSpec: '512GB SSD',
        osVersion: 'Windows 11',
        ipAddress: '192.0.2.55',
        macAddress: 'AA-BB-CC-11-22-33',
        warrantyDate: '2029-03-14',
        printCount: 2,
        lastPrintedAt: '2026-11-20 09:30:00',
        remark: '标配',
      },
    ])
    const buf = XLSXStyle.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const restored = XLSX.read(buf, { type: 'buffer' })
    const sheet = restored.Sheets['IT电脑资产台账']
    expect(sheet).toBeDefined()
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1 })
    expect(String(matrix[0][0])).toContain('共 1 台')
    expect(matrix[1]).toContain('资产编号')
    expect(matrix[1]).toContain('打印次数')
    expect(matrix[2]).toContain('TK-PC-0001')
    expect(matrix[2]).toContain('台式机')
    expect(matrix[2]).toContain('在用')
    expect(matrix[2]).toContain(2)
  })
})
