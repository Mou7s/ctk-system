import { defineJob } from './types'

/**
 * 111 获取7天内的审批消息 TkTask.saveApproveDataBySecond() 原每10秒
 * 与108同源，只是高频增量补拉。原高频轮询在 Nitro 下太重，
 * 迁移后默认关闭；即使打开也建议先降频（默认间隔已改为5分钟）。
 */
export const approve7dJob = defineJob({
  key: 'approveSync7d',
  jobId: 111,
  name: '获取7天内的审批消息',
  oldTarget: 'TkTask.saveApproveDataBySecond()',
  nitroTarget: 'Nitro.approveSync7d()',
  intervalMs: 300_000,
  configKey: 'nitro.job.approveSync7d',
  envKey: 'NUXT_NITRO_JOB_APPROVE_SYNC_7D',
  async run(dryRun) {
    return {
      ok: true,
      dryRun,
      summary: '与108同源，拉取口径待补；原10秒间隔已降为5分钟，当前只占位不写库',
      note: '需与108一起确认口径；确认前不要打开',
    }
  },
})
