import { defineJob } from './types'
import { runWecomEmployeeSync } from '../wecom-sync'

/**
 * 109 更新企微员工（通讯录）原 TkTask.syncWXUsers() 每小时
 * 真跑走独立插件 wecom-auto-sync（调度 apply）；统一 nitro-legacy-jobs 只干 dry-run，
 * 此处 skipScheduler 避免重复。手动仍走组织架构页或 POST /prod-api/monitor/nitroJobRun {key:'wecomEmployeeSync',apply:'1'}。
 */
export const wecomEmployeeSyncJob = defineJob({
  key: 'wecomEmployeeSync',
  jobId: 109,
  name: '更新企微员工（通讯录）',
  oldTarget: 'TkTask.syncWXUsers()',
  nitroTarget: 'Nitro.wecomEmployeeSync()',
  intervalMs: 3_600_000,
  skipScheduler: true,
  configKey: 'nitro.job.wecomEmployeeSync',
  envKey: 'NUXT_NITRO_JOB_WECOM_EMPLOYEE_SYNC',
  async run(dryRun) {
    try {
      const summary = await runWecomEmployeeSync({
        apply: !dryRun,
        operator: { userId: 1, userName: 'system' },
      })
      const preview = dryRun ? 'dry-run' : 'apply'
      return {
        ok: true,
        dryRun,
        summary: `${preview}：企微 ${summary.remoteCount} 人（新增约 ${summary.addedCount}，更新 ${summary.updatedCount}，离职 ${summary.leaveCount}）${dryRun ? '，未写库' : ''}`,
        count: summary.remoteCount,
      }
    } catch (error) {
      return {
        ok: false,
        dryRun,
        summary: `企微同步失败：${String((error as Error)?.message || error).slice(0, 300)}`,
      }
    }
  },
})
