import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useTkListQuery } from '../../packages/composables/useTkListQuery.js'

/** 手动可控的 promise，用来制造「旧请求后到」的竞态 */
function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useTkListQuery', () => {
  it.each(['success', 'business-error', 'network-error'])('审核关闭弹窗触发静默刷新时，最新请求以 %s 结束也必须解除加载', async (outcome) => {
    const requests = [deferred(), deferred()]
    let call = 0
    const query = useTkListQuery({
      queryParams: ref({ pageNum: 1, pageSize: 20 }),
      fetchList: () => requests[call++].promise,
    })
    const foreground = query.getList()
    const background = query.getList({ silent: true })
    expect(query.loading.value).toBe(true)
    // 旧请求先完成也不能替最新请求结束加载。
    requests[0].resolve({ code: 200, rows: [{ id: 'stale' }], total: 1 })
    await foreground
    expect(query.loading.value).toBe(true)
    if (outcome === 'network-error') requests[1].reject(new Error('网络异常'))
    else requests[1].resolve(outcome === 'success'
      ? { code: 200, rows: [{ id: 'latest' }], total: 1 }
      : { code: 502, msg: '查询失败' })
    await background
    expect(query.loading.value).toBe(false)
    expect(query.list.value).toEqual(outcome === 'success' ? [{ id: 'latest' }] : [])
    expect(query.error.value).toBe(null)
  })

  it('正常路径：写入 rows/total、跑 afterLoad、loading 复位、error 清空', async () => {
    const queryParams = ref({ pageNum: 2, pageSize: 20 })
    const afterLoad = vi.fn()
    const query = useTkListQuery({
      queryParams,
      fetchList: async () => ({ code: 200, rows: [{ id: 1 }], total: 3 }),
      afterLoad,
    })

    await query.getList()

    expect(query.list.value).toEqual([{ id: 1 }])
    expect(query.total.value).toBe(3)
    expect(afterLoad).toHaveBeenCalledTimes(1)
    expect(query.loading.value).toBe(false)
    expect(query.error.value).toBe(null)
  })

  it('code 非 200（401/502）时不把失败当空表：保留旧数据、跳过 afterLoad、记录 error', async () => {
    const queryParams = ref({ pageNum: 1, pageSize: 20 })
    const afterLoad = vi.fn()
    let response = { code: 200, rows: [{ id: 1 }], total: 1 }
    const query = useTkListQuery({
      queryParams,
      fetchList: async () => response,
      afterLoad,
    })

    await query.getList()
    expect(query.list.value).toEqual([{ id: 1 }])

    response = { code: 401, msg: '登录状态已过期' }
    await query.getList()

    expect(query.list.value).toEqual([{ id: 1 }])
    expect(query.total.value).toBe(1)
    expect(afterLoad).toHaveBeenCalledTimes(1)
    expect(query.error.value).toBe('登录状态已过期')
    expect(query.loading.value).toBe(false)
  })

  it('旧请求晚于新请求返回时不覆盖结果，loading 由最后一次请求收尾', async () => {
    const queryParams = ref({ pageNum: 1, pageSize: 20 })
    const slow = deferred()
    const slowCall = vi.fn(() => slow.promise)
    let call = 0
    const query = useTkListQuery({
      queryParams,
      fetchList: async () => {
        call += 1
        return call === 1 ? slowCall() : { code: 200, rows: [{ id: 'new' }], total: 1 }
      },
    })

    const first = query.getList()
    const second = query.getList()
    await second

    expect(query.list.value).toEqual([{ id: 'new' }])
    expect(query.loading.value).toBe(false)

    slow.resolve({ code: 200, rows: [{ id: 'old' }], total: 9 })
    await first

    expect(query.list.value).toEqual([{ id: 'new' }])
    expect(query.total.value).toBe(1)
    expect(query.loading.value).toBe(false)
  })

  it('handleQuery/resetQuery 回到第一页并先跑 beforeReset', async () => {
    const queryParams = ref({ pageNum: 5, pageSize: 20 })
    const beforeReset = vi.fn()
    const fetchList = vi.fn(async () => ({ code: 200, rows: [], total: 0 }))
    const query = useTkListQuery({ queryParams, fetchList, beforeReset })

    await query.handleQuery()
    expect(queryParams.value.pageNum).toBe(1)

    queryParams.value.pageNum = 4
    await query.resetQuery()
    expect(beforeReset).toHaveBeenCalledTimes(1)
    expect(queryParams.value.pageNum).toBe(1)
  })

  it('fetchList 抛错时不冒泡（既有页面多为裸 getList()，抛错会变成 unhandled rejection）', async () => {
    const query = useTkListQuery({
      queryParams: ref({ pageNum: 1, pageSize: 20 }),
      fetchList: async () => {
        throw new Error('网络连接异常')
      },
    })

    await expect(query.getList()).resolves.toBeUndefined()
    expect(query.error.value).toBe('网络连接异常')
    expect(query.list.value).toEqual([])
    expect(query.loading.value).toBe(false)
  })

  it('silent 模式下不翻转 loading 且静默忽略失败，但成功时仍更新数据', async () => {
    const queryParams = ref({ pageNum: 1, pageSize: 20 })
    let response = { code: 200, rows: [{ id: 1, status: 'PENDING_INITIAL' }], total: 1 }
    const query = useTkListQuery({
      queryParams,
      fetchList: async () => response,
    })

    await query.getList()
    expect(query.list.value[0].status).toBe('PENDING_INITIAL')

    // 审批后 silent 刷新
    response = { code: 200, rows: [{ id: 1, status: 'APPROVED' }], total: 1 }
    expect(query.loading.value).toBe(false)
    const silentPromise = query.getList({ silent: true })
    // silent 时 loading 依然是 false，不闪烁骨架屏
    expect(query.loading.value).toBe(false)
    await silentPromise
    expect(query.list.value[0].status).toBe('APPROVED')
    expect(query.loading.value).toBe(false)
  })
})
