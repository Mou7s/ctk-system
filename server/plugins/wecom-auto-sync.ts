import { getNitroServerConfig } from '../utils/runtime'
import { isNitroJobEnabled } from '../utils/nitro-jobs/types'
import { NITRO_JOB_MAP } from '../utils/nitro-jobs/registry'
import { skipHeavySchedulerInDev } from '../utils/nitro-jobs/dev-guard'
import { errorMessage } from '../utils/response'
import { runAutomaticWecomEmployeeSync } from '../utils/wecom-sync'

type SchedulerState = {
  running: boolean
  initialTimer?: ReturnType<typeof setTimeout>
  intervalTimer?: ReturnType<typeof setInterval>
}

type SchedulerGlobal = typeof globalThis & {
  __ctkWecomSyncScheduler?: SchedulerState
}

export default defineNitroPlugin((nitroApp) => {
  if (skipHeavySchedulerInDev('NitroWecomAutoSync')) return
  const config = getNitroServerConfig()
  if (!config.wecomAutoSyncEnabled) {
    console.info('[NitroWecomAutoSync] disabled by configuration')
    return
  }

  const globalState = globalThis as SchedulerGlobal
  if (globalState.__ctkWecomSyncScheduler) return

  const state: SchedulerState = { running: false }
  globalState.__ctkWecomSyncScheduler = state

  const run = async () => {
    if (state.running) return
    // 开关搬到定时任务页：sys_config nitro.job.wecomEmployeeSync（env NUXT_WECOM_AUTO_SYNC_ENABLED=0 仍可一票否决）
    const def = NITRO_JOB_MAP.get('wecomEmployeeSync')
    if (def && !(await isNitroJobEnabled(def))) {
      console.info('[NitroWecomAutoSync] skipped by nitro.job.wecomEmployeeSync=0')
      return
    }
    state.running = true
    try {
      const summary = await runAutomaticWecomEmployeeSync()
      if (!summary) {
        console.info('[NitroWecomAutoSync] skipped because another instance holds the lock')
      } else {
        console.info(
          `[NitroWecomAutoSync] completed: remote=${summary.remoteCount}, hire=${summary.hireCount}, leave=${summary.leaveCount}`,
        )
      }
    } catch (error) {
      console.error('[NitroWecomAutoSync] failed:', errorMessage(error, '企业微信自动同步失败'))
    } finally {
      state.running = false
    }
  }

  state.initialTimer = setTimeout(() => {
    void run()
    state.intervalTimer = setInterval(() => { void run() }, config.wecomAutoSyncIntervalMs)
  }, config.wecomAutoSyncInitialDelayMs)

  nitroApp.hooks.hook('close', () => {
    if (state.initialTimer) clearTimeout(state.initialTimer)
    if (state.intervalTimer) clearInterval(state.intervalTimer)
    if (globalState.__ctkWecomSyncScheduler === state) delete globalState.__ctkWecomSyncScheduler
  })
})
