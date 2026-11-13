import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ auth:vi.fn(), query:vi.fn(), load:vi.fn(), httpQuery: { recipient: 'other' } }))
vi.mock('../../server/utils/auth', async importOriginal => ({ ...await importOriginal(), getAuthSession:state.auth }))
vi.mock('../../server/utils/mysql', () => ({getMysqlPool:() => ({query:state.query}),mysqlQueryOptions:(sql)=>sql}))
vi.mock('../../server/utils/sales-delivery-alert-read', async importOriginal => ({...await importOriginal(),loadDeliveryAlerts:state.load}))
vi.mock('h3', async importOriginal => ({...await importOriginal(),getQuery:() => state.httpQuery}))
import { deliveryAlertRead } from '../../server/utils/sales-delivery-alert-http'
import { DELIVERY_ALERT_SQL, scopeDeliveryRows } from '../../server/utils/sales-delivery-alert-read'
import { prepareDeliveryRows } from '../../server/utils/sales-delivery-alert-model'
import XLSX from 'xlsx-js-style'

const row = (id) => ({entryId:1,recipients:[id]})
const members = [{name:'本人',userid:'random-id'},{name:'其他',userid:'other'}]
const session = () => ({userId:2,userName:'account',permissions:['tk_custom:deliveryAlert:list'],user:{nickName:'本人'}})
describe('交期预警权限与个人数据隔离', () => {
  it('候选排除整单关闭、行业务关闭和业务终止，不能只按未出库量判断', () => {
    expect(DELIVERY_ALERT_SQL).toContain("o.FCLOSESTATUS='A'")
    expect(DELIVERY_ALERT_SQL).toContain("e.FMRPCLOSESTATUS='A'")
    expect(DELIVERY_ALERT_SQL).toContain("e.FMRPTERMINATESTATUS='A'")
    expect(DELIVERY_ALERT_SQL).not.toContain('e.FTERMINATESTATUS')
    expect(DELIVERY_ALERT_SQL).toContain('r.FREMAINOUTQTY>0')
  })
  beforeEach(() => {vi.clearAllMocks();state.httpQuery = {recipient:'other'};state.load.mockResolvedValue({rows:[row('random-id'),row('other')],members,plans:[],fetchedAt:'2026-10-10T00:00:00Z'})})
  it('逾期统计在分页前计算，生产筛选与Excel导出一致', async () => {
    state.auth.mockResolvedValue({ session: { ...session(), userId: 1 } })
    const base = { billNo: 'SO', seq: 1, qty: 100, shippedQty: 20, remainingQty: 80, dueDate: '2026-10-09', productionReliable: 1 }
    const rows = prepareDeliveryRows([
      { ...base, entryId: 1, instockedQty: 100 },
      { ...base, entryId: 2, instockedQty: 80 },
      { ...base, entryId: 3, productionReliable: 0 },
    ], [], new Date('2026-10-10T00:00:00Z'))
    state.load.mockResolvedValue({ rows, members, plans: [], fetchedAt: '2026-10-10T00:00:00Z' })
    state.httpQuery = { status: '逾期', pageSize: 1 }
    expect(await deliveryAlertRead({}, 'list')).toMatchObject({ code: 200, total: 3,
      summary: { overdue: 3, overdueReady: 1, overdueUnfinished: 1, overdueUnknown: 1 } })
    state.httpQuery = { status: '逾期', production: '生产未完成' }
    const response = await deliveryAlertRead({}, 'list')
    expect(response.total).toBe(1)
    expect(response.rows[0].entryId).toBe(2)
    const buffer = await deliveryAlertRead({ node: { res: { setHeader: vi.fn(), getHeader: vi.fn() } } }, 'export')
    const book = XLSX.read(buffer, { type: 'array' })
    const sheet = book.Sheets[book.SheetNames[0]]
    expect(sheet.S4.v).toBe(response.rows[0].productionStatus)
    expect(sheet.V4.v).toBe(20)
    expect(sheet['!autofilter'].ref).toBe('A3:X4')
  })
  it('未登录拒绝，不读取金蝶', async () => {
    state.auth.mockResolvedValue(null)
    expect(await deliveryAlertRead({},'list')).toMatchObject({code:401})
    expect(state.load).not.toHaveBeenCalled()
  })
  it('无页面权限拒绝', async () => {
    state.auth.mockResolvedValue({session:{...session(),permissions:[]}})
    expect(await deliveryAlertRead({},'list')).toMatchObject({code:403})
  })
  it('个人用户不能篡改recipient导出别人的表', async () => {
    state.auth.mockResolvedValue({session:session()})
    expect(await deliveryAlertRead({},'export')).toMatchObject({code:403})
  })
  it('个人用户不能查看全员预览或总表接收人配置', async () => {
    state.auth.mockResolvedValue({session:session()})
    expect(await deliveryAlertRead({},'preview')).toMatchObject({code:403})
    expect(await deliveryAlertRead({},'settings')).toMatchObject({code:403})
  })
  it('暂时仅用户1开放，其他账号即使有通配权限也不能取数据', async () => {
    state.auth.mockResolvedValue({session:{...session(),permissions:['*:*:*']}})
    for (const action of ['list','export','preview','settings','logs']) {
      expect(await deliveryAlertRead({},action)).toMatchObject({code:403})
    }
    expect(state.load).not.toHaveBeenCalled()
  })
  it('只读本人数据，使用唯一姓名身份而非猜账号', () => {
    const rows=[row('random-id'),row('other')]
    expect(scopeDeliveryRows(rows,members,session())).toEqual([rows[0]])
    expect(scopeDeliveryRows(rows,[...members,{name:'本人',userid:'dup'}],session())).toEqual([])
    expect(scopeDeliveryRows(rows,members,{...session(),userId:1})).toEqual(rows)
  })
  it('销售经理可查看全员发送预览，但不能查看或修改提醒设置', async () => {
    state.auth.mockResolvedValue({session:{...session(),roles:['sales_manager'],permissions:['tk_custom:deliveryAlert:list','tk_custom:deliveryAlert:all']}})
    expect(await deliveryAlertRead({},'preview')).toMatchObject({code:200})
    expect(await deliveryAlertRead({},'settings')).toMatchObject({code:403})
  })
  it('销售经理即使有通配权限也不能获取设置', async () => {
    state.auth.mockResolvedValue({session:{...session(),roles:['sales_manager'],permissions:['*:*:*']}})
    expect(await deliveryAlertRead({},'settings')).toMatchObject({code:403})
  })
})

