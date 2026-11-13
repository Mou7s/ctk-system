import { getMysqlPool, mysqlQueryOptions } from './mysql'
import { getNitroServerConfig, type NitroServerConfig } from './runtime'
import { errorMessage } from './response'

const configKeys = [
  'kingdee.serverUrl',
  'kingdee.serverUrlFallback',
  'kingdee.dCID',
  'kingdee.lCID',
  'kingdee.userName',
  'kingdee.appId',
  'kingdee.appSecret',
  'kingdee.connectTimeout',
  'kingdee.requestTimeout',
] as const

const globalState = globalThis as typeof globalThis & {
  __nitroK3ConfigPromise?: Promise<NitroServerConfig>
}

function configured(config: NitroServerConfig): boolean {
  return Boolean(config.k3BaseUrl && config.k3DbId && config.k3Username && config.k3AppId && config.k3AppSecret)
}

function numberOr(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

async function loadFromDatabase(base: NitroServerConfig): Promise<NitroServerConfig> {
  const [rows] = await getMysqlPool().query<{ config_key: string; config_value: string }[]>(mysqlQueryOptions(`
    SELECT config_key, config_value
    FROM sys_config
    WHERE config_key IN (${configKeys.map(() => '?').join(', ')})
  `), [...configKeys])
  const values = new Map(rows.map((row) => [String(row.config_key), String(row.config_value || '')]))
  const value = (key: typeof configKeys[number]) => values.get(key) || ''
  return {
    ...base,
    k3BaseUrl: base.k3BaseUrl || value('kingdee.serverUrl'),
    k3BaseUrlIntranet: base.k3BaseUrlIntranet || value('kingdee.serverUrlFallback'),
    k3DbId: base.k3DbId || value('kingdee.dCID'),
    k3Username: base.k3Username || value('kingdee.userName'),
    k3AppId: base.k3AppId || value('kingdee.appId'),
    k3AppSecret: base.k3AppSecret || value('kingdee.appSecret'),
    k3Lcid: base.k3Lcid !== 2052 ? base.k3Lcid : numberOr(value('kingdee.lCID'), base.k3Lcid),
    k3ConnectTimeoutMs: base.k3ConnectTimeoutMs !== 5000 ? base.k3ConnectTimeoutMs : numberOr(value('kingdee.connectTimeout'), base.k3ConnectTimeoutMs),
    k3RequestTimeoutMs: base.k3RequestTimeoutMs !== 30000 ? base.k3RequestTimeoutMs : numberOr(value('kingdee.requestTimeout'), base.k3RequestTimeoutMs),
  }
}

export async function getNitroK3Config(): Promise<NitroServerConfig> {
  const base = getNitroServerConfig()
  if (configured(base) || (!base.mysqlUrl && !base.mysqlHost)) return base
  if (!globalState.__nitroK3ConfigPromise) {
    globalState.__nitroK3ConfigPromise = loadFromDatabase(base).catch((error) => {
      console.error('[NitroK3Config] database fallback failed:', errorMessage(error, 'unknown error'))
      return base
    })
  }
  return globalState.__nitroK3ConfigPromise
}
