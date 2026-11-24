import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { JukeboxCommandError, PlayerEngine } from './player-engine'

const SHA256_RE = /^[a-f0-9]{64}$/
const ALLOWED_MEDIA_EXTENSIONS = new Set([
  '', '.aac', '.aiff', '.ape', '.flac', '.m4a', '.mp3', '.oga', '.ogg', '.opus', '.wav', '.wma',
])

function jsonFetchResult(details: any, status = 200) {
  const response = new Response(JSON.stringify(details), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
  return { response, details }
}

function parseJsonBody(body: BodyInit | null | undefined): Record<string, any> {
  if (!body) return {}
  if (typeof body === 'string') {
    const trimmed = body.trim()
    if (!trimmed) return {}
    const parsed = JSON.parse(trimmed)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new JukeboxCommandError('request payload must be a JSON object', 400)
    }
    return parsed
  }
  throw new JukeboxCommandError('unsupported request payload', 400)
}

async function readBodyBuffer(body: BodyInit | null | undefined): Promise<Buffer | null> {
  if (body == null) return null
  if (Buffer.isBuffer(body)) return body
  if (body instanceof Uint8Array) return Buffer.from(body)
  if (body instanceof ArrayBuffer) return Buffer.from(body)
  if (typeof body === 'string') return Buffer.from(body)
  return Buffer.from(await new Response(body).arrayBuffer())
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

function normalizeRelativeMediaKey(storageKeyRaw: string, digest: string): string {
  const expected = `${digest.slice(0, 2)}/${digest}`
  const cleaned = String(storageKeyRaw || '').replaceAll('\\', '/').trim()
  if (!cleaned) return expected
  if (cleaned === expected || cleaned.startsWith(`${expected}.`)) return cleaned
  throw new JukeboxCommandError('invalid media storage key', 400)
}

function assertSafeTarget(rootDir: string, relativeKey: string): string {
  const root = resolve(rootDir)
  const target = resolve(root, relativeKey)
  const rel = relative(root, target)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    throw new JukeboxCommandError('media path escapes root directory', 400)
  }
  return target
}

async function handleEmbeddedMediaRegister(
  engine: PlayerEngine,
  headers: Headers,
  body: BodyInit | null | undefined,
  mediaBackupDir: string,
) {
  const mediaId = String(headers.get('x-media-id') || '').trim()
  const digest = String(headers.get('x-media-sha256') || '').toLowerCase().trim()
  const durationMs = Math.max(0, Math.trunc(Number(headers.get('x-media-duration-ms') || 0)))
  const codec = String(headers.get('x-media-codec') || '').slice(0, 40)
  const extension = String(headers.get('x-media-extension') || '').toLowerCase().trim()
  const originalName = decodeURIComponent(String(headers.get('x-media-name') || '')).slice(0, 255)
  const storageKeyHeader = String(headers.get('x-media-storage-key') || '').trim()

  if (!/^\d+$/.test(mediaId) || Number(mediaId) <= 0) {
    throw new JukeboxCommandError('invalid media id', 400)
  }
  if (!SHA256_RE.test(digest)) {
    throw new JukeboxCommandError('invalid SHA-256', 400)
  }
  if (!ALLOWED_MEDIA_EXTENSIONS.has(extension)) {
    throw new JukeboxCommandError('unsupported audio extension', 400)
  }

  const relativePath = normalizeRelativeMediaKey(storageKeyHeader, digest)
  const target = assertSafeTarget(mediaBackupDir, relativePath)
  const bytes = await readBodyBuffer(body)

  let fileSize = 0
  if (bytes) {
    if (bytes.length === 0) throw new JukeboxCommandError('audio payload is empty', 400)
    if (createHash('sha256').update(bytes).digest('hex') !== digest) {
      throw new JukeboxCommandError('uploaded audio checksum does not match', 400)
    }
    fileSize = bytes.length
    let alreadyPresent = false
    try {
      const existingStat = await lstat(target)
      if (existingStat.isFile() && !existingStat.isSymbolicLink() && (await sha256File(target)) === digest) {
        alreadyPresent = true
      }
    } catch { /* missing file will be written */ }
    if (!alreadyPresent) {
      await mkdir(resolve(target, '..'), { recursive: true, mode: 0o700 })
      const temp = `${target}.${process.pid}.${Date.now()}.tmp`
      try {
        await writeFile(temp, bytes, { flag: 'wx', mode: 0o600 })
        await rename(temp, target)
      } finally {
        await rm(temp, { force: true }).catch(() => {})
      }
    }
  } else {
    let fileStat
    try {
      fileStat = await lstat(target)
    } catch {
      throw new JukeboxCommandError('local media file is missing', 400)
    }
    if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
      throw new JukeboxCommandError('local media file is invalid', 400)
    }
    if ((await sha256File(target)) !== digest) {
      throw new JukeboxCommandError('stored audio checksum does not match', 400)
    }
    fileSize = fileStat.size
  }

  const manifest = engine.registerMedia({
    mediaId,
    sha256: digest,
    relativePath,
    durationMs,
    codec,
    fileSize,
  })

  return {
    ok: true,
    mediaId: Number(mediaId),
    sha256: digest,
    playerSha256: digest,
    durationMs,
    codec,
    fileSize,
    relativePath,
    originalName,
    verifiedAt: manifest.verifiedAt,
  }
}

/**
 * 将原独立播放器 HTTP 路径直接分发至 Nitro 同进程内嵌引擎。
 */
export async function dispatchEmbeddedPlayer(
  engine: PlayerEngine,
  path: string,
  init: RequestInit = {},
  mediaBackupDir = '',
) {
  const cleanPath = String(path || '').split('?')[0] || '/'
  const method = String(init.method || 'GET').toUpperCase()
  const headers = new Headers(init.headers)

  if (method === 'GET') {
    if (cleanPath === '/api/health') return jsonFetchResult(engine.getHealth())
    if (cleanPath === '/api/player') return jsonFetchResult({ player: engine.getPlayerStateResponse() })
    if (cleanPath === '/api/queue') return jsonFetchResult(engine.getQueue())
    if (cleanPath === '/api/now-playing' || cleanPath === '/api/status') {
      return jsonFetchResult(engine.getPlayerStateResponse())
    }
    if (cleanPath === '/api/schedule/status') return jsonFetchResult(engine.getScheduleStatus())
    if (cleanPath === '/api/media/status') return jsonFetchResult(engine.getMediaStatus())
    return jsonFetchResult({ error: 'not found' }, 404)
  }

  if (method === 'POST') {
    if (cleanPath === '/api/media') {
      try {
        const result = await handleEmbeddedMediaRegister(engine, headers, init.body, mediaBackupDir)
        return jsonFetchResult(result, 200)
      } catch (error) {
        if (error instanceof JukeboxCommandError) {
          return jsonFetchResult({ ok: false, error: error.message }, error.statusCode)
        }
        return jsonFetchResult({ ok: false, error: 'audio verification or storage failed' }, 502)
      }
    }

    let data: Record<string, any>
    try {
      data = parseJsonBody(init.body)
    } catch (error) {
      const status = error instanceof JukeboxCommandError ? error.statusCode : 400
      return jsonFetchResult({ error: (error as Error).message }, status)
    }

    try {
      if (cleanPath === '/api/schedule/sync') return jsonFetchResult(engine.syncPlan(data))
      if (cleanPath === '/api/player/stop') return jsonFetchResult(await engine.stop())
      if (cleanPath === '/api/player/next') return jsonFetchResult(await engine.next())
      if (cleanPath === '/api/player/volume') return jsonFetchResult(await engine.setVolume(data.volume))
      if (cleanPath === '/pause') return jsonFetchResult(await engine.pause())
      if (cleanPath === '/resume') return jsonFetchResult(await engine.resume())
      if (cleanPath === '/api/queue') return jsonFetchResult(await engine.enqueue(data))
      if (cleanPath === '/api/player/play') return jsonFetchResult(await engine.play(data))
      return jsonFetchResult({ error: 'not found' }, 404)
    } catch (error) {
      if (error instanceof JukeboxCommandError) {
        return jsonFetchResult({ ok: false, error: error.message }, error.statusCode)
      }
      return jsonFetchResult({ ok: false, error: 'player request failed' }, 500)
    }
  }

  if (method === 'DELETE' && cleanPath.startsWith('/api/queue/')) {
    const id = cleanPath.slice('/api/queue/'.length)
    try {
      return jsonFetchResult(await engine.deleteQueueItem(id))
    } catch (error) {
      if (error instanceof JukeboxCommandError) {
        return jsonFetchResult({ error: error.message }, error.statusCode)
      }
      return jsonFetchResult({ error: 'player request failed' }, 500)
    }
  }

  return jsonFetchResult({ error: 'not found' }, 404)
}
