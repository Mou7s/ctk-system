import { NITRO_JOB_MAP } from '../utils/nitro-jobs/registry'
import { isNitroJobEnabled, type NitroJobDef } from '../utils/nitro-jobs/types'
import { skipHeavySchedulerInDev } from '../utils/nitro-jobs/dev-guard'
import { errorMessage } from '../utils/response'

/**
 * 103 D栋库存同步（全量，每小时）+ 106 D栋库存同步（差异，每15分钟）自动真跑。
 * 还原旧 Java TkTask.updateAllKucun/updatePartKucun 的真实写入行为（迁移后曾长期 dry-run only，
 * 且差异沿用旧 5 分钟间隔，现放宽到 15 分钟）。
 * 开关（各管各的）：sys_config nitro.job.kucunFullSync=1 / nitro.job.kucunDiffSync=1，
 * 或 env NUXT_NITRO_JOB_KUCUN_FULL_SYNC / NUXT_NITRO_JOB_KUCUN_DIFF_SYNC=1。
 * 与统一 nitro-legacy-jobs 的 dry-run-only 约定不同：只读金蝶 + 写本地 kucun 表，
 * 无金蝶写、无外发副作用（参考 kucun-warning-snapshot 插件）。
 */
type JobState = {
  running: boolean
  timer?: ReturnType<typeof setInterval>
  lastResult?: string
  lastRunAt?: string
}

type SchedulerGlobal = typeof globalThis & {
  __ctkKucunSyncScheduler?: { full: JobState; diff: JobState }
}

const INITIAL_DELAY_MS = 60_000

async function runApply(key: string, state: JobState) {
  if (state.running) return
  const def: NitroJobDef | undefined = NITRO_JOB_MAP.get(key)
  if (!def) return
  state.running = true
  try {
    const result = await def.run(false) // apply = 真写库
    state.lastResult = result.summary
    state.lastRunAt = new Date().toLocaleString('zh-CN')
    console.info(`[NitroKucunSync:${key}] ${result.ok ? 'ok' : 'failed'}: ${result.summary}`)
  } catch (error) {
    console.error(`[NitroKucunSync:${key}] failed:`, errorMessage(error, '同步失败'))
  } finally {
    state.running = false
  }
}

function scheduleJob(key: string, state: JobState, timers: ReturnType<typeof setTimeout>[]) {
  const def = NITRO_JOB_MAP.get(key)
  if (!def || !def.intervalMs) return
  const intervalMs = Math.max(60_000, def.intervalMs)
  timers.push(setTimeout(() => {
    void (async () => {
      if (await isNitroJobEnabled(def)) await runApply(key, state)
    })()
    state.timer = setInterval(async () => {
      if (await isNitroJobEnabled(def)) await runApply(key, state)
    }, intervalMs)
  }, INITIAL_DELAY_MS))
  console.info(`[NitroKucunSync:${key}] scheduler loaded (every ${Math.round(intervalMs / 60000)}min apply, default OFF until ${def.configKey}=1)`)
}

export default defineNitroPlugin((nitroApp) => {
  if (skipHeavySchedulerInDev('NitroKucunSync')) return
  const globalState = globalThis as SchedulerGlobal
  if (globalState.__ctkKucunSyncScheduler) return
  const state = { full: { running: false }, diff: { running: false } }
  globalState.__ctkKucunSyncScheduler = state
  const timers: ReturnType<typeof setTimeout>[] = []

  scheduleJob('kucunFullSync', state.full, timers)
  scheduleJob('kucunDiffSync', state.diff, timers)

  nitroApp.hooks.hook('close', () => {
    for (const t of timers) clearTimeout(t)
    for (const s of [state.full, state.diff]) if (s.timer) clearInterval(s.timer)
    if (globalState.__ctkKucunSyncScheduler === state) delete globalState.__ctkKucunSyncScheduler
  })
})
