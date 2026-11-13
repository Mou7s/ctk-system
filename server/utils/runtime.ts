import { homedir } from 'node:os'
import { join } from 'node:path'

// K3 SQL Server connection settings must be provided via runtimeConfig or environment variables.

export interface NitroServerConfig {
  authTokenSecret: string
  legacyTokenSecret: string
  tokenExpireMinutes: number
  mysqlUrl: string
  mysqlHost: string
  mysqlPort: number
  mysqlUser: string
  mysqlPassword: string
  mysqlDatabase: string
  /** 业务库备用入口（同一份数据的另一条网络路径，如 openp2p 隧道）；为空则不做故障切换。 */
  mysqlHostFallback: string
  mysqlConnectTimeoutMs: number
  mysqlQueryTimeoutMs: number
  /** 演示账号专用库（wfs_demo）：未配置时演示域直接报错，绝不回退到生产库。 */
  demoMysqlUrl: string
  demoMysqlHost: string
  demoMysqlPort: number
  demoMysqlUser: string
  demoMysqlPassword: string
  demoMysqlDatabase: string
  k3BaseUrl: string
  k3BaseUrlIntranet: string
  k3DbId: string
  k3Username: string
  k3Password: string
  k3AppId: string
  k3AppSecret: string
  k3Lcid: number
  k3ConnectTimeoutMs: number
  k3RequestTimeoutMs: number
  sqlServerK3Host: string
  sqlServerK3HostFallback: string
  sqlServerK3TlsServerName: string
  sqlServerK3Port: number
  sqlServerK3Database: string
  sqlServerK3User: string
  sqlServerK3Password: string
  sqlServerK3ConnectTimeoutMs: number
  sqlServerK3RequestTimeoutMs: number
  sqlServerK3PoolMax: number
  profilePath: string
  wxMpQrCodeUrl: string
  wecomAutoSyncEnabled: boolean
  wecomAutoSyncIntervalMs: number
  wecomAutoSyncInitialDelayMs: number
  jukeboxBaseUrl: string
  jukeboxTimeoutMs: number
  jukeboxMediaTimeoutMs: number
  jukeboxServiceToken: string
  jukeboxMediaBackupPath: string
  jukeboxFfprobePath: string
  attendanceMysqlHost: string
  attendanceMysqlPort: number
  attendanceMysqlUser: string
  attendanceMysqlPassword: string
  attendanceMysqlDatabase: string
}

function asNumber(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function parseJdbcMysqlUrl(value: string): { host: string; port: number; database: string } {
  if (!value) return { host: '', port: 3306, database: '' }

  try {
    const parsed = new URL(value.replace(/^jdbc:/i, ''))
    if (parsed.protocol !== 'mysql:') return { host: '', port: 3306, database: '' }

    return {
      host: parsed.hostname,
      port: asNumber(parsed.port, 3306),
      database: decodeURIComponent(parsed.pathname.replace(/^\/+/, '')),
    }
  } catch {
    return { host: '', port: 3306, database: '' }
  }
}

export function getNitroServerConfig(): NitroServerConfig {
  const config = useRuntimeConfig() as Record<string, unknown>
  const env = process.env
  const jdbcMysql = parseJdbcMysqlUrl(String(env.TK_MYSQL_URL || ''))
  const jdbcDemoMysql = parseJdbcMysqlUrl(String(env.NUXT_DEMO_MYSQL_URL || ''))
  const sqlServerK3Host = String(config.sqlServerK3Host || env.NUXT_SQLSERVER_K3_HOST || env.TK_SQLSERVER_HOST || '')
  const sqlServerK3HostFallback = String(
    config.sqlServerK3HostFallback
      || env.NUXT_SQLSERVER_K3_HOST_FALLBACK
      || env.TK_SQLSERVER_HOST_FALLBACK
      || '',
  )

  return {
    authTokenSecret: String(config.authTokenSecret || env.NUXT_AUTH_TOKEN_SECRET || env.TOKEN_SECRET || ''),
    legacyTokenSecret: String(config.legacyTokenSecret || env.NUXT_LEGACY_TOKEN_SECRET || env.TOKEN_SECRET || ''),
    tokenExpireMinutes: asNumber(config.tokenExpireMinutes || env.NUXT_TOKEN_EXPIRE_MINUTES, 1440),
    mysqlUrl: String(config.mysqlUrl || env.NUXT_MYSQL_URL || ''),
    mysqlHost: String(config.mysqlHost || env.NUXT_MYSQL_HOST || jdbcMysql.host),
    mysqlPort: asNumber(config.mysqlPort || env.NUXT_MYSQL_PORT, jdbcMysql.port),
    mysqlUser: String(config.mysqlUser || env.NUXT_MYSQL_USER || env.TK_MYSQL_USERNAME || ''),
    mysqlPassword: String(config.mysqlPassword || env.NUXT_MYSQL_PASSWORD || env.TK_MYSQL_PASSWORD || ''),
    mysqlDatabase: String(config.mysqlDatabase || env.NUXT_MYSQL_DATABASE || jdbcMysql.database),
    mysqlHostFallback: String(config.mysqlHostFallback || env.NUXT_MYSQL_HOST_FALLBACK || ''),
    mysqlConnectTimeoutMs: asNumber(config.mysqlConnectTimeoutMs || env.NUXT_MYSQL_CONNECT_TIMEOUT_MS, 5000),
    mysqlQueryTimeoutMs: asNumber(config.mysqlQueryTimeoutMs || env.NUXT_MYSQL_QUERY_TIMEOUT_MS, 10000),
    demoMysqlUrl: String(config.demoMysqlUrl || env.NUXT_DEMO_MYSQL_URL || ''),
    demoMysqlHost: String(config.demoMysqlHost || env.NUXT_DEMO_MYSQL_HOST || jdbcDemoMysql.host),
    demoMysqlPort: asNumber(config.demoMysqlPort || env.NUXT_DEMO_MYSQL_PORT, jdbcDemoMysql.port),
    demoMysqlUser: String(config.demoMysqlUser || env.NUXT_DEMO_MYSQL_USER || ''),
    demoMysqlPassword: String(config.demoMysqlPassword || env.NUXT_DEMO_MYSQL_PASSWORD || ''),
    demoMysqlDatabase: String(config.demoMysqlDatabase || env.NUXT_DEMO_MYSQL_DATABASE || jdbcDemoMysql.database),
    k3BaseUrl: String(config.k3BaseUrl || env.NUXT_K3_BASE_URL || ''),
    k3BaseUrlIntranet: String(config.k3BaseUrlIntranet || env.NUXT_K3_BASE_URL_INTRANET || ''),
    k3DbId: String(config.k3DbId || env.NUXT_K3_DBID || ''),
    k3Username: String(config.k3Username || env.NUXT_K3_USERNAME || ''),
    k3Password: String(config.k3Password || env.NUXT_K3_PASSWORD || ''),
    k3AppId: String(config.k3AppId || env.NUXT_K3_APP_ID || ''),
    k3AppSecret: String(config.k3AppSecret || env.NUXT_K3_APP_SECRET || ''),
    k3Lcid: asNumber(config.k3Lcid || env.NUXT_K3_LCID, 2052),
    k3ConnectTimeoutMs: asNumber(config.k3ConnectTimeoutMs || env.NUXT_K3_CONNECT_TIMEOUT_MS, 5000),
    k3RequestTimeoutMs: asNumber(config.k3RequestTimeoutMs || env.NUXT_K3_REQUEST_TIMEOUT_MS, 30000),
    sqlServerK3Host,
    sqlServerK3HostFallback,
    sqlServerK3TlsServerName: String(config.sqlServerK3TlsServerName || env.NUXT_SQLSERVER_K3_TLS_SERVER_NAME || env.TK_SQLSERVER_TLS_SERVER_NAME || ''),
    sqlServerK3Port: asNumber(config.sqlServerK3Port || env.NUXT_SQLSERVER_K3_PORT || env.TK_SQLSERVER_PORT, 1433),
    sqlServerK3Database: String(config.sqlServerK3Database || env.NUXT_SQLSERVER_K3_DATABASE || env.TK_SQLSERVER_DATABASE || ''),
    sqlServerK3User: String(config.sqlServerK3User || env.NUXT_SQLSERVER_K3_USER || env.NUXT_SQLSERVER_USERNAME || env.TK_SQLSERVER_USERNAME || ''),
    sqlServerK3Password: String(config.sqlServerK3Password || env.NUXT_SQLSERVER_K3_PASSWORD || env.NUXT_SQLSERVER_PASSWORD || env.TK_SQLSERVER_PASSWORD || ''),
    sqlServerK3ConnectTimeoutMs: asNumber(config.sqlServerK3ConnectTimeoutMs || env.NUXT_SQLSERVER_K3_CONNECT_TIMEOUT_MS, 5000),
    sqlServerK3RequestTimeoutMs: asNumber(config.sqlServerK3RequestTimeoutMs || env.NUXT_SQLSERVER_K3_REQUEST_TIMEOUT_MS, 30000),
    sqlServerK3PoolMax: asNumber(config.sqlServerK3PoolMax || env.NUXT_SQLSERVER_K3_POOL_MAX, 5),
    profilePath: String(env.NUXT_PROFILE_PATH || config.profilePath || join(process.cwd(), 'runtime', 'uploadPath')),
    wxMpQrCodeUrl: String(config.wxMpQrCodeUrl || env.NUXT_WX_MP_QR_CODE_URL || '/profile/upload/lucky/mp-qrcode.png'),
    wecomAutoSyncEnabled: !['0', 'false', 'off'].includes(String(config.wecomAutoSyncEnabled ?? env.NUXT_WECOM_AUTO_SYNC_ENABLED ?? '1').toLowerCase()),
    wecomAutoSyncIntervalMs: asNumber(config.wecomAutoSyncIntervalMs || env.NUXT_WECOM_AUTO_SYNC_INTERVAL_MS, 60 * 60 * 1000),
    wecomAutoSyncInitialDelayMs: asNumber(config.wecomAutoSyncInitialDelayMs || env.NUXT_WECOM_AUTO_SYNC_INITIAL_DELAY_MS, 30 * 1000),
    jukeboxBaseUrl: String(config.jukeboxBaseUrl || env.NUXT_JUKEBOX_API_BASE_URL || env.TK_JUKEBOX_API_BASE_URL || ''),
    jukeboxTimeoutMs: asNumber(config.jukeboxTimeoutMs || env.NUXT_JUKEBOX_TIMEOUT_MS, 10000),
    jukeboxMediaTimeoutMs: asNumber(config.jukeboxMediaTimeoutMs || env.NUXT_JUKEBOX_MEDIA_TIMEOUT_MS, 10 * 60 * 1000),
    jukeboxServiceToken: String(config.jukeboxServiceToken || env.NUXT_JUKEBOX_SERVICE_TOKEN || ''),
    jukeboxMediaBackupPath: String(
      config.jukeboxMediaBackupPath
        || env.NUXT_JUKEBOX_MEDIA_BACKUP_PATH
        || join(homedir(), '.local', 'share', 'app-erp', 'jukebox-media'),
    ),
    jukeboxFfprobePath: String(config.jukeboxFfprobePath || env.NUXT_JUKEBOX_FFPROBE_PATH || 'ffprobe'),
    attendanceMysqlHost: String(config.attendanceMysqlHost || env.NUXT_ATTENDANCE_MYSQL_HOST || ''),
    attendanceMysqlPort: asNumber(config.attendanceMysqlPort || env.NUXT_ATTENDANCE_MYSQL_PORT, 3306),
    attendanceMysqlUser: String(config.attendanceMysqlUser || env.NUXT_ATTENDANCE_MYSQL_USER || 'root'),
    attendanceMysqlPassword: String(config.attendanceMysqlPassword || env.NUXT_ATTENDANCE_MYSQL_PASSWORD || ''),
    attendanceMysqlDatabase: String(config.attendanceMysqlDatabase || env.NUXT_ATTENDANCE_MYSQL_DATABASE || ''),
  }
}

export function requireConfigValue(name: string, value: string): string {
  if (!value) {
    throw new Error(`Missing Nitro server configuration: ${name}`)
  }
  return value
}
