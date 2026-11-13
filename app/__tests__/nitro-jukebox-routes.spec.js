import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  authenticated: {
    session: {
      userId: 2,
      userName: 'u2',
      roles: [],
      permissions: ['tk_custom:jukebox:list', 'tk_custom:jukebox:play', 'tk_custom:jukebox:diagnostics'],
    },
  },
  body: {},
  query: {},
  fetch: vi.fn(),
  importHandler: vi.fn(),
}))

vi.mock('h3', () => ({
  getHeader: vi.fn(() => ''),
  getQuery: vi.fn(() => state.query),
  getRouterParam: vi.fn((event, key) => event?.routeParams?.[key] || ''),
  readBody: vi.fn(async () => state.body),
  readMultipartFormData: vi.fn(async () => []),
}))

vi.mock('../../server/utils/auth.ts', () => ({
  getAuthSession: vi.fn(async () => state.authenticated),
  hasPermission: vi.fn((session, permission) => session.permissions?.includes(permission)),
}))

vi.mock('../../server/utils/runtime.ts', () => ({
  getNitroServerConfig: vi.fn(() => ({
    jukeboxBaseUrl: 'http://192.0.2.182:3000',
    jukeboxTimeoutMs: 1000,
    jukeboxServiceToken: 'private-test-token',
  })),
}))

vi.mock('../../server/utils/music-read.ts', () => ({
  listMusicTracks: vi.fn(),
}))

vi.mock('../../server/utils/music-write.ts', () => ({
  createMusicWriteHandler: vi.fn(() => vi.fn()),
}))

vi.mock('../../server/utils/music-media.ts', () => ({
  createMusicTrackImportHandler: vi.fn(() => state.importHandler),
}))

globalThis.defineEventHandler = (handler) => handler

describe('Nitro jukebox routes', () => {
  let healthHandler
  let playerGetHandler
  let playerPostHandler
  let musicPathHandler
  let consoleError

  beforeAll(async () => {
    ({ default: healthHandler } = await import('../../server/routes/prod-api/tk_custom/jukebox/health.get.ts'));
    ({ default: playerGetHandler } = await import('../../server/routes/prod-api/tk_custom/jukebox/player.get.ts'));
    ({ default: playerPostHandler } = await import('../../server/routes/prod-api/tk_custom/jukebox/player.post.ts'));
    ({ default: musicPathHandler } = await import('../../server/routes/prod-api/[...path].ts'));
  })

  beforeEach(() => {
    state.authenticated = {
      session: {
        userId: 2,
        userName: 'u2',
        roles: [],
        permissions: ['tk_custom:jukebox:list', 'tk_custom:jukebox:play', 'tk_custom:jukebox:diagnostics'],
      },
    }
    state.body = {}
    state.query = {}
    state.importHandler = vi.fn(async () => ({ code: 200, msg: '导入完成' }))
    state.fetch.mockReset()
    vi.stubGlobal('fetch', state.fetch)
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleError.mockRestore()
    vi.unstubAllGlobals()
  })

  const remoteResponse = (body, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn(async () => JSON.stringify(body)),
  })

  it('requires authentication for health diagnostics', async () => {
    state.authenticated = null

    await expect(healthHandler({})).resolves.toEqual({ code: 401, msg: '登录状态已过期' })
    expect(state.fetch).not.toHaveBeenCalled()
  })

  it('requires diagnostics permission for health checks', async () => {
    state.authenticated.session.permissions = ['tk_custom:jukebox:list']

    await expect(healthHandler({})).resolves.toEqual({ code: 403, msg: '没有权限访问该接口' })
    expect(state.fetch).not.toHaveBeenCalled()
  })

  it('proxies player state through Nitro for authorized users', async () => {
    state.fetch.mockResolvedValueOnce(remoteResponse({ player: { status: 'idle', queue: [] } }))

    await expect(playerGetHandler({})).resolves.toEqual({
      code: 200,
      msg: '操作成功',
      data: { player: { status: 'idle', queue: [] } },
    })
    expect(state.fetch.mock.calls[0][0]).toBe('http://192.0.2.182:3000/api/player')
    expect(state.fetch.mock.calls[0][1].headers.get('authorization')).toBe('Bearer private-test-token')
  })

  it('maps play commands to the remote player and requires play permission', async () => {
    state.body = { action: 'play', song: { videoId: 'abc', title: '测试歌曲' }, queue: [], clearQueue: true }
    state.fetch.mockResolvedValueOnce(remoteResponse({ player: { status: 'playing' } }))

    await expect(playerPostHandler({})).resolves.toEqual({
      code: 200,
      msg: '操作成功',
      data: { player: { status: 'playing' } },
    })
    expect(state.fetch.mock.calls[0][0]).toBe('http://192.0.2.182:3000/api/player/play')
    expect(state.fetch.mock.calls[0][1].method).toBe('POST')

    state.authenticated.session.permissions = ['tk_custom:jukebox:list']
    await expect(playerPostHandler({})).resolves.toEqual({ code: 403, msg: '没有权限访问该接口' })
  })

  it('dispatches local audio imports through the Nitro music catch-all', async () => {
    const event = {
      method: 'POST',
      routeParams: { path: 'tk_custom/music/album/8/tracks/import' },
      context: { params: {} },
    }

    await expect(musicPathHandler(event)).resolves.toEqual({ code: 200, msg: '导入完成' })
    expect(state.importHandler).toHaveBeenCalledWith(event)
    expect(event.context.params.albumId).toBe('8')
  })
})
