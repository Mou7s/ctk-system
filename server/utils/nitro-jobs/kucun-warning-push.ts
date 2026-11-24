import { defineJob } from './types'
import { runKucunWarningPush, readWarningReceivers } from './kucun-warning-send'
import { getMysqlPool, mysqlQueryOptions } from '../mysql'

/**
 * 112 金蝶库存上下限预警 TkTask.sendKucunWarningTask() 原每天08:00。
 * 真发送走每日 8 点插件（kucun-warning-push.ts）或手动 POST /monitor/nitroJobRun
 * {key:'kucunWarningPush', apply:'1'}；调度器永远只 dry-run（只统计不发）。
 */
export const kucunWarningPushJob = defineJob({
  key: 'kucunWarningPush',
  jobId: 112,
  name: '金蝶库存上下限预警',
  oldTarget: 'TkTask.sendKucunWarningTask()',
  nitroTarget: 'Nitro.kucunWarningPush()',
  intervalMs: 86_400_000,
  configKey: 'nitro.job.kucunWarningPush',
  envKey: 'NUXT_NITRO_JOB_KUCUN_WARNING_PUSH',
  async run(dryRun) {
    try {
      if (dryRun) {
        const [rows] = await getMysqlPool().query<any[]>(
          mysqlQueryOptions(`SELECT COUNT(*) AS total,
              SUM(CASE WHEN warning_status LIKE '%偏低%' OR warning_status LIKE '%安全%' THEN 1 ELSE 0 END) AS below
            FROM kucun_warning`),
        )
        const total = Number(rows[0]?.total || 0)
        const below = Number(rows[0]?.below || 0)
        const receivers = await readWarningReceivers()
        return {
          ok: true,
          dryRun: true,
          summary: `dry-run：快照 ${total} 行（偏低 ${below}），接收人 ${receivers.length} 人，未发送`,
          count: below,
        }
      }
      const r = await runKucunWarningPush()
      if (r.skipped) {
        return { ok: false, dryRun: false, summary: `跳过：${r.skipped}`, count: 0 }
      }
      const parts = [`发送成功 ${r.sent.length} 人`]
      if (r.failed.length) parts.push(`失败 ${r.failed.length} 人（${r.failed.map((f) => f.userId).join(',')}）`)
      return {
        ok: r.ok,
        dryRun: false,
        summary: `金蝶库存预警已推送：快照 ${r.totalCount} 行（偏低 ${r.belowCount}），${parts.join('，')}`,
        count: r.sent.length,
      }
    } catch (error) {
      return {
        ok: false,
        dryRun,
        summary: `金蝶库存预警推送失败：${String((error as Error)?.message || error).slice(0, 300)}`,
      }
    }
  },
})
