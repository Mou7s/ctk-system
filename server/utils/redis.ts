/**
 * Nitro 进程外状态存储 —— MySQL 实现（2026-09-15 起替代 Garnet）
 *
 * 为什么需要一个「进程外」的存储：
 *   Nitro 服务平均每天重启 2 次（发布/重启），登录会话不能放在 Nuxt 进程内存里，
 *   否则每次重启全员掉线。这些状态必须比进程活得久。
 *
 * 为什么换成 MySQL：
 *   实测单次会话读取 Garnet 0.28ms、MySQL 4.7ms，差 4.4ms——300 人内部系统无感。
 *   为这点性能差单养一个 .NET 进程（外加 .NET 运行时）不划算，故精简技术栈。
 *   Garnet 的真正价值只是「进程外」，MySQL 同样满足。
 *
 * 保留 `getGarnet()` 这个导出名是刻意的：
 *   10 个业务文件按此名导入，21 个测试文件按此名 mock（mock 路径 server/utils/redis.ts）。
 *   改名会波及 31 个文件却没有行为收益，因此只换实现、不换签名。
 *   新代码请用语义化的 `getCache()`（同一个对象）。
 *
 * 对应表：sys_cache（db/sql/20260915_sys_cache_state_table.sql）
 * 键的约定与过期语义见该 SQL 文件头部注释。
 */
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { getMysqlPool, mysqlQueryOptions } from './mysql'
import { errorMessage } from './response'

const CACHE_TABLE = 'sys_cache'
const DUP_ENTRY_CODE = 'ER_DUP_ENTRY'
const DELETE_CHUNK = 500

/** sys_cache 的权威 DDL 与 db/sql/20260915_sys_cache_state_table.sql 保持一致。 */
const CACHE_TABLE_DDL = `CREATE TABLE IF NOT EXISTS ${CACHE_TABLE} (
  cache_key   VARCHAR(191) NOT NULL COMMENT '键名（含业务前缀）',
  cache_value MEDIUMTEXT   NOT NULL COMMENT '键值（会话 JSON 约 2KB）',
  expire_time DATETIME     NULL DEFAULT NULL COMMENT '过期时间，NULL 表示永不过期',
  create_time DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (cache_key),
  KEY idx_sys_cache_expire (expire_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Nitro 进程外状态：会话/验证码/登录锁/幂等键（替代 Garnet）'`

/**
 * 与原 ioredis 客户端对齐的最小接口：只保留业务实际用到的 8 个命令。
 * 用法与参数形态刻意保持 ioredis 风格（'EX' / 'NX' / MATCH / COUNT），
 * 这样调用方无需改动。
 */
export interface CacheClient {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ...args: Array<string | number>): Promise<'OK' | null>
  del(...keys: string[]): Promise<number>
  mget(...keys: string[]): Promise<Array<string | null>>
  keys(pattern: string): Promise<string[]>
  scan(cursor: string, ...args: string[]): Promise<[string, string[]]>
  info(section?: string): Promise<string>
  dbsize(): Promise<number>
  /** 仅保留接口形状：MySQL 客户端没有连接级事件，注册后不触发。 */
  on(event: string, handler: (...args: unknown[]) => void): CacheClient
}

const globalState = globalThis as typeof globalThis & {
  __nitroCache?: CacheClient
  __nitroCacheTableReady?: Promise<void>
}

function pool(): Pool {
  return getMysqlPool()
}

/** 统一带上 query timeout，避免单条卡住的查询拖死会话读取路径。 */
function queryCache<T = RowDataPacket[]>(sql: string, params?: unknown[]): Promise<[T, unknown]> {
  return pool().query(mysqlQueryOptions(sql), params) as unknown as Promise<[T, unknown]>
}

/** Redis glob（`*` / `?`）转 SQL LIKE，转义字面量 `%`、`_`、`\`。 */
export function globToLike(pattern: string): string {
  let out = ''
  for (const character of String(pattern ?? '*')) {
    if (character === '*') out += '%'
    else if (character === '?') out += '_'
    else if (character === '%' || character === '_' || character === '\\') out += `\\${character}`
    else out += character
  }
  return out
}

function placeholders(count: number): string {
  return new Array(count).fill('?').join(', ')
}

/** 读取时的过期判定：expire_time 为 NULL（永不过期）或尚未到期。 */
const LIVE_CONDITION = '(expire_time IS NULL OR expire_time > NOW())'

/** 解析 ioredis 风格的 SET 追加参数：EX 秒 / PX 毫秒 / NX。 */
function parseSetOptions(args: Array<string | number>): { ttlSeconds: number | null; onlyIfAbsent: boolean } {
  let ttlSeconds: number | null = null
  let onlyIfAbsent = false
  for (let index = 0; index < args.length; index += 1) {
    const flag = String(args[index]).toUpperCase()
    if (flag === 'EX') {
      ttlSeconds = Number(args[index + 1])
      index += 1
    } else if (flag === 'PX') {
      ttlSeconds = Number(args[index + 1]) / 1000
      index += 1
    } else if (flag === 'NX') {
      onlyIfAbsent = true
    }
  }
  return {
    ttlSeconds: ttlSeconds !== null && Number.isFinite(ttlSeconds) ? ttlSeconds : null,
    onlyIfAbsent,
  }
}

function rowCount(result: unknown): number {
  return Number((result as { affectedRows?: number })?.affectedRows ?? 0)
}

/** 表缺失时兜底建表，避免漏跑迁移导致全员无法登录。幂等，只执行一次。 */
export function ensureCacheTable(): Promise<void> {
  if (!globalState.__nitroCacheTableReady) {
    globalState.__nitroCacheTableReady = (async () => {
      try {
        await queryCache(CACHE_TABLE_DDL)
      } catch (error) {
        // 建表失败（无 DDL 权限等）不阻断请求：若表已存在则一切照常，
        // 若表真的不存在，后续查询会抛出可读的错误信息。
        console.error('[NitroCache] ensure table failed:', errorMessage(error, '建表失败'))
      }
    })()
  }
  return globalState.__nitroCacheTableReady
}

function createCacheClient(): CacheClient {
  const client: CacheClient = {
    async get(key) {
      await ensureCacheTable()
      const [rows] = await queryCache<RowDataPacket[]>(
        `SELECT cache_value FROM ${CACHE_TABLE} WHERE cache_key = ? AND ${LIVE_CONDITION} LIMIT 1`,
        [String(key)],
      )
      const value = rows[0]?.cache_value
      return value === undefined || value === null ? null : String(value)
    },

    async set(key, value, ...args) {
      await ensureCacheTable()
      const { ttlSeconds, onlyIfAbsent } = parseSetOptions(args)
      const expiry = ttlSeconds === null ? 'NULL' : 'DATE_ADD(NOW(), INTERVAL ? SECOND)'
      const insertParams: unknown[] = [String(key), String(value)]
      if (ttlSeconds !== null) insertParams.push(Math.max(1, Math.ceil(ttlSeconds)))

      if (onlyIfAbsent) {
        try {
          await queryCache(`INSERT INTO ${CACHE_TABLE} (cache_key, cache_value, expire_time) VALUES (?, ?, ${expiry})`, insertParams)
          return 'OK'
        } catch (error) {
          // 主键冲突 = 键已被占用，等价于 Redis SET NX 未抢到。
          if ((error as { code?: string })?.code === DUP_ENTRY_CODE) return null
          throw error
        }
      }

      await queryCache(
        `INSERT INTO ${CACHE_TABLE} (cache_key, cache_value, expire_time) VALUES (?, ?, ${expiry})
         ON DUPLICATE KEY UPDATE cache_value = VALUES(cache_value), expire_time = VALUES(expire_time)`,
        insertParams,
      )
      return 'OK'
    },

    async del(...keys) {
      const targets = keys.map(String).filter(Boolean)
      if (!targets.length) return 0
      await ensureCacheTable()
      let deleted = 0
      for (let index = 0; index < targets.length; index += DELETE_CHUNK) {
        const chunk = targets.slice(index, index + DELETE_CHUNK)
        const [result] = await queryCache(
          `DELETE FROM ${CACHE_TABLE} WHERE cache_key IN (${placeholders(chunk.length)})`,
          chunk,
        )
        deleted += rowCount(result)
      }
      return deleted
    },

    async mget(...keys) {
      const targets = keys.map(String)
      if (!targets.length) return []
      await ensureCacheTable()
      const found = new Map<string, string>()
      for (let index = 0; index < targets.length; index += DELETE_CHUNK) {
        const chunk = targets.slice(index, index + DELETE_CHUNK)
        const [rows] = await queryCache<RowDataPacket[]>(
          `SELECT cache_key, cache_value FROM ${CACHE_TABLE} WHERE cache_key IN (${placeholders(chunk.length)}) AND ${LIVE_CONDITION}`,
          chunk,
        )
        for (const row of rows) found.set(String(row.cache_key), String(row.cache_value))
      }
      // 与 Redis MGET 一致：按入参顺序返回，缺失键为 null。
      return targets.map((key) => found.get(key) ?? null)
    },

    async keys(pattern) {
      await ensureCacheTable()
      const [rows] = await pool().query<RowDataPacket[]>(
        `SELECT cache_key FROM ${CACHE_TABLE} WHERE cache_key LIKE ? AND ${LIVE_CONDITION} ORDER BY cache_key`,
        [globToLike(pattern)],
      )
      return rows.map((row) => String(row.cache_key))
    },

    async scan(cursor, ...args) {
      await ensureCacheTable()
      let pattern = '*'
      let count = 100
      for (let index = 0; index < args.length; index += 2) {
        const flag = String(args[index]).toUpperCase()
        if (flag === 'MATCH') pattern = String(args[index + 1] ?? '*')
        else if (flag === 'COUNT') count = Math.max(1, Number(args[index + 1]) || 100)
      }
      const like = globToLike(pattern)
      // 用键名游标（而非 OFFSET）分页：调用方会在遍历中改写键，OFFSET 会漏行。
      const [rows] = cursor && cursor !== '0'
        ? await pool().query<RowDataPacket[]>(
          `SELECT cache_key FROM ${CACHE_TABLE} WHERE cache_key LIKE ? AND cache_key > ? AND ${LIVE_CONDITION} ORDER BY cache_key LIMIT ${count}`,
          [like, String(cursor)],
        )
        : await pool().query<RowDataPacket[]>(
          `SELECT cache_key FROM ${CACHE_TABLE} WHERE cache_key LIKE ? AND ${LIVE_CONDITION} ORDER BY cache_key LIMIT ${count}`,
          [like],
        )
      const matched = rows.map((row) => String(row.cache_key))
      // 返回 '0' 表示遍历结束，与 Redis SCAN 的游标约定一致。
      const nextCursor = matched.length >= count ? matched[matched.length - 1] : '0'
      return [nextCursor, matched]
    },

    async dbsize() {
      await ensureCacheTable()
      const [rows] = await pool().query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM ${CACHE_TABLE} WHERE ${LIVE_CONDITION}`,
      )
      return Number(rows[0]?.total ?? 0)
    },

    async info(section) {
      await ensureCacheTable()
      // MySQL 没有按命令统计；监控页据此隐藏命令饼图。
      if (String(section || '').toLowerCase() === 'commandstats') {
        return '# Commandstats\r\nCommand statistics are not available on the MySQL state store.\r\n'
      }

      const lines: string[] = ['# Server', 'engine:mysql', 'redis_mode:standalone']
      const safe = async (fn: () => Promise<void>) => {
        try {
          await fn()
        } catch (error) {
          // 指标读取失败（权限不足等）不应影响监控页其余字段。
          console.error('[NitroCache] info metric failed:', errorMessage(error, '指标读取失败'))
        }
      }

      await safe(async () => {
        const [rows] = await queryCache<RowDataPacket[]>('SELECT VERSION() AS version')
        const version = String(rows[0]?.version ?? '')
        lines.push(`engine_version:${version}`, `redis_version:${version}`)
      })
      await safe(async () => {
        const [rows] = await queryCache<RowDataPacket[]>("SHOW GLOBAL STATUS LIKE 'Uptime'")
        const seconds = Number(rows[0]?.Value ?? 0)
        lines.push(`uptime_in_seconds:${seconds}`, `uptime_in_days:${Math.floor(seconds / 86400)}`)
      })
      let connectedClients = 0
      await safe(async () => {
        const [rows] = await queryCache<RowDataPacket[]>("SHOW GLOBAL STATUS LIKE 'Threads_connected'")
        connectedClients = Number(rows[0]?.Value ?? 0)
      })
      lines.push('# Clients', `connected_clients:${connectedClients}`)
      await safe(async () => {
        const [rows] = await queryCache<RowDataPacket[]>("SHOW VARIABLES LIKE 'port'")
        lines.push(`tcp_port:${String(rows[0]?.Value ?? 3306)}`)
      })
      await safe(async () => {
        const [rows] = await queryCache<RowDataPacket[]>(
          `SELECT
             COUNT(*) AS total,
             SUM(expire_time IS NOT NULL AND expire_time <= NOW()) AS expired
           FROM ${CACHE_TABLE}`,
        )
        const total = Number(rows[0]?.total ?? 0)
        const expired = Number(rows[0]?.expired ?? 0)
        lines.push('# Keyspace', `db0:keys=${total},expires=${total - expired}`)
        lines.push('# sys_cache', `cache_rows:${total}`, `cache_expired_rows:${expired}`)
      })
      await safe(async () => {
        const [rows] = await queryCache<RowDataPacket[]>(
          `SELECT data_length, index_length FROM information_schema.TABLES
           WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
          [CACHE_TABLE],
        )
        const bytes = Number(rows[0]?.data_length ?? 0) + Number(rows[0]?.index_length ?? 0)
        lines.push('# Memory', `used_memory:${bytes}`, `used_memory_human:${formatBytes(bytes)}`)
      })
      await safe(async () => {
        // 键值内容大小：information_schema 的统计对新建小表常为 0，这个值始终有效，
        // 监控页以它作为「键值内容」展示。
        const [rows] = await queryCache<RowDataPacket[]>(
          `SELECT COALESCE(SUM(CHAR_LENGTH(cache_key) + CHAR_LENGTH(cache_value)), 0) AS content_bytes FROM ${CACHE_TABLE}`,
        )
        const contentBytes = Number(rows[0]?.content_bytes ?? 0)
        lines.push(`cache_content_bytes:${contentBytes}`, `cache_content_human:${formatBytes(contentBytes)}`)
      })

      return `${lines.join('\r\n')}\r\n`
    },

    on() {
      // MySQL 实现没有连接级事件；保留方法以满足原接口形状。
      return client
    },
  }

  return client
}

function formatBytes(bytes: number, decimals = 2): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${Number((bytes / 1024 ** index).toFixed(decimals))} ${units[index]}`
}

/** 单例：整个 Nitro 进程共用一个缓存客户端。 */
export function getCache(): CacheClient {
  if (!globalState.__nitroCache) {
    globalState.__nitroCache = createCacheClient()
  }
  return globalState.__nitroCache
}

/**
 * 兼容别名（历史命名：该存储原为 Garnet）。
 * 保留此名以免改动 10 个业务文件的 import 与 21 个测试文件的 mock 路径。
 */
export function getGarnet(): CacheClient {
  return getCache()
}

export { formatBytes as formatCacheBytes }
