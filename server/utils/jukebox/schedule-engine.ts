import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import {
  findBroadcastScheduleConflicts,
  scheduleDurationMs,
  validateBroadcastSchedule,
} from '../jukebox-schedule'
import type {
  ActivePlaybackState,
  MediaManifestEntry,
  PublicMediaManifestEntry,
  RecentErrorEntry,
  RegisterMediaInput,
  SchedulePlanItem,
  ScheduleStateSnapshot,
  ScheduleStatusResponse,
  ScheduleSyncPayload,
  ScheduleSyncResult,
  TrackInput,
} from './types'

export const TIMEZONE_NAME = 'Asia/Shanghai'
export const DEFAULT_TRIGGER_GRACE_SECONDS = 10
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const PROGRESS_THROTTLE_MS = 5000
const SHA256_RE = /^[a-f0-9]{64}$/
const MEDIA_EXT_FALLBACKS = ['', '.mp3', '.m4a', '.flac', '.wav', '.aac', '.ogg', '.oga', '.opus', '.wma', '.ape', '.aiff']

export class ScheduleValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScheduleValidationError'
  }
}

export class SchedulePersistenceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SchedulePersistenceError'
  }
}

export function isEnabledFlag(value: unknown): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '0').toLowerCase())
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

export function formatShanghaiDate(epochMs: number): string {
  const sh = new Date(epochMs + SHANGHAI_OFFSET_MS)
  return `${sh.getUTCFullYear()}-${pad2(sh.getUTCMonth() + 1)}-${pad2(sh.getUTCDate())}`
}

export function formatShanghaiIso(epochMs: number): string {
  const sh = new Date(epochMs + SHANGHAI_OFFSET_MS)
  return `${sh.getUTCFullYear()}-${pad2(sh.getUTCMonth() + 1)}-${pad2(sh.getUTCDate())}T`
    + `${pad2(sh.getUTCHours())}:${pad2(sh.getUTCMinutes())}:${pad2(sh.getUTCSeconds())}+08:00`
}

export function shanghaiIsoWeekday(epochMs: number): number {
  const day = new Date(epochMs + SHANGHAI_OFFSET_MS).getUTCDay()
  return day === 0 ? 7 : day
}

export function parseShanghaiTimestamp(value: unknown): number | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const normalized = raw.includes(' ') && !raw.includes('T') ? raw.replace(' ', 'T') : raw
  const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? normalized : `${normalized}+08:00`
  const parsed = Date.parse(withZone)
  return Number.isFinite(parsed) ? parsed : null
}

function makeOccurrenceStartMs(startTime: string, occurrenceDateStr: string): number {
  const hhmm = String(startTime || '').slice(0, 5)
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(hhmm)) {
    throw new ScheduleValidationError('startTime must use HH:mm')
  }
  const parsed = Date.parse(`${occurrenceDateStr}T${hhmm}:00+08:00`)
  if (!Number.isFinite(parsed)) {
    throw new ScheduleValidationError('invalid startTime')
  }
  return parsed
}

function computeWindowEndMs(schedule: SchedulePlanItem, occurrenceStartMs: number): number {
  const endValue = schedule.endTime
  if (endValue != null && String(endValue).trim() !== '') {
    const endHhmm = String(endValue).slice(0, 5)
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(endHhmm)) {
      throw new ScheduleValidationError('endTime must use HH:mm')
    }
    const startDate = formatShanghaiDate(occurrenceStartMs)
    let endMs = Date.parse(`${startDate}T${endHhmm}:00+08:00`)
    if (endMs <= occurrenceStartMs) endMs += DAY_MS
    return endMs
  }
  return occurrenceStartMs + scheduleDurationMs(schedule)
}

function trackDurationMs(track: TrackInput): number {
  const raw = track.durationMs == null
    ? (track.duration == null ? 0 : Number(track.duration) * 1000)
    : Number(track.durationMs)
  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : 0
}

function isWithinRoot(rootPath: string, targetPath: string): boolean {
  const rel = relative(rootPath, targetPath)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function createEmptyState(): ScheduleStateSnapshot {
  return {
    planVersion: 0,
    schedules: [],
    lastPlayed: {},
    syncedAt: null,
    mediaManifest: {},
    activePlayback: null,
    recentErrors: [],
  }
}

export interface ScheduleEngineOptions {
  mediaDir: string
  statePath: string
  legacyStatePath?: string
  clock?: () => number
  triggerGraceSeconds?: number
  log?: (message: string) => void
  startPlayback: (
    schedule: SchedulePlanItem,
    trackIndex: number,
    positionSeconds: number,
    scheduleId: number,
    resumed: boolean,
  ) => void | Promise<void>
  stopPlayback?: (scheduleId: number) => void
}

/**
 * 车间广播离线排期引擎：管理媒体清单校验、Asia/Shanghai 排期触发、
 * activePlayback 断点续播与 cutoff 到点停播。
 */
export class ScheduleEngine {
  private readonly mediaDir: string
  private readonly statePath: string
  private readonly legacyStatePath?: string
  private readonly clock: () => number
  private readonly triggerGraceSeconds: number
  private readonly log: (message: string) => void
  private readonly startPlayback: ScheduleEngineOptions['startPlayback']
  private readonly stopPlayback: (scheduleId: number) => void

  private state: ScheduleStateSnapshot
  private recoveryChecked = false
  private lastProgressSaveMs = 0

  constructor(options: ScheduleEngineOptions) {
    this.mediaDir = resolve(options.mediaDir)
    this.statePath = resolve(options.statePath)
    this.legacyStatePath = options.legacyStatePath ? resolve(options.legacyStatePath) : undefined
    this.clock = options.clock || (() => Date.now())
    this.triggerGraceSeconds = Math.max(0, Math.trunc(options.triggerGraceSeconds ?? DEFAULT_TRIGGER_GRACE_SECONDS))
    this.log = options.log || ((message) => console.info(`[Jukebox] ${message}`))
    this.startPlayback = options.startPlayback
    this.stopPlayback = options.stopPlayback || (() => {})
    this.state = this.loadState()
  }

  private nowMs(): number {
    return this.clock()
  }

  private loadState(): ScheduleStateSnapshot {
    let source = ''
    try {
      if (lstatSync(this.statePath).isFile()) source = this.statePath
    } catch {
      if (this.legacyStatePath) {
        try {
          if (lstatSync(this.legacyStatePath).isFile()) source = this.legacyStatePath
        } catch {
          // Wait for new state creation on first write.
        }
      }
    }
    const base = createEmptyState()
    if (!source) return base
    try {
      const parsed = JSON.parse(readFileSync(source, 'utf8'))
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.planVersion === 'number') base.planVersion = parsed.planVersion
        if (Array.isArray(parsed.schedules)) base.schedules = parsed.schedules
        if (parsed.lastPlayed && typeof parsed.lastPlayed === 'object') base.lastPlayed = parsed.lastPlayed
        if (typeof parsed.syncedAt === 'string' || parsed.syncedAt === null) base.syncedAt = parsed.syncedAt
        if (parsed.mediaManifest && typeof parsed.mediaManifest === 'object') base.mediaManifest = parsed.mediaManifest
        if (parsed.activePlayback && typeof parsed.activePlayback === 'object') base.activePlayback = parsed.activePlayback
        if (Array.isArray(parsed.recentErrors)) base.recentErrors = parsed.recentErrors
      }
      if (this.legacyStatePath && source === this.legacyStatePath && source !== this.statePath) {
        this.persistState(base)
        this.log(`[SCHEDULE] migrated legacy schedule state to ${this.statePath}`)
      }
    } catch (error) {
      this.log(`[SCHEDULE] failed to read state file: ${(error as Error)?.name || 'Error'}`)
    }
    return base
  }

  private persistState(snapshot: ScheduleStateSnapshot): void {
    const targetDir = dirname(this.statePath)
    mkdirSync(targetDir, { recursive: true, mode: 0o700 })
    const temporary = `${this.statePath}.${process.pid}.${Date.now()}.tmp`
    let fd: number | null = null
    try {
      const payload = Buffer.from(JSON.stringify(snapshot, null, 2), 'utf8')
      fd = openSync(temporary, 'w', 0o600)
      writeSync(fd, payload)
      fsyncSync(fd)
      closeSync(fd)
      fd = null
      renameSync(temporary, this.statePath)
    } catch (error) {
      if (fd !== null) {
        try { closeSync(fd) } catch { /* ignore */ }
      }
      try { rmSync(temporary, { force: true }) } catch { /* ignore */ }
      throw error
    }
  }

  private saveState(): boolean {
    try {
      this.persistState(this.state)
      return true
    } catch (error) {
      this.log(`[SCHEDULE] state write failed: ${(error as Error)?.name || 'Error'}`)
      return false
    }
  }

  private commitState(candidate: ScheduleStateSnapshot, action: string): void {
    const previous = this.state
    this.state = candidate
    try {
      this.persistState(candidate)
    } catch (error) {
      this.state = previous
      this.log(`[SCHEDULE] ${action} state persistence failed: ${(error as Error)?.name || 'Error'}`)
      throw new SchedulePersistenceError(`failed to persist ${action}`)
    }
  }

  private resolveSafeMediaFile(relativePath: string): string | null {
    const cleaned = String(relativePath || '').replaceAll('\\', '/').replace(/^\/+/, '')
    if (!cleaned || cleaned.includes('\0')) return null
    const candidate = resolve(this.mediaDir, cleaned)
    if (!isWithinRoot(this.mediaDir, candidate)) return null
    try {
      const rootReal = realpathSync(this.mediaDir)
      const stat = lstatSync(candidate)
      if (!stat.isFile() || stat.isSymbolicLink()) return null
      const fileReal = realpathSync(candidate)
      if (!isWithinRoot(rootReal, fileReal)) return null
      return fileReal
    } catch {
      return null
    }
  }

  resolveMediaPath(mediaId: number | string, expectedSha256?: string | null): string | null {
    const key = String(mediaId || '').trim()
    if (!/^\d+$/.test(key)) return null
    const entry = this.state.mediaManifest?.[key]
    if (!entry) return null
    const manifestSha = String(entry.sha256 || '').toLowerCase()
    if (!SHA256_RE.test(manifestSha)) return null
    if (expectedSha256 && manifestSha !== String(expectedSha256).toLowerCase()) return null

    const candidates: string[] = []
    if (entry.relativePath) candidates.push(entry.relativePath)
    const canonical = `${manifestSha.slice(0, 2)}/${manifestSha}`
    for (const ext of MEDIA_EXT_FALLBACKS) {
      const alt = `${canonical}${ext}`
      if (!candidates.includes(alt)) candidates.push(alt)
    }
    for (const candidate of candidates) {
      const resolved = this.resolveSafeMediaFile(candidate)
      if (resolved) return resolved
    }
    return null
  }

  registerMedia(input: RegisterMediaInput): PublicMediaManifestEntry {
    const mediaId = String(input.mediaId || '').trim()
    const sha256 = String(input.sha256 || '').toLowerCase().trim()
    const relativePath = String(input.relativePath || '').replaceAll('\\', '/').trim()
    if (!/^\d+$/.test(mediaId) || Number(mediaId) <= 0 || !SHA256_RE.test(sha256)) {
      throw new ScheduleValidationError('invalid media identity')
    }
    const resolved = this.resolveSafeMediaFile(relativePath)
    if (!resolved) {
      throw new ScheduleValidationError('local media file is missing')
    }
    const existing = this.state.mediaManifest?.[mediaId]
    if (existing && String(existing.sha256 || '').toLowerCase() !== sha256) {
      throw new ScheduleValidationError('media id checksum changed')
    }
    const fileSize = Math.max(0, Math.trunc(Number(input.fileSize || statSync(resolved).size)))
    const entry: MediaManifestEntry = {
      mediaId: Number(mediaId),
      sha256,
      relativePath,
      durationMs: Math.max(0, Math.trunc(Number(input.durationMs || 0))),
      codec: String(input.codec || '').slice(0, 40),
      fileSize,
      verifiedAt: formatShanghaiIso(this.nowMs()),
    }
    const candidate = structuredClone(this.state)
    candidate.mediaManifest[mediaId] = entry
    this.commitState(candidate, 'media manifest')
    const { relativePath: _hidden, ...publicEntry } = entry
    return publicEntry
  }

  private prepareSchedule(schedule: SchedulePlanItem): SchedulePlanItem | null {
    try {
      validateBroadcastSchedule(schedule)
    } catch {
      return null
    }
    if (!Array.isArray(schedule.tracks) || schedule.tracks.length === 0) return null
    const preparedTracks: TrackInput[] = []
    for (const track of schedule.tracks) {
      if (!track || typeof track !== 'object') return null
      const mediaId = track.mediaId
      if (mediaId == null) return null
      const localPath = this.resolveMediaPath(mediaId, track.sha256 || track.mediaSha256)
      if (!localPath) return null
      const manifest = this.state.mediaManifest?.[String(mediaId)]
      const durationMs = trackDurationMs(track) || Number(manifest?.durationMs || 0)
      if (!Number.isFinite(durationMs) || durationMs <= 0) return null
      preparedTracks.push({
        ...structuredClone(track),
        _localPath: localPath,
        durationMs: Math.trunc(durationMs),
      })
    }
    return {
      ...structuredClone(schedule),
      tracks: preparedTracks,
    }
  }

  syncPlan(payload: ScheduleSyncPayload): ScheduleSyncResult {
    const version = Math.trunc(Number(payload?.version ?? 0))
    if (!Number.isFinite(version) || version < 0) {
      throw new ScheduleValidationError('plan version must be non-negative')
    }
    const schedules = payload?.schedules ?? []
    const manifestItems = payload?.mediaManifest ?? []
    if (!Array.isArray(schedules) || !Array.isArray(manifestItems)) {
      throw new ScheduleValidationError('invalid plan payload')
    }

    const currentVersion = Number(this.state.planVersion || 0)
    if (version < currentVersion) {
      return {
        ok: true,
        skipped: true,
        reason: 'older version',
        planVersion: currentVersion,
      }
    }

    const incomingManifest: Record<string, MediaManifestEntry> = {}
    for (const item of manifestItems) {
      if (!item || typeof item !== 'object') {
        throw new ScheduleValidationError('invalid media manifest entry')
      }
      const mediaId = String(item.mediaId || '').trim()
      const sha256 = String(item.sha256 || '').toLowerCase().trim()
      if (!/^\d+$/.test(mediaId) || Number(mediaId) <= 0 || !SHA256_RE.test(sha256)) {
        throw new ScheduleValidationError('invalid media manifest identity')
      }
      const existing = this.state.mediaManifest?.[mediaId]
      if (!existing || String(existing.sha256 || '').toLowerCase() !== sha256 || !this.resolveMediaPath(mediaId, sha256)) {
        throw new ScheduleValidationError(`media ${mediaId} is not locally verified`)
      }
      incomingManifest[mediaId] = structuredClone(existing)
    }

    const preparedSchedules: SchedulePlanItem[] = []
    for (const schedule of schedules) {
      if (!schedule || typeof schedule !== 'object') {
        throw new ScheduleValidationError('invalid schedule entry')
      }
      if (!isEnabledFlag(schedule.enabled)) continue
      const prepared = this.prepareSchedule(schedule)
      if (!prepared) {
        throw new ScheduleValidationError(
          `schedule ${schedule.scheduleId ?? '?'} references unavailable local media`,
        )
      }
      preparedSchedules.push(structuredClone(schedule))
    }

    try {
      const conflicts = findBroadcastScheduleConflicts(preparedSchedules)
      if (conflicts.length > 0) {
        throw new ScheduleValidationError(`schedules ${conflicts[0][0]} and ${conflicts[0][1]} overlap`)
      }
    } catch (error) {
      if (error instanceof ScheduleValidationError) throw error
      throw new ScheduleValidationError((error as Error)?.message || 'invalid schedule configuration')
    }

    const candidate = structuredClone(this.state)
    candidate.planVersion = version
    candidate.schedules = structuredClone(schedules)
    candidate.mediaManifest = {
      ...candidate.mediaManifest,
      ...incomingManifest,
    }
    candidate.syncedAt = formatShanghaiIso(this.nowMs())
    this.commitState(candidate, 'schedule plan')
    this.log(`[SCHEDULE] plan synced version=${version} schedules=${schedules.length}`)
    return {
      ok: true,
      planVersion: version,
      scheduleCount: schedules.length,
      mediaCount: Object.keys(incomingManifest).length,
    }
  }

  getStatus(): ScheduleStatusResponse {
    const manifest = this.state.mediaManifest || {}
    const media: PublicMediaManifestEntry[] = []
    for (const entry of Object.values(manifest)) {
      if (!entry || typeof entry !== 'object') continue
      const { relativePath: _hidden, ...rest } = entry
      media.push(rest)
    }
    return {
      planVersion: this.state.planVersion,
      syncedAt: this.state.syncedAt,
      scheduleCount: this.state.schedules.length,
      lastPlayed: { ...this.state.lastPlayed },
      activeScheduleId: this.state.activePlayback?.scheduleId ?? null,
      mediaCount: media.length,
      media,
      recentErrors: this.state.recentErrors.slice(-10),
      timezone: TIMEZONE_NAME,
    }
  }

  private alreadyPlayedOn(scheduleId: number, occurrenceDate: string): boolean {
    const recorded = this.state.lastPlayed?.[String(scheduleId)]
    return Boolean(recorded && String(recorded).startsWith(occurrenceDate))
  }

  private markPlayed(scheduleId: number, startedAtMs: number): void {
    this.state.lastPlayed[String(scheduleId)] = formatShanghaiIso(startedAtMs)
  }

  private pushError(scheduleId: number, message: string, trackId?: unknown): void {
    const nextErrors: RecentErrorEntry[] = [
      ...this.state.recentErrors,
      {
        at: formatShanghaiIso(this.nowMs()),
        scheduleId,
        trackId,
        message: String(message || '').slice(0, 300),
      },
    ].slice(-20)
    this.state.recentErrors = nextErrors
    this.saveState()
  }

  recordError(message: string, trackId?: unknown): void {
    const scheduleId = Number(this.state.activePlayback?.scheduleId || 0)
    this.pushError(scheduleId, message, trackId)
  }

  private storeActive(
    schedule: SchedulePlanItem,
    occurrenceStartMs: number,
    windowEndMs: number,
    trackIndex: number,
    positionSeconds: number,
    paused = false,
  ): void {
    const scheduleId = Number(schedule.scheduleId || 0)
    const candidate = structuredClone(this.state)
    candidate.lastPlayed[String(scheduleId)] = formatShanghaiIso(occurrenceStartMs)
    candidate.activePlayback = {
      scheduleId,
      occurrenceDate: formatShanghaiDate(occurrenceStartMs),
      startedAt: formatShanghaiIso(occurrenceStartMs),
      windowEnd: formatShanghaiIso(windowEndMs),
      schedule: structuredClone(schedule),
      trackIndex: Math.max(0, Math.trunc(trackIndex)),
      positionSeconds: Math.max(0, Number(positionSeconds || 0)),
      progressUpdatedAt: formatShanghaiIso(this.nowMs()),
      paused: Boolean(paused),
    }
    this.commitState(candidate, 'active playback')
  }

  private callStart(
    schedule: SchedulePlanItem,
    occurrenceStartMs: number,
    windowEndMs: number,
    trackIndex: number,
    positionSeconds: number,
    resumed: boolean,
  ): void {
    const scheduleId = Number(schedule.scheduleId || 0)
    const prepared = this.prepareSchedule(schedule)
    if (!prepared) {
      this.pushError(scheduleId, '计划歌曲缺少已校验的本地音频')
      this.state.activePlayback = null
      this.saveState()
      return
    }
    prepared._windowEnd = formatShanghaiIso(windowEndMs)
    try {
      this.storeActive(schedule, occurrenceStartMs, windowEndMs, trackIndex, positionSeconds)
    } catch (error) {
      if (error instanceof SchedulePersistenceError) {
        this.markPlayed(scheduleId, occurrenceStartMs)
        this.pushError(scheduleId, '无法保存本地播放状态，已跳过计划')
        return
      }
      throw error
    }

    const handleFailure = (error: unknown) => {
      const name = (error as Error)?.name || 'Error'
      this.pushError(scheduleId, `播放器启动失败: ${name}`)
      this.state.activePlayback = null
      this.saveState()
      this.log(`[SCHEDULE] start failed scheduleId=${scheduleId}: ${name}`)
    }

    try {
      const result = this.startPlayback(prepared, trackIndex, positionSeconds, scheduleId, resumed)
      if (result && typeof (result as Promise<void>).then === 'function') {
        void (result as Promise<void>).catch(handleFailure)
      }
    } catch (error) {
      handleFailure(error)
    }
  }

  private locatePosition(
    schedule: SchedulePlanItem,
    elapsedSeconds: number,
    loop: boolean,
  ): [number, number] | null {
    const durations = (schedule.tracks || []).map((track) => trackDurationMs(track) / 1000)
    const total = durations.reduce((sum, item) => sum + item, 0)
    if (total <= 0) return null

    let remaining = Math.max(0, elapsedSeconds)
    if (loop) {
      remaining %= total
    } else if (remaining >= total) {
      return null
    }
    for (let index = 0; index < durations.length; index += 1) {
      const duration = durations[index]
      if (remaining < duration) return [index, remaining]
      remaining -= duration
    }
    return null
  }

  private advanceOnePass(
    schedule: SchedulePlanItem,
    trackIndex: number,
    positionSeconds: number,
    elapsedSeconds: number,
  ): [number, number] | null {
    const tracks = schedule.tracks || []
    let index = Math.max(0, Math.trunc(trackIndex))
    let position = Math.max(0, Number(positionSeconds || 0)) + Math.max(0, Number(elapsedSeconds || 0))
    while (index < tracks.length) {
      const duration = trackDurationMs(tracks[index]) / 1000
      if (duration <= 0) return null
      if (position < duration) return [index, position]
      position -= duration
      index += 1
    }
    return null
  }

  private recoverActive(nowMs: number): void {
    const active = this.state.activePlayback ? structuredClone(this.state.activePlayback) : null
    if (!active) return

    const startedAtMs = parseShanghaiTimestamp(active.startedAt)
    const windowEndMs = parseShanghaiTimestamp(active.windowEnd)
    const scheduleId = Number(active.scheduleId || 0)
    const schedule = active.schedule
    if (!schedule || startedAtMs === null || windowEndMs === null || !scheduleId) {
      this.state.activePlayback = null
      this.saveState()
      return
    }

    if (nowMs < startedAtMs || nowMs >= windowEndMs) {
      this.state.activePlayback = null
      this.saveState()
      this.log(`[SCHEDULE] expired occurrence not resumed scheduleId=${scheduleId}`)
      return
    }

    if (scheduleDurationMs(schedule) <= 0) {
      this.pushError(scheduleId, '无法恢复：曲目时长缺失')
      this.state.activePlayback = null
      this.saveState()
      return
    }

    const loop = Boolean(schedule.endTime) && isEnabledFlag(schedule.loop)
    let position: [number, number] | null
    if (loop) {
      if (active.paused) {
        const prefixTracks = (schedule.tracks || []).slice(0, Math.max(0, active.trackIndex || 0))
        const elapsedPosition = prefixTracks.reduce((sum, track) => sum + trackDurationMs(track) / 1000, 0)
          + Math.max(0, Number(active.positionSeconds || 0))
        position = this.locatePosition(schedule, elapsedPosition, true)
      } else {
        position = this.locatePosition(schedule, (nowMs - startedAtMs) / 1000, true)
      }
    } else {
      const progressAtMs = parseShanghaiTimestamp(active.progressUpdatedAt || active.startedAt) ?? startedAtMs
      const offlineSeconds = active.paused ? 0 : Math.max(0, (nowMs - progressAtMs) / 1000)
      position = this.advanceOnePass(schedule, active.trackIndex || 0, active.positionSeconds || 0, offlineSeconds)
    }

    if (!position) {
      this.state.activePlayback = null
      this.saveState()
      this.log(`[SCHEDULE] occurrence already finished; no catch-up scheduleId=${scheduleId}`)
      return
    }

    this.callStart(schedule, startedAtMs, windowEndMs, position[0], position[1], true)
    this.log(`[SCHEDULE] resumed scheduleId=${scheduleId} trackIndex=${position[0]} offset=${position[1].toFixed(1)}s`)
  }

  private trigger(schedule: SchedulePlanItem, occurrenceStartMs: number, nowMs: number): void {
    const scheduleId = Number(schedule.scheduleId || 0)
    const prepared = this.prepareSchedule(schedule)
    if (!prepared) {
      this.pushError(scheduleId, '计划歌曲缺少已校验的本地音频')
      this.markPlayed(scheduleId, occurrenceStartMs)
      this.saveState()
      this.log(`[SCHEDULE] skipped unavailable local media scheduleId=${scheduleId}`)
      return
    }

    const windowEndMs = computeWindowEndMs(prepared, occurrenceStartMs)
    if (nowMs >= windowEndMs) return
    const elapsedSeconds = Math.max(0, (nowMs - occurrenceStartMs) / 1000)
    const loop = Boolean(prepared.endTime) && isEnabledFlag(prepared.loop)
    const position = this.locatePosition(prepared, elapsedSeconds, loop)
    if (!position) {
      this.markPlayed(scheduleId, occurrenceStartMs)
      this.saveState()
      return
    }

    this.callStart(prepared, occurrenceStartMs, windowEndMs, position[0], position[1], false)
    this.log(`[SCHEDULE] trigger id=${scheduleId} trackIndex=${position[0]} offset=${position[1].toFixed(1)}s`)
  }

  updateProgress(scheduleId: number, trackIndex: number, positionSeconds: number, paused: boolean): void {
    const nowMs = this.nowMs()
    if (nowMs >= this.lastProgressSaveMs && nowMs - this.lastProgressSaveMs < PROGRESS_THROTTLE_MS) return

    const active = this.state.activePlayback
    if (!active || Number(active.scheduleId || 0) !== Number(scheduleId)) return
    active.trackIndex = Math.max(0, Math.trunc(trackIndex))
    active.positionSeconds = Math.max(0, Number(positionSeconds || 0))
    active.progressUpdatedAt = formatShanghaiIso(nowMs)
    active.paused = Boolean(paused)
    this.saveState()
    this.lastProgressSaveMs = nowMs
  }

  finishActive(reason = 'completed'): void {
    const active = this.state.activePlayback
    if (!active) return
    const scheduleId = Number(active.scheduleId || 0)
    this.state.activePlayback = null
    this.saveState()
    this.log(`[SCHEDULE] finished scheduleId=${scheduleId} reason=${reason}`)
  }

  cancelActive(reason = 'stopped'): void {
    this.finishActive(reason)
  }

  tick(): void {
    const nowMs = this.nowMs()
    if (!this.recoveryChecked) {
      this.recoveryChecked = true
      this.recoverActive(nowMs)
    }

    const active = this.state.activePlayback
    if (active) {
      const endMs = parseShanghaiTimestamp(active.windowEnd)
      const scheduleId = Number(active.scheduleId || 0)
      if (endMs === null || !scheduleId) {
        this.state.activePlayback = null
        this.saveState()
      } else {
        if (nowMs >= endMs) {
          this.stopPlayback(scheduleId)
          this.finishActive('cutoff')
        }
        return
      }
    }

    const todayStr = formatShanghaiDate(nowMs)
    const todayWeekday = shanghaiIsoWeekday(nowMs)
    for (const schedule of [...this.state.schedules]) {
      if (!schedule || typeof schedule !== 'object' || !isEnabledFlag(schedule.enabled)) continue
      try {
        const { days } = validateBroadcastSchedule(schedule)
        if (!days.includes(todayWeekday)) continue
        const occurrenceStartMs = makeOccurrenceStartMs(schedule.startTime, todayStr)
        const elapsedSeconds = (nowMs - occurrenceStartMs) / 1000
        if (elapsedSeconds < 0 || elapsedSeconds > this.triggerGraceSeconds) continue
        const scheduleId = Number(schedule.scheduleId || 0)
        if (this.alreadyPlayedOn(scheduleId, todayStr)) continue
        this.trigger(schedule, occurrenceStartMs, nowMs)
        return
      } catch {
        // Ignore invalid schedule entries during runtime ticks.
      }
    }
  }
}
