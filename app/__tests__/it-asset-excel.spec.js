import * as XLSX from 'xlsx/xlsx.mjs'
import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import {
  buildItAssetExportWorkbook,
  buildItAssetImportTemplateWorkbook,
  parseItAssetImportBuffer,
  serializeItAssetWorkbook,
} from '../../server/utils/it-asset-excel'

describe('IT asset Excel template, import parser and export workbook', () => {
  it('ignores the default sample row when round-tripping the generated import template and applies styling/freeze', () => {
    const templateWb = buildItAssetImportTemplateWorkbook()
    const ws1 = templateWb.Sheets['IT资产导入模板']
    const ws2 = templateWb.Sheets['填写说明']

    expect(ws1['!views']).toEqual([
      expect.objectContaining({ state: 'frozen', ySplit: 1, topLeftCell: 'A2' }),
    ])
    expect(ws1['!autofilter']).toEqual({ ref: 'A1:S2' })
    expect(ws1['!pageSetup']).toMatchObject({ orientation: 'landscape', fitToPage: true, fitToWidth: 1 })
    expect(ws1.A1.s.fill.fgColor.rgb).toBe('FF1E3A5F')
    expect(ws1.B2.s.fill.fgColor.rgb).toBe('FFFEFCE8')

    expect(ws2['!views']).toEqual([
      expect.objectContaining({ state: 'frozen', ySplit: 2, topLeftCell: 'A3' }),
    ])
    expect(ws2.A1.v).toBe('IT 资产批量导入填写说明')
    expect(ws2.B4.s.fill.fgColor.rgb).toBe('FFFEE2E2') // 必填

    const buf = serializeItAssetWorkbook(templateWb)
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

  it('builds styled export workbook with title, subtitle stats, dynamic row heights, semantic status colors, freeze panes, autofilter and print setup', () => {
    const sampleRows = [
      {
        assetNo: 'TK-PC-0001',
        assetName: '办公台式机',
        deviceType: 'desktop',
        brand: '联想',
        model: 'M740t',
        serialNo: 'SN001',
        useDept: '工程部',
        userName: '张三',
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
      {
        assetNo: 'TK-PC-0002',
        assetName: '高性能研发台式机（双屏配置主机）',
        deviceType: 'desktop',
        brand: '惠普',
        model: 'ProDesk 400 G9 MT',
        serialNo: 'SN002',
        useDept: '工程部',
        userName: '李四',
        location: 'A栋3楼研发区东侧工位',
        purchaseDate: '2026-04-01',
        status: 'idle',
        cpuSpec: 'AMD Ryzen 5 5600GT with Radeon Graphics 3.60GHz 6核12线程处理器',
        memorySpec: '32GB',
        diskSpec: '1TB NVMe SSD',
        osVersion: 'Windows 11 专业工作站版 24H2',
        ipAddress: '192.0.2.56',
        macAddress: 'AA-BB-CC-11-22-34',
        warrantyDate: '2029-04-01',
        remark: '第一行说明：已安装全套开发工具与虚拟机环境\n第二行说明：包含双27寸显示器支架与扩展坞配件',
      },
      {
        assetNo: 'TK-PC-0003',
        assetName: '商务笔记本',
        deviceType: 'laptop',
        brand: '戴尔',
        model: 'Latitude 5440',
        serialNo: 'SN003',
        useDept: '财务部',
        userName: '王五',
        location: 'B栋2楼',
        purchaseDate: '2025-11-10',
        status: 'repair',
        cpuSpec: 'i7-1355U',
        memorySpec: '16GB',
        diskSpec: '512GB SSD',
        osVersion: 'Windows 11 专业版',
        ipAddress: '192.0.2.57',
        macAddress: 'AA-BB-CC-11-22-35',
        warrantyDate: '2028-11-09',
        remark: '主板送修',
      },
      {
        assetNo: 'TK-PC-0004',
        assetName: '旧款机房服务器',
        deviceType: 'server',
        brand: '戴尔',
        model: 'PowerEdge R740',
        serialNo: 'SN004',
        useDept: '',
        userName: '',
        location: '机房机柜01',
        purchaseDate: '2020-05-01',
        status: 'scrapped',
        cpuSpec: 'Xeon Silver 4210',
        memorySpec: '64GB',
        diskSpec: '4TB RAID',
        osVersion: 'Linux',
        ipAddress: '192.0.2.58',
        macAddress: 'AA-BB-CC-11-22-36',
        warrantyDate: '2023-05-01',
        remark: '已过保报废',
      },
    ]

    const wb = buildItAssetExportWorkbook({
      rows: sampleRows,
      exportedAt: '2026-11-24 14:30',
      companyTitle: '示例企业有限公司',
    })

    expect(wb.SheetNames).toEqual(['IT电脑资产台账', '部门汇总'])
    const sheet = wb.Sheets['IT电脑资产台账']
    expect(sheet).toBeDefined()

    // 第 1 行直接为表头（无顶部标题/副标题行，无跨列合并，保证 Excel 任意列筛选排序零阻碍）
    expect(sheet.A1.v).toBe('资产编号')
    expect(sheet.A1.s.fill.fgColor.rgb).toBe('FF1E3A5F')
    expect(sheet.A1.s.font.color.rgb).toBe('FFFFFFFF')
    expect(sheet.A1.s.font.bold).toBe(true)

    // 默认按资产编号升序排列，且明细表无跨列合并单元格
    expect([sheet.A2.v, sheet.A3.v, sheet.A4.v, sheet.A5.v]).toEqual([
      'TK-PC-0001',
      'TK-PC-0002',
      'TK-PC-0003',
      'TK-PC-0004',
    ])
    expect(sheet['!merges']).toBeUndefined()

    // 状态列 (K列，index 10) 语义配色：在用绿 / 闲置蓝 / 维修中橙 / 已报废灰
    expect(sheet.K2.s.fill.fgColor.rgb).toBe('FFDCFCE7')
    expect(sheet.K2.s.font.color.rgb).toBe('FF166534')
    expect(sheet.K3.s.fill.fgColor.rgb).toBe('FFDBEAFE')
    expect(sheet.K3.s.font.color.rgb).toBe('FF1E40AF')
    expect(sheet.K4.s.fill.fgColor.rgb).toBe('FFFFEDD5')
    expect(sheet.K4.s.font.color.rgb).toBe('FF9A3412')
    expect(sheet.K5.s.fill.fgColor.rgb).toBe('FFE2E8F0')
    expect(sheet.K5.s.font.color.rgb).toBe('FF475569')

    // 斑马纹与对齐策略
    expect(sheet.B2.s.fill.fgColor.rgb).toBe('FFFFFFFF')
    expect(sheet.B3.s.fill.fgColor.rgb).toBe('FFF8FAFC')
    expect(sheet.A2.s.alignment.horizontal).toBe('center')
    expect(sheet.L2.s.alignment.horizontal).toBe('left')
    expect(sheet.S2.s.alignment.horizontal).toBe('left')

    // 动态行高：含长 CPU 与多行备注的第 3 行(index 2, TK-PC-0002) 应明显高于普通单行第 2 行(index 1)
    expect(sheet['!rows'][1].hpt).toBeGreaterThanOrEqual(22)
    expect(sheet['!rows'][2].hpt).toBeGreaterThan(sheet['!rows'][1].hpt)
    expect(sheet['!rows'][2].hpt).toBeGreaterThanOrEqual(45)

    // 冻结第 1 行表头、自动筛选覆盖表头与数据、横向打印设置
    expect(sheet['!views']).toEqual([
      expect.objectContaining({ state: 'frozen', ySplit: 1, topLeftCell: 'A2' }),
    ])
    expect(sheet['!autofilter']).toEqual({ ref: 'A1:S5' })
    expect(sheet['!pageSetup']).toMatchObject({
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    })

    // 序列化为真实 .xlsx 并验证 OOXML 冻结窗格与打印设置已真实落盘，且可读回
    const buf = serializeItAssetWorkbook(wb)
    const zipEntries = unzipSync(new Uint8Array(buf))
    const sheet1Xml = strFromU8(zipEntries['xl/worksheets/sheet1.xml'])
    expect(sheet1Xml).toContain('<pageSetUpPr fitToPage="1"/>')
    expect(sheet1Xml).toContain('ySplit="1"')
    expect(sheet1Xml).toContain('state="frozen"')
    expect(sheet1Xml).toContain('orientation="landscape"')
    expect(sheet1Xml).toContain('fitToWidth="1"')

    const restored = XLSX.read(buf, { type: 'buffer' })
    const restoredMain = restored.Sheets['IT电脑资产台账']
    const matrix = XLSX.utils.sheet_to_json(restoredMain, { header: 1 })
    expect(matrix[0]).toHaveLength(19)
    expect(matrix[0]).toContain('资产编号')
    expect(matrix[0]).not.toContain('打印次数')
    expect(matrix[0]).not.toContain('最近打印时间')
    expect(matrix[1]).toContain('TK-PC-0001')
    expect(matrix[1]).toContain('台式机')
    expect(matrix[1]).toContain('在用')
    expect(matrix).toHaveLength(5)

    // 验证「部门汇总」Sheet
    const deptSheet = wb.Sheets['部门汇总']
    expect(deptSheet['!views']).toEqual([
      expect.objectContaining({ state: 'frozen', ySplit: 3, topLeftCell: 'A4' }),
    ])
    expect(deptSheet['!autofilter']).toEqual({ ref: 'A3:L6' })
    const restoredDept = restored.Sheets['部门汇总']
    const deptMatrix = XLSX.utils.sheet_to_json(restoredDept, { header: 1 })
    expect(deptMatrix[2]).toEqual([
      '序号', '使用部门', '资产总计', '台式机', '笔记本', '服务器', '其他设备', '在用', '闲置', '维修中', '已报废', '占比',
    ])
    // 工程部 2 台排第一
    expect(deptMatrix[3]).toEqual([1, '工程部', 2, 2, 0, 0, 0, 1, 1, 0, 0, '50.0%'])
    // 财务部 & 未分配部门各 1 台
    const deptNames = deptMatrix.slice(3, 6).map((r) => r[1])
    expect(deptNames).toContain('财务部')
    expect(deptNames).toContain('未分配部门')
    // 合计行
    expect(deptMatrix[6]).toEqual(['合计', '共 3 个部门', 4, 2, 1, 1, 0, 1, 1, 1, 1, '100.0%'])
  })

  it('still accepts plain array input and handles empty rows gracefully', () => {
    const wb = buildItAssetExportWorkbook([])
    const sheet = wb.Sheets['IT电脑资产台账']
    expect(sheet['!autofilter']).toEqual({ ref: 'A1:S1' })
    const buf = serializeItAssetWorkbook(wb)
    const restored = XLSX.read(buf, { type: 'buffer' })
    const matrix = XLSX.utils.sheet_to_json(restored.Sheets['IT电脑资产台账'], { header: 1 })
    expect(matrix[1][0]).toBe('暂无 IT 资产数据')
    expect(matrix).toHaveLength(2)
  })
})
