import { getMysqlPool, mysqlQueryOptions } from '../utils/mysql'
import { skipHeavySchedulerInDev } from '../utils/nitro-jobs/dev-guard'
import { errorMessage } from '../utils/response'
import { ensureCacheTable } from '../utils/redis'

/**
 * 清理 sys_cache 里的过期键。
 *
 * 为什么需要它：换掉 Garnet 之前，过期键由缓存服务自己回收；MySQL 不会自动删除行，
 * 会话（1440 分钟）、验证码（120 秒）、幂等键（900 秒）过期后如果没人清理，
 * 表会一直长，在线用户/缓存监控页的统计也会被死键污染。
 *
 * 语义说明：过期判定本身在读取时按 NOW() 完成（server/utils/redis.ts），
 * 本任务只做物理回收，晚几分钟不影响正确性——所以失败只记日志，不重试、不告警。
 *
 * 不做开关：这是纯维护任务，不需要也不应该有业务开关。
 */
const CLEANUP_INTERVAL_MS = Number(process.env.NUXT_SYS_CACHE_CLEANUP_INTERVAL_MS || 5 * 60 * 1000)
const INITIAL_DELAY_MS = Number(process.env.NUXT_SYS_CACHE_CLEANUP_INITIAL_DELAY_MS || 60 * 1000)
/** 单批删除上限：避免一次删太多长时间占用连接。 */
const BATCH_LIMIT = 2000
/** 单轮最多删几批：防止表被意外写爆时一直循环。 */
const MAX_BATCHES = 20

type CleanupState = {
  timer?: ReturnType<typeof setInterval>
  initialTimer?: ReturnType<typeof setTimeout>
  running: boolean
  lastDeleted?: number
  lastRunAt?: string
}

type CleanupGlobal = typeof globalThis & { __ctkSysCacheCleanup?: CleanupState }

export default defineNitroPlugin(() => {
  if (skipHeavySchedulerInDev('NitroSysCacheCleanup')) return
  const globalState = globalThis as CleanupGlobal
  if (globalState.__ctkSysCacheCleanup) return
  const state: CleanupState = { running: false }
  globalState.__ctkSysCacheCleanup = state

  const run = async () => {
    if (state.running) return
    state.running = true
    try {
      await ensureCacheTable()
      const pool = getMysqlPool()
      let deleted = 0
      for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
        const [result] = await pool.query(
          mysqlQueryOptions('DELETE FROM sys_cache WHERE expire_time IS NOT NULL AND expire_time < NOW() LIMIT ?'),
          [BATCH_LIMIT],
        )
        const affected = Number((result as { affectedRows?: number })?.affectedRows ?? 0)
        deleted += affected
        if (affected < BATCH_LIMIT) break
      }
      state.lastDeleted = deleted
      state.lastRunAt = new Date().toLocaleString('zh-CN')
      if (deleted > 0) {
        console.info(`[NitroSysCacheCleanup] 清理过期键 ${deleted} 个`)
      }
    } catch (error) {
      console.error('[NitroSysCacheCleanup] failed:', errorMessage(error, '清理过期键失败'))
    } finally {
      state.running = false
    }
  }

  // 启动后先等一会（让服务先完成就绪），之后按间隔清理。
  state.initialTimer = setTimeout(() => {
    void run()
    state.timer = setInterval(() => void run(), CLEANUP_INTERVAL_MS)
    if (typeof state.timer.unref === 'function') state.timer.unref()
  }, INITIAL_DELAY_MS)
  if (typeof state.initialTimer.unref === 'function') state.initialTimer.unref()

  console.info(`[NitroSysCacheCleanup] scheduled every ${Math.round(CLEANUP_INTERVAL_MS / 1000)}s`)
})
