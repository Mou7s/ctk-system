import { defineJob } from './types'

/**
 * 108 更新企微审批信息 TkTask.saveApproveData() 原每小时
 * 原逻辑是从企微审批 API 拉取写入本地，Nitro 侧只有审批单的读写接口，
 * 拉取口径（哪些模板ID、增量方式）已丢失，占位不写库。
 */
export const approveSyncJob = defineJob({
  key: 'approveSync',
  jobId: 108,
  name: '更新企微审批信息',
  oldTarget: 'TkTask.saveApproveData()',
  nitroTarget: 'Nitro.approveSync()',
  intervalMs: 3_600_000,
  configKey: 'nitro.job.approveSync',
  envKey: 'NUXT_NITRO_JOB_APPROVE_SYNC',
  async run(dryRun) {
    return {
      ok: true,
      dryRun,
      summary: '企微审批拉取口径待补（模板ID/增量方式未知），当前只占位不写库',
      note: '需确认：同步哪些审批模板、全量还是增量、写哪张本地表',
    }
  },
})
