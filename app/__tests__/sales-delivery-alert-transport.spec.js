import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendFileToUser } from '../../server/utils/nitro-jobs/kucun-warning-send'
const fetchMock = vi.fn()
describe('企微附件发送响应校验', () => {
  beforeEach(() => {
    delete globalThis.__kucunWarningWecomToken
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValueOnce({ok:true,json:async()=>({errcode:0,access_token:'test-token',expires_in:7200})})
  })
  it('真实userid原样用于touser，不由姓名转换', async () => {
    fetchMock.mockResolvedValueOnce({ok:true,json:async()=>({errcode:0})})
    await sendFileToUser({corpId:'test',corpSecret:'test',agentId:1},'987654','media')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({touser:'987654',msgtype:'file',file:{media_id:'media'}})
  })
  it('HTTP成功但没有有效响应不能算送达', async () => {
    fetchMock.mockResolvedValueOnce({ok:true,json:async()=>null})
    await expect(sendFileToUser({corpId:'test',corpSecret:'test',agentId:1},'u','m')).rejects.toThrow('失败')
  })
  it('errcode=0但invaliduser包含目标成员也算失败', async () => {
    fetchMock.mockResolvedValueOnce({ok:true,json:async()=>({errcode:0,invaliduser:'u'})})
    await expect(sendFileToUser({corpId:'test',corpSecret:'test',agentId:1},'u','m')).rejects.toThrow('接收人无效')
  })
})
