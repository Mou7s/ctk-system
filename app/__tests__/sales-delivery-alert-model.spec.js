import { describe, expect, it } from 'vitest'
import XLSX from 'xlsx-js-style'
import { unzipSync, strFromU8 } from 'fflate'
import { matchMember, prepareDeliveryRows, recipientPlans, shanghaiClock, filterDeliveryRows } from '../../server/utils/sales-delivery-alert-model'
import { renderDeliveryAlertExcel } from '../../server/utils/sales-delivery-alert-export'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { readFileSync } from 'node:fs'
import { createTkApi } from '../packages/api/createTkApi'
import { canAccessStaticRoute, filterStaticNavigation, findStaticRoute, staticNavigation } from '../router/static-navigation'

const members = [{ name: '跟单甲', userid: '00123' }, { name: '业务乙', userid: 'NotPinyin' }, { name: '总表', userid: 'boss' }]
const now = new Date('2026-10-10T00:00:00Z')
const raw = (extra = {}) => ({ entryId: 1, billNo: 'SO1', seq: 1, customer: '客户', materialCode: 'M1', materialName: '=SUM(1)', specification: 'SPEC-123', productionOrderNos: 'MO001、MO002',
  unit: 'K', qty: 100, shippedQty: 20, remainingQty: 80, dueDate: '2026-10-09', seller: '业务乙', follow1: '跟单甲', follow2: '跟单甲', ...extra })

describe('销售交期预警业务与报表', () => {
  it('有跟单工作号时优先发送工作号，与通讯录顺序无关', () => {
    const contacts = [{ name: '示例甲', userid: 'personal' }, { name: '跟单示例甲', userid: 'work' }]
    expect(matchMember('示例甲', contacts)?.userid).toBe('work')
    expect(matchMember('示例甲', [...contacts].reverse())?.userid).toBe('work')
    expect(matchMember('跟单示例甲', contacts)?.userid).toBe('work')
    const rows = prepareDeliveryRows([raw({ seller: '示例甲', follow1: '跟单示例甲', follow2: '示例甲' })], contacts, now)
    expect(rows[0].recipients).toEqual(['work'])
  })
  it('无工作号时保持原账号，工作号重名时拒绝猜发', () => {
    const personal = { name: '示例甲', userid: 'personal' }
    expect(matchMember('示例甲', [personal])).toEqual(personal)
    expect(matchMember('示例甲', [personal, { name: '跟单示例甲', userid: 'work1' }, { name: '跟单示例甲', userid: 'work2' }])).toBeNull()
    expect(matchMember('', [personal])).toBeNull()
    expect(matchMember('示例', [personal])).toBeNull()
  })
  it('销售侧栏实际包含预警入口，并按权限过滤', () => {
    const route = findStaticRoute('/tk_custom/deliveryAlert')
    expect(route).toMatchObject({ component: 'tk_custom/deliveryAlert/index', meta: {title: '销售交期预警', permission: 'tk_custom:deliveryAlert:list'} })
    const admin = filterStaticNavigation(staticNavigation, {id:1,roles:[],permissions:[],menuIds:[]})
    expect(admin.find(r => r.path === '/__nav/salesManagement').children.some(r => r.path === route.path)).toBe(true)
    expect(canAccessStaticRoute({id:5,roles:[],permissions:['tk_custom:deliveryAlert:list'],menuIds:[]},route)).toBe(false)
    expect(canAccessStaticRoute({id:5,roles:['admin'],permissions:['*:*:*'],menuIds:[]},route)).toBe(false)
    expect(canAccessStaticRoute({id:5,roles:['sales_manager'],permissions:['tk_custom:deliveryAlert:list'],menuIds:[]},route)).toBe(true)
    expect(canAccessStaticRoute({id:5,roles:[],permissions:[],menuIds:[]},route)).toBe(false)
  })
  it('用上海日期判断逾期，不依赖服务器时区', () => {
    expect(shanghaiClock(new Date('2026-10-09T23:59:00Z'))).toEqual({ day: '2026-10-10', hour: 7, minute: 59 })
    expect(prepareDeliveryRows([raw()], members, now)[0]).toMatchObject({ daysLeft: -1, urgency: '逾期', remainingQty: 80 })
  })
  it('按交期排序，缺交期最后；同交期稳定按单号行号排', () => {
    const rows = prepareDeliveryRows([raw({entryId: 4, dueDate: null}), raw({entryId: 3, dueDate: '2026-10-11'}), raw({entryId: 2, dueDate: '2026-10-10'}), raw()], members, now)
    expect(rows.map(r => r.entryId)).toEqual([1,2,3,4])
    expect(rows[1].urgency).toBe('今天到期')
    expect(rows[3].issues).toContain('未回复交期')
  })
  it('两位跟单都匹配真实userid，同一个人只收一份', () => {
    const rows = prepareDeliveryRows([raw()], members, now)
    expect(rows[0].recipients).toEqual(['NotPinyin','00123'])
    const plans = recipientPlans(rows, members, ['boss'])
    expect(plans).toHaveLength(3)
    expect(plans.find(p => p.userid === 'boss')).toMatchObject({ total: true, rows })
  })
  it('同名和未匹配的人员不猜发，但订单保留在总表', () => {
    const duplicate = [...members, { name: '跟单甲', userid: 'dup' }]
    const rows = prepareDeliveryRows([raw({ seller: '陌生人' })], duplicate, now)
    expect(rows[0].recipients).toEqual([])
    expect(rows[0].issues).toContain('跟单甲：企微姓名未唯一匹配')
    expect(recipientPlans(rows, duplicate, ['boss'])[0].rows).toHaveLength(1)
  })
  it('总表接收人兼任负责人时只给总表，不再发个人重复表', () => {
    const rows = prepareDeliveryRows([raw()], members, now)
    expect(recipientPlans(rows, members, ['00123']).filter(p => p.userid === '00123')).toHaveLength(1)
    expect(recipientPlans(rows, members, ['00123']).find(p => p.userid === '00123')?.total).toBe(true)
  })
  it('个人表不会带出别人负责的明细；总表不丢未匹配明细', () => {
    const rows = prepareDeliveryRows([raw(), raw({entryId:2,seller:'未知',follow1:'',follow2:''})], members, now)
    const plans = recipientPlans(rows, members, ['boss'])
    expect(plans.find(p => p.userid === '00123')?.rows.map(r => r.entryId)).toEqual([1])
    expect(plans.find(p => p.userid === 'boss')?.rows).toHaveLength(2)
  })
  it('支持客户物料和负责人筛选，没有提醒窗口限制', () => {
    const rows = prepareDeliveryRows([raw({ dueDate: '2027-01-01' })], members, now)
    expect(filterDeliveryRows(rows, {status:'all'})).toHaveLength(1)
    expect(filterDeliveryRows(rows, {keyword:'m1',owner:'跟单甲'})).toHaveLength(1)
    expect(filterDeliveryRows(rows, {status:'逾期'})).toHaveLength(0)
    expect(filterDeliveryRows(rows, {keyword:'spec-123'})).toHaveLength(1)
    expect(filterDeliveryRows(rows, {keyword:'mo002'})).toHaveLength(1)
  })
  it('Excel可回读，部分出货数量和文本不变，不把物料文本当公式', () => {
    const rows = prepareDeliveryRows([raw()], members, now)
    const buffer = renderDeliveryAlertExcel(rows, '个人预警', now.toISOString())
    const book = XLSX.read(buffer, {type:'array'})
    const sheet = book.Sheets[book.SheetNames[0]]
    expect(sheet.L4.v).toBe(80)
    expect(sheet.K4.v).toBe(20)
    expect(sheet.H4).toMatchObject({v:'=SUM(1)',t:'s'})
    expect(sheet.H4.f).toBeUndefined()
    expect(sheet['!autofilter'].ref).toBe('A3:X4')
    expect(sheet.W4).toMatchObject({ v: 'SPEC-123', t: 's' })
    expect(sheet.X4).toMatchObject({ v: 'MO001、MO002', t: 's' })
    const xml = strFromU8(unzipSync(buffer)['xl/worksheets/sheet1.xml'])
    expect(xml).toContain('state="frozen"')
    expect(xml).toContain('topLeftCell="A4"')
  })
  it('空报表仍生成合法表头', () => {
    const book = XLSX.read(renderDeliveryAlertExcel([], '总表', now.toISOString()), {type:'array'})
    expect(book.Sheets[book.SheetNames[0]].A3.v).toBe('紧急程度')
  })
  it('累计入库扣掉已出货再覆盖未交量，部分出货不会误判完成', () => {
    const rows = prepareDeliveryRows([
      raw({ productionReliable: 1, instockedQty: 100 }),
      raw({ entryId: 2, productionReliable: 1, instockedQty: 80 }),
    ], members, now)
    expect(rows[0]).toMatchObject({ productionGroup: '已入库待发货', readyQty: 80, unfinishedQty: 0 })
    expect(rows[1]).toMatchObject({ productionGroup: '生产未完成', productionStatus: '生产未完成', readyQty: 60, unfinishedQty: 20 })
    expect(filterDeliveryRows(rows, { status: '逾期', production: '已入库待发货' }).map(r => r.entryId)).toEqual([1])
    expect(filterDeliveryRows(rows, { status: '今天到期', production: '已入库待发货' })).toEqual([])
  })
  it('未开工和生产中统一为生产未完成，入库超额时待发量不超过未交量', () => {
    const rows = prepareDeliveryRows([
      raw({ shippedQty: 0, remainingQty: 100, productionReliable: 1, instockedQty: 0, startedCount: 0 }),
      raw({ entryId: 2, shippedQty: 0, remainingQty: 100, productionReliable: 1, instockedQty: 0, startedCount: 1 }),
      raw({ entryId: 3, productionReliable: 1, instockedQty: 150 }),
    ], members, now)
    expect(rows.map(r => r.productionStatus)).toEqual(['生产未完成', '生产未完成', '已入库待发货'])
    expect(rows[2].readyQty).toBe(80)
  })
  it('无关联、单位异常、退货、勾稽异常或缺失数量均待核实，不把缺失当零', () => {
    const rows = prepareDeliveryRows([
      raw(), raw({ productionReliable: 0, instockedQty: 100 }),
      raw({ productionReliable: 1, instockedQty: null }),
      raw({ productionReliable: 1, instockedQty: 100, returnedQty: 1 }),
      raw({ productionReliable: 1, instockedQty: 100, remainingQty: 81 }),
      raw({ productionReliable: 1, instockedQty: -1 }),
    ], members, now)
    for (const row of rows) expect(row).toMatchObject({ productionGroup: '待核实', readyQty: null, unfinishedQty: null })
  })
  it('生产字段随个人表导出，保留数字及未知空值', () => {
    const rows = prepareDeliveryRows([raw({ productionReliable: 1, instockedQty: 80 }), raw({ entryId: 2 })], members, now)
    const book = XLSX.read(renderDeliveryAlertExcel(rows, '个人表', now.toISOString()), { type: 'array' })
    const sheet = book.Sheets[book.SheetNames[0]]
    expect(sheet.R4.v).toBe('生产未完成')
    expect(sheet.S4.v).toBe('生产未完成')
    expect(sheet.T4.v).toBe(80)
    expect(sheet.U4.v).toBe(60)
    expect(sheet.V4.v).toBe(20)
    expect(sheet.R5.v).toBe('待核实')
    expect(sheet.T5.v).toBe('')
  })
  it('退货和数量异常不会被简单相减掩盖', () => {
    const rows = prepareDeliveryRows([raw({shippedQty:100,returnedQty:20,remainingQty:20}),raw({entryId:2,remainingQty:81})], members, now)
    expect(rows[0].issues).toContain('存在退货，按金蝶剩余量跟进')
    expect(rows[0].issues.some(s => s.includes('勾稽'))).toBe(false)
    expect(rows[1].issues.some(s => s.includes('勾稽'))).toBe(true)
    const notReopened = prepareDeliveryRows([raw({returnedQty:20})], members, now)
    expect(notReopened[0].remainingQty).toBe(80)
    expect(notReopened[0].issues.some(s => s.includes('勾稽'))).toBe(false)
  })
  it('新页面脚本和模板可以编译', () => {
    const filename = 'app/pages/tk_custom/deliveryAlert/index.vue'
    const {descriptor,errors} = parse(readFileSync(filename,'utf8'), {filename})
    expect(errors).toEqual([])
    const script = compileScript(descriptor, {id:'delivery-alert'})
    expect(compileTemplate({source:descriptor.template.content,filename,id:'delivery-alert',compilerOptions:{bindingMetadata:script.bindings}}).errors).toEqual([])
  })
  it('公共API工厂连到新路由，不建立第二套鉴权客户端', async () => {
    const calls = []
    const api = createTkApi((options) => { calls.push(options); return Promise.resolve({code:200}) })
    await api.listDeliveryAlerts({pageNum:2})
    await api.exportDeliveryAlerts({recipient:'00123'})
    expect(calls[0]).toMatchObject({url:'/tk_custom/deliveryAlert/list',method:'get',params:{pageNum:2}})
    expect(calls[1]).toMatchObject({responseType:'blob',params:{recipient:'00123'}})
  })
})

