import { defineJob } from './types'
import { syncKucunWarningsFromK3 } from '../kucun-warning-sync'
import { getMysqlPool, mysqlQueryOptions } from '../mysql'
import { errorMessage } from '../response'

/**
 * 116 同步金蝶库存预警快照 TkTask.syncKucunWarningSnapshot() 原每30分钟。
 * 逻辑：调 syncKucunWarningsFromK3（金蝶只读查询安全库存 + 可参与预警即时库存，
 * 事务 DELETE+INSERT 写本地 kucun_warning）。dryRun 只对行数不写库；
 * 真写走手动 apply 或调度（本任务为读金蝶+写本地快照，无外部副作用，
 * 调度真写由插件统一开关控制，与其他任务 dry-run-only 约定不同——见插件内说明）。
 */
export const kucunSnapshotJob = defineJob({
  key: 'kucunWarningSnapshot',
  jobId: 116,
  name: '同步金蝶库存预警快照',
  oldTarget: 'TkTask.syncKucunWarningSnapshot',
  nitroTarget: 'Nitro.kucunWarningSnapshot()',
  intervalMs: 1_800_000,
  configKey: 'nitro.job.kucunWarningSnapshot',
  envKey: 'NUXT_NITRO_JOB_KUCUN_WARNING_SNAPSHOT',
  async run(dryRun) {
    try {
      if (dryRun) {
        const pool = getMysqlPool()
        const [rows] = await pool.query<any[]>(
          mysqlQueryOptions('SELECT COUNT(*) AS total, MAX(sync_time) AS lastSync FROM kucun_warning'),
        )
        const total = Number(rows[0]?.total || 0)
        const last = rows[0]?.lastSync ? String(rows[0].lastSync).slice(0, 19) : 'never'
        return {
          ok: true,
          dryRun: true,
          summary: `dry-run：当前快照 ${total} 行（最近同步 ${last}），未拉取金蝶`,
          count: total,
        }
      }
      const r = await syncKucunWarningsFromK3()
      return {
        ok: true,
        dryRun: false,
        summary: `快照已同步：金蝶 ${r.rows} 行（组织 ${r.stockOrgName}），sync_time=${r.syncTime}`,
        count: r.rows,
      }
    } catch (error) {
      return {
        ok: false,
        dryRun,
        summary: `快照同步失败：${errorMessage(error, '未知错误').slice(0, 300)}`,
      }
    }
  },
})
