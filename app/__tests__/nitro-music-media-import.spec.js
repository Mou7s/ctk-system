import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'

const state = vi.hoisted(() => ({
  session: { session: { userId: 1, userName: 'admin', permissions: ['tk_custom:jukebox:manage'] } },
  hasPermission: true,
  albumId: '7',
  parts: [],
  existingTrack: false,
  mediaStatus: 'pending_sync',
  connection: { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), query: vi.fn() },
  pool: { getConnection: vi.fn() },
}))

vi.mock('h3', () => ({
  getHeader: vi.fn(() => '100'),
  getRouterParam: vi.fn(() => state.albumId),
  readBody: vi.fn(async () => ({})),
  readMultipartFormData: vi.fn(async () => state.parts),
}))

vi.mock('../../server/utils/auth.ts', () => ({
  getAuthSession: vi.fn(async () => state.session),
  hasPermission: vi.fn(() => state.hasPermission),
}))

vi.mock('../../server/utils/mysql.ts', () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}))

vi.mock('../../server/utils/runtime.ts', () => ({
  getNitroServerConfig: vi.fn(() => ({
    jukeboxMediaBackupPath: '', profilePath: '', jukeboxFfprobePath: 'ffprobe', jukeboxMediaTimeoutMs: 1000,
  })),
}))

vi.mock('../../server/utils/write.ts', () => ({
  insertOperationLog: vi.fn(async () => {}),
}))

vi.mock('../../server/utils/jukebox-client.ts', () => ({
  fetchPlayer: vi.fn(),
  JukeboxRemoteError: class JukeboxRemoteError extends Error {},
}))

describe('local music track import', () => {
  let createMusicTrackImportHandler
  let createMusicMediaRetryHandler
  let MusicImportError
  let root
  let consoleError
  const bytes = Buffer.from('synthetic-audio-data')
  const digest = createHash('sha256').update(bytes).digest('hex')

  beforeEach(async () => {
    ({ createMusicTrackImportHandler, createMusicMediaRetryHandler, MusicImportError } = await import('../../server/utils/music-media.ts'))
    root = await mkdtemp(join(tmpdir(), 'jukebox-import-test-'))
    state.session = { session: { userId: 1, userName: 'admin', permissions: ['tk_custom:jukebox:manage'] } }
    state.hasPermission = true
    state.albumId = '7'
    state.parts = [{ name: 'file', filename: 'fixture.wav', type: 'audio/wav', data: bytes }, { name: 'title', data: Buffer.from('Fixture') }]
    state.existingTrack = false
    state.mediaStatus = 'pending_sync'
    state.connection.beginTransaction.mockReset().mockResolvedValue(undefined)
    state.connection.commit.mockReset().mockResolvedValue(undefined)
    state.connection.rollback.mockReset().mockResolvedValue(undefined)
    state.connection.release.mockReset()
    state.pool.getConnection.mockReset().mockResolvedValue(state.connection)
    state.connection.query.mockReset().mockImplementation(async (options) => {
      const sql = options.sql
      if (sql.includes('FROM tk_music_album')) return [[{ album_id: 7 }], []]
      if (sql.includes('INSERT INTO tk_music_media')) return [{ insertId: 21 }, []]
      if (sql.includes('SELECT media_id, sync_status')) return [[{
        media_id: 21, sync_status: state.mediaStatus, player_sha256: null, sha256: digest,
      }], []]
      if (sql.includes('SELECT track_id FROM tk_music_track')) return [state.existingTrack ? [{ track_id: 31 }] : [], []]
      if (sql.includes('COALESCE(MAX(sort_order)')) return [[{ max_order: 0 }], []]
      if (sql.includes('INSERT INTO tk_music_track')) return [{ insertId: 31 }, []]
      return [{ affectedRows: 1 }, []]
    })
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(async () => {
    consoleError.mockRestore()
    await rm(root, { recursive: true, force: true })
  })

  const makeHandler = (overrides = {}) => createMusicTrackImportHandler({
    getSession: async () => state.session,
    can: () => state.hasPermission,
    readParts: async () => state.parts,
    getPool: () => state.pool,
    getConfig: () => ({
      jukeboxMediaBackupPath: join(root, 'private-media'),
      profilePath: join(root, 'public-profile'),
      jukeboxFfprobePath: 'ffprobe',
    }),
    probe: async () => ({ durationMs: 20_000, codec: 'pcm_s16le' }),
    syncMedia: async () => ({ ok: false, mediaId: 21, syncStatus: 'pending_sync', error: '播放器暂不可达' }),
    ...overrides,
  })

  it('checks management permission before reading the upload body', async () => {
    const handler = makeHandler({ can: () => false })
    await expect(handler({})).resolves.toEqual({ code: 403, msg: '没有权限访问该接口' })
    expect(state.pool.getConnection).not.toHaveBeenCalled()
  })

  it('rejects corrupted audio before backup or database writes', async () => {
    const handler = makeHandler({ probe: async () => { throw new MusicImportError('音频文件损坏或无法解码') } })
    await expect(handler({})).resolves.toEqual({ code: 400, msg: '音频文件损坏或无法解码' })
    expect(state.pool.getConnection).not.toHaveBeenCalled()
    await expect(readFile(join(root, 'private-media', digest.slice(0, 2), digest))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('deduplicates the same file in one album and keeps the original track row', async () => {
    state.existingTrack = true
    state.mediaStatus = 'ready'
    const handler = makeHandler({ syncMedia: vi.fn() })
    const result = await handler({})
    expect(result.data).toEqual(expect.objectContaining({ trackId: 31, mediaId: 21, duplicateTrack: true }))
    expect(state.connection.query.mock.calls.some(([query]) => query.sql.includes('INSERT INTO tk_music_track'))).toBe(false)
    expect(state.connection.commit).toHaveBeenCalledTimes(1)
  })

  it('keeps a verified private central backup and marks an offline player copy pending', async () => {
    const result = await makeHandler()({})
    const backupPath = join(root, 'private-media', digest.slice(0, 2), digest)
    expect(await readFile(backupPath)).toEqual(bytes)
    expect(result.data.copyStatus).toEqual(expect.objectContaining({ central: 'verified', player: 'pending_sync', playerSha256: null }))
    expect(state.connection.commit).toHaveBeenCalledTimes(1)
  })

  it('refuses to place the central backup under the public profile root', async () => {
    const handler = makeHandler({
      getConfig: () => ({ jukeboxMediaBackupPath: join(root, 'public-profile', 'music'), profilePath: join(root, 'public-profile'), jukeboxFfprobePath: 'ffprobe' }),
    })
    await expect(handler({})).resolves.toEqual(expect.objectContaining({ code: 500, msg: expect.stringContaining('公开 Profile') }))
    expect(state.pool.getConnection).not.toHaveBeenCalled()
  })

  it('refuses to place the central backup under the public profile fallback root', async () => {
    const fallbackProfileRoot = resolve(process.cwd(), 'runtime', 'uploadPath')
    const handler = makeHandler({
      getConfig: () => ({ jukeboxMediaBackupPath: join(fallbackProfileRoot, 'jukebox-media'), profilePath: join(root, 'profile'), jukeboxFfprobePath: 'ffprobe' }),
    })
    await expect(handler({})).resolves.toEqual(expect.objectContaining({ code: 500, msg: expect.stringContaining('公开 Profile') }))
    expect(state.pool.getConnection).not.toHaveBeenCalled()
  })

  it('retries failed or pending media sync by album or mediaId and triggers schedule sync when ready', async () => {
    const syncMedia = vi.fn(async (id) => ({ ok: id === 5, mediaId: id, syncStatus: id === 5 ? 'ready' : 'failed', error: id === 5 ? undefined : '文件缺失' }))
    const syncPlan = vi.fn(async () => ({ ok: true }))
    const query = vi.fn(async () => [[{ media_id: 5 }, { media_id: 6 }], []])

    const forbidden = createMusicMediaRetryHandler({
      getSession: async () => state.session,
      can: () => false,
    })
    await expect(forbidden({})).resolves.toEqual({ code: 403, msg: '没有权限访问该接口' })

    const batchHandler = createMusicMediaRetryHandler({
      getSession: async () => state.session,
      can: () => true,
      readBody: async () => ({ albumId: 7 }),
      getPool: () => ({ query }),
      syncMedia,
      syncPlan,
    })
    const batchRes = await batchHandler({})
    expect(batchRes.code).toBe(200)
    expect(batchRes.data).toMatchObject({ attempted: 2, ready: 1, pending: 0, failed: 1 })
    expect(syncMedia).toHaveBeenCalledWith(5, true)
    expect(syncMedia).toHaveBeenCalledWith(6, true)
    expect(syncPlan).toHaveBeenCalledTimes(1)

    const singleHandler = createMusicMediaRetryHandler({
      getSession: async () => state.session,
      can: () => true,
      readBody: async () => ({ mediaId: 9 }),
      getPool: () => ({ query }),
      syncMedia: vi.fn(async (id) => ({ ok: true, mediaId: id, syncStatus: 'ready' })),
      syncPlan: vi.fn(async () => ({ ok: true })),
    })
    const singleRes = await singleHandler({})
    expect(singleRes.data).toMatchObject({ attempted: 1, ready: 1 })
  })
})
