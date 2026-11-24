import { defineJob } from './types'
import { getMysqlPool, mysqlQueryOptions } from '../mysql'

/**
 * 107 发送消息到企微，匿名意见 TkTask.sendSuggestMsg() 原每天01:00
 * dry-run 只统计 tk_suggest 总数；推送目标人/模板待确认，不发送。
 */
export const suggestPushJob = defineJob({
  key: 'suggestPush',
  jobId: 107,
  name: '发送消息到企微，匿名意见',
  oldTarget: 'TkTask.sendSuggestMsg()',
  nitroTarget: 'Nitro.suggestPush()',
  intervalMs: 86_400_000,
  configKey: 'nitro.job.suggestPush',
  envKey: 'NUXT_NITRO_JOB_SUGGEST_PUSH',
  async run(dryRun) {
    const [rows] = await getMysqlPool().query<any[]>(
      mysqlQueryOptions('SELECT COUNT(*) AS c FROM tk_suggest'),
    )
    const total = Number(rows[0]?.c || 0)
    return {
      ok: true,
      dryRun: true,
      summary: `tk_suggest共${total}条；推送接收人/模板待确认，暂不发送`,
      count: total,
      note: '需确认：推给谁（企微userid列表）、推未处理还是全量、模板格式',
    }
  },
})
