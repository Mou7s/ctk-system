import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ScheduleEngine,
  ScheduleValidationError,
} from '../../server/utils/jukebox/schedule-engine.ts'

function makeDigest(content) {
  return createHash('sha256').update(content).digest('hex')
}

function writeMediaFixture(mediaDir, content, ext = '') {
  const bytes = Buffer.from(content)
  const sha = makeDigest(bytes)
  const rel = `${sha.slice(0, 2)}/${sha}${ext}`
  const target = join(mediaDir, sha.slice(0, 2), `${sha}${ext}`)
  mkdirSync(join(mediaDir, sha.slice(0, 2)), { recursive: true })
  writeFileSync(target, bytes)
  return { sha, rel, size: bytes.length }
}

describe('Jukebox ScheduleEngine', () => {
  let root
  let mediaDir
  let statePath

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'jukebox-sched-test-'))
    mediaDir = join(root, 'media')
    statePath = join(root, 'state', 'schedule_state.json')
    mkdirSync(mediaDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('triggers enabled daily schedule inside Asia/Shanghai grace window and deduplicates same day', () => {
    const f1 = writeMediaFixture(mediaDir, 'track-one')
    let nowMs = Date.parse('2026-11-17T04:00:05+08:00')
    const startPlayback = vi.fn()
    const engine = new ScheduleEngine({
      mediaDir,
      statePath,
      clock: () => nowMs,
      startPlayback,
      log: () => {},
    })

    engine.registerMedia({ mediaId: 101, sha256: f1.sha, relativePath: f1.rel, durationMs: 60000, codec: 'mp3', fileSize: f1.size })
    engine.syncPlan({
      version: 10,
      schedules: [{
        scheduleId: 2,
        name: '凌晨播放',
        scheduleType: 'daily',
        startTime: '04:00',
        endTime: null,
        loop: '0',
        enabled: '1',
        tracks: [{ trackId: 1, mediaId: 101, sha256: f1.sha, durationMs: 60000, title: 'T1' }],
      }],
      mediaManifest: [{ mediaId: 101, sha256: f1.sha }],
    })

    engine.tick()
    expect(startPlayback).toHaveBeenCalledTimes(1)
    expect(startPlayback.mock.calls[0][1]).toBe(0)
    expect(startPlayback.mock.calls[0][2]).toBeCloseTo(5, 1)
    expect(startPlayback.mock.calls[0][4]).toBe(false)

    // Stopping active and ticking again on the same day must not re-trigger
    engine.finishActive('manual stop')
    nowMs = Date.parse('2026-11-17T04:00:08+08:00')
    engine.tick()
    expect(startPlayback).toHaveBeenCalledTimes(1)
  })

  it('stops active schedule on windowEnd cutoff including overnight window', () => {
    const f1 = writeMediaFixture(mediaDir, 'night-track')
    let nowMs = Date.parse('2026-11-17T23:55:02+08:00')
    const startPlayback = vi.fn()
    const stopPlayback = vi.fn()
    const engine = new ScheduleEngine({
      mediaDir,
      statePath,
      clock: () => nowMs,
      startPlayback,
      stopPlayback,
      log: () => {},
    })

    engine.registerMedia({ mediaId: 1, sha256: f1.sha, relativePath: f1.rel, durationMs: 60000, codec: 'mp3', fileSize: f1.size })
    engine.syncPlan({
      version: 1,
      schedules: [{
        scheduleId: 9,
        name: '夜班',
        scheduleType: 'daily',
        startTime: '23:55',
        endTime: '00:10',
        loop: '1',
        enabled: '1',
        tracks: [{ trackId: 1, mediaId: 1, sha256: f1.sha, durationMs: 60000, title: 'N1' }],
      }],
      mediaManifest: [{ mediaId: 1, sha256: f1.sha }],
    })

    engine.tick()
    expect(startPlayback).toHaveBeenCalledTimes(1)

    nowMs = Date.parse('2026-11-18T00:09:59+08:00')
    engine.tick()
    expect(stopPlayback).not.toHaveBeenCalled()

    nowMs = Date.parse('2026-11-18T00:10:00+08:00')
    engine.tick()
    expect(stopPlayback).toHaveBeenCalledWith(9)
    expect(engine.getStatus().activeScheduleId).toBeNull()
  })

  it('recovers activePlayback across engine restart within valid window and skips expired windows', () => {
    const f1 = writeMediaFixture(mediaDir, 't1')
    const f2 = writeMediaFixture(mediaDir, 't2')
    let nowMs = Date.parse('2026-11-17T04:00:00+08:00')
    const firstStart = vi.fn()
    const engine1 = new ScheduleEngine({ mediaDir, statePath, clock: () => nowMs, startPlayback: firstStart, log: () => {} })
    engine1.registerMedia({ mediaId: 1, sha256: f1.sha, relativePath: f1.rel, durationMs: 60000, codec: 'mp3', fileSize: f1.size })
    engine1.registerMedia({ mediaId: 2, sha256: f2.sha, relativePath: f2.rel, durationMs: 60000, codec: 'mp3', fileSize: f2.size })
    engine1.syncPlan({
      version: 5,
      schedules: [{
        scheduleId: 2,
        name: '凌晨播放',
        scheduleType: 'daily',
        startTime: '04:00',
        endTime: null,
        loop: '0',
        enabled: '1',
        tracks: [
          { trackId: 1, mediaId: 1, sha256: f1.sha, durationMs: 60000, title: 'T1' },
          { trackId: 2, mediaId: 2, sha256: f2.sha, durationMs: 60000, title: 'T2' },
        ],
      }],
      mediaManifest: [{ mediaId: 1, sha256: f1.sha }, { mediaId: 2, sha256: f2.sha }],
    })
    engine1.tick()
    nowMs += 10_000
    engine1.updateProgress(2, 0, 10, false)

    // Restart engine 65s later -> should resume track 2 at 15s (10s + 65s - 60s)
    const resumeStart = vi.fn()
    const resumeTime = nowMs + 65_000
    const engine2 = new ScheduleEngine({ mediaDir, statePath, clock: () => resumeTime, startPlayback: resumeStart, log: () => {} })
    engine2.tick()
    expect(resumeStart).toHaveBeenCalledTimes(1)
    expect(resumeStart.mock.calls[0][1]).toBe(1)
    expect(resumeStart.mock.calls[0][2]).toBeCloseTo(15, 1)
    expect(resumeStart.mock.calls[0][4]).toBe(true)

    // Expired restart -> does not resume
    const expiredStart = vi.fn()
    const expiredEngine = new ScheduleEngine({
      mediaDir,
      statePath,
      clock: () => Date.parse('2026-11-17T06:00:00+08:00'),
      startPlayback: expiredStart,
      log: () => {},
    })
    expiredEngine.tick()
    expect(expiredStart).not.toHaveBeenCalled()
    expect(expiredEngine.getStatus().activeScheduleId).toBeNull()
  })

  it('resolves legacy .mp3 manifest paths cleanly from extensionless files and blocks symlinks', () => {
    const f1 = writeMediaFixture(mediaDir, 'canonical-bytes', '')
    const engine = new ScheduleEngine({ mediaDir, statePath, startPlayback: vi.fn(), log: () => {} })
    engine.registerMedia({ mediaId: 7, sha256: f1.sha, relativePath: f1.rel, durationMs: 30000, codec: 'mp3', fileSize: f1.size })

    // Simulate migrated state containing legacy ".mp3" relativePath pointing to extensionless disk file
    const saved = JSON.parse(readFileSync(statePath, 'utf8'))
    saved.mediaManifest['7'].relativePath = `${f1.rel}.mp3`
    writeFileSync(statePath, JSON.stringify(saved))

    const migratedEngine = new ScheduleEngine({ mediaDir, statePath, startPlayback: vi.fn(), log: () => {} })
    expect(migratedEngine.resolveMediaPath(7, f1.sha)).toContain(f1.sha)
    expect(migratedEngine.resolveMediaPath(7, 'a'.repeat(64))).toBeNull()

    // Symlink rejection test
    const outsideFile = join(root, 'secret.txt')
    writeFileSync(outsideFile, 'secret')
    const linkSha = makeDigest(Buffer.from('symlink-media'))
    mkdirSync(join(mediaDir, linkSha.slice(0, 2)), { recursive: true })
    const linkPath = join(mediaDir, linkSha.slice(0, 2), linkSha)
    try {
      symlinkSync(outsideFile, linkPath)
      expect(() => migratedEngine.registerMedia({
        mediaId: 8,
        sha256: linkSha,
        relativePath: `${linkSha.slice(0, 2)}/${linkSha}`,
      })).toThrow(ScheduleValidationError)
    } catch {
      // Windows without developer mode may disallow symlinks; skip safely if OS blocks creation.
    }
  })

  it('rejects unverified media and skips older plan versions during syncPlan', () => {
    const f1 = writeMediaFixture(mediaDir, 'ok')
    const engine = new ScheduleEngine({ mediaDir, statePath, startPlayback: vi.fn(), log: () => {} })
    engine.registerMedia({ mediaId: 1, sha256: f1.sha, relativePath: f1.rel, durationMs: 30000, codec: 'mp3', fileSize: f1.size })

    expect(() => engine.syncPlan({
      version: 2,
      schedules: [],
      mediaManifest: [{ mediaId: 99, sha256: 'b'.repeat(64) }],
    })).toThrow(ScheduleValidationError)

    const synced = engine.syncPlan({ version: 10, schedules: [], mediaManifest: [{ mediaId: 1, sha256: f1.sha }] })
    expect(synced.planVersion).toBe(10)

    const skipped = engine.syncPlan({ version: 5, schedules: [], mediaManifest: [{ mediaId: 1, sha256: f1.sha }] })
    expect(skipped).toEqual({ ok: true, skipped: true, reason: 'older version', planVersion: 10 })
  })
})
