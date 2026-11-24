import { describe, expect, it } from 'vitest'
import {
  computeScheduleDurationMs,
  detectScheduleTimeConflict,
  formatHumanDurationMs,
  formatJukeboxDuration,
  formatJukeboxDurationMs,
  formatJukeboxFileSize,
  formatScheduleSummary,
  getTrackSyncStatusMeta,
  isJukeboxTrackReady,
  moveArrayItem,
  summarizeAlbumTracks,
  toPlayableSongPayload,
} from '../packages/shared/index.js'

describe('Jukebox shared UI helpers', () => {
  it('formats seconds, milliseconds, human durations, and file sizes cleanly', () => {
    expect(formatJukeboxDuration(0)).toBe('0:00')
    expect(formatJukeboxDuration(65)).toBe('1:05')
    expect(formatJukeboxDuration(3661)).toBe('1:01:01')
    expect(formatJukeboxDurationMs(125_400)).toBe('2:05')
    expect(formatHumanDurationMs(45_000)).toBe('45 秒')
    expect(formatHumanDurationMs(2_700_000)).toBe('45 分钟')
    expect(formatHumanDurationMs(5_400_000)).toBe('1 小时 30 分')
    expect(formatJukeboxFileSize(500)).toBe('500 B')
    expect(formatJukeboxFileSize(2048)).toBe('2.0 KB')
    expect(formatJukeboxFileSize(5 * 1024 * 1024)).toBe('5.0 MB')
  })

  it('classifies track readiness and summarizes album track counts accurately', () => {
    const readyTrack = {
      trackId: 1,
      mediaId: 10,
      mediaSyncStatus: 'ready',
      mediaSha256: 'abc',
      playerSha256: 'abc',
      mediaDurationMs: 180_000,
    }
    const pendingTrack = {
      trackId: 2,
      mediaId: 11,
      mediaSyncStatus: 'pending_sync',
      duration: 120,
    }
    const failedTrack = {
      trackId: 3,
      mediaId: 12,
      mediaSyncStatus: 'failed',
      lastSyncError: '校验失败',
      mediaDurationMs: 90_000,
    }
    const mismatchTrack = {
      trackId: 4,
      mediaId: 13,
      mediaSyncStatus: 'ready',
      mediaSha256: 'aaa',
      playerSha256: 'bbb',
    }
    const legacyTrack = {
      trackId: 5,
      mediaId: null,
      duration: 200,
    }

    expect(isJukeboxTrackReady(readyTrack)).toBe(true)
    expect(isJukeboxTrackReady(mismatchTrack)).toBe(false)
    expect(getTrackSyncStatusMeta(readyTrack)).toMatchObject({ code: 'ready', color: 'success', ready: true })
    expect(getTrackSyncStatusMeta(pendingTrack)).toMatchObject({ code: 'pending_sync', color: 'warning', ready: false })
    expect(getTrackSyncStatusMeta(failedTrack)).toMatchObject({ code: 'failed', color: 'error', detail: '校验失败' })
    expect(getTrackSyncStatusMeta(mismatchTrack)).toMatchObject({ code: 'checksum_mismatch', color: 'error', ready: false })
    expect(getTrackSyncStatusMeta(legacyTrack)).toMatchObject({ code: 'missing_media', color: 'neutral', ready: false })

    expect(summarizeAlbumTracks([readyTrack, pendingTrack, failedTrack, mismatchTrack, legacyTrack])).toEqual({
      total: 5,
      ready: 1,
      pending: 1,
      failed: 2,
      missing: 1,
      needSyncCount: 3,
      totalDurationMs: 590_000,
      readyDurationMs: 180_000,
    })
  })

  it('reorders items immutably and builds playable payloads', () => {
    const source = ['a', 'b', 'c']
    const moved = moveArrayItem(source, 0, 2)
    expect(moved).toEqual(['b', 'c', 'a'])
    expect(source).toEqual(['a', 'b', 'c'])
    expect(moveArrayItem(source, -1, 1)).toEqual(['a', 'b', 'c'])

    expect(toPlayableSongPayload({
      trackId: 9,
      mediaId: 30,
      mediaSha256: 'deadbeef',
      mediaDurationMs: 42_000,
      title: '早会进行曲',
      channel: '厂区广播',
    })).toEqual({
      trackId: 9,
      mediaId: 30,
      sha256: 'deadbeef',
      durationMs: 42_000,
      title: '早会进行曲',
      channelTitle: '厂区广播',
      thumbnail: '',
    })
  })

  it('computes schedule totals, descriptions, and overnight schedule conflicts', () => {
    const albums = [
      {
        albumId: 1,
        name: '轻音乐',
        tracks: [
          { trackId: 1, mediaId: 11, mediaSyncStatus: 'ready', mediaSha256: 'a', playerSha256: 'a', mediaDurationMs: 300_000 },
        ],
      },
      {
        albumId: 2,
        name: '待补专辑',
        tracks: [
          { trackId: 2, mediaId: null, duration: 120 },
        ],
      },
    ]

    expect(computeScheduleDurationMs([1, 2], albums)).toEqual({
      totalMs: 420_000,
      trackCount: 2,
      readyTrackCount: 1,
      unreadyAlbumNames: ['待补专辑'],
    })

    expect(formatScheduleSummary({
      scheduleType: 'daily',
      startTime: '23:30',
      endTime: '01:00',
      loop: '1',
    })).toBe('每天 · 23:30–01:00（次日） · 循环至截止')

    expect(formatScheduleSummary({
      scheduleType: 'custom',
      weekdays: '1,3,5',
      startTime: '08:00',
      endTime: null,
      loop: '0',
    })).toBe('周一、周三、周五 · 08:00 · 播完一轮')

    const existing = [
      {
        scheduleId: 10,
        name: '夜班广播',
        scheduleType: 'daily',
        startTime: '23:30',
        endTime: '01:00',
        enabled: '1',
        albumIds: [1],
      },
    ]

    expect(detectScheduleTimeConflict({
      scheduleType: 'weekdays',
      startTime: '00:30',
      endTime: '01:30',
      enabled: '1',
      albumIds: [1],
    }, existing, albums)).toEqual([{ scheduleId: 10, name: '夜班广播' }])

    // 同一排期编辑自身不冲突，停用也不冲突
    expect(detectScheduleTimeConflict({
      scheduleId: 10,
      scheduleType: 'daily',
      startTime: '23:30',
      endTime: '01:00',
      enabled: '1',
      albumIds: [1],
    }, existing, albums)).toEqual([])
    expect(detectScheduleTimeConflict({
      scheduleType: 'weekdays',
      startTime: '00:30',
      endTime: '01:30',
      enabled: '0',
      albumIds: [1],
    }, existing, albums)).toEqual([])
  })
})
