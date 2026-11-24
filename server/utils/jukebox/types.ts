export type PlayerStatus = 'idle' | 'playing' | 'paused' | 'error'

export interface TrackInput {
  id?: number | string
  trackId?: number | string
  albumId?: number | string
  mediaId?: number | string
  sha256?: string
  mediaSha256?: string
  title?: string
  channel?: string
  channelTitle?: string
  thumbnail?: string
  duration?: number
  durationMs?: number
  sortOrder?: number
  requestedBy?: string
  scheduleId?: number
  _trackIndex?: number
  _retryAttempt?: number
  _localPath?: string
}

export interface JukeboxSong {
  id: number | string
  trackId?: number | string
  mediaId: number
  sha256: string | null
  title: string
  channel: string
  channelTitle: string
  thumbnail: string
  duration: number
  durationMs: number
  requestedBy?: string
  scheduleId?: number
  _localPath: string
  _trackIndex: number
  _retryAttempt?: number
}

export type PublicJukeboxSong = Omit<JukeboxSong, '_localPath' | '_trackIndex' | '_retryAttempt' | 'sha256'>

export interface SchedulePlanItem {
  scheduleId: number
  name?: string
  albumIds?: number[]
  albumNames?: string[]
  scheduleType?: string
  weekdays?: string | number[] | null
  startTime: string
  endTime?: string | null
  loop?: string | number | boolean
  enabled?: string | number | boolean
  tracks: TrackInput[]
  _windowEnd?: string
}

export interface MediaManifestEntry {
  mediaId: number
  sha256: string
  relativePath: string
  durationMs: number
  codec: string
  fileSize: number
  verifiedAt: string
}

export type PublicMediaManifestEntry = Omit<MediaManifestEntry, 'relativePath'>

export interface ActivePlaybackState {
  scheduleId: number
  occurrenceDate: string
  startedAt: string
  windowEnd: string
  schedule: SchedulePlanItem
  trackIndex: number
  positionSeconds: number
  progressUpdatedAt: string
  paused: boolean
}

export interface RecentErrorEntry {
  at: string
  scheduleId: number
  trackId?: unknown
  message: string
}

export interface ScheduleStateSnapshot {
  planVersion: number
  schedules: SchedulePlanItem[]
  lastPlayed: Record<string, string>
  syncedAt: string | null
  mediaManifest: Record<string, MediaManifestEntry>
  activePlayback: ActivePlaybackState | null
  recentErrors: RecentErrorEntry[]
}

export interface PlaybackContext {
  scheduleId: number
  tracks: JukeboxSong[]
  loop: boolean
  windowEnd: string
  currentTrackIndex: number
}

export interface ScheduleStatusResponse {
  planVersion: number
  syncedAt: string | null
  scheduleCount: number
  lastPlayed: Record<string, string>
  activeScheduleId: number | null
  mediaCount: number
  media: PublicMediaManifestEntry[]
  recentErrors: RecentErrorEntry[]
  timezone: string
}

export interface PlayerStateResponse {
  current: PublicJukeboxSong | null
  queue: PublicJukeboxSong[]
  status: PlayerStatus
  error: string
  elapsed: number
  duration: number
  paused: boolean
  volume: number
  schedule: ScheduleStatusResponse | null
}

export interface ScheduleSyncPayload {
  version?: number
  timezone?: string
  schedules?: SchedulePlanItem[]
  mediaManifest?: Array<{ mediaId: number | string; sha256: string }>
}

export interface ScheduleSyncResult {
  ok: boolean
  skipped?: boolean
  reason?: string
  planVersion: number
  scheduleCount?: number
  mediaCount?: number
}

export interface RegisterMediaInput {
  mediaId: number | string
  sha256: string
  relativePath: string
  durationMs?: number
  codec?: string
  fileSize?: number
}
