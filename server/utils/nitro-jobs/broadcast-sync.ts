import { defineJob } from './types'
import { syncMusicPlan } from '../music-write'
import { fetchPlayer } from '../jukebox-client'

/**
 * 113 同步广播计划 TkTask.syncMusicBroadcastPlan() 原每5分钟
 * Nitro 侧真实逻辑已存在：syncMusicPlan() 同步计划 + 查播放器状态。
 * 唯一真接线的迁移任务；同样默认关闭，打开后每5分钟跑。
 */
export const broadcastSyncJob = defineJob({
  key: 'broadcastSync',
  jobId: 113,
  name: '同步广播计划',
  oldTarget: 'TkTask.syncMusicBroadcastPlan()',
  nitroTarget: 'Nitro.broadcastSync()',
  intervalMs: 300_000,
  configKey: 'nitro.job.broadcastSync',
  envKey: 'NUXT_NITRO_JOB_BROADCAST_SYNC',
  async run(dryRun) {
    if (dryRun) {
      return { ok: true, dryRun: true, summary: 'dry-run：未调用播放器，打开后将执行 syncMusicPlan+状态回查' }
    }
    const sync = await syncMusicPlan()
    let pull: unknown = null
    try {
      pull = await fetchPlayer('/api/schedule/status')
    } catch (e) {
      pull = { error: String((e as Error)?.message || e).slice(0, 200) }
    }
    return {
      ok: sync.ok,
      dryRun: false,
      summary: `同步计划ok=${sync.ok} scheduleCount=${sync.scheduleCount ?? '-'} pull=${JSON.stringify(pull).slice(0, 200)}`,
      count: sync.scheduleCount,
    }
  },
})
