import { defineJob } from './types'
import { runKucunFullSync } from './kucun-sync'

/**
 * 103 D栋库存同步（全量）
 * 金蝶 SAL_OUTSTOCK + SAL_RETURNSTOCK（内部客户示例，退货数量取负）清表全插。
 * 调度只跑 dry-run；真写走 POST /prod-api/monitor/nitroJobRun {key:'kucunFullSync',apply:'1'}。
 * 自动真跑走独立插件 kucun-sync-scheduler，此处 skipScheduler 避免统一调度重复 dry-run。
 */
export const kucunFullJob = defineJob({
  key: 'kucunFullSync',
  jobId: 103,
  name: 'D栋库存同步（全量）',
  oldTarget: 'TkTask.updateAllKucun()',
  nitroTarget: 'Nitro.kucunFullSync()',
  intervalMs: 3_600_000,
  skipScheduler: true,
  configKey: 'nitro.job.kucunFullSync',
  envKey: 'NUXT_NITRO_JOB_KUCUN_FULL_SYNC',
  async run(dryRun) {
    try {
      return await runKucunFullSync(dryRun)
    } catch (error) {
      return {
        ok: false,
        dryRun,
        summary: `全量同步失败：${String((error as Error)?.message || error).slice(0, 300)}`,
      }
    }
  },
})
