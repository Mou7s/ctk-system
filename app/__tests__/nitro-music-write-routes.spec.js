import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  body: {},
  params: {},
  query: {},
  connection: {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi.fn(),
  },
  pool: { getConnection: vi.fn(), query: vi.fn() },
  garnet: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
}));

vi.mock("h3", () => ({
  getHeader: vi.fn((_event, name) => name === "idempotency-key" ? state.body.requestId : "test-agent"),
  getQuery: vi.fn(() => state.query),
  getRequestURL: vi.fn(() => new URL("http://test.local/prod-api/tk_custom/music/album/1/tracks/group")),
  getRouterParam: vi.fn((_event, name) => state.params[name]),
  getRouterParams: vi.fn(() => state.params),
  readBody: vi.fn(async () => state.body),
  readMultipartFormData: vi.fn(async () => []),
}));

vi.mock("../../server/utils/auth.ts", () => ({
  getAuthSession: vi.fn(async () => ({
    token: "test-token",
    session: {
      userId: 1,
      deptId: 1,
      userName: "admin",
      user: { userId: 1, userName: "admin", nickName: "管理员" },
      roles: [],
      permissions: [],
    },
  })),
  hasPermission: vi.fn(() => true),
}));

vi.mock("../../server/utils/mysql.ts", () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}));

vi.mock("../../server/utils/redis.ts", () => ({
  getGarnet: vi.fn(() => state.garnet),
}));

vi.mock("../../server/utils/runtime.ts", () => ({
  getNitroServerConfig: vi.fn(() => ({ jukeboxBaseUrl: "http://jukebox.test", jukeboxTimeoutMs: 1000 })),
}));

describe("Nitro music write routes", () => {
  let createMusicWriteHandler;
  let consoleError;

  beforeEach(async () => {
    ({ createMusicWriteHandler } = await import("../../server/utils/music-write.ts"));
    state.body = { requestId: "music-1", name: "测试专辑", sourceType: "manual", status: "0" };
    state.params = {};
    state.query = {};
    state.connection.beginTransaction.mockReset();
    state.connection.commit.mockReset();
    state.connection.rollback.mockReset();
    state.connection.release.mockReset();
    state.connection.query.mockReset();
    state.pool.getConnection.mockReset().mockResolvedValue(state.connection);
    state.pool.query.mockReset().mockResolvedValue([[], []]);
    state.garnet.get.mockReset().mockResolvedValue(null);
    state.garnet.set.mockReset().mockResolvedValue("OK");
    state.garnet.del.mockReset().mockResolvedValue(1);
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => consoleError.mockRestore());

  it("commits an album write and records the operation log", async () => {
    state.connection.query
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    await expect(createMusicWriteHandler("album-add")({ node: { req: { method: "POST" } } })).resolves.toEqual({
      code: 200,
      msg: "操作成功",
    });
    expect(state.connection.commit).toHaveBeenCalledTimes(1);
    expect(state.connection.query.mock.calls[0][0].sql).toContain("INSERT INTO tk_music_album");
    expect(state.connection.query.mock.calls[1][0].sql).toContain("INSERT INTO sys_oper_log");
  });

  it("deletes only tracks in the requested album and selected channel", async () => {
    state.body = { requestId: "music-group-1" };
    state.params = { albumId: "7" };
    state.query = { channel: "其他单曲" };
    state.connection.query
      .mockResolvedValueOnce([[{ album_id: 7 }], []])
      .mockResolvedValueOnce([{ affectedRows: 2 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    await expect(createMusicWriteHandler("track-group-delete")({ node: { req: { method: "DELETE" } } })).resolves.toEqual({
      code: 200,
      msg: "操作成功",
    });
    expect(state.connection.query.mock.calls[1][0].sql).toContain("DELETE FROM tk_music_track");
    expect(state.connection.query.mock.calls[1][1]).toEqual([7, "其他单曲", "其他单曲"]);
  });

  it("rejects an incomplete reorder before mutating track order", async () => {
    state.body = { requestId: "music-order-1", albumId: 7, items: [{ trackId: 1 }] };
    state.connection.query
      .mockResolvedValueOnce([[{ album_id: 7 }], []])
      .mockResolvedValueOnce([[{ track_id: 1 }, { track_id: 2 }], []]);
    await expect(createMusicWriteHandler("track-order")({ node: { req: { method: "PUT" } } })).resolves.toEqual({
      code: 500,
      msg: "歌曲顺序数据不完整，请刷新后重试",
    });
    expect(state.connection.query).toHaveBeenCalledTimes(2);
    expect(state.connection.rollback).toHaveBeenCalledTimes(1);
  });

  it("creates an independent broadcast plan with multiple selected albums", async () => {
    state.body = {
      requestId: "music-schedule-multi-album",
      name: "凌晨播放",
      albumIds: [7, 8],
      startTime: "02:00",
      scheduleType: "daily",
      enabled: "0",
    };
    state.connection.query
      .mockResolvedValueOnce([[
        { album_id: 7, album_name: "专辑甲", track_id: 71, title: "歌曲甲", duration: 180, media_id: 31, sort_order: 1 },
        { album_id: 8, album_name: "专辑乙", track_id: 81, title: "歌曲乙", duration: 210, media_id: 32, sort_order: 1 },
      ], []])
      .mockResolvedValueOnce([{ affectedRows: 1, insertId: 42 }, []])
      .mockResolvedValueOnce([{ affectedRows: 2 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    await expect(createMusicWriteHandler("schedule-add")({ node: { req: { method: "POST" } } })).resolves.toEqual({
      code: 200,
      msg: "操作成功",
    });

    expect(state.connection.query.mock.calls[0][0].sql).toContain("FROM tk_music_album a");
    expect(state.connection.query.mock.calls[1][0].sql).toContain("INSERT INTO tk_music_broadcast_schedule");
    expect(state.connection.query.mock.calls[2][0].sql).toContain("INSERT INTO tk_music_broadcast_schedule_album");
    expect(state.connection.query.mock.calls[2][1]).toEqual([42, 7, 1, 42, 8, 2]);
    expect(state.connection.query.mock.calls[1][1][0]).toBe("凌晨播放");
    expect(state.connection.commit).toHaveBeenCalledTimes(1);
  });

  it("requires at least one album for a broadcast plan", async () => {
    state.body = { requestId: "music-schedule-no-album", name: "凌晨播放", albumIds: [] };

    await expect(createMusicWriteHandler("schedule-add")({ node: { req: { method: "POST" } } })).resolves.toEqual({
      code: 500,
      msg: "请至少选择一张专辑",
    });
    expect(state.connection.query).not.toHaveBeenCalled();
    expect(state.connection.rollback).toHaveBeenCalledTimes(1);
  });

  it("rejects enabling a plan that has no selected albums", async () => {
    state.body = { requestId: "music-schedule-enable-empty", enabled: "1" };
    state.params = { scheduleId: "42" };
    state.connection.query
      .mockResolvedValueOnce([[{ broadcast_schedule_id: 42, schedule_type: "daily", start_time: "02:00", end_time: null }], []])
      .mockResolvedValueOnce([[], []]);

    await expect(createMusicWriteHandler("schedule-toggle")({ node: { req: { method: "PUT" } } })).resolves.toEqual({
      code: 500,
      msg: "计划中还没有选择专辑",
    });
    expect(state.connection.query).toHaveBeenCalledTimes(2);
    expect(state.connection.query.mock.calls.some(([query]) => query.sql.includes("UPDATE tk_music_broadcast_schedule"))).toBe(false);
    expect(state.connection.rollback).toHaveBeenCalledTimes(1);
  });
});
