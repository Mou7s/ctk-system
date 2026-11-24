import { defineJob } from './types'
import { runKucunDiffSync } from './kucun-sync'

/**
 * 106 D栋库存同步（差异）TkTask.updatePartKucun() 原每5分钟，现每15分钟
 * 口径还原自退役 Java：按本地 MAX(sync_time) 拉 FModifyDate/FApproveDate 更大的单据，
 * 按分录内码幂等 upsert。
 * 真跑走独立插件 kucun-sync-scheduler（调度 apply）；统一 nitro-legacy-jobs 只干 dry-run，
 * 此处 skipScheduler 避免重复。手动仍走 POST /prod-api/monitor/nitroJobRun {key:'kucunDiffSync',apply:'1'}。
 */
export const kucunDiffJob = defineJob({
  key: 'kucunDiffSync',
  jobId: 106,
  name: 'D栋库存同步（差异）',
  oldTarget: 'TkTask.updatePartKucun()',
  nitroTarget: 'Nitro.kucunDiffSync()',
  intervalMs: 900_000,
  skipScheduler: true,
  configKey: 'nitro.job.kucunDiffSync',
  envKey: 'NUXT_NITRO_JOB_KUCUN_DIFF_SYNC',
  async run(dryRun) {
    try {
      return await runKucunDiffSync(dryRun)
    } catch (error) {
      return {
        ok: false,
        dryRun,
        summary: `差异同步失败：${String((error as Error)?.message || error).slice(0, 300)}`,
      }
    }
  },
})
