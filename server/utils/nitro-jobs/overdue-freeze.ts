import { defineJob } from './types'
import { queryCustomerOverdueAr } from '../customer-overdue-ar'

/**
 * 115 逾期客户自动冻结出库 TkTask.autoFreezeOverdueCustomers 原每天08:00
 * 注意旧行调用目标缺括号，原样保留在 oldTarget。
 * dry-run 只统计逾期客户数；冻结写入（freezeStatus/outstock）是危险操作，
 * 口径确认 + 单独授权前不执行。
 */
export const overdueFreezeJob = defineJob({
  key: 'overdueAutoFreeze',
  jobId: 115,
  name: '逾期客户自动冻结出库',
  oldTarget: 'TkTask.autoFreezeOverdueCustomers',
  nitroTarget: 'Nitro.overdueAutoFreeze()',
  intervalMs: 86_400_000,
  configKey: 'nitro.job.overdueAutoFreeze',
  envKey: 'NUXT_NITRO_JOB_OVERDUE_AUTO_FREEZE',
  async run(dryRun) {
    const result = await queryCustomerOverdueAr({})
    const list = Array.isArray((result as { rows?: unknown })?.rows)
      ? (result as { rows: any[] }).rows
      : []
    const frozen = list.filter((r) => r.freezeOutStock).length
    return {
      ok: true,
      dryRun: true,
      summary: `逾期客户${list.length}家，已冻结出库${frozen}家；冻结写入需口径确认+授权，暂不执行`,
      count: list.length,
      note: '需确认：逾期天数/金额阈值、排除名单（内部户/款到发货）、冻结后是否通知跟单',
    }
  },
})
