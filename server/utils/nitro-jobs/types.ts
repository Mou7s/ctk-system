/**
 * 旧 sys_job(TkTask.*) 迁移到 Nitro 的统一注册表类型。
 * 约定：Nitro.<key>()，key 对应本目录下 <key>.ts。
 * 全部默认关闭：sys_config nitro.job.<key>=1 或 env NUXT_NITRO_JOB_<KEY>=1 才跑。
 */

export type NitroJobResult = {
  ok: boolean
  dryRun: boolean
  summary: string
  count?: number
  note?: string
}

export type NitroJobDef = {
  /** 注册表 key，同时是 Nitro.<key>() 的 key */
  key: string
  /** 旧 sys_job 任务编号 */
  jobId: number
  name: string
  oldTarget: string
  nitroTarget: string
  /** 调度间隔毫秒；0 = 仅手动，不自动调度（如纯配置项） */
  intervalMs: number
  /** true = 只进注册表（手动触发+列表展示），不进统一调度（已有独立插件在跑） */
  skipScheduler?: boolean
  configKey: string
  envKey: string
  run: (dryRun: boolean) => Promise<NitroJobResult>
}

export async function isNitroJobEnabled(def: NitroJobDef): Promise<boolean> {
  if (['1', 'true', 'yes', 'on'].includes(String(process.env[def.envKey] || '').toLowerCase())) return true
  try {
    const { getMysqlPool, mysqlQueryOptions } = await import('../mysql')
    const [rows] = await getMysqlPool().query<any[]>(
      mysqlQueryOptions('SELECT config_value FROM sys_config WHERE config_key = ? LIMIT 1'),
      [def.configKey],
    )
    return String(rows[0]?.config_value || '').trim() === '1'
  } catch {
    return false
  }
}

export function defineJob(def: NitroJobDef): NitroJobDef {
  return def
}
