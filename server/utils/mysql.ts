import mysql, { type Connection, type Pool } from 'mysql2/promise'
import { getNitroServerConfig } from './runtime'
import { isDemoScope } from './data-scope'

const globalState = globalThis as typeof globalThis & {
  __nitroMysqlPool?: Pool
  __nitroMysqlDemoPool?: Pool
  /** 已解析出的业务库连接地址（主地址或 fallback）。 */
  __nitroMysqlHost?: string
  /** 单飞：并发解析共享同一次探测。 */
  __nitroMysqlResolve?: Promise<string>
}

type PoolConnectionOptions = { uri: string } | {
  host: string
  port: number
  user: string
  password: string
  database: string
}

function createPool(connection: PoolConnectionOptions, connectTimeoutMs: number): Pool {
  return mysql.createPool({
    ...connection,
    waitForConnections: true,
    connectionLimit: 10,
    maxIdle: 10,
    idleTimeout: 60000,
    queueLimit: 0,
    connectTimeout: connectTimeoutMs,
    charset: 'utf8mb4',
  })
}

/**
 * 把配置里的连接串归一成 mysql2 认的形态。
 * 仓库里习惯写 JDBC 风格（jdbc:mysql://…?useUnicode=true&serverTimezone=…），
 * 这些参数 mysql2 不认（会打印 “Ignoring invalid configuration option”），需要剥掉。
 */
function normalizeMysqlUri(raw: string): string {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return ''
  const stripped = trimmed.replace(/^jdbc:/i, '')
  return stripped.split('?')[0] || ''
}

function connectionOptions(
  url: string,
  host: string,
  port: number,
  user: string,
  password: string,
  database: string,
): PoolConnectionOptions | null {
  if (host || database) {
    return { host, port, user, password, database }
  }
  const uri = normalizeMysqlUri(url)
  return uri ? { uri } : null
}

/** 业务库候选连接地址：主地址 + 可选 fallback（同一份数据的另一条网络入口）。 */
export function mysqlHostCandidates(): string[] {
  const config = getNitroServerConfig()
  return [config.mysqlHost, config.mysqlHostFallback]
    .map((host) => String(host || '').trim())
    .filter((host, index, hosts) => host && hosts.indexOf(host) === index)
}

/** 用指定 host 组装业务库连接池；host 为空时沿用 URL 形态（与改造前一致）。 */
function createBusinessPool(host: string): Pool {
  const config = getNitroServerConfig()
  const connection = connectionOptions(
    config.mysqlUrl,
    host,
    config.mysqlPort,
    config.mysqlUser,
    config.mysqlPassword,
    config.mysqlDatabase,
  )
  if (!connection) {
    throw new Error('Missing Nitro MySQL configuration: NUXT_MYSQL_URL or NUXT_MYSQL_HOST')
  }
  return createPool(connection, config.mysqlConnectTimeoutMs)
}

/** 关闭当前业务库连接池（解析出不同地址时换池用）。 */
export async function closeMysqlPool(): Promise<void> {
  const pool = globalState.__nitroMysqlPool
  globalState.__nitroMysqlPool = undefined
  if (!pool) return
  try {
    await pool.end()
  } catch {
    // 旧池可能已不可用；换地址不能被它的关闭失败拖住。
  }
}

/**
 * 解析业务库实际可用的连接地址：先试主地址，连不上再试 NUXT_MYSQL_HOST_FALLBACK。
 *
 * - 未配置 fallback 时不探测，直接返回主地址（生产默认，零额外开销）。
 * - 解析结果记在 __nitroMysqlHost 供 getMysqlPool() 建池；两个都连不上则保持主地址，
 *   报错行为与改造前一致。
 * - 单飞：并发调用共享同一次探测。
 *
 * 安全前提：fallback 必须与主地址指向同一份数据（例如同一台库的 openp2p 隧道入口），
 * 否则写入与会话会分裂到两个库。
 */
export function resolveMysqlPoolHost(): Promise<string> {
  if (globalState.__nitroMysqlResolve) return globalState.__nitroMysqlResolve
  if (isDemoScope()) return Promise.resolve('')

  const hosts = mysqlHostCandidates()
  if (hosts.length <= 1) {
    globalState.__nitroMysqlHost = hosts[0] || ''
    return Promise.resolve(globalState.__nitroMysqlHost)
  }

  globalState.__nitroMysqlResolve = (async () => {
    const config = getNitroServerConfig()
    for (const host of hosts) {
      const connection = connectionOptions(
        config.mysqlUrl,
        host,
        config.mysqlPort,
        config.mysqlUser,
        config.mysqlPassword,
        config.mysqlDatabase,
      )
      if (!connection) break
      let probe: Connection | undefined
      try {
        probe = await mysql.createConnection({ ...connection, connectTimeout: config.mysqlConnectTimeoutMs })
        await probe.ping()
        await probe.end()
        if (globalState.__nitroMysqlHost !== host) {
          globalState.__nitroMysqlHost = host
          await closeMysqlPool()
        }
        return host
      } catch {
        if (probe) await probe.end().catch(() => {})
      }
    }
    return globalState.__nitroMysqlHost || ''
  })().finally(() => {
    globalState.__nitroMysqlResolve = undefined
  })
  return globalState.__nitroMysqlResolve
}

/**
 * 业务库连接池。按当前请求的数据域返回：
 * - 生产域（默认）：生产库；
 * - 演示域（demo 账号）：演示库（wfs_demo），账号只对该库有权限。
 *
 * 关键安全约束：演示域**未配置演示库时直接抛错**，绝不回退到生产库——
 * 宁可演示页面报错，也不能让演示账号读到/写到生产数据。
 */
export function getMysqlPool(): Pool {
  const config = getNitroServerConfig()

  if (isDemoScope()) {
    if (globalState.__nitroMysqlDemoPool) {
      return globalState.__nitroMysqlDemoPool
    }
    const demoConnection = connectionOptions(
      config.demoMysqlUrl,
      config.demoMysqlHost,
      config.demoMysqlPort,
      config.demoMysqlUser,
      config.demoMysqlPassword,
      config.demoMysqlDatabase,
    )
    if (!demoConnection) {
      throw new Error('演示数据源未配置：请设置 NUXT_DEMO_MYSQL_URL 或 NUXT_DEMO_MYSQL_HOST（演示域不会回退到生产库）')
    }
    globalState.__nitroMysqlDemoPool = createPool(demoConnection, config.mysqlConnectTimeoutMs)
    return globalState.__nitroMysqlDemoPool
  }

  if (globalState.__nitroMysqlPool) {
    return globalState.__nitroMysqlPool
  }

  globalState.__nitroMysqlPool = createBusinessPool(globalState.__nitroMysqlHost || config.mysqlHost)
  return globalState.__nitroMysqlPool
}

export function mysqlQueryOptions(sql: string) {
  return {
    sql,
    timeout: getNitroServerConfig().mysqlQueryTimeoutMs,
  }
}
