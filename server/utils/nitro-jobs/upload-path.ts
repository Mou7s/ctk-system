import { defineJob } from './types'
import { getNitroServerConfig } from '../runtime'

/**
 * 114 UpdateUploadPath 配置检查任务
 * 这不是业务任务，只是把上传目录写进配置。Nitro 下对应
 * NUXT_PROFILE_PATH / local.env，改完重启生效，无需调度。
 */
export const uploadPathJob = defineJob({
  key: 'uploadPath',
  jobId: 114,
  name: 'UpdateUploadPath',
  oldTarget: 'legacy.setProfile(uploadPath)',
  nitroTarget: 'Nitro.uploadPath()',
  intervalMs: 0,
  configKey: 'nitro.job.uploadPath',
  envKey: 'NUXT_NITRO_JOB_UPLOAD_PATH',
  async run(dryRun) {
    const cfg = getNitroServerConfig()
    return {
      ok: true,
      dryRun,
      summary: `当前上传目录=${cfg.profilePath}（改 local.env NUXT_PROFILE_PATH 后重启生效，无需定时跑）`,
    }
  },
})
