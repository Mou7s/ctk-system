import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  authenticated: { session: { userId: 2, userName: 'u2', roles: [], permissions: ['tk_custom:jukebox:list'] } },
  query: { pageNum: '1', pageSize: '999' },
  pool: { query: vi.fn() },
}))

vi.mock('h3', () => ({
  getQuery: vi.fn(() => state.query),
  getRouterParam: vi.fn(() => '7'),
}))

vi.mock('../../server/utils/auth.ts', () => ({
  getAuthSession: vi.fn(async () => state.authenticated),
  hasPermission: vi.fn((session, permission) => session.permissions?.includes(permission)),
}))

vi.mock('../../server/utils/mysql.ts', () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}))

globalThis.defineEventHandler = (handler) => handler

describe('Nitro music read routes', () => {
  let listAlbums
  let listSchedules
  let listTracks

  beforeAll(async () => {
    ({ listMusicAlbums: listAlbums, listMusicSchedules: listSchedules, listMusicTracks: listTracks } = await import('../../server/utils/music-read.ts'))
  })

  beforeEach(() => {
    state.authenticated = { session: { userId: 2, userName: 'u2', roles: [], permissions: ['tk_custom:jukebox:list'] } }
    state.pool.query.mockReset()
    state.pool.query
      .mockResolvedValueOnce([[{ total: 1 }], []])
      .mockResolvedValueOnce([[{
        album_id: 7,
        name: '早会广播',
        track_count: 3,
      }], []])
  })

  it('returns camelCase album fields expected by the page', async () => {
    const result = await listAlbums({})

    expect(result.rows).toEqual([{ albumId: 7, name: '早会广播', trackCount: 3 }])
  })

  it('returns camelCase schedule and track fields', async () => {
    state.pool.query.mockReset()
    state.pool.query
      .mockResolvedValueOnce([[{ total: 1 }], []])
      .mockResolvedValueOnce([[{
        schedule_id: 9,
        name: '凌晨播放',
        schedule_type: 'daily',
        start_time: '09:00',
        enabled: '1',
      }], []])
      .mockResolvedValueOnce([[
        { schedule_id: 9, album_id: 7, album_name: '专辑甲' },
        { schedule_id: 9, album_id: 8, album_name: '专辑乙' },
      ], []])
    const schedules = await listSchedules({})
    expect(schedules.rows[0]).toEqual(expect.objectContaining({
      scheduleId: 9,
      name: '凌晨播放',
      albumIds: [7, 8],
      albumNames: ['专辑甲', '专辑乙'],
      scheduleType: 'daily',
      startTime: '09:00',
      enabled: '1',
    }))
    expect(state.pool.query.mock.calls[1][0].sql).toContain('tk_music_broadcast_schedule')
    expect(state.pool.query.mock.calls[2][0].sql).toContain('tk_music_broadcast_schedule_album')

    state.pool.query.mockReset()
    state.pool.query.mockResolvedValueOnce([[{
      track_id: 11,
      album_id: 7,
      video_id: 'abc',
      sort_order: 1,
    }], []])
    const tracks = await listTracks({})
    expect(tracks.data[0]).toEqual(expect.objectContaining({ trackId: 11, albumId: 7, videoId: 'abc', sortOrder: 1 }))
  })
})
