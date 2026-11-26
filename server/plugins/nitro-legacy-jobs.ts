import { NITRO_JOBS } from '../utils/nitro-jobs/registry'
import { isNitroJobEnabled as enabled } from '../utils/nitro-jobs/types'
import { skipHeavySchedulerInDev } from '../utils/nitro-jobs/dev-guard'

type State = { running: Set<string>, timers: ReturnType<typeof setTimeout>[], intervals: ReturnType<typeof setInterval>[] }
const g = globalThis as typeof globalThis & { __ctkNitroLegacyJobs?: State }

export default defineNitroPlugin((nitro) => {
  if (skipHeavySchedulerInDev('NitroJobs')) return
  if (g.__ctkNitroLegacyJobs) return
  const state: State = { running: new Set(), timers: [], intervals: [] }
  g.__ctkNitroLegacyJobs = state

  const runOne = async (key: string, dryRun: boolean) => {
    const def = NITRO_JOBS.find((j) => j.key === key)
    if (!def || state.running.has(key)) return
    state.running.add(key)
    try {
      const r = await def.run(dryRun)
      console.info(`[NitroJobs:${key}] dryRun=${r.dryRun} ${r.summary}`)
    } catch (e) {
      console.error(`[NitroJobs:${key}] failed:`, e)
    } finally {
      state.running.delete(key)
    }
  }

  // 调度任务永远只跑 dry-run（只看不写）；真写只走手动接口。
  // skipScheduler 的只进注册表（已有独立插件在跑，避免重复调度）。
  for (const def of NITRO_JOBS) {
    if (!def.intervalMs || def.skipScheduler) continue
    const initialDelayMs = Math.min(def.intervalMs, 60_000)
    state.timers.push(setTimeout(async () => {
      if (await enabled(def)) void runOne(def.key, true)
      state.intervals.push(setInterval(async () => {
        if (await enabled(def)) void runOne(def.key, true)
      }, Math.max(10_000, def.intervalMs)))
    }, Math.max(1000, initialDelayMs)))
  }

  nitro.hooks.hook('close', () => {
    for (const t of state.timers) clearTimeout(t)
    for (const i of state.intervals) clearInterval(i)
    if (g.__ctkNitroLegacyJobs === state) delete g.__ctkNitroLegacyJobs
  })

  console.info(`[NitroJobs] plugin loaded jobs=${NITRO_JOBS.length} (all default OFF, scheduler dry-run only)`)
})
