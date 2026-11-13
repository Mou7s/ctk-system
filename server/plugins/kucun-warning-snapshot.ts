import { isNitroJobEnabled } from '../utils/nitro-jobs/types'
import { NITRO_JOB_MAP } from '../utils/nitro-jobs/registry'
import { skipHeavySchedulerInDev } from '../utils/nitro-jobs/dev-guard'
import { errorMessage } from '../utils/response'

/**
 * 116 同步金蝶库存预警快照 · 每 30 分钟自动执行（对齐 sys_job 116 原 cron 0 0/30 * * * ?）。
 * 开关：sys_config nitro.job.kucunWarningSnapshot=1 或 NUXT_NITRO_JOB_KUCUN_WARNING_SNAPSHOT=1。
 * 与 nitro-legacy-jobs 的 dry-run-only 约定不同：本任务只「读金蝶 + 写本地快照」，
 * 无金蝶写、无外发副作用，调度真跑是安全的（与 112 的企微外发性质不同，故独立插件）。
 */
type SchedulerState = {
  timer?: ReturnType<typeof setInterval>
  running: boolean
  lastResult?: string
  lastRunAt?: string
}

type SchedulerGlobal = typeof globalThis & {
  __ctkKucunWarningSnapshot?: SchedulerState
}

export default defineNitroPlugin((nitroApp) => {
  if (skipHeavySchedulerInDev('NitroKucunWarningSnapshot')) return
  const globalState = globalThis as SchedulerGlobal
  if (globalState.__ctkKucunWarningSnapshot) return
  const state: SchedulerState = { running: false }
  globalState.__ctkKucunWarningSnapshot = state

  const run = async () => {
    if (state.running) return
    state.running = true
    try {
      const def = NITRO_JOB_MAP.get('kucunWarningSnapshot')!
      const result = await def.run(false) // apply = 真同步
      state.lastResult = result.summary
      state.lastRunAt = new Date().toLocaleString('zh-CN')
      console.info(`[NitroKucunWarningSnapshot] ${result.ok ? 'ok' : 'failed'}: ${result.summary}`)
    } catch (error) {
      console.error('[NitroKucunWarningSnapshot] failed:', errorMessage(error, '快照同步失败'))
    } finally {
      state.running = false
    }
  }

  // 启动后先等 1 分钟再对表开关，之后每 30 分钟一轮
  const initialTimer = setTimeout(() => {
    void (async () => {
      if (await isNitroJobEnabled(NITRO_JOB_MAP.get('kucunWarningSnapshot')!)) await run()
    })()
    state.timer = setInterval(async () => {
      if (await isNitroJobEnabled(NITRO_JOB_MAP.get('kucunWarningSnapshot')!)) await run()
    }, 1_800_000)
  }, 60_000)

  nitroApp.hooks.hook('close', () => {
    clearTimeout(initialTimer)
    if (state.timer) clearInterval(state.timer)
    if (globalState.__ctkKucunWarningSnapshot === state) delete globalState.__ctkKucunWarningSnapshot
  })

  console.info('[NitroKucunWarningSnapshot] scheduler loaded (every 30min, default OFF until nitro.job.kucunWarningSnapshot=1)')
})
