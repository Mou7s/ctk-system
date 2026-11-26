import { isIP } from 'node:net'
import { getMssqlSync, loadMssql } from './lazy-deps'
import { getNitroServerConfig } from './runtime'
import { isDemoScope } from './data-scope'
import { DemoModeError } from './demo'

export type SqlServerFailureKind = 'config' | 'timeout' | 'unavailable' | 'query'

export class SqlServerError extends Error {
  readonly kind: SqlServerFailureKind
  readonly statusCode: number

  constructor(kind: SqlServerFailureKind, message: string, statusCode: number, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'SqlServerError'
    this.kind = kind
    this.statusCode = statusCode
  }
}

type SqlServerPool = any

const globalState = globalThis as typeof globalThis & {
  __nitroSqlServerK3Pool?: SqlServerPool
  __nitroSqlServerK3Host?: string
  __nitroSqlServerK3Connect?: Promise<SqlServerPool>
}

function hostCandidates(): string[] {
  const config = getNitroServerConfig()
  return [config.sqlServerK3Host, config.sqlServerK3HostFallback]
    .map((host) => host.trim())
    .filter((host, index, hosts) => host && hosts.indexOf(host) === index)
}

function validateConfig() {
  const config = getNitroServerConfig()
  const host = hostCandidates()[0]
  const missing = [
    !host ? 'NUXT_SQLSERVER_K3_HOST' : '',
    !config.sqlServerK3Database ? 'NUXT_SQLSERVER_K3_DATABASE' : '',
    !config.sqlServerK3User ? 'NUXT_SQLSERVER_K3_USER' : '',
    !config.sqlServerK3Password ? 'NUXT_SQLSERVER_K3_PASSWORD' : '',
  ].filter(Boolean)
  if (missing.length) throw new SqlServerError('config', `缺少 K3 SQL Server 配置：${missing.join('、')}`, 503)
  return config
}

function connectionConfig(host: string) {
  const config = validateConfig()
  const tlsServerName = config.sqlServerK3TlsServerName.trim()
  // tedious 的 TDS7.4 startTls 路径在 options.serverName 为空时会回退用 config.server 作 SNI，
  // IP 直连会被 Node TLS 拒绝（ESOCKET）。显式配置优先，IP 无配置时用占位 SNI 绕过。
  const serverName = tlsServerName || (isIP(host) ? 'k3-sqlserver' : '')
  return {
    server: host,
    port: config.sqlServerK3Port,
    database: config.sqlServerK3Database,
    user: config.sqlServerK3User,
    password: config.sqlServerK3Password,
    pool: {
      max: Math.min(Math.max(config.sqlServerK3PoolMax, 1), 20),
      min: 0,
      idleTimeoutMillis: 30000,
    },
    options: {
      encrypt: true,
      trustServerCertificate: true,
      enableArithAbort: true,
      ...(serverName ? { serverName } : {}),
    },
    connectionTimeout: Math.max(config.sqlServerK3ConnectTimeoutMs, 1000),
    requestTimeout: Math.max(config.sqlServerK3RequestTimeoutMs, 1000),
  }
}

async function closePool(pool: SqlServerPool | undefined): Promise<void> {
  if (!pool) return
  try {
    await pool.close()
  } catch {
    // A failed pool is already unusable; do not hide the original dependency error.
  }
}

export async function closeK3SqlServerPool(): Promise<void> {
  const pool = globalState.__nitroSqlServerK3Pool
  globalState.__nitroSqlServerK3Pool = undefined
  globalState.__nitroSqlServerK3Host = undefined
  await closePool(pool)
}

function isTimeout(error: unknown): boolean {
  const value = error as { code?: string; name?: string; message?: string } | null
  return value?.code === 'ETIMEOUT' || /timeout|timed out/i.test(String(value?.message || ''))
}

function isConnectionFailure(error: unknown): boolean {
  const value = error as { code?: string; name?: string; message?: string } | null
  return ['ESOCKET', 'ECONNRESET', 'ECONNREFUSED', 'ENOTOPEN', 'ELOGIN'].includes(String(value?.code || ''))
    || /connection|socket|login|not open/i.test(String(value?.message || ''))
}

function classifyError(error: unknown): SqlServerError {
  if (error instanceof SqlServerError) return error
  if (isTimeout(error)) return new SqlServerError('timeout', 'K3 SQL Server 查询超时', 504, { cause: error })
  if (isConnectionFailure(error)) return new SqlServerError('unavailable', 'K3 SQL Server 暂不可用', 502, { cause: error })
  return new SqlServerError('query', 'K3 SQL Server 查询失败', 502, { cause: error })
}

async function connectPool(): Promise<SqlServerPool> {
  const sql = await loadMssql()
  const hosts = hostCandidates()
  let lastError: unknown
  for (const host of hosts) {
    let pool: SqlServerPool | undefined
    try {
      pool = new sql.ConnectionPool(connectionConfig(host))
      await pool.connect()
      globalState.__nitroSqlServerK3Pool = pool
      globalState.__nitroSqlServerK3Host = host
      return pool
    } catch (error) {
      lastError = error
      await closePool(pool)
    }
  }
  throw classifyError(lastError || new Error('No K3 SQL Server endpoint is configured'))
}

export async function getK3SqlServerPool(forceReconnect = false): Promise<SqlServerPool> {
  if (isDemoScope()) throw new DemoModeError()
  validateConfig()
  if (!forceReconnect && globalState.__nitroSqlServerK3Pool?.connected) {
    return globalState.__nitroSqlServerK3Pool
  }
  if (globalState.__nitroSqlServerK3Connect) return globalState.__nitroSqlServerK3Connect

  const previous = globalState.__nitroSqlServerK3Pool
  globalState.__nitroSqlServerK3Pool = undefined
  globalState.__nitroSqlServerK3Host = undefined
  await closePool(previous)
  globalState.__nitroSqlServerK3Connect = connectPool().finally(() => {
    globalState.__nitroSqlServerK3Connect = undefined
  })
  return globalState.__nitroSqlServerK3Connect
}

export async function queryK3SqlServer<T = Record<string, any>>(
  execute: (request: any) => Promise<{ recordset?: T[] }>,
): Promise<T[]> {
  if (isDemoScope()) return []
  let retried = false
  while (true) {
    const pool = await getK3SqlServerPool(retried)
    try {
      const result = await execute(pool.request())
      return result.recordset || []
    } catch (error) {
      const classified = classifyError(error)
      if (!retried && classified.kind === 'unavailable') {
        retried = true
        await closePool(pool)
        globalState.__nitroSqlServerK3Pool = undefined
        continue
      }
      throw classified
    }
  }
}

/**
 * Execute a K3 SQL Server write in one transaction.
 *
 * Write paths intentionally do not retry after a transaction has started:
 * blindly repeating a mutation after a network failure could apply it twice.
 */
export async function withK3SqlServerTransaction<T>(
  execute: (transaction: any) => Promise<T>,
): Promise<T> {
  if (isDemoScope()) throw new DemoModeError()
  const pool = await getK3SqlServerPool()
  const transaction = pool.transaction()
  let started = false

  try {
    await transaction.begin()
    started = true
    const result = await execute(transaction)
    await transaction.commit()
    return result
  } catch (error) {
    if (started) {
      try {
        await transaction.rollback()
      } catch {
        // Preserve the original SQL Server error when rollback also fails.
      }
    }
    throw classifyError(error)
  }
}

export function sqlParameterName(prefix: string, index: number): string {
  return `${prefix}${index}`
}

export function sqlStringParameter(request: any, name: string, value: string): any {
  const sql = getMssqlSync()
  return request.input(name, sql.NVarChar(255), value)
}

export function sqlDateParameter(request: any, name: string, value: string): any {
  const sql = getMssqlSync()
  return request.input(name, sql.Date, value)
}

export function sqlBigIntParameter(request: any, name: string, value: number | string): any {
  const sql = getMssqlSync()
  return request.input(name, sql.BigInt, value)
}

export function sqlIntParameter(request: any, name: string, value: number): any {
  const sql = getMssqlSync()
  return request.input(name, sql.Int, value)
}
