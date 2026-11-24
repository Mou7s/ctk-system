import { appendFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { dirname, isAbsolute, resolve } from 'node:path'
import { getNitroServerConfig } from '../runtime'
import { getMpvProperty, sendMpvCommand } from './ipc'
import {
  DEFAULT_TRIGGER_GRACE_SECONDS,
  isEnabledFlag,
  parseShanghaiTimestamp,
  ScheduleEngine,
  ScheduleValidationError,
} from './schedule-engine'
import type {
  JukeboxSong,
  PlaybackContext,
  PlayerStateResponse,
  PlayerStatus,
  PublicJukeboxSong,
  RegisterMediaInput,
  SchedulePlanItem,
  ScheduleStatusResponse,
  ScheduleSyncPayload,
  ScheduleSyncResult,
  TrackInput,
} from './types'

export class JukeboxCommandError extends Error {
  readonly statusCode: number

  constructor(message: string, statusCode = 400) {
    super(message)
    this.name = 'JukeboxCommandError'
    this.statusCode = statusCode
  }
}

export type SpawnProcessFn = (
  command: string,
  args: string[],
  options: Record<string, any>,
) => ChildProcess

export interface PlayerEngineOptions {
  mediaDir: string
  statePath: string
  legacyStatePath?: string
  ipcPath?: string
  mpvPath?: string
  mpvLogPath?: string
  mpvAo?: string
  pulseServer?: string
  audioUid?: number | null
  audioGid?: number | null
  defaultVolume?: number
  playbackRetries?: number
  triggerGraceSeconds?: number
  startupProbeMs?: number
  clock?: () => number
  log?: (message: string) => void
  spawnProcess?: SpawnProcessFn
  checkMpvAvailable?: () => boolean
  sendIpcCommand?: (ipcPath: string, command: unknown[]) => Promise<boolean>
  readIpcProperty?: <T = unknown>(ipcPath: string, name: string) => Promise<T | null>
}

function safeInt(value: unknown, fallback = 0): number {
  const num = Number(value)
  return Number.isFinite(num) ? Math.trunc(num) : fallback
}

function publicSong(song: JukeboxSong | null): PublicJukeboxSong | null {
  if (!song) return null
  const result: PublicJukeboxSong = {
    id: song.id,
    mediaId: song.mediaId,
    title: song.title,
    channel: song.channel,
    channelTitle: song.channelTitle,
    thumbnail: song.thumbnail,
    duration: song.duration,
    durationMs: song.durationMs,
  }
  if (song.trackId !== undefined) result.trackId = song.trackId
  if (song.requestedBy !== undefined) result.requestedBy = song.requestedBy
  if (song.scheduleId !== undefined) result.scheduleId = song.scheduleId
  return result
}

function isProcessAlive(proc: ChildProcess | null): boolean {
  return Boolean(proc && proc.exitCode === null && proc.signalCode === null)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveTimer) => setTimeout(resolveTimer, Math.max(0, ms)))
}

/**
 * Nitro 内嵌本地音频播放器引擎：封装 mpv 子进程管理、IPC 状态同步、
 * 播控队列与 ScheduleEngine 离线排期循环。
 */
export class PlayerEngine {
  private readonly ipcPath: string
  private readonly mpvPath: string
  private readonly mpvLogPath: string
  private readonly mpvAo: string
  private readonly pulseServer: string
  private readonly audioUid: number | null
  private readonly audioGid: number | null
  private readonly playbackRetries: number
  private readonly startupProbeMs: number
  private readonly clock: () => number
  private readonly log: (message: string) => void
  private readonly spawnProcess: SpawnProcessFn
  private readonly checkMpvAvailable: () => boolean
  private readonly sendIpcCommand: (ipcPath: string, command: unknown[]) => Promise<boolean>
  private readonly readIpcProperty: <T = unknown>(ipcPath: string, name: string) => Promise<T | null>

  readonly scheduleEngine: ScheduleEngine

  private currentProcess: ChildProcess | null = null
  private currentMediaId: string | null = null
  private currentSongId: string | null = null
  private currentRetryAttempt = 0
  private current: JukeboxSong | null = null
  private queue: JukeboxSong[] = []
  private elapsed = 0
  private duration = 0
  private paused = false
  private volume: number
  private lastError = ''
  private playbackContext: PlaybackContext | null = null
  private playRequestId = 0
  private controlVersion = 0
  private stopping = false
  private statusTimer: ReturnType<typeof setInterval> | null = null
  private scheduleTimer: ReturnType<typeof setInterval> | null = null
  private initialTickTimer: ReturnType<typeof setTimeout> | null = null
  private statusPollInFlight = false
  private mpvAvailableCache: boolean | null = null

  constructor(options: PlayerEngineOptions) {
    this.ipcPath = options.ipcPath || '/tmp/mpv-ipc'
    this.mpvPath = options.mpvPath || 'mpv'
    this.mpvLogPath = options.mpvLogPath || resolve(dirname(options.statePath), 'mpv.log')
    this.pulseServer = String(options.pulseServer || '').trim()
    this.mpvAo = String(options.mpvAo ?? (this.pulseServer ? 'pulse' : '')).trim()
    this.audioUid = options.audioUid ?? null
    this.audioGid = options.audioGid ?? options.audioUid ?? null
    this.playbackRetries = Math.max(1, safeInt(options.playbackRetries, 2))
    this.startupProbeMs = Math.max(10, safeInt(options.startupProbeMs, 300))
    this.volume = Math.max(0, Math.min(100, safeInt(options.defaultVolume, 70)))
    this.clock = options.clock || (() => Date.now())
    this.log = options.log || ((message) => console.info(`[Jukebox] ${message}`))
    this.spawnProcess = options.spawnProcess || ((cmd, args, opts) => spawn(cmd, args, opts))
    this.sendIpcCommand = options.sendIpcCommand || ((ipcPath, cmd) => sendMpvCommand(ipcPath, cmd))
    this.readIpcProperty = options.readIpcProperty || ((ipcPath, name) => getMpvProperty(ipcPath, name))
    this.checkMpvAvailable = options.checkMpvAvailable || (() => this.probeMpvBinary())

    this.scheduleEngine = new ScheduleEngine({
      mediaDir: options.mediaDir,
      statePath: options.statePath,
      legacyStatePath: options.legacyStatePath,
      clock: this.clock,
      triggerGraceSeconds: options.triggerGraceSeconds ?? DEFAULT_TRIGGER_GRACE_SECONDS,
      log: this.log,
      startPlayback: (schedule, trackIndex, positionSeconds, scheduleId, resumed) => {
        this.startScheduledPlayback(schedule, trackIndex, positionSeconds, scheduleId, resumed)
      },
      stopPlayback: (scheduleId) => {
        this.stopScheduledPlayback(scheduleId)
      },
    })
  }

  private probeMpvBinary(): boolean {
    if (this.mpvAvailableCache !== null) return this.mpvAvailableCache
    try {
      const result = spawnSync(this.mpvPath, ['--version'], { stdio: 'ignore', timeout: 3000 })
      this.mpvAvailableCache = result.status === 0
    } catch {
      this.mpvAvailableCache = false
    }
    return this.mpvAvailableCache
  }

  private isPulseSocketReady(): boolean | null {
    if (!this.pulseServer) return null
    if (!this.pulseServer.startsWith('unix:')) return true
    const socketPath = this.pulseServer.slice(5)
    return isAbsolute(socketPath) && existsSync(socketPath)
  }

  start(): void {
    if (this.statusTimer || this.scheduleTimer) return
    this.stopping = false
    this.log('Starting Nitro embedded local-media jukebox; YouTube URLs are not playable')
    this.initialTickTimer = setTimeout(() => {
      this.initialTickTimer = null
      if (!this.stopping) this.scheduleEngine.tick()
    }, 200)
    this.scheduleTimer = setInterval(() => {
      if (this.stopping) return
      try {
        this.scheduleEngine.tick()
      } catch (error) {
        this.log(`[SCHEDULE] tick error: ${(error as Error)?.name || 'Error'}`)
      }
    }, 1000)
    this.statusTimer = setInterval(() => {
      void this.pollPlaybackStatus()
    }, 1000)
  }

  shutdown(): void {
    this.stopping = true
    if (this.initialTickTimer) {
      clearTimeout(this.initialTickTimer)
      this.initialTickTimer = null
    }
    if (this.scheduleTimer) {
      clearInterval(this.scheduleTimer)
      this.scheduleTimer = null
    }
    if (this.statusTimer) {
      clearInterval(this.statusTimer)
      this.statusTimer = null
    }
    this.stopCurrentPlayback('service exit')
  }

  getPlayerStateResponse(): PlayerStateResponse {
    let status: PlayerStatus = 'idle'
    if (isProcessAlive(this.currentProcess)) {
      status = this.paused ? 'paused' : 'playing'
    } else if (this.lastError) {
      status = 'error'
    }
    return {
      current: publicSong(this.current),
      queue: this.queue.map((item) => publicSong(item)!).filter(Boolean),
      status,
      error: this.lastError,
      elapsed: Math.max(0, Math.trunc(this.elapsed)),
      duration: Math.max(0, Math.trunc(this.duration)),
      paused: Boolean(this.paused),
      volume: this.volume,
      schedule: this.scheduleEngine.getStatus(),
    }
  }

  getHealth() {
    const mpvAvailable = this.checkMpvAvailable()
    const pulseSocketReady = this.isPulseSocketReady()
    const audioReady = mpvAvailable && pulseSocketReady !== false
    return {
      ok: audioReady,
      service: audioReady ? 'up' : 'down',
      playerStatus: this.getPlayerStateResponse().status,
      mpvAvailable,
      pulseSocketReady,
    }
  }

  getQueue(): { queue: PublicJukeboxSong[] } {
    return {
      queue: this.queue.map((item) => publicSong(item)!).filter(Boolean),
    }
  }

  getScheduleStatus(): ScheduleStatusResponse {
    return this.scheduleEngine.getStatus()
  }

  getMediaStatus() {
    const status = this.scheduleEngine.getStatus()
    return {
      mediaCount: status.mediaCount,
      media: status.media,
    }
  }

  registerMedia(input: RegisterMediaInput) {
    try {
      return this.scheduleEngine.registerMedia(input)
    } catch (error) {
      if (error instanceof ScheduleValidationError) {
        throw new JukeboxCommandError(error.message, 400)
      }
      throw error
    }
  }

  syncPlan(payload: ScheduleSyncPayload): ScheduleSyncResult {
    try {
      return this.scheduleEngine.syncPlan(payload)
    } catch (error) {
      if (error instanceof ScheduleValidationError) {
        throw new JukeboxCommandError(error.message, 409)
      }
      throw error
    }
  }

  async stop(): Promise<{ player: PlayerStateResponse }> {
    this.queue = []
    this.current = null
    this.scheduleEngine.cancelActive('manual stop')
    this.clearPlaybackContext()
    this.stopCurrentPlayback('manual stop')
    return { player: this.getPlayerStateResponse() }
  }

  async next(): Promise<{ player: PlayerStateResponse }> {
    this.advanceToNext()
    return { player: this.getPlayerStateResponse() }
  }

  async setVolume(volumeValue: unknown): Promise<{ player: PlayerStateResponse }> {
    const volume = Number(volumeValue)
    if (!Number.isFinite(volume) || volume < 0 || volume > 100) {
      throw new JukeboxCommandError('volume must be from 0 to 100', 400)
    }
    this.volume = Math.trunc(volume)
    await this.sendIpcCommand(this.ipcPath, ['set_property', 'volume', this.volume])
    return { player: this.getPlayerStateResponse() }
  }

  async pause(): Promise<{ paused: boolean }> {
    this.controlVersion += 1
    this.paused = true
    await this.sendIpcCommand(this.ipcPath, ['set_property', 'pause', true])
    return { paused: true }
  }

  async resume(): Promise<{ paused: boolean }> {
    this.controlVersion += 1
    this.paused = false
    await this.sendIpcCommand(this.ipcPath, ['set_property', 'pause', false])
    return { paused: false }
  }

  async enqueue(data: TrackInput): Promise<{ item: PublicJukeboxSong; player: PlayerStateResponse }> {
    const item = this.makeLocalSong(data, safeInt(data?._trackIndex, this.queue.length))
    this.queue.push(item)
    if (this.current === null) {
      const first = this.queue.shift()!
      this.current = first
      this.playSong(first)
    }
    return {
      item: publicSong(item)!,
      player: this.getPlayerStateResponse(),
    }
  }

  async play(data: { song?: TrackInput | null; queue?: TrackInput[] | null }): Promise<{ player: PlayerStateResponse }> {
    const rawQueue = data?.queue ?? []
    if (!Array.isArray(rawQueue)) {
      throw new JukeboxCommandError('queue must be an array', 400)
    }
    const offset = data?.song ? 1 : 0
    const normalizedQueue = rawQueue
      .filter((item): item is TrackInput => Boolean(item && typeof item === 'object'))
      .map((item, index) => this.makeLocalSong(item, index + offset))

    let normalizedSong = data?.song && typeof data.song === 'object'
      ? this.makeLocalSong(data.song, 0)
      : null
    if (!normalizedSong && normalizedQueue.length > 0) {
      normalizedSong = normalizedQueue.shift()!
    }

    this.scheduleEngine.cancelActive('manual playback')
    this.clearPlaybackContext()
    this.queue = normalizedQueue
    this.current = normalizedSong

    if (normalizedSong) {
      this.playSong(normalizedSong)
    } else {
      this.stopCurrentPlayback('empty playlist')
    }
    return { player: this.getPlayerStateResponse() }
  }

  async deleteQueueItem(idRaw: string | number): Promise<{ player: PlayerStateResponse }> {
    const idText = String(idRaw || '').trim()
    if (!/^\d+$/.test(idText)) {
      throw new JukeboxCommandError('invalid queue id', 400)
    }
    const itemId = Number(idText)
    this.queue = this.queue.filter((item) => safeInt(item.id, -1) !== itemId)
    const isCurrent = this.current !== null && safeInt(this.current.id, -1) === itemId
    if (isCurrent) {
      this.advanceToNext()
    }
    return { player: this.getPlayerStateResponse() }
  }

  private makeLocalSong(song: TrackInput, trackIndex = 0): JukeboxSong {
    const mediaIdStr = String(song?.mediaId || '').trim()
    if (!/^\d+$/.test(mediaIdStr) || Number(mediaIdStr) <= 0) {
      throw new JukeboxCommandError('track needs a verified local audio file', 400)
    }
    const sha256 = String(song.sha256 || song.mediaSha256 || '').toLowerCase().trim() || null
    const localPath = this.scheduleEngine.resolveMediaPath(mediaIdStr, sha256)
    if (!localPath) {
      throw new JukeboxCommandError('track audio is not synced to this player', 400)
    }
    const durationMs = Math.max(0, safeInt(song.durationMs, safeInt(song.duration, 0) * 1000))
    const id = song.trackId ?? song.id ?? this.clock()
    return {
      id,
      ...(song.trackId !== undefined ? { trackId: song.trackId } : {}),
      ...(song.requestedBy !== undefined ? { requestedBy: song.requestedBy } : {}),
      ...(song.scheduleId !== undefined ? { scheduleId: song.scheduleId } : {}),
      mediaId: Number(mediaIdStr),
      sha256,
      title: String(song.title || '未知曲目').slice(0, 300),
      channel: String(song.channel || song.channelTitle || '').slice(0, 200),
      channelTitle: String(song.channelTitle || song.channel || '').slice(0, 200),
      thumbnail: String(song.thumbnail || '').slice(0, 500),
      durationMs,
      duration: Math.max(0, Math.floor(durationMs / 1000)),
      _localPath: localPath,
      _trackIndex: Math.max(0, safeInt(trackIndex, 0)),
      ...(song._retryAttempt !== undefined ? { _retryAttempt: song._retryAttempt } : {}),
    }
  }

  private buildMpvArgs(song: JukeboxSong, startSeconds: number): string[] {
    const args = [
      '--no-video',
      `--volume=${this.volume}`,
      '--no-terminal',
      '--no-config',
      '--ytdl=no',
    ]
    if (this.mpvAo) args.push(`--ao=${this.mpvAo}`)
    args.push(
      `--start=${Math.max(0, Number(startSeconds || 0)).toFixed(3)}`,
      `--input-ipc-server=${this.ipcPath}`,
      song._localPath,
    )
    return args
  }

  private appendMpvLog(chunk: Buffer | string): void {
    try {
      mkdirSync(dirname(this.mpvLogPath), { recursive: true })
      appendFileSync(this.mpvLogPath, chunk)
    } catch {
      // Logging errors must never break playback.
    }
  }

  private terminateProcess(proc: ChildProcess): void {
    try {
      if (isProcessAlive(proc)) {
        proc.kill('SIGTERM')
        const killer = setTimeout(() => {
          try {
            if (isProcessAlive(proc)) proc.kill('SIGKILL')
          } catch { /* ignore */ }
        }, 3000)
        killer.unref?.()
      }
    } catch {
      try { proc.kill('SIGKILL') } catch { /* ignore */ }
    }
  }

  private stopCurrentPlayback(reason = '', clearCurrent = true): void {
    const proc = this.currentProcess
    this.currentProcess = null
    this.currentMediaId = null
    this.currentSongId = null
    this.playRequestId += 1
    this.elapsed = 0
    this.duration = 0
    this.paused = false
    if (clearCurrent) this.current = null
    if (proc) {
      this.terminateProcess(proc)
      this.log(`[STOP] playback stopped (${reason || 'requested'})`)
    }
    try {
      rmSync(this.ipcPath, { force: true })
    } catch { /* ignore */ }
  }

  private clearPlaybackContext(scheduleId?: number): void {
    if (!this.playbackContext) return
    if (scheduleId !== undefined && Number(this.playbackContext.scheduleId) !== Number(scheduleId)) return
    this.playbackContext = null
  }

  private startScheduledPlayback(
    schedule: SchedulePlanItem,
    trackIndex: number,
    positionSeconds: number,
    scheduleId: number,
    resumed: boolean,
  ): void {
    const tracks = schedule.tracks || []
    if (!tracks.length) throw new JukeboxCommandError('schedule has no local tracks', 400)
    const loop = Boolean(schedule.endTime) && isEnabledFlag(schedule.loop)
    const windowEnd = String(schedule._windowEnd || '')
    const normalizedTracks = tracks.map((track, idx) => this.makeLocalSong({ ...track, scheduleId }, idx))
    const currentTrack = normalizedTracks[trackIndex]
    if (!currentTrack) throw new JukeboxCommandError('schedule track index out of range', 400)
    const upcoming = normalizedTracks.slice(trackIndex + 1)

    this.playbackContext = {
      scheduleId: Number(scheduleId),
      tracks: normalizedTracks,
      loop,
      windowEnd,
      currentTrackIndex: trackIndex,
    }
    this.queue = upcoming
    this.current = currentTrack
    this.log(
      `[SCHEDULE] ${resumed ? 'resume' : 'start'} scheduleId=${scheduleId} `
      + `trackIndex=${trackIndex} queued=${this.queue.length}`,
    )
    this.playSong(currentTrack, positionSeconds)
  }

  private stopScheduledPlayback(scheduleId: number): void {
    if (Number(this.playbackContext?.scheduleId || 0) !== Number(scheduleId)) return
    this.queue = []
    this.current = null
    this.clearPlaybackContext(scheduleId)
    this.stopCurrentPlayback('schedule cutoff')
  }

  private isScheduleCutoffReached(context: PlaybackContext): boolean {
    const cutoffMs = parseShanghaiTimestamp(context.windowEnd)
    if (cutoffMs === null) return true
    return this.clock() >= cutoffMs
  }

  private advanceToNext(): void {
    let finishScheduleId: number | null = null
    let nextSong: JukeboxSong | null = null

    if (this.queue.length > 0) {
      nextSong = this.queue.shift()!
      this.current = nextSong
      if (this.playbackContext) {
        this.playbackContext.currentTrackIndex = safeInt(nextSong._trackIndex, 0)
      }
    } else if (this.playbackContext) {
      const context = this.playbackContext
      if (context.loop && !this.isScheduleCutoffReached(context) && context.tracks.length > 0) {
        this.queue = context.tracks.slice(1).map((item) => ({ ...item }))
        nextSong = { ...context.tracks[0] }
        this.current = nextSong
        context.currentTrackIndex = 0
      } else {
        finishScheduleId = safeInt(context.scheduleId, 0)
        this.playbackContext = null
        this.current = null
      }
    } else {
      this.current = null
    }

    if (nextSong) {
      this.playSong(nextSong)
      return
    }
    this.stopCurrentPlayback('queue complete')
    if (finishScheduleId) {
      this.scheduleEngine.finishActive('one pass complete')
    }
  }

  private playSong(song: JukeboxSong, startSeconds = 0): void {
    let localSong: JukeboxSong
    try {
      localSong = this.makeLocalSong(song, safeInt(song._trackIndex, 0))
    } catch (error) {
      this.lastError = String((error as Error)?.message || 'track audio invalid').slice(0, 300)
      this.scheduleEngine.recordError(this.lastError, song?.trackId ?? song?.id)
      this.log(`[PLAY] skipped track without verified local media: ${(error as Error)?.name || 'Error'}`)
      queueMicrotask(() => this.advanceToNext())
      return
    }

    this.stopCurrentPlayback('track change', false)
    this.playRequestId += 1
    const requestId = this.playRequestId
    this.current = localSong
    this.currentProcess = null
    this.currentMediaId = String(localSong.mediaId)
    this.currentSongId = String(localSong.id)
    this.currentRetryAttempt = Math.max(0, safeInt(song._retryAttempt, 0))
    this.lastError = ''

    void this.launchSongProcess(localSong, startSeconds, requestId)
  }

  private async launchSongProcess(localSong: JukeboxSong, startSeconds: number, requestId: number): Promise<void> {
    const proc = await this.startMpvProcess(localSong, startSeconds, requestId)
    if (proc) return
    if (requestId !== this.playRequestId) return
    this.currentProcess = null
    this.currentMediaId = null
    this.currentSongId = null
    this.lastError = `无法播放：${localSong.title || '未知曲目'}`.slice(0, 300)
    this.scheduleEngine.recordError(this.lastError, localSong.trackId ?? localSong.id)
    this.advanceToNext()
  }

  private async startMpvProcess(
    song: JukeboxSong,
    startSeconds: number,
    requestId: number,
  ): Promise<ChildProcess | null> {
    const args = this.buildMpvArgs(song, startSeconds)
    const isRoot = typeof process.getuid === 'function' && process.getuid() === 0
    const spawnEnv: Record<string, string | undefined> = {
      ...process.env,
      HOME: '/tmp',
      ...(this.pulseServer ? { PULSE_SERVER: this.pulseServer } : {}),
    }

    for (let attempt = 1; attempt <= this.playbackRetries; attempt += 1) {
      if (requestId !== this.playRequestId || this.stopping) return null
      try {
        const spawnOptions: Record<string, any> = {
          stdio: ['ignore', 'ignore', 'pipe'],
          detached: false,
          env: spawnEnv,
        }
        if (isRoot && this.audioUid !== null) {
          spawnOptions.uid = this.audioUid
          spawnOptions.gid = this.audioGid ?? this.audioUid
        }
        const proc = this.spawnProcess(this.mpvPath, args, spawnOptions)
        let earlyExitCode: number | null = null
        let exitedEarly = false
        let startupSettled = false

        proc.stderr?.on('data', (chunk) => this.appendMpvLog(chunk))
        proc.once('error', (error) => {
          this.appendMpvLog(`[spawn error] ${error.message}\n`)
          if (!startupSettled) {
            exitedEarly = true
            earlyExitCode = -1
          }
        })
        proc.once('exit', (code, signal) => {
          const effectiveCode = code !== null ? code : (signal === 'SIGTERM' ? -15 : -1)
          if (!startupSettled) {
            exitedEarly = true
            earlyExitCode = effectiveCode
            return
          }
          this.handleWatchedExit(proc, effectiveCode, String(song.mediaId), String(song.id))
        })

        if (requestId !== this.playRequestId || this.stopping) {
          startupSettled = true
          this.terminateProcess(proc)
          return null
        }

        this.currentProcess = proc
        this.currentMediaId = String(song.mediaId)
        this.currentSongId = String(song.id)

        await sleep(this.startupProbeMs)
        startupSettled = true

        if (requestId !== this.playRequestId || this.stopping) {
          this.terminateProcess(proc)
          return null
        }
        if (!exitedEarly && isProcessAlive(proc)) {
          return proc
        }
        if (this.currentProcess === proc) {
          this.currentProcess = null
          this.currentMediaId = null
          this.currentSongId = null
        }
        this.log(`[PLAY] mpv exited on attempt ${attempt}/${this.playbackRetries} code=${earlyExitCode ?? proc.exitCode}`)
      } catch (error) {
        this.log(`[PLAY] mpv start failed on attempt ${attempt}/${this.playbackRetries}: ${(error as Error)?.name || 'Error'}`)
      }

      if (attempt < this.playbackRetries && requestId === this.playRequestId && !this.stopping) {
        await sleep(Math.min(attempt, 2) * 1000)
      }
    }
    return null
  }

  private handleWatchedExit(proc: ChildProcess, returnCode: number, mediaId: string, songId: string): void {
    const stillCurrent = (
      this.currentProcess === proc
      && this.currentMediaId === mediaId
      && this.currentSongId === songId
    )
    if (!stillCurrent || this.stopping) return

    const retryAttempt = this.currentRetryAttempt
    const retrySong = this.current ? { ...this.current } : null
    const retryOffset = Math.max(0, Number(this.elapsed || 0))

    if (returnCode !== 0 && returnCode !== -15) {
      if (retrySong && retryAttempt < this.playbackRetries - 1) {
        retrySong._retryAttempt = retryAttempt + 1
        this.log(`[PLAY] media=${mediaId} failed; retry ${retryAttempt + 1}/${this.playbackRetries - 1}`)
        this.playSong(retrySong, retryOffset)
        return
      }
      this.lastError = `mpv 播放失败 (code=${returnCode})`
      this.scheduleEngine.recordError(this.lastError, songId)
    }
    this.advanceToNext()
  }

  private async pollPlaybackStatus(): Promise<void> {
    if (this.stopping || this.statusPollInFlight) return
    const proc = this.currentProcess
    if (!isProcessAlive(proc)) return

    this.statusPollInFlight = true
    const expectedVersion = this.controlVersion
    try {
      const [posVal, durVal, pauseVal] = await Promise.all([
        this.readIpcProperty<number>(this.ipcPath, 'time-pos'),
        this.readIpcProperty<number>(this.ipcPath, 'duration'),
        this.readIpcProperty<boolean>(this.ipcPath, 'pause'),
      ])
      if (this.currentProcess !== proc || this.stopping) return

      if (typeof posVal === 'number' && Number.isFinite(posVal)) {
        this.elapsed = posVal
      }
      if (typeof durVal === 'number' && Number.isFinite(durVal)) {
        this.duration = durVal
      } else if ((this.duration || 0) <= 0 && this.current?.duration) {
        this.duration = this.current.duration
      }
      if (typeof pauseVal === 'boolean' && expectedVersion === this.controlVersion) {
        this.paused = pauseVal
      }

      if (this.playbackContext) {
        this.scheduleEngine.updateProgress(
          this.playbackContext.scheduleId,
          this.playbackContext.currentTrackIndex,
          this.elapsed,
          this.paused,
        )
      }
    } finally {
      this.statusPollInFlight = false
    }
  }
}

const g = globalThis as typeof globalThis & { __ctkJukeboxPlayer?: PlayerEngine }

/**
 * 获取全进程单例的 Nitro 内嵌播放器引擎。
 */
export function getEmbeddedJukeboxPlayer(): PlayerEngine {
  if (!g.__ctkJukeboxPlayer) {
    const config = getNitroServerConfig()
    g.__ctkJukeboxPlayer = new PlayerEngine({
      mediaDir: config.jukeboxMediaBackupPath,
      statePath: config.jukeboxStatePath,
      ipcPath: config.jukeboxMpvIpcPath,
      mpvPath: config.jukeboxMpvPath,
      mpvLogPath: config.jukeboxMpvLogPath,
      pulseServer: config.jukeboxPulseServer,
      audioUid: config.jukeboxAudioUid,
      audioGid: config.jukeboxAudioGid,
      defaultVolume: config.jukeboxVolume,
      playbackRetries: config.jukeboxPlaybackRetries,
    })
  }
  return g.__ctkJukeboxPlayer
}

export function resetEmbeddedJukeboxPlayerForTests(): void {
  if (g.__ctkJukeboxPlayer) {
    g.__ctkJukeboxPlayer.shutdown()
    delete g.__ctkJukeboxPlayer
  }
}
