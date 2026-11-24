// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref, watch } from 'vue'
import { useTkAutoRefresh } from '../packages/composables/useTkAutoRefresh.js'
import { useTkListQuery } from '../packages/composables/useTkListQuery.js'

describe('报价单审批状态自动刷新机制 (方案一)', () => {
  it('审核完成关闭详情：普通刷新与关闭监听的静默刷新重叠后恢复列表', async () => {
    const requests = []
    const detailOpen = ref(true)
    const query = useTkListQuery({
      queryParams: ref({ pageNum: 1, pageSize: 20 }),
      fetchList: () => new Promise(resolve => requests.push(resolve)),
    })
    let silentRefresh
    const stop = watch(detailOpen, (open, wasOpen) => {
      if (!open && wasOpen) silentRefresh = query.getList({ silent: true })
    })
    try {
      detailOpen.value = false
      const reviewRefresh = query.getList()
      await nextTick()
      expect(requests).toHaveLength(2)
      expect(query.loading.value).toBe(true)
      requests[1]({ code: 200, rows: [{ id: 101, status: 'APPROVED' }], total: 1 })
      await silentRefresh
      expect(query.loading.value).toBe(false)
      requests[0]({ code: 200, rows: [{ id: 101, status: 'PENDING_FINAL' }], total: 1 })
      await reviewRefresh
      expect(query.loading.value).toBe(false)
      expect(query.list.value[0].status).toBe('APPROVED')
    } finally {
      stop()
    }
  })

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('待审批单据（PENDING）在后台被审批后，轮询自动静默同步最新状态为 APPROVED', async () => {
    const queryParams = ref({ pageNum: 1, pageSize: 20 })
    let mockListResponse = {
      code: 200,
      rows: [
        { id: 101, quoteNo: 'QT20261029001', status: 'PENDING_FINAL', salespersonName: '业务员A' },
      ],
      total: 1,
    }

    const { list, loading, getList } = useTkListQuery({
      queryParams,
      fetchList: async () => mockListResponse,
    })

    // 初次加载
    await getList()
    expect(list.value[0].status).toBe('PENDING_FINAL')

    const hasPendingQuotations = () => list.value.some((row) => String(row.status || '').startsWith('PENDING_'))
    const canAutoRefresh = () => true

    const auto = useTkAutoRefresh({
      onRefresh: () => getList({ silent: true }),
      enabled: canAutoRefresh,
      pollWhen: hasPendingQuotations,
      intervalMs: 30_000,
      cooldownMs: 15_000,
    })
    auto.start()

    // 审批人在后台审批通过为 APPROVED
    mockListResponse = {
      code: 200,
      rows: [
        { id: 101, quoteNo: 'QT20261029001', status: 'APPROVED', salespersonName: '业务员A' },
      ],
      total: 1,
    }

    // 经过 30 秒轮询触发
    await vi.advanceTimersByTimeAsync(30_000)

    // 列表状态已自动刷新为 APPROVED，且 loading 从始至终没有变成 true（静默无闪烁）
    expect(list.value[0].status).toBe('APPROVED')
    expect(loading.value).toBe(false)

    // 此时已无待审单据，进一步计时不再发起定时轮询
    const spyFetch = vi.fn(async () => mockListResponse)
    const { getList: getList2 } = useTkListQuery({ queryParams, fetchList: spyFetch })
    const auto2 = useTkAutoRefresh({
      onRefresh: () => getList2({ silent: true }),
      enabled: () => true,
      pollWhen: () => false, // 无待审单据
      intervalMs: 30_000,
    })
    auto2.start()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(spyFetch).not.toHaveBeenCalled()

    auto.stop()
    auto2.stop()
  })

  it('业务员收到企微通知切回浏览器（窗口 focus / visibilitychange）时立即静默刷新', async () => {
    const queryParams = ref({ pageNum: 1, pageSize: 20 })
    let mockListResponse = {
      code: 200,
      rows: [
        { id: 102, quoteNo: 'QT20261029002', status: 'PENDING_INITIAL' },
      ],
      total: 1,
    }

    const { list, getList } = useTkListQuery({
      queryParams,
      fetchList: async () => mockListResponse,
    })

    await getList()
    expect(list.value[0].status).toBe('PENDING_INITIAL')

    const auto = useTkAutoRefresh({
      onRefresh: () => getList({ silent: true }),
      enabled: () => true,
      pollWhen: () => true,
      intervalMs: 30_000,
      cooldownMs: 10_000,
    })
    auto.start()

    // 审核人在后台退回单据
    mockListResponse = {
      code: 200,
      rows: [
        { id: 102, quoteNo: 'QT20261029002', status: 'RETURNED' },
      ],
      total: 1,
    }

    // 冷却时间后，用户切回窗口激活
    vi.advanceTimersByTime(11_000)
    window.dispatchEvent(new Event('focus'))
    await Promise.resolve()
    await Promise.resolve()

    expect(list.value[0].status).toBe('RETURNED')
    auto.stop()
  })

  it('编辑状态保护：用户打开新建/上传弹窗时暂停自动刷新，关闭后恢复', async () => {
    const uploadOpen = ref(true) // 用户正在编辑/上传
    const fetchList = vi.fn(async () => ({ code: 200, rows: [], total: 0 }))
    const queryParams = ref({ pageNum: 1, pageSize: 20 })
    const { getList } = useTkListQuery({ queryParams, fetchList })

    const auto = useTkAutoRefresh({
      onRefresh: () => getList({ silent: true }),
      enabled: () => !uploadOpen.value,
      pollWhen: () => true,
      intervalMs: 30_000,
      cooldownMs: 15_000,
    })
    auto.start()

    // 30秒后因为处于编辑态，不刷新
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetchList).not.toHaveBeenCalled()

    // 用户关闭弹窗，结束编辑
    uploadOpen.value = false
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetchList).toHaveBeenCalledTimes(1)

    auto.stop()
  })
})
