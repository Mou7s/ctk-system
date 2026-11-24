import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * sys_cache（MySQL 实现）的命令契约测试。
 *
 * 用一个极小的内存表模拟 sys_cache，验证 server/utils/redis.ts 对 8 个命令的
 * 语义实现：EX 过期、NX 抢占、前缀匹配、mget 顺序、scan 游标、dbsize。
 * 真实的 SQL/LIKE 转义行为另由连本机 MySQL 的探针脚本验证。
 */
const state = vi.hoisted(() => {
  const table = new Map();
  const queries = [];
  const now = () => Date.now();
  const live = (row) => row.expireTime === null || row.expireTime > now();

  return {
    table,
    queries,
    reset() {
      table.clear();
      queries.length = 0;
    },
    handle(sql, params = []) {
      const query = String(sql);
      queries.push({ sql: query, params });

      if (/^CREATE TABLE/i.test(query)) return [{}, []];

      if (/^INSERT INTO sys_cache/i.test(query) && /ON DUPLICATE KEY UPDATE/i.test(query)) {
        const [key, value, ttlSeconds] = params;
        table.set(key, { value, expireTime: ttlSeconds == null ? null : now() + Number(ttlSeconds) * 1000 });
        return [{ affectedRows: 1 }, []];
      }

      if (/^INSERT INTO sys_cache/i.test(query)) {
        const [key, value, ttlSeconds] = params;
        if (table.has(key)) {
          const error = new Error("Duplicate entry");
          error.code = "ER_DUP_ENTRY";
          throw error;
        }
        table.set(key, { value, expireTime: ttlSeconds == null ? null : now() + Number(ttlSeconds) * 1000 });
        return [{ affectedRows: 1 }, []];
      }

      if (/^SELECT cache_value FROM sys_cache WHERE cache_key = \?/i.test(query)) {
        const row = table.get(params[0]);
        return [row && live(row) ? [{ cache_value: row.value }] : [], []];
      }

      if (/^SELECT cache_key, cache_value FROM sys_cache WHERE cache_key IN/i.test(query)) {
        const rows = params
          .filter((key) => table.has(key) && live(table.get(key)))
          .map((key) => ({ cache_key: key, cache_value: table.get(key).value }));
        return [rows, []];
      }

      if (/^SELECT cache_key FROM sys_cache WHERE cache_key LIKE \? AND cache_key > \?/i.test(query)) {
        const [pattern, cursor, limit] = params;
        const matcher = likeMatcher(pattern);
        const rows = [...table.keys()]
          .filter((key) => matcher(key) && key > cursor && live(table.get(key)))
          .sort()
          .slice(0, Number(limit))
          .map((key) => ({ cache_key: key }));
        return [rows, []];
      }

      if (/^SELECT cache_key FROM sys_cache WHERE cache_key LIKE \?/i.test(query)) {
        const [pattern, limit] = params;
        const matcher = likeMatcher(pattern);
        const keys = [...table.keys()].filter((key) => matcher(key) && live(table.get(key))).sort();
        return [(limit === undefined ? keys : keys.slice(0, Number(limit))).map((key) => ({ cache_key: key })), []];
      }

      if (/^DELETE FROM sys_cache WHERE cache_key IN/i.test(query)) {
        let affectedRows = 0;
        for (const key of params) if (table.delete(key)) affectedRows += 1;
        return [{ affectedRows }, []];
      }

      if (/^SELECT COUNT\(\*\) AS total FROM sys_cache/i.test(query)) {
        return [[{ total: [...table.values()].filter(live).length }], []];
      }

      if (/^SELECT VERSION\(\)/i.test(query)) return [[{ version: "8.4.0" }], []];
      if (/SHOW GLOBAL STATUS LIKE 'Uptime'/i.test(query)) return [[{ Value: "3600" }], []];
      if (/SHOW GLOBAL STATUS LIKE 'Threads_connected'/i.test(query)) return [[{ Value: "7" }], []];
      if (/SHOW VARIABLES LIKE 'port'/i.test(query)) return [[{ Value: "3306" }], []];
      if (/FROM information_schema.TABLES/i.test(query)) return [[{ data_length: 16384, index_length: 0 }], []];
      if (/SUM\(CHAR_LENGTH/i.test(query)) return [[{ content_bytes: 2048 }], []];
      if (/COUNT\(\*\) AS total,\s*SUM\(expire_time/i.test(query)) {
        const all = [...table.values()];
        return [[{ total: all.length, expired: all.filter((row) => !live(row)).length }], []];
      }

      throw new Error(`未预期的 SQL：${query}`);
    },
  };

  /** 把 SQL LIKE 模式（已由 globToLike 转义）还原成正则。 */
  function likeMatcher(pattern) {
    let regex = "";
    for (let index = 0; index < pattern.length; index += 1) {
      const character = pattern[index];
      if (character === "\\") {
        regex += pattern[index + 1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        index += 1;
      } else if (character === "%") regex += ".*";
      else if (character === "_") regex += ".";
      else regex += character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    return (key) => new RegExp(`^${regex}$`).test(key);
  }
});

vi.mock("../../server/utils/mysql.ts", () => ({
  mysqlQueryOptions: (sql) => ({ sql }),
  getMysqlPool: () => ({ query: async (options, params) => state.handle(String(options?.sql ?? options), params) }),
}));

const { getGarnet, getCache, globToLike } = await import("../../server/utils/redis.ts");

describe("sys_cache MySQL 命令契约", () => {
  beforeEach(() => {
    state.reset();
    // 每次重建单例，避免上一用例的内存表被复用。
    delete globalThis.__nitroCache;
  });

  it("glob 转 SQL LIKE 时把下划线当字面量（auth_sessions 前缀必须精确匹配）", () => {
    expect(globToLike("auth_sessions:*")).toBe("auth\\_sessions:%");
    expect(globToLike("a?c*")).toBe("a_c%");
    expect(globToLike("100%_x")).toBe("100\\%\\_x");
    expect(globToLike("*")).toBe("%");
  });

  it("set/get 往返，且 getCache 与 getGarnet 是同一个单例", async () => {
    const cache = getCache();
    expect(getGarnet()).toBe(cache);
    await expect(cache.set("t:a", "1")).resolves.toBe("OK");
    await expect(cache.get("t:a")).resolves.toBe("1");
    await expect(cache.get("t:missing")).resolves.toBeNull();
  });

  it("set 带 EX 会写入 DATE_ADD(NOW(), INTERVAL ? SECOND)", async () => {
    await getGarnet().set("t:ttl", "v", "EX", 120);
    const insert = state.queries.find((entry) => /^INSERT INTO sys_cache/i.test(entry.sql));
    expect(insert.sql).toContain("DATE_ADD(NOW(), INTERVAL ? SECOND)");
    expect(insert.params).toEqual(["t:ttl", "v", 120]);
  });

  it("过期键读取为 null，且不出现在 keys/dbsize 里", async () => {
    const cache = getGarnet();
    await cache.set("t:dead", "v", "EX", 1);
    state.table.set("t:dead", { value: "v", expireTime: Date.now() - 1000 });
    await expect(cache.get("t:dead")).resolves.toBeNull();
    await expect(cache.keys("t:*")).resolves.toEqual([]);
    await expect(cache.dbsize()).resolves.toBe(0);
  });

  it("NX 抢占：首次 OK、第二次 null，且不覆盖原值", async () => {
    const cache = getGarnet();
    await expect(cache.set("nitro:write:l:1:r", "processing", "NX", "EX", 900)).resolves.toBe("OK");
    await expect(cache.set("nitro:write:l:1:r", "processing", "NX", "EX", 900)).resolves.toBeNull();
    await expect(cache.get("nitro:write:l:1:r")).resolves.toBe("processing");
    await expect(cache.set("nitro:write:l:1:r", "done", "EX", 900)).resolves.toBe("OK");
    await expect(cache.get("nitro:write:l:1:r")).resolves.toBe("done");
  });

  it("NX 的失败信息只吞掉主键冲突，其它错误继续抛出", async () => {
    const cache = getGarnet();
    const original = state.handle;
    state.handle = () => {
      throw new Error("connection lost");
    };
    await expect(cache.set("t:x", "v", "NX", "EX", 10)).rejects.toThrow("connection lost");
    state.handle = original;
  });

  it("mget 按入参顺序返回并保留缺失键的 null", async () => {
    const cache = getGarnet();
    await cache.set("t:b", "2");
    await cache.set("t:a", "1");
    await expect(cache.mget("t:b", "t:none", "t:a")).resolves.toEqual(["2", null, "1"]);
    await expect(cache.mget()).resolves.toEqual([]);
  });

  it("del 返回实际删除行数，空入参返回 0", async () => {
    const cache = getGarnet();
    await cache.set("t:a", "1");
    await cache.set("t:b", "2");
    await expect(cache.del("t:a", "t:b")).resolves.toBe(2);
    await expect(cache.del()).resolves.toBe(0);
  });

  it("scan 用键名游标遍历且不遗漏、不重复", async () => {
    const cache = getGarnet();
    for (let index = 0; index < 7; index += 1) await cache.set(`auth_sessions:${index}`, String(index));

    const collected = [];
    let cursor = "0";
    do {
      const [next, batch] = await cache.scan(cursor, "MATCH", "auth_sessions:*", "COUNT", "3");
      cursor = next;
      collected.push(...batch);
    } while (cursor !== "0");

    expect(collected).toHaveLength(7);
    expect(new Set(collected).size).toBe(7);
  });

  it("keys 只返回精确匹配前缀的存活键（不误配同形键）", async () => {
    const cache = getGarnet();
    await cache.set("auth_sessions:a", "1");
    await cache.set("authXsessions:b", "2");
    await cache.set("auth_sessions2:c", "3");
    await expect(cache.keys("auth_sessions:*")).resolves.toEqual(["auth_sessions:a"]);
  });

  it("info 输出 MySQL 语义字段，commandstats 为空段", async () => {
    const info = await getGarnet().info();
    expect(info).toContain("engine:mysql");
    expect(info).toContain("engine_version:8.4.0");
    expect(info).toContain("tcp_port:3306");
    expect(info).toContain("connected_clients:7");
    expect(info).toContain("cache_content_human:2 KB");
    await expect(getGarnet().info("commandstats")).resolves.toContain("# Commandstats");
  });
});
