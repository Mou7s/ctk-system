import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dispatchEmbeddedPlayer } from '../../server/utils/jukebox/dispatcher.ts'
import { PlayerEngine } from '../../server/utils/jukebox/player-engine.ts'

function createFakeProc() {
  const proc = new EventEmitter()
  proc.exitCode = null
  proc.signalCode = null
  proc.killed = false
  proc.stderr = new EventEmitter()
  proc.kill = vi.fn((sig = 'SIGTERM') => {
    proc.killed = true
    proc.signalCode = sig
    proc.exitCode = sig === 'SIGTERM' ? 143 : 137
    queueMicrotask(() => proc.emit('exit', null, sig))
    return true
  })
  return proc
}

describe('Jukebox PlayerEngine & Embedded Dispatcher', () => {
  let root
  let mediaDir
  let statePath
  let procs
  let sendIpcCommand
  let readIpcProperty
  let engine

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'jukebox-player-test-'))
    mediaDir = join(root, 'media')
    statePath = join(root, 'state', 'schedule_state.json')
    mkdirSync(mediaDir, { recursive: true })
    procs = []
    sendIpcCommand = vi.fn(async () => true)
    readIpcProperty = vi.fn(async () => null)
    engine = new PlayerEngine({
      mediaDir,
      statePath,
      ipcPath: join(root, 'mpv.sock'),
      pulseServer: 'unix:/run/user/1000/pulse/native',
      playbackRetries: 2,
      startupProbeMs: 15,
      clock: () => 1763352000000,
      log: () => {},
      checkMpvAvailable: () => true,
      sendIpcCommand,
      readIpcProperty,
      spawnProcess: vi.fn(() => {
        const proc = createFakeProc()
        procs.push(proc)
        return proc
      }),
    })
  })

  afterEach(() => {
    engine.shutdown()
    rmSync(root, { recursive: true, force: true })
  })

  it('registers media cleanly via storageKey without body upload and verifies uploaded checksums', async () => {
    const audioBytes = Buffer.from('mp3-frame-payload')
    const digest = createHash('sha256').update(audioBytes).digest('hex')
    const storageKey = `${digest.slice(0, 2)}/${digest}`
    mkdirSync(join(mediaDir, digest.slice(0, 2)), { recursive: true })
    writeFileSync(join(mediaDir, storageKey), audioBytes)

    // Zero-copy registration from local storageKey
    const regRes = await dispatchEmbeddedPlayer(engine, '/api/media', {
      method: 'POST',
      headers: {
        'x-media-id': '12',
        'x-media-sha256': digest,
        'x-media-duration-ms': '45000',
        'x-media-codec': 'mp3',
        'x-media-extension': '.mp3',
        'x-media-name': encodeURIComponent('demo.mp3'),
        'x-media-storage-key': storageKey,
      },
    }, mediaDir)
    expect(regRes.response.status).toBe(200)
    expect(regRes.details).toMatchObject({ ok: true, mediaId: 12, playerSha256: digest, relativePath: storageKey })

    // Body upload path rejects checksum mismatch cleanly
    const badRes = await dispatchEmbeddedPlayer(engine, '/api/media', {
      method: 'POST',
      headers: {
        'x-media-id': '13',
        'x-media-sha256': 'a'.repeat(64),
        'x-media-extension': '.mp3',
      },
      body: Buffer.from('tampered'),
    }, mediaDir)
    expect(badRes.response.status).toBe(400)
    expect(badRes.details.ok).toBe(false)

    // Good body upload persists atomically
    const bytes2 = Buffer.from('second-track')
    const digest2 = createHash('sha256').update(bytes2).digest('hex')
    const okUpload = await dispatchEmbeddedPlayer(engine, '/api/media', {
      method: 'POST',
      headers: {
        'x-media-id': '14',
        'x-media-sha256': digest2,
        'x-media-duration-ms': '30000',
        'x-media-codec': 'mp3',
        'x-media-extension': '.mp3',
      },
      body: bytes2,
    }, mediaDir)
    expect(okUpload.response.status).toBe(200)
    expect(readFileSync(join(mediaDir, `${digest2.slice(0, 2)}/${digest2}`))).toEqual(bytes2)
  })

  it('plays, queues, advances on EOF, pauses/resumes, sets volume, and stops cleanly', async () => {
    const b1 = Buffer.from('song-one')
    const s1 = createHash('sha256').update(b1).digest('hex')
    const b2 = Buffer.from('song-two')
    const s2 = createHash('sha256').update(b2).digest('hex')
    for (const [id, bytes, sha] of [[1, b1, s1], [2, b2, s2]]) {
      mkdirSync(join(mediaDir, sha.slice(0, 2)), { recursive: true })
      writeFileSync(join(mediaDir, `${sha.slice(0, 2)}/${sha}`), bytes)
      engine.registerMedia({ mediaId: id, sha256: sha, relativePath: `${sha.slice(0, 2)}/${sha}`, durationMs: 30000, codec: 'mp3', fileSize: bytes.length })
    }

    const playRes = await dispatchEmbeddedPlayer(engine, '/api/player/play', {
      method: 'POST',
      body: JSON.stringify({
        song: { trackId: 101, mediaId: 1, sha256: s1, title: 'Song One', durationMs: 30000 },
        queue: [{ trackId: 102, mediaId: 2, sha256: s2, title: 'Song Two', durationMs: 30000 }],
      }),
    }, mediaDir)
    expect(playRes.response.status).toBe(200)
    expect(playRes.details.player.current.title).toBe('Song One')
    expect(playRes.details.player.queue).toHaveLength(1)

    await new Promise((r) => setTimeout(r, 35))
    expect(procs).toHaveLength(1)
    expect(engine.getPlayerStateResponse().status).toBe('playing')

    // Pause / Resume / Volume commands propagate to IPC
    const pauseRes = await dispatchEmbeddedPlayer(engine, '/pause', { method: 'POST' }, mediaDir)
    expect(pauseRes.details).toEqual({ paused: true })
    expect(sendIpcCommand).toHaveBeenCalledWith(expect.any(String), ['set_property', 'pause', true])

    const volRes = await dispatchEmbeddedPlayer(engine, '/api/player/volume', {
      method: 'POST',
      body: JSON.stringify({ volume: 85 }),
    }, mediaDir)
    expect(volRes.details.player.volume).toBe(85)

    // Invalid volume returns 400
    const badVol = await dispatchEmbeddedPlayer(engine, '/api/player/volume', {
      method: 'POST',
      body: JSON.stringify({ volume: 120 }),
    }, mediaDir)
    expect(badVol.response.status).toBe(400)

    // Natural EOF advances automatically to Song Two
    procs[0].exitCode = 0
    procs[0].emit('exit', 0, null)
    await new Promise((r) => setTimeout(r, 35))
    expect(procs).toHaveLength(2)
    expect(engine.getPlayerStateResponse().current.title).toBe('Song Two')
    expect(engine.getPlayerStateResponse().queue).toHaveLength(0)

    // Manual stop clears state and does NOT advance
    const stopRes = await dispatchEmbeddedPlayer(engine, '/api/player/stop', { method: 'POST' }, mediaDir)
    expect(stopRes.details.player.current).toBeNull()
    expect(stopRes.details.player.status).toBe('idle')
    await new Promise((r) => setTimeout(r, 20))
    expect(procs).toHaveLength(2)
  })
})
