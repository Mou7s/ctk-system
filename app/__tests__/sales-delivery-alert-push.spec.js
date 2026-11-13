import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ query: vi.fn(), settings: vi.fn(), load: vi.fn(), credentials: vi.fn(), upload: vi.fn(), send: vi.fn() }))
vi.mock('../../server/utils/mysql', () => ({ getMysqlPool: () => ({query:mocks.query}), mysqlQueryOptions: (sql) => sql }))
vi.mock('../../server/utils/sales-delivery-alert-read', () => ({ readDeliveryAlertSettings:mocks.settings, loadDeliveryAlerts:mocks.load }))
vi.mock('../../server/utils/nitro-jobs/kucun-warning-send', () => ({ readWecomConfig:mocks.credentials, uploadWarningExcelMedia:mocks.upload, sendFileToUser:mocks.send }))
import { runDailyDeliveryAlert } from '../../server/utils/sales-delivery-alert-push'

const now = new Date('2026-10-10T00:00:00Z')
describe('每日08:00调度与防重复发送', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.query.mockResolvedValue([{affectedRows:1}])
    mocks.settings.mockResolvedValue({enabled:true,totalReceivers:['boss']})
    mocks.load.mockResolvedValue({rows:[],settings:{enabled:true,totalReceivers:['boss']},invalidTotal:[],fetchedAt:now.toISOString(),plans:[{userid:'boss',name:'总表',total:true,rows:[]},{userid:'worker',name:'跟单',total:false,rows:[]}]})
    mocks.credentials.mockResolvedValue({})
    mocks.upload.mockResolvedValue('media')
    mocks.send.mockResolvedValue(undefined)
  })
  it('上海08:00前不取数不发送', async () => {
    expect(await runDailyDeliveryAlert(new Date('2026-10-09T23:59:59Z'))).toEqual({skipped:true})
    expect(mocks.query).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it('开关关闭不写日期锁', async () => {
    mocks.settings.mockResolvedValue({enabled:false})
    await runDailyDeliveryAlert(now)
    expect(mocks.query).not.toHaveBeenCalled()
  })
  it('先日期唯一锁再取新数据；逐人发不同附件', async () => {
    expect(await runDailyDeliveryAlert(now)).toMatchObject({sent:2,failed:0})
    expect(mocks.query.mock.calls[0][0]).toContain('INSERT IGNORE')
    expect(mocks.query.mock.calls[0][1]).toEqual(['2026-10-10'])
    expect(mocks.upload).toHaveBeenCalledTimes(2)
    expect(mocks.send.mock.calls.map(c => c[1])).toEqual(['boss','worker'])
  })
  it('服务重启/多个实例拿不到日期锁时不会重复发送', async () => {
    mocks.query.mockResolvedValue([{affectedRows:0}])
    expect(await runDailyDeliveryAlert(now)).toEqual({skipped:true})
    expect(mocks.load).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it('取数失败记录失败，不发送旧表', async () => {
    mocks.load.mockRejectedValue(new Error('金蝶查询超时'))
    expect(await runDailyDeliveryAlert(now)).toMatchObject({summary:'金蝶查询超时'})
    expect(mocks.send).not.toHaveBeenCalled()
    expect(mocks.query.mock.calls.at(-1)?.[0]).toContain("status='failed'")
  })
  it('总表接收人失效时阻止全部发送', async () => {
    const value = await mocks.load()
    mocks.load.mockResolvedValue({...value,invalidTotal:['boss']})
    await runDailyDeliveryAlert(now)
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it('发送超时记录结果不明，不重试该人，并继续下一人', async () => {
    mocks.send.mockRejectedValueOnce(new Error('请求超时')).mockResolvedValueOnce(undefined)
    expect(await runDailyDeliveryAlert(now)).toMatchObject({sent:1,failed:1})
    expect(mocks.send).toHaveBeenCalledTimes(2)
    expect(mocks.query.mock.calls.some(c => c[0].includes("'uncertain'"))).toBe(true)
  })
})

