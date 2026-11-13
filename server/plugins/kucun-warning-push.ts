import { isNitroJobEnabled } from '../utils/nitro-jobs/types'
import { NITRO_JOB_MAP } from '../utils/nitro-jobs/registry'
import { errorMessage } from '../utils/response'
import { readWarningPushTime } from '../utils/nitro-jobs/kucun-warning-send'
import { shouldRunWarningPushAt, warningPushDateKey } from '../utils/nitro-jobs/kucun-warning-schedule'

/**
 * 112 金蝶库存上下限预警 · 每日自动推送（时间由 sys_config tk.kucun.warning.pushHour/pushMinute 控制，默认 08:00）。
 * - 开关：sys_config nitro.job.kucunWarningPush=1 或 NUXT_NITRO_JOB_KUCUN_WARNING_PUSH=1
 * - 每分钟对表一次，到点且当天未发过才触发（进程重启不重发）
 * - 发送幂等靠「当天已发」内存标记 + lastPushedAt 状态
 */
type SchedulerState = {
  timer?: ReturnType<typeof setInterval>
  lastRunDate: string
  running: boolean
  lastResult?: string
  lastRunAt?: string
}

type SchedulerGlobal = typeof globalThis & {
  __ctkKucunWarningPush?: SchedulerState
}

function todayKey(): string {
  return warningPushDateKey(new Date())
}

export default defineNitroPlugin((nitroApp) => {
  const globalState = globalThis as SchedulerGlobal
  if (globalState.__ctkKucunWarningPush) return
  const state: SchedulerState = { lastRunDate: '', running: false }
  globalState.__ctkKucunWarningPush = state

  const run = async (force: boolean) => {
    if (state.running) return
    const enabled = await isNitroJobEnabled(NITRO_JOB_MAP.get('kucunWarningPush')!)
    if (!enabled && !force) return
    state.running = true
    try {
      const def = NITRO_JOB_MAP.get('kucunWarningPush')!
      const result = await def.run(false) // apply = 真发送
      state.lastResult = result.summary
      state.lastRunAt = new Date().toLocaleString('zh-CN')
      state.lastRunDate = todayKey()
      console.info(`[NitroKucunWarningPush] ${result.ok ? 'sent' : 'failed'}: ${result.summary}`)
    } catch (error) {
      state.lastResult = errorMessage(error, '推送失败')
      console.error('[NitroKucunWarningPush] failed:', errorMessage(error, '金蝶库存预警推送失败'))
    } finally {
      state.running = false
    }
  }

  // 每分钟对表：到配置的播报时间且今天没发过 → 发（服务器重启在播报点之后也能补发当天一次）
  state.timer = setInterval(async () => {
    const now = new Date()
    let pushHour = 8
    let pushMinute = 0
    try {
      ({ hour: pushHour, minute: pushMinute } = await readWarningPushTime())
    } catch {
      /* 读取失败用默认 08:00 */
    }
    if (!shouldRunWarningPushAt(now, { hour: pushHour, minute: pushMinute }, state.lastRunDate)) return
    void run(false)
  }, 60_000)

  nitroApp.hooks.hook('close', () => {
    if (state.timer) clearInterval(state.timer)
    if (globalState.__ctkKucunWarningPush === state) delete globalState.__ctkKucunWarningPush
  })

  console.info('[NitroKucunWarningPush] scheduler loaded (daily 08:00, default OFF until nitro.job.kucunWarningPush=1)')
})
