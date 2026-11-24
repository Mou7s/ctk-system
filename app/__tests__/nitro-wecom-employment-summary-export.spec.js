import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx/xlsx.mjs'
import { unzipSync } from 'fflate'

const state = vi.hoisted(() => ({
  session: { userId: 2 },
  permission: true,
  body: { startDate: '2026-08-17', endDate: '2026-08-23', eventType: '' },
  headers: {},
  pool: { query: vi.fn() },
}))

vi.mock('h3', () => ({
  readBody: vi.fn(() => state.body),
  setResponseHeader: vi.fn((_, name, value) => { state.headers[name] = value }),
}))

vi.mock('../../server/utils/auth.ts', () => ({
  getAuthSession: vi.fn(async () => state.session),
  hasPermission: vi.fn(() => state.permission),
}))

vi.mock('../../server/utils/wecom-contacts.ts', () => ({
  loadWecomContactConfig: vi.fn(async () => ({ corpId: 'corp', corpSecret: 'app', corpSecretContacts: 'contacts' })),
  fetchWecomDepartments: vi.fn(async () => []),
}))

vi.mock('../../server/utils/mysql.ts', () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}))

globalThis.defineEventHandler = (handler) => handler

describe('Nitro WeCom employment summary export route', () => {
  let handler
  let consoleError

  beforeAll(async () => {
    handler = (await import('../../server/routes/prod-api/tk_custom/wxuser/employmentSummary/export.post.ts')).default
  })

  beforeEach(() => {
    state.session = { userId: 2 }
    state.permission = true
    state.body = { startDate: '2026-08-17', endDate: '2026-08-23', eventType: '' }
    state.headers = {}
    state.pool.query.mockReset()
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('exports the filtered department report as xlsx', async () => {
    state.pool.query
      .mockResolvedValueOnce([[{
        event_id: 1,
        userid: 'hire-1',
        event_type: 'hire',
        event_at: '2026-08-20 10:00:00',
        name: '新员工',
        dept: '生产部',
        position: '操作员',
        sync_batch_id: 3,
      }, {
        event_id: 2,
        userid: 'leave-1',
        event_type: 'leave',
        event_at: '2026-08-21 10:00:00',
        name: '离职员工',
        dept: '生产部',
        position: '操作员',
        sync_batch_id: 3,
      }], []])
      .mockResolvedValueOnce([[{
        userid: 'active-1',
        name: '现有员工',
        dept: '生产部',
        leader_dept: null,
        status: 'active',
      }], []])
      .mockResolvedValueOnce([[], []])

    const result = await handler({})
    const workbook = XLSX.read(result, { type: 'buffer', cellStyles: true })
    expect(workbook.SheetNames).toEqual(['入离职汇总', '分布图', '图表数据'])
    expect(workbook.Workbook?.Sheets?.[2]?.Hidden).toBe(1)
    const sheet = workbook.Sheets['入离职汇总']
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 })

    expect(rows).toEqual([
      ['（2026-08-17-2026-08-23）入离职汇总'],
      ['序号', '部门', '入职人数', '入职名单', '离职人数', '离职名单', '离职率'],
      [1, '生产部', 1, '新员工', 1, '离职员工', '-'],
      ['', '合计', 1, '1 人', 1, '1 人', '-'],
      [],
      ['离职原因归类（离职 1 人次）'],
      ['序号', '原因编码', '原因', '原话口径', '人次', '占比', ''],
      [1, 'R01', '站立劳累', '站得脚痛，做不了', 0, '0.00%', ''],
      [2, 'R02', '家庭原因', '家庭原因，家里有事，回家照顾老人、小孩', 0, '0.00%', ''],
      [3, 'R03', '身体原因', '身体不舒服，生病，身体扛不住', 0, '0.00%', ''],
      [4, 'R04', '个人发展', '个人发展规划', 0, '0.00%', ''],
      [5, 'R05', '薪资偏低', '工资太低', 0, '0.00%', ''],
      [6, 'R06', '工作量大', '工作量大，内容繁重，无法适应', 0, '0.00%', ''],
      [7, 'R07', '试用不通过', '试用不通过，工作散漫，纪律性差，请假多', 0, '0.00%', ''],
      [8, 'R08', '不适应环境', '个人原因，不适应工作环境', 0, '0.00%', ''],
      [9, 'R09', '不适应夜班', '不适应夜班', 0, '0.00%', ''],
      [10, 'R10', '环境炎热劳累', '工作环境太热、太累', 0, '0.00%', ''],
      [11, '-', '未填写', '人事尚未补录离职原因', 1, '100.00%', ''],
    ])
    expect(sheet['A1']?.s).toBeDefined()
    // 样式细节（加粗/底色/边框/百分比格式）SheetJS 读侧解析不全，改断言布局结构；
    // 样式已用原始 styles.xml 逐项验证，见本次变更记录。
    expect(sheet['!merges']).toEqual([
      { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
      { s: { r: 5, c: 0 }, e: { r: 5, c: 6 } },
    ])
    expect(sheet['!cols']?.map((col) => col.wch)).toEqual([8, 20, 12, 56, 12, 56, 12])
    expect(sheet['!autofilter']).toEqual({ ref: 'A2:G3' })

    const chartSheet = workbook.Sheets['图表数据']
    const chartVal = (addr) => chartSheet[addr]?.v ?? ''
    // 图表数据只收录非零行：入职块 B/C，离职块 E/F，原因块只剩“未填写”
    expect([chartVal('B3'), chartVal('C3')]).toEqual(['生产部', 1])
    expect([chartVal('E3'), chartVal('F3')]).toEqual(['生产部', 1])
    expect(chartVal('D3')).toEqual('')
    expect([chartVal('B45'), chartVal('C45'), chartVal('D45')]).toEqual(['未填写', '-', 1])
    expect(chartVal('B46')).toEqual('')

    const text = (name) => new TextDecoder().decode(unzipSync(new Uint8Array(result))[name])
    const parts = Object.keys(unzipSync(new Uint8Array(result)))
    for (const part of [
      'xl/charts/chart1.xml',
      'xl/charts/chart2.xml',
      'xl/charts/chart3.xml',
      'xl/drawings/drawing1.xml',
      'xl/drawings/_rels/drawing1.xml.rels',
      'xl/worksheets/_rels/sheet2.xml.rels',
    ]) {
      expect(parts).toContain(part)
    }
    expect(text('[Content_Types].xml')).toContain('/xl/charts/chart1.xml')
    expect(text('[Content_Types].xml')).toContain('/xl/drawings/drawing1.xml')
    expect(text('xl/worksheets/sheet2.xml')).toContain('<drawing r:id="rId1"/>')
    // 引用区间收窄到非零行；数据标签开关显式写全（缺省项在 Excel 里曾被展开成“系列1,”前缀）
    expect(text('xl/charts/chart1.xml')).toContain("图表数据'!$B$3:$B$3")
    expect(text('xl/charts/chart1.xml')).toContain("图表数据'!$C$3:$C$3")
    expect(text('xl/charts/chart2.xml')).toContain("图表数据'!$E$3:$E$3")
    expect(text('xl/charts/chart2.xml')).toContain("图表数据'!$F$3:$F$3")
    expect(text('xl/charts/chart3.xml')).toContain("图表数据'!$B$45:$B$45")
    expect(text('xl/charts/chart3.xml')).toContain("图表数据'!$D$45:$D$45")
    expect(text('xl/charts/chart1.xml')).toContain('<showSerName val="0"')
    expect(text('xl/charts/chart1.xml')).toContain('<showVal val="0"')
    expect(text('xl/charts/chart1.xml')).not.toContain('<legend')
    expect(text('xl/charts/chart2.xml')).not.toContain('<legend')
    expect(text('xl/charts/chart3.xml')).not.toContain('<legend')
    // “未填写”是原因压缩后第 1 行（下标 0），红色点跟随
    expect(text('xl/charts/chart3.xml')).toContain('<dPt><idx val="0"')
    expect(state.headers['Content-Type']).toContain('spreadsheetml.sheet')
    expect(decodeURIComponent(state.headers['Content-Disposition'].split("''")[1])).toContain('入离职汇总_2026-08-17-2026-08-23.xlsx')
  })

  it('rejects unauthenticated and invalid date requests', async () => {
    state.session = null
    await expect(handler({})).resolves.toEqual({ code: 401, msg: '登录状态已过期' })
    expect(state.pool.query).not.toHaveBeenCalled()

    state.session = { userId: 2 }
    state.body = { startDate: '2026/08/17' }
    await expect(handler({})).resolves.toEqual({ code: 500, msg: '开始日期格式应为 YYYY-MM-DD' })
    expect(state.pool.query).not.toHaveBeenCalled()
  })

  it('rejects authenticated users without the page permission', async () => {
    state.permission = false
    await expect(handler({})).resolves.toEqual({ code: 403, msg: '没有权限访问该接口' })
    expect(state.pool.query).not.toHaveBeenCalled()
  })
})
