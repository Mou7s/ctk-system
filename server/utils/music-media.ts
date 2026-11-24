import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { chmod, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import type { H3Event } from 'h3'
import { getHeader, getRouterParam, readBody, readMultipartFormData } from 'h3'
import type { RowDataPacket } from 'mysql2/promise'
import { getAuthSession, hasPermission } from './auth'
import { getMysqlPool, mysqlQueryOptions } from './mysql'
import { getNitroServerConfig } from './runtime'
import { apiError, apiSuccess, errorMessage } from './response'
import { insertOperationLog } from './write'
import { JUKEBOX_PERMISSIONS } from './jukebox-permissions'
import { fetchPlayer, JukeboxRemoteError } from './jukebox-client'

const execFileAsync = promisify(execFile)
const MAX_AUDIO_BYTES = 250 * 1024 * 1024
const AUDIO_EXTENSIONS = new Set([
  '.aac', '.aiff', '.ape', '.flac', '.m4a', '.mp3', '.oga', '.ogg', '.opus', '.wav', '.wma',
])
const AUDIO_CODECS = new Set([
  'aac', 'ac3', 'alac', 'amr_nb', 'amr_wb', 'ape', 'eac3', 'flac', 'mp3',
  'opus', 'pcm_alaw', 'pcm_f32le', 'pcm_f64le', 'pcm_mulaw', 'pcm_s16be',
  'pcm_s16le', 'pcm_s24be', 'pcm_s24le', 'pcm_s32be', 'pcm_s32le', 'pcm_u8',
  'vorbis', 'wavpack', 'wma', 'wmav1', 'wmav2', 'wmavoice', 'wmapro', 'wmalossless',
])
const PROFILE_FALLBACK_PATH = join(process.cwd(), 'runtime', 'uploadPath')

export class MusicImportError extends Error {
  readonly statusCode: number

  constructor(message: string, statusCode = 400) {
    super(message)
    this.name = 'MusicImportError'
    this.statusCode = statusCode
  }
}

type AudioProbe = { durationMs: number; codec: string }
type MultipartPart = { name?: string; filename?: string; type?: string; data?: Buffer }
type MusicMediaRow = RowDataPacket & {
  media_id: number
  sha256: string
  file_name: string
  file_ext: string
  mime_type: string | null
  file_size: number
  duration_ms: number
  codec: string
  storage_key: string
  backup_sha256: string
  player_sha256: string | null
  player_path: string | null
  sync_status: 'pending_sync' | 'ready' | 'failed'
  last_sync_error: string | null
}

function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

function normalizedFileName(value: unknown): string {
  const raw = String(value || '').replace(/\\/g, '/').split('/').pop() || 'audio'
  const safe = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 255)
  return safe || 'audio'
}

function extensionOf(fileName: string): string {
  const extension = extname(fileName).toLowerCase()
  if (!AUDIO_EXTENSIONS.has(extension)) {
    throw new MusicImportError('只支持 MP3、M4A、AAC、FLAC、WAV、OGG、OPUS、AIFF、APE、WMA 音频')
  }
  return extension
}

function textField(parts: MultipartPart[], name: string): string {
  const part = parts.find((item) => item.name === name && !item.filename)
  return part?.data ? Buffer.from(part.data).toString('utf8').trim() : ''
}

export async function probeAudioBuffer(data: Buffer, extension: string, ffprobePath = 'ffprobe'): Promise<AudioProbe> {
  const directory = await mkdtemp(join(tmpdir(), 'ctk-jukebox-audio-'))
  const filePath = join(directory, 'input' + extension)
  try {
    await writeFile(filePath, data, { mode: 0o600, flag: 'wx' })
    let output: string
    try {
      const result = await execFileAsync(ffprobePath, [
        '-v', 'error', '-show_streams', '-show_format', '-of', 'json', filePath,
      ], { timeout: 20_000, maxBuffer: 1024 * 1024, windowsHide: true })
      output = result.stdout
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new MusicImportError('服务器未安装 ffprobe，无法校验音频', 503)
      }
      throw new MusicImportError('音频文件损坏或无法解码')
    }

    let metadata: Record<string, any>
    try {
      metadata = JSON.parse(output)
    } catch {
      throw new MusicImportError('音频文件元数据无法解析')
    }
    const streams = (Array.isArray(metadata.streams) ? metadata.streams : [])
      .filter((stream: Record<string, any>) => stream.codec_type === 'audio')
    if (!streams.length) throw new MusicImportError('文件中没有可播放的音频轨')
    const codec = String(streams[0].codec_name || '').toLowerCase()
    if (!AUDIO_CODECS.has(codec)) throw new MusicImportError('音频编码不受支持')
    const durationValue = metadata.format?.duration
      ?? streams.find((stream: Record<string, any>) => stream.duration)?.duration
    const durationMs = Math.round(Number(durationValue) * 1000)
    if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 24 * 60 * 60 * 1000) {
      throw new MusicImportError('音频时长无效或超过 24 小时')
    }
    return { durationMs, codec }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

function normalizeStorageKey(value: string, digest: string): string {
  const key = value.replace(/\\/g, '/')
  if (!new RegExp('^[a-f0-9]{2}/' + digest + '$').test(key)) {
    throw new MusicImportError('中央备份路径不符合规范', 500)
  }
  return key
}

function assertPrivateBackupRoot(rootValue: string, profileRootValue: string): string {
  const root = resolve(rootValue || join(homedir(), '.local', 'share', 'ctk-system', 'jukebox-media'))
  const profileRoots = [
    resolve(profileRootValue || join(homedir(), 'public-profile')),
    resolve(PROFILE_FALLBACK_PATH),
  ]
  if (profileRoots.some((profileRoot) =>
    root === profileRoot || root.startsWith(profileRoot + sep) || profileRoot.startsWith(root + sep),
  )) {
    throw new MusicImportError('广播备份目录必须与公开 Profile 目录隔离', 500)
  }
  return root
}

function isPathWithin(parent: string, candidate: string): boolean {
  const relation = relative(parent, candidate)
  return relation === '' || (relation !== '..' && !relation.startsWith('..' + sep) && !isAbsolute(relation))
}

async function realPathWithMissingTail(value: string): Promise<string> {
  let candidate = resolve(value)
  const missingParts: string[] = []
  while (true) {
    try {
      return resolve(await realpath(candidate), ...missingParts)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const parent = dirname(candidate)
      if (parent === candidate) return resolve(candidate, ...missingParts)
      missingParts.unshift(basename(candidate))
      candidate = parent
    }
  }
}

async function resolvePrivateMediaRoot(rootValue: string, profileRootValue: string): Promise<string> {
  const root = assertPrivateBackupRoot(rootValue, profileRootValue)
  const profileRoots = [
    resolve(profileRootValue || join(homedir(), 'public-profile')),
    resolve(PROFILE_FALLBACK_PATH),
  ]
  const [realRoot, realProfileRoots] = await Promise.all([
    realPathWithMissingTail(root),
    Promise.all(profileRoots.map((profileRoot) => realPathWithMissingTail(profileRoot))),
  ])
  if (realProfileRoots.some((profileRoot) =>
    isPathWithin(profileRoot, realRoot) || isPathWithin(realRoot, profileRoot),
  )) {
    throw new MusicImportError('广播备份目录必须与公开 Profile 目录隔离', 500)
  }
  return realRoot
}

async function resolvePrivateMediaDirectory(root: string, profileRootValue: string, prefix: string): Promise<string> {
  const directory = resolve(root, prefix)
  const profileRoots = [
    resolve(profileRootValue || join(homedir(), 'public-profile')),
    resolve(PROFILE_FALLBACK_PATH),
  ]
  const [realRoot, realDirectory, realProfileRoots] = await Promise.all([
    realpath(root),
    realpath(directory),
    Promise.all(profileRoots.map((profileRoot) => realPathWithMissingTail(profileRoot))),
  ])
  if (!isPathWithin(realRoot, realDirectory)
    || realProfileRoots.some((profileRoot) =>
      isPathWithin(profileRoot, realDirectory) || isPathWithin(realDirectory, profileRoot),
    )) {
    throw new MusicImportError('中央备份目录不能通过公开 Profile 路由访问', 500)
  }
  return realDirectory
}

export async function ensurePrivateMediaBackup(
  data: Buffer,
  backupRootValue: string,
  profileRootValue: string,
  requestedStorageKey?: string,
): Promise<{ storageKey: string; backupSha256: string }> {
  const digest = sha256(data)
  let root = await resolvePrivateMediaRoot(backupRootValue, profileRootValue)
  const storageKey = normalizeStorageKey(requestedStorageKey || digest.slice(0, 2) + '/' + digest, digest)
  await mkdir(root, { recursive: true, mode: 0o700 })
  await chmod(root, 0o700).catch(() => {})
  root = await resolvePrivateMediaRoot(root, profileRootValue)
  const [prefix, fileName] = storageKey.split('/')
  const requestedDirectory = resolve(root, prefix)
  if (!isPathWithin(root, requestedDirectory)) throw new MusicImportError('中央备份路径越界', 500)
  try {
    const directoryStat = await lstat(requestedDirectory)
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
      throw new MusicImportError('中央备份目录不能是链接', 500)
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    await mkdir(requestedDirectory, { recursive: true, mode: 0o700 })
  }
  await chmod(requestedDirectory, 0o700).catch(() => {})
  const directory = await resolvePrivateMediaDirectory(root, profileRootValue, prefix)
  const target = resolve(directory, fileName)
  if (!isPathWithin(root, target)) throw new MusicImportError('中央备份路径越界', 500)
  const verifiedDirectory = await resolvePrivateMediaDirectory(root, profileRootValue, prefix)
  if (verifiedDirectory !== directory) throw new MusicImportError('中央备份目录路径发生变化', 500)
  try {
    const currentStat = await lstat(target)
    if (currentStat.isFile() && !currentStat.isSymbolicLink()) {
      const current = await readFile(target)
      if (sha256(current) === digest) return { storageKey, backupSha256: digest }
    }
  } catch {
    // A missing or unreadable copy is replaced below.
  }

  const temporary = target + '.' + randomUUID() + '.tmp'
  try {
    await writeFile(temporary, data, { flag: 'wx', mode: 0o600 })
    if (sha256(await readFile(temporary)) !== digest) {
      throw new MusicImportError('中央备份校验失败', 500)
    }
    await rename(temporary, target)
  } finally {
    await rm(temporary, { force: true })
  }
  return { storageKey, backupSha256: digest }
}

async function resolvePrivateBackupPath(rootValue: string, profileRootValue: string, storageKey: string, digest: string) {
  const root = await resolvePrivateMediaRoot(rootValue, profileRootValue)
  const normalized = normalizeStorageKey(storageKey, digest)
  const [prefix, fileName] = normalized.split('/')
  const directory = await resolvePrivateMediaDirectory(root, profileRootValue, prefix)
  const target = resolve(directory, fileName)
  if (!isPathWithin(root, target) || !isAbsolute(target)) throw new Error('invalid private backup path')
  return target
}

async function updateMediaSyncResult(
  mediaId: number,
  result: { status: 'ready' | 'pending_sync' | 'failed'; playerSha256?: string | null; playerPath?: string | null; error?: string | null },
) {
  await getMysqlPool().query(mysqlQueryOptions(
    'UPDATE tk_music_media SET sync_status = ?, player_sha256 = ?, player_path = ?, last_sync_error = ?, ' +
    'player_verified_at = CASE WHEN ? = ? THEN NOW() ELSE player_verified_at END, update_time = NOW() ' +
    'WHERE media_id = ?',
  ), [
    result.status,
    result.playerSha256 ?? null,
    result.playerPath ?? null,
    result.error?.slice(0, 500) ?? null,
    result.status,
    'ready',
    mediaId,
  ])
}

function sha256File(filePath: string): Promise<string> {
  return new Promise((resolveHash, rejectHash) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolveHash(hash.digest('hex')))
    stream.on('error', rejectHash)
  })
}

export async function syncMusicMediaById(mediaId: number, force = false): Promise<{
  ok: boolean
  mediaId: number
  syncStatus: 'ready' | 'pending_sync' | 'failed'
  error?: string
}> {
  const [rows] = await getMysqlPool().query<MusicMediaRow[]>(mysqlQueryOptions(
    'SELECT media_id, sha256, file_name, file_ext, mime_type, file_size, duration_ms, codec, ' +
    'storage_key, backup_sha256, player_sha256, player_path, sync_status, last_sync_error ' +
    'FROM tk_music_media WHERE media_id = ? LIMIT 1',
  ), [mediaId])
  const media = rows[0]
  if (!media) throw new MusicImportError('媒体资源不存在', 404)
  if (!force && media.sync_status === 'ready' && media.player_sha256 === media.sha256) {
    return { ok: true, mediaId, syncStatus: 'ready' }
  }

  const config = getNitroServerConfig()
  const isRemoteMode = config.jukeboxEngineMode === 'remote'
  const storageKey = normalizeStorageKey(media.storage_key, media.sha256)
  let file: Buffer | null = null
  try {
    const filePath = await resolvePrivateBackupPath(
      config.jukeboxMediaBackupPath,
      config.profilePath,
      media.storage_key,
      media.sha256,
    )
    const fileStat = await lstat(filePath)
    if (!fileStat.isFile() || fileStat.isSymbolicLink()) throw new Error('backup file is not a regular file')
    let actualDigest = ''
    if (isRemoteMode) {
      file = await readFile(filePath)
      actualDigest = sha256(file)
    } else {
      actualDigest = await sha256File(filePath)
    }
    if (actualDigest !== media.sha256 || media.backup_sha256 !== media.sha256) {
      await updateMediaSyncResult(mediaId, { status: 'failed', error: '中央备份校验失败' })
      return { ok: false, mediaId, syncStatus: 'failed', error: '中央备份校验失败' }
    }
  } catch (error) {
    const message = '中央备份不可读取或校验失败'
    await updateMediaSyncResult(mediaId, { status: 'failed', error: message })
    return { ok: false, mediaId, syncStatus: 'failed', error: message }
  }

  try {
    const response = await fetchPlayer('/api/media', {
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream',
        'x-media-id': String(media.media_id),
        'x-media-sha256': media.sha256,
        'x-media-duration-ms': String(media.duration_ms),
        'x-media-codec': media.codec,
        'x-media-extension': String(media.file_ext || '').toLowerCase(),
        'x-media-name': encodeURIComponent(media.file_name),
        'x-media-storage-key': storageKey,
      },
      ...(file ? { body: file } : {}),
    }, config.jukeboxMediaTimeoutMs)
    const details = response.details || {}
    const playerSha256 = String(details.playerSha256 || details.sha256 || '').toLowerCase()
    const playerPath = String(details.relativePath || '')
    if (Number(details.mediaId) !== mediaId || playerSha256 !== media.sha256 || !playerPath) {
      await updateMediaSyncResult(mediaId, {
        status: 'pending_sync',
        playerSha256: playerSha256 || null,
        playerPath: null,
        error: '播放器副本校验未通过',
      })
      return { ok: false, mediaId, syncStatus: 'pending_sync', error: '播放器副本校验未通过' }
    }
    await updateMediaSyncResult(mediaId, {
      status: 'ready',
      playerSha256,
      playerPath,
      error: null,
    })
    return { ok: true, mediaId, syncStatus: 'ready' }
  } catch (error) {
    const rejectedAudio = error instanceof JukeboxRemoteError
      && [400, 413, 415, 422].includes(error.statusCode)
    const status = rejectedAudio ? 'failed' : 'pending_sync'
    const message = rejectedAudio
      ? '播放器拒绝该音频文件'
      : error instanceof JukeboxRemoteError ? '播放器暂不可达' : '播放器副本同步失败'
    await updateMediaSyncResult(mediaId, {
      status,
      playerSha256: null,
      playerPath: null,
      error: message,
    })
    return {
      ok: false,
      mediaId,
      syncStatus: status,
      error: message,
    }
  }
}

export async function syncPendingMusicMedia(limit = 3): Promise<{
  attempted: number
  ready: number
  pending: number
  failed: number
}> {
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)))
  const [rows] = await getMysqlPool().query<RowDataPacket[]>(mysqlQueryOptions(
    'SELECT media_id FROM tk_music_media WHERE sync_status = ? ' +
    'ORDER BY update_time, media_id LIMIT ?',
  ), ['pending_sync', safeLimit])
  let ready = 0
  let pending = 0
  let failed = 0
  for (const row of rows) {
    const result = await syncMusicMediaById(Number(row.media_id))
    if (result.syncStatus === 'ready') ready += 1
    else if (result.syncStatus === 'failed') failed += 1
    else pending += 1
  }
  return { attempted: rows.length, ready, pending, failed }
}

type ImportDependencies = {
  getSession: typeof getAuthSession
  can: typeof hasPermission
  readParts: typeof readMultipartFormData
  getPool: typeof getMysqlPool
  getConfig: typeof getNitroServerConfig
  probe: typeof probeAudioBuffer
  backup: typeof ensurePrivateMediaBackup
  syncMedia: typeof syncMusicMediaById
}

const defaultImportDependencies: ImportDependencies = {
  getSession: getAuthSession,
  can: hasPermission,
  readParts: readMultipartFormData,
  getPool: getMysqlPool,
  getConfig: getNitroServerConfig,
  probe: probeAudioBuffer,
  backup: ensurePrivateMediaBackup,
  syncMedia: syncMusicMediaById,
}

export function createMusicTrackImportHandler(overrides: Partial<ImportDependencies> = {}) {
  const dependencies = { ...defaultImportDependencies, ...overrides }
  return async (event: H3Event) => {
    const authenticated = await dependencies.getSession(event)
    if (!authenticated) return apiError('登录状态已过期', 401)
    if (!dependencies.can(authenticated.session, JUKEBOX_PERMISSIONS.manage)) {
      return apiError('没有权限访问该接口', 403)
    }

    try {
      const contentLength = Number(getHeader(event, 'content-length') || 0)
      if (contentLength > MAX_AUDIO_BYTES + 1024 * 1024) throw new MusicImportError('音频文件大小超出限制', 413)
      const albumId = Number(getRouterParam(event, 'albumId'))
      if (!Number.isSafeInteger(albumId) || albumId <= 0) throw new MusicImportError('专辑ID不符合规范')
      const parts = (await dependencies.readParts(event) || []) as MultipartPart[]
      const files = parts.filter((part) => part.name === 'file' && Boolean(part.filename))
      if (files.length !== 1) throw new MusicImportError('每次只能上传一个音频文件')
      const file = files[0]
      const data = Buffer.from(file.data || [])
      if (!data.length || data.length > MAX_AUDIO_BYTES) throw new MusicImportError('音频文件大小超出限制')
      const fileName = normalizedFileName(file.filename)
      const extension = extensionOf(fileName)
      const titleValue = textField(parts, 'title')
      const artist = textField(parts, 'artist')
      const title = (titleValue || fileName.slice(0, -extension.length)).trim()
      if (!title || title.length > 300) throw new MusicImportError('曲目标题不能为空且不能超过 300 个字符')
      if (artist.length > 200) throw new MusicImportError('艺术家名称不能超过 200 个字符')

      const config = dependencies.getConfig()
      const probe = await dependencies.probe(data, extension, config.jukeboxFfprobePath)
      const digest = sha256(data)
      const backup = await dependencies.backup(
        data,
        config.jukeboxMediaBackupPath,
        config.profilePath,
        digest.slice(0, 2) + '/' + digest,
      )
      if (backup.backupSha256 !== digest) throw new MusicImportError('中央备份校验失败', 500)

      const connection = await dependencies.getPool().getConnection()
      let mediaId = 0
      let trackId = 0
      let duplicateTrack = false
      let mediaStatus: string = 'pending_sync'
      try {
        await connection.beginTransaction()
        const [albumRows] = await connection.query<RowDataPacket[]>(
          mysqlQueryOptions('SELECT album_id FROM tk_music_album WHERE album_id = ? LIMIT 1 FOR UPDATE'),
          [albumId],
        )
        if (!albumRows[0]) throw new MusicImportError('曲库不存在', 404)

        const [mediaInsert] = await connection.query<any>(mysqlQueryOptions(
          'INSERT INTO tk_music_media ' +
          '(sha256, file_name, file_ext, mime_type, file_size, duration_ms, codec, storage_key, backup_sha256, sync_status, create_time, update_time) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW()) ' +
          'ON DUPLICATE KEY UPDATE media_id = LAST_INSERT_ID(media_id), backup_sha256 = VALUES(backup_sha256), update_time = NOW()',
        ), [
          digest,
          fileName,
          extension,
          String(file.type || '').slice(0, 100) || null,
          data.length,
          probe.durationMs,
          probe.codec,
          backup.storageKey,
          backup.backupSha256,
          'pending_sync',
        ])
        mediaId = Number(mediaInsert.insertId || mediaInsert[0]?.insertId)
        const [mediaRows] = await connection.query<MusicMediaRow[]>(mysqlQueryOptions(
          'SELECT media_id, sync_status, player_sha256, sha256 FROM tk_music_media WHERE sha256 = ? LIMIT 1 FOR UPDATE',
        ), [digest])
        const mediaRow = mediaRows[0]
        if (!mediaRow) throw new Error('media insert failed')
        mediaId = Number(mediaRow.media_id)
        mediaStatus = mediaRow.sync_status

        const [trackRows] = await connection.query<RowDataPacket[]>(mysqlQueryOptions(
          'SELECT track_id FROM tk_music_track WHERE album_id = ? AND media_id = ? LIMIT 1 FOR UPDATE',
        ), [albumId, mediaId])
        if (trackRows[0]) {
          trackId = Number(trackRows[0].track_id)
          duplicateTrack = true
        } else {
          const [sortRows] = await connection.query<RowDataPacket[]>(mysqlQueryOptions(
            'SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM tk_music_track WHERE album_id = ?',
          ), [albumId])
          const sortOrder = Number(sortRows[0]?.max_order || 0) + 1
          const [trackInsert] = await connection.query<any>(mysqlQueryOptions(
            'INSERT INTO tk_music_track ' +
            '(album_id, video_id, media_id, title, url, channel, thumbnail, duration, sort_order, create_time, update_time) ' +
            'VALUES (?, NULL, ?, ?, NULL, ?, NULL, ?, ?, NOW(), NOW())',
          ), [albumId, mediaId, title, artist || null, Math.max(1, Math.ceil(probe.durationMs / 1000)), sortOrder])
          trackId = Number(trackInsert.insertId || trackInsert[0]?.insertId)
          await connection.query(mysqlQueryOptions(
            'UPDATE tk_music_album SET track_count = ' +
            '(SELECT COUNT(*) FROM tk_music_track WHERE album_id = ?) WHERE album_id = ?',
          ), [albumId, albumId])
        }
        await insertOperationLog(event, connection, authenticated.session, 'MusicTrackImport', 1, {
          albumId,
          trackId,
          mediaId,
          sha256: digest,
          duplicateTrack,
        })
        await connection.commit()
      } catch (error) {
        try {
          await connection.rollback()
        } catch {
          // Preserve the original database error.
        }
        throw error
      } finally {
        connection.release()
      }

      let syncResult: Awaited<ReturnType<typeof syncMusicMediaById>> | null = null
      if (mediaStatus !== 'ready') {
        syncResult = await dependencies.syncMedia(mediaId)
        mediaStatus = syncResult.syncStatus
      }
      return apiSuccess({
        trackId,
        mediaId,
        durationMs: probe.durationMs,
        duration: Math.max(1, Math.ceil(probe.durationMs / 1000)),
        duplicateTrack,
        copyStatus: {
          central: 'verified',
          player: mediaStatus,
          centralSha256: digest,
          playerSha256: syncResult?.syncStatus === 'ready' ? digest : null,
          error: syncResult?.error || null,
        },
      })
    } catch (error) {
      if (error instanceof MusicImportError) return apiError(error.message, error.statusCode)
      console.error('[NitroMusicImport] failed:', errorMessage(error, 'unknown error'))
      return apiError('音频导入失败，请稍后重试', 500)
    }
  }
}

type RetryDependencies = {
  getSession: typeof getAuthSession
  can: typeof hasPermission
  readBody: typeof readBody
  getPool: typeof getMysqlPool
  syncMedia: typeof syncMusicMediaById
  syncPlan: () => Promise<unknown>
}

const defaultRetryDependencies: RetryDependencies = {
  getSession: getAuthSession,
  can: hasPermission,
  readBody,
  getPool: getMysqlPool,
  syncMedia: syncMusicMediaById,
  syncPlan: async () => {
    const { syncMusicPlan } = await import('./music-write')
    return syncMusicPlan()
  },
}

/**
 * 手动触发单个或批量未就绪（pending_sync / failed / 校验不一致）本地媒体的重试同步。
 */
export function createMusicMediaRetryHandler(overrides: Partial<RetryDependencies> = {}) {
  const dependencies = { ...defaultRetryDependencies, ...overrides }
  return async (event: H3Event) => {
    const authenticated = await dependencies.getSession(event)
    if (!authenticated) return apiError('登录状态已过期', 401)
    if (!dependencies.can(authenticated.session, JUKEBOX_PERMISSIONS.manage)) {
      return apiError('没有权限访问该接口', 403)
    }

    let body: Record<string, any> = {}
    try {
      const raw = await dependencies.readBody(event)
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) body = raw as Record<string, any>
    } catch {
      body = {}
    }

    try {
      const targetMediaId = body.mediaId != null && String(body.mediaId).trim() !== ''
        ? Number(body.mediaId)
        : null
      const targetAlbumId = body.albumId != null && String(body.albumId).trim() !== ''
        ? Number(body.albumId)
        : null
      if (targetMediaId !== null && (!Number.isSafeInteger(targetMediaId) || targetMediaId <= 0)) {
        return apiError('媒体ID不符合规范', 400)
      }
      if (targetAlbumId !== null && (!Number.isSafeInteger(targetAlbumId) || targetAlbumId <= 0)) {
        return apiError('专辑ID不符合规范', 400)
      }

      let mediaIds: number[] = []
      if (targetMediaId !== null) {
        mediaIds = [targetMediaId]
      } else {
        const limit = Math.max(1, Math.min(50, Math.floor(Number(body.limit || 50))))
        const pool = dependencies.getPool()
        const [rows] = targetAlbumId !== null
          ? await pool.query<RowDataPacket[]>(mysqlQueryOptions(
            'SELECT DISTINCT m.media_id FROM tk_music_track t ' +
            'INNER JOIN tk_music_media m ON m.media_id = t.media_id ' +
            'WHERE t.album_id = ? AND (m.sync_status IN (?, ?) OR m.player_sha256 IS NULL OR m.player_sha256 <> m.sha256) ' +
            'ORDER BY m.update_time, m.media_id LIMIT ?',
          ), [targetAlbumId, 'pending_sync', 'failed', limit])
          : await pool.query<RowDataPacket[]>(mysqlQueryOptions(
            'SELECT media_id FROM tk_music_media ' +
            'WHERE sync_status IN (?, ?) OR player_sha256 IS NULL OR player_sha256 <> sha256 ' +
            'ORDER BY update_time, media_id LIMIT ?',
          ), ['pending_sync', 'failed', limit])
        mediaIds = rows.map((row) => Number(row.media_id)).filter((id) => Number.isSafeInteger(id) && id > 0)
      }

      const items: Array<{ ok: boolean; mediaId: number; syncStatus: string; error?: string }> = []
      let ready = 0
      let pending = 0
      let failed = 0
      for (const id of mediaIds) {
        const result = await dependencies.syncMedia(id, true)
        items.push(result)
        if (result.syncStatus === 'ready') ready += 1
        else if (result.syncStatus === 'failed') failed += 1
        else pending += 1
      }

      if (ready > 0) {
        try {
          await dependencies.syncPlan()
        } catch (error) {
          console.error('[NitroMusicMediaRetry] schedule sync after retry failed:', errorMessage(error, 'unknown error'))
        }
      }

      return apiSuccess({
        attempted: mediaIds.length,
        ready,
        pending,
        failed,
        items,
      }, mediaIds.length === 0 ? '当前没有待同步或异常的媒体资源' : '媒体同步重试完成')
    } catch (error) {
      if (error instanceof MusicImportError) return apiError(error.message, error.statusCode)
      console.error('[NitroMusicMediaRetry] failed:', errorMessage(error, 'unknown error'))
      return apiError('媒体同步重试失败，请稍后重试', 500)
    }
  }
}

export const retryMusicMediaSyncHandler = createMusicMediaRetryHandler()
