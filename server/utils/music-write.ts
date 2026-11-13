import type { H3Event } from 'h3'
import { getHeader, getQuery, getRequestURL, getRouterParam, getRouterParams, readBody } from 'h3'
import type { PoolConnection, RowDataPacket } from 'mysql2/promise'
import { getMysqlPool, mysqlQueryOptions } from './mysql'
import { fetchPlayer } from './jukebox-client'
import { syncPendingMusicMedia } from './music-media'
import { errorMessage } from './response'
import {
  affectedRows,
  insertOperationLog,
  javaAjax,
  positiveId,
  queryOne,
  requiredText,
  sqlPlaceholders,
  stringIdList,
  text,
  withIdempotentWriteSession,
  writeFail,
} from './write'
import { JUKEBOX_PERMISSIONS } from './jukebox-permissions'
import { findBroadcastScheduleConflicts, validateBroadcastSchedule } from './jukebox-schedule'

type Kind =
  | 'album-add' | 'album-edit' | 'album-delete'
  | 'track-add' | 'track-batch' | 'track-order' | 'track-delete' | 'track-group-delete' | 'track-clear'
  | 'schedule-add' | 'schedule-edit' | 'schedule-delete' | 'schedule-toggle'

function permissionFor(kind: Kind): string {
  return kind.startsWith('schedule-') ? JUKEBOX_PERMISSIONS.schedule : JUKEBOX_PERMISSIONS.manage
}

function pathText(event: H3Event, name: string): string {
  const direct = getRouterParam(event, name)
  if (direct != null && text(direct)) return text(direct)
  const params = getRouterParams(event) as Record<string, unknown>
  const named = params?.[name]
  if (named != null && text(named)) return text(named)
  const segments = getRequestURL(event).pathname.split('/').filter(Boolean)
  return text(segments.at(-1))
}

function requestId(event: H3Event, body: Record<string, any>): string {
  return text(getHeader(event, 'idempotency-key')) || text(body.requestId) || crypto.randomUUID()
}

function auditBody(body: Record<string, any>, requestKey: string) {
  return { ...body, requestId: requestKey }
}

async function assertAlbum(connection: PoolConnection, albumId: number) {
  return queryOne(connection, 'SELECT album_id FROM tk_music_album WHERE album_id = ?', [albumId]) || writeFail('专辑不存在')
}

async function refreshTrackCount(connection: PoolConnection, albumId: number) {
  await connection.query(mysqlQueryOptions('UPDATE tk_music_album SET track_count = (SELECT COUNT(*) FROM tk_music_track WHERE album_id = ?) WHERE album_id = ?'), [albumId, albumId])
}

async function albumWrite(event: H3Event, session: any, connection: PoolConnection, body: Record<string, any>, editing: boolean, requestKey: string) {
  if (!editing) {
    const name = requiredText(body.name, '专辑名称', 255)
    const result: any = await connection.query(mysqlQueryOptions(`
      INSERT INTO tk_music_album
        (name, description, source_type, source_url, track_count, status, create_by, create_time, update_by, update_time, remark)
      VALUES (?, ?, ?, ?, 0, ?, ?, NOW(), ?, NOW(), ?)
    `), [name, body.description ?? null, text(body.sourceType) || 'manual', body.sourceUrl ?? null, text(body.status) || '0', session.userName, session.userName, body.remark ?? null])
    const count = affectedRows(result[0])
    await insertOperationLog(event, connection, session, 'MusicAlbum', 1, auditBody(body, requestKey))
    return javaAjax(count)
  }

  const albumId = positiveId(body.albumId, '专辑ID')
  await assertAlbum(connection, albumId)
  const fields: Array<[string, string, unknown]> = [
    ['name', 'name', body.name], ['description', 'description', body.description], ['sourceType', 'source_type', body.sourceType],
    ['sourceUrl', 'source_url', body.sourceUrl], ['trackCount', 'track_count', body.trackCount], ['status', 'status', body.status], ['remark', 'remark', body.remark],
  ]
  const sets: string[] = []
  const params: unknown[] = []
  for (const [key, column, value] of fields) {
    if (!(key in body)) continue
    if (key === 'name') params.push(requiredText(value, '专辑名称', 255))
    else if (key === 'trackCount') {
      const number = Number(value)
      if (!Number.isSafeInteger(number) || number < 0) writeFail('歌曲数量不符合规范')
      params.push(number)
    } else params.push(value ?? null)
    sets.push(`${column} = ?`)
  }
  sets.push('update_by = ?', 'update_time = NOW()')
  params.push(session.userName, albumId)
  const result: any = await connection.query(mysqlQueryOptions(`UPDATE tk_music_album SET ${sets.join(', ')} WHERE album_id = ?`), params)
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, 'MusicAlbum', 2, auditBody(body, requestKey))
  return javaAjax(count)
}

async function albumDelete(event: H3Event, session: any, connection: PoolConnection, requestKey: string) {
  const ids = stringIdList(pathText(event, 'albumIds'), '专辑ID').map((value) => positiveId(value, '专辑ID'))
  const placeholders = sqlPlaceholders(ids)
  const [linkedSchedules] = await connection.query<RowDataPacket[]>(mysqlQueryOptions(`
    SELECT s.broadcast_schedule_id
    FROM tk_music_broadcast_schedule_album sa
    INNER JOIN tk_music_broadcast_schedule s ON s.broadcast_schedule_id = sa.broadcast_schedule_id
    WHERE sa.album_id IN (${placeholders})
    LIMIT 1
  `), ids)
  if (linkedSchedules.length) writeFail('所选专辑仍被凌晨播放计划使用，请先从计划中移除')
  await connection.query(mysqlQueryOptions(`DELETE FROM tk_music_track WHERE album_id IN (${placeholders})`), ids)
  const result: any = await connection.query(mysqlQueryOptions(`DELETE FROM tk_music_album WHERE album_id IN (${placeholders})`), ids)
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, 'MusicAlbum', 3, { albumIds: ids, requestId: requestKey })
  return javaAjax(count)
}

function trackItems(body: Record<string, any>): Record<string, any>[] {
  const items = Array.isArray(body.items) ? body.items : []
  if (!items.length) writeFail('歌曲列表不能为空')
  return items.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) writeFail('歌曲参数不符合规范')
    return item as Record<string, any>
  })
}

function trackValues(item: Record<string, any>, albumId: number, sortOrder: number | null): unknown[] {
  return [albumId, text(item.videoId) || null, requiredText(item.title, '歌曲标题', 500), text(item.url) || null, text(item.channel) || null, text(item.thumbnail) || null, item.duration == null || text(item.duration) === '' ? null : positiveId(item.duration, '歌曲时长'), sortOrder ?? 0]
}

async function trackAdd(event: H3Event, session: any, connection: PoolConnection, body: Record<string, any>, requestKey: string, batch: boolean) {
  const albumId = positiveId(body.albumId ?? pathText(event, 'albumId'), '专辑ID')
  await assertAlbum(connection, albumId)
  const items = batch ? trackItems(body) : [body]
  let nextOrder = Number((await queryOne(connection, 'SELECT COUNT(*) AS count FROM tk_music_track WHERE album_id = ?', [albumId]))?.count || 0) + 1
  const values: unknown[] = []
  const tuples: string[] = []
  for (const item of items) {
    tuples.push('(?, ?, ?, ?, ?, ?, ?, ?, NOW())')
    values.push(...trackValues(item, albumId, item.sortOrder == null ? nextOrder : Number(item.sortOrder)))
    nextOrder += 1
  }
  const result: any = await connection.query(mysqlQueryOptions(`INSERT INTO tk_music_track (album_id, video_id, title, url, channel, thumbnail, duration, sort_order, create_time) VALUES ${tuples.join(', ')}`), values)
  await refreshTrackCount(connection, albumId)
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, 'MusicTrack', 1, auditBody(body, requestKey))
  return javaAjax(count)
}

async function trackOrder(event: H3Event, session: any, connection: PoolConnection, body: Record<string, any>, requestKey: string) {
  const albumId = positiveId(body.albumId ?? pathText(event, 'albumId'), '专辑ID')
  await assertAlbum(connection, albumId)
  const items = trackItems(body)
  const existingRows = await connection.query<RowDataPacket[]>(mysqlQueryOptions('SELECT track_id FROM tk_music_track WHERE album_id = ?'), [albumId])
  const existing = new Set(existingRows[0].map((row) => Number(row.track_id)))
  const requested = new Set<number>()
  if (items.length !== existing.size) writeFail('歌曲顺序数据不完整，请刷新后重试')
  for (const [index, item] of items.entries()) {
    const trackId = positiveId(item.trackId, '歌曲ID')
    if (!existing.has(trackId) || requested.has(trackId)) writeFail('歌曲顺序数据已变化，请刷新后重试')
    requested.add(trackId)
    await connection.query(mysqlQueryOptions('UPDATE tk_music_track SET sort_order = ?, update_time = NOW() WHERE album_id = ? AND track_id = ?'), [index + 1, albumId, trackId])
  }
  await insertOperationLog(event, connection, session, 'MusicTrack', 2, auditBody(body, requestKey))
  return javaAjax(items.length)
}

async function trackDelete(event: H3Event, session: any, connection: PoolConnection, requestKey: string, mode: 'one' | 'group' | 'all') {
  const albumId = positiveId(pathText(event, 'albumId'), '专辑ID')
  await assertAlbum(connection, albumId)
  let result: any
  if (mode === 'one') {
    const trackId = positiveId(pathText(event, 'trackId'), '歌曲ID')
    result = await connection.query(mysqlQueryOptions('DELETE FROM tk_music_track WHERE album_id = ? AND track_id = ?'), [albumId, trackId])
  } else if (mode === 'group') {
    const channel = text(getQuery(event).channel)
    if (!channel) writeFail('频道不能为空')
    result = await connection.query(mysqlQueryOptions(`DELETE FROM tk_music_track WHERE album_id = ? AND (channel = ? OR (? = '其他单曲' AND (channel IS NULL OR channel = ''))) `), [albumId, channel, channel])
  } else {
    result = await connection.query(mysqlQueryOptions('DELETE FROM tk_music_track WHERE album_id = ?'), [albumId])
  }
  await refreshTrackCount(connection, albumId)
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, 'MusicTrack', 3, { albumId, mode, requestId: requestKey })
  return javaAjax(count)
}

function scheduleAlbumIdList(value: unknown): number[] {
  const values = Array.isArray(value) ? value : text(value).split(',').filter(Boolean)
  const ids = values.map((item) => positiveId(item, '专辑ID'))
  if (!ids.length) writeFail('请至少选择一张专辑')
  if (new Set(ids).size !== ids.length) writeFail('专辑选择不能重复')
  return ids
}

async function scheduleAlbumTracks(connection: PoolConnection, albumIds: number[]) {
  const [rows] = await connection.query<RowDataPacket[]>(mysqlQueryOptions(`
    SELECT a.album_id, a.name AS album_name, t.track_id, t.title, t.duration, t.media_id,
           t.channel, t.thumbnail, t.sort_order, m.duration_ms, m.sync_status, m.sha256, m.player_sha256
    FROM tk_music_album a
    LEFT JOIN tk_music_track t ON t.album_id = a.album_id
    LEFT JOIN tk_music_media m ON m.media_id = t.media_id
    WHERE a.album_id IN (${sqlPlaceholders(albumIds)})
  `), albumIds)
  const albumOrder = new Map(albumIds.map((albumId, index) => [albumId, index]))
  rows.sort((left, right) => (albumOrder.get(Number(left.album_id)) ?? 0) - (albumOrder.get(Number(right.album_id)) ?? 0)
    || Number(left.sort_order || 0) - Number(right.sort_order || 0)
    || Number(left.track_id || 0) - Number(right.track_id || 0))
  if (new Set(rows.map((row) => Number(row.album_id))).size !== albumIds.length) writeFail('所选专辑中包含已删除的专辑')
  const tracks = rows.filter((row) => row.track_id != null)
  if (!tracks.length) writeFail('所选专辑没有曲目，无法排期')
  return tracks
}

async function existingBroadcastSchedules(connection: PoolConnection, excludeId = 0) {
  const [rows] = await connection.query<RowDataPacket[]>(mysqlQueryOptions(`
    SELECT s.broadcast_schedule_id AS schedule_id, s.schedule_type, s.weekdays, s.start_time, s.end_time,
           s.enabled, t.track_id, COALESCE(m.duration_ms, t.duration * 1000) AS duration_ms
    FROM tk_music_broadcast_schedule s
    LEFT JOIN tk_music_broadcast_schedule_album sa ON sa.broadcast_schedule_id = s.broadcast_schedule_id
    LEFT JOIN tk_music_track t ON t.album_id = sa.album_id
    LEFT JOIN tk_music_media m ON m.media_id = t.media_id
    WHERE s.enabled = '1' AND (? = 0 OR s.broadcast_schedule_id <> ?)
    ORDER BY s.broadcast_schedule_id, sa.sort_order, t.sort_order, t.track_id
  `), [excludeId, excludeId])
  const schedules = new Map<number, any>()
  for (const row of rows) {
    const id = Number(row.schedule_id)
    const schedule = schedules.get(id) || {
      scheduleId: id,
      scheduleType: row.schedule_type,
      weekdays: row.weekdays,
      startTime: row.start_time,
      endTime: row.end_time,
      enabled: row.enabled,
      tracks: [],
    }
    if (row.track_id != null) schedule.tracks.push({ durationMs: Number(row.duration_ms || 0) })
    schedules.set(id, schedule)
  }
  return [...schedules.values()]
}

async function scheduleWrite(event: H3Event, session: any, connection: PoolConnection, body: Record<string, any>, editing: boolean, requestKey: string) {
  const scheduleId = editing ? positiveId(body.scheduleId, '计划ID') : null
  if (scheduleId) {
    await queryOne(connection, 'SELECT broadcast_schedule_id FROM tk_music_broadcast_schedule WHERE broadcast_schedule_id = ?', [scheduleId]) || writeFail('广播计划不存在')
  }
  const albumIds = scheduleAlbumIdList(body.albumIds)
  const tracks = await scheduleAlbumTracks(connection, albumIds)
  const targetEnabled = text(body.enabled) === '1' ? '1' : '0'
  const scheduleType = text(body.scheduleType) || 'daily'
  const weekdays = Array.isArray(body.weekdays) ? body.weekdays.join(',') : text(body.weekdays) || null
  const startTime = text(body.startTime)
  const endTime = text(body.endTime) || null
  const loop = text(body.loop) === '1' ? '1' : '0'
  const playOrder = Number(body.playOrder ?? 0)
  if (!Number.isSafeInteger(playOrder) || playOrder < 0) writeFail('播放顺序不符合规范')
  const candidate = {
    scheduleId: scheduleId || 0,
    scheduleType,
    weekdays,
    startTime,
    endTime,
    enabled: targetEnabled,
    tracks: tracks.map((row) => ({ durationMs: Number(row.duration_ms || Number(row.duration || 0) * 1000) })),
  }
  try {
    validateBroadcastSchedule(candidate)
    if (targetEnabled === '1' && tracks.some((row) =>
      !row.media_id || row.sync_status !== 'ready' || !row.sha256 || row.player_sha256 !== row.sha256,
    )) {
      writeFail('所选专辑仍有曲目缺少已同步的本地音频')
    }
    if (targetEnabled === '1') {
      const conflicts = findBroadcastScheduleConflicts([...await existingBroadcastSchedules(connection, scheduleId || 0), candidate])
      if (conflicts.length) writeFail(`排期与计划 ${conflicts[0][0]}、${conflicts[0][1]} 时间重叠`)
    }
  } catch (error) {
    if (error instanceof Error && error.message) writeFail(error.message)
    throw error
  }

  const name = requiredText(body.name, '计划名称', 255)
  const values = [name, scheduleType, weekdays, startTime, endTime, playOrder, loop, targetEnabled, session.userName, body.remark ?? null]
  let result: any
  let savedScheduleId = scheduleId
  if (editing) {
    result = await connection.query(mysqlQueryOptions(`
      UPDATE tk_music_broadcast_schedule
      SET name = ?, schedule_type = ?, weekdays = ?, start_time = ?, end_time = ?, play_order = ?,
          \`loop\` = ?, enabled = ?, update_by = ?, update_time = NOW(), remark = ?
      WHERE broadcast_schedule_id = ?
    `), [...values, scheduleId])
    await connection.query(mysqlQueryOptions('DELETE FROM tk_music_broadcast_schedule_album WHERE broadcast_schedule_id = ?'), [scheduleId])
  } else {
    result = await connection.query(mysqlQueryOptions(`
      INSERT INTO tk_music_broadcast_schedule
        (name, schedule_type, weekdays, start_time, end_time, play_order, \`loop\`, enabled, create_by, create_time, update_by, update_time, remark)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, NOW(), ?)
    `), [name, scheduleType, weekdays, startTime, endTime, playOrder, loop, targetEnabled, session.userName, session.userName, body.remark ?? null])
    savedScheduleId = Number((result[0] as any).insertId)
  }
  if (!savedScheduleId) writeFail('无法读取新建计划编号')
  await connection.query(mysqlQueryOptions(`
    INSERT INTO tk_music_broadcast_schedule_album (broadcast_schedule_id, album_id, sort_order)
    VALUES ${albumIds.map(() => '(?, ?, ?)').join(', ')}
  `), albumIds.flatMap((albumId, index) => [savedScheduleId, albumId, index + 1]))
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, 'MusicBroadcastSchedule', editing ? 2 : 1, auditBody({ ...body, albumIds }, requestKey))
  return javaAjax(count)
}

async function scheduleDelete(event: H3Event, session: any, connection: PoolConnection, requestKey: string) {
  const ids = stringIdList(pathText(event, 'scheduleIds'), '计划ID').map((value) => positiveId(value, '计划ID'))
  const placeholders = sqlPlaceholders(ids)
  await connection.query(mysqlQueryOptions(`DELETE FROM tk_music_broadcast_schedule_album WHERE broadcast_schedule_id IN (${placeholders})`), ids)
  const result: any = await connection.query(mysqlQueryOptions(`DELETE FROM tk_music_broadcast_schedule WHERE broadcast_schedule_id IN (${placeholders})`), ids)
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, 'MusicBroadcastSchedule', 3, { scheduleIds: ids, requestId: requestKey })
  return javaAjax(count)
}

async function scheduleToggle(event: H3Event, session: any, connection: PoolConnection, body: Record<string, any>, requestKey: string) {
  const scheduleId = positiveId(pathText(event, 'scheduleId'), '计划ID')
  const current = await queryOne(connection, `
    SELECT broadcast_schedule_id, schedule_type, weekdays, start_time, end_time, enabled
    FROM tk_music_broadcast_schedule WHERE broadcast_schedule_id = ?
  `, [scheduleId]) || writeFail('广播计划不存在')
  const enabled = text(body.enabled) === '1' ? '1' : '0'
  if (enabled === '1') {
    const [albumRows] = await connection.query<RowDataPacket[]>(mysqlQueryOptions(`
      SELECT album_id FROM tk_music_broadcast_schedule_album WHERE broadcast_schedule_id = ? ORDER BY sort_order, album_id
    `), [scheduleId])
    const albumIds = albumRows.map((row) => Number(row.album_id))
    if (!albumIds.length) writeFail('计划中还没有选择专辑')
    const tracks = await scheduleAlbumTracks(connection, albumIds)
    if (tracks.some((row) => !row.media_id || row.sync_status !== 'ready' || !row.sha256 || row.player_sha256 !== row.sha256)) {
      writeFail('所选专辑仍有曲目缺少已同步的本地音频')
    }
    const candidate = {
      scheduleId,
      scheduleType: current.schedule_type,
      weekdays: current.weekdays,
      startTime: current.start_time,
      endTime: current.end_time,
      enabled,
      tracks: tracks.map((row) => ({ durationMs: Number(row.duration_ms || Number(row.duration || 0) * 1000) })),
    }
    try {
      validateBroadcastSchedule(candidate)
      const conflicts = findBroadcastScheduleConflicts([...await existingBroadcastSchedules(connection, scheduleId), candidate])
      if (conflicts.length) writeFail(`排期与计划 ${conflicts[0][0]}、${conflicts[0][1]} 时间重叠`)
    } catch (error) {
      if (error instanceof Error && error.message) writeFail(error.message)
      throw error
    }
  }
  const result: any = await connection.query(mysqlQueryOptions('UPDATE tk_music_broadcast_schedule SET enabled = ?, update_by = ?, update_time = NOW() WHERE broadcast_schedule_id = ?'), [enabled, session.userName, scheduleId])
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, 'MusicBroadcastSchedule', 2, auditBody(body, requestKey))
  return javaAjax(count)
}

export async function syncMusicPlan(): Promise<{ ok: boolean; scheduleCount: number; excludedScheduleCount: number; mediaSync: Awaited<ReturnType<typeof syncPendingMusicMedia>> }> {
  const mediaSync = await syncPendingMusicMedia(3)
  const [rows] = await getMysqlPool().query<RowDataPacket[]>(mysqlQueryOptions(`
    SELECT s.broadcast_schedule_id AS schedule_id, s.name AS schedule_name, s.schedule_type, s.weekdays,
           s.start_time, s.end_time, s.\`loop\`, s.enabled, s.play_order,
           sa.album_id, a.name AS album_name, sa.sort_order AS album_sort_order,
           t.track_id, t.video_id, t.title, t.channel, t.thumbnail, t.sort_order,
           t.media_id, COALESCE(m.duration_ms, t.duration * 1000) AS duration_ms,
           m.sha256 AS media_sha256, m.sync_status AS media_sync_status, m.player_sha256
    FROM tk_music_broadcast_schedule s
    LEFT JOIN tk_music_broadcast_schedule_album sa ON sa.broadcast_schedule_id = s.broadcast_schedule_id
    LEFT JOIN tk_music_album a ON a.album_id = sa.album_id
    LEFT JOIN tk_music_track t ON t.album_id = sa.album_id
    LEFT JOIN tk_music_media m ON m.media_id = t.media_id
    WHERE s.enabled = '1'
    ORDER BY s.start_time, s.play_order, s.broadcast_schedule_id, sa.sort_order, t.sort_order, t.track_id
  `))
  const schedules = new Map<number, any>()
  const invalid = new Set<number>()
  const mediaManifest = new Map<number, { mediaId: number; sha256: string }>()
  for (const row of rows) {
    const scheduleId = Number(row.schedule_id)
    let schedule = schedules.get(scheduleId)
    if (!schedule) {
      schedule = {
        scheduleId, name: row.schedule_name, albumIds: [], albumNames: [], _albumIds: new Set<number>(), scheduleType: row.schedule_type,
        weekdays: row.weekdays, startTime: String(row.start_time || '').slice(0, 5),
        endTime: row.end_time ? String(row.end_time).slice(0, 5) : null,
        loop: row.loop, enabled: row.enabled, tracks: [],
      }
      schedules.set(scheduleId, schedule)
    }
    if (row.album_id != null && !schedule._albumIds.has(Number(row.album_id))) {
      schedule._albumIds.add(Number(row.album_id))
      schedule.albumIds.push(Number(row.album_id))
      schedule.albumNames.push(String(row.album_name || ''))
    }
    if (row.track_id == null || !row.media_id || row.media_sync_status !== 'ready' || row.player_sha256 !== row.media_sha256) {
      invalid.add(scheduleId)
      continue
    }
    const mediaId = Number(row.media_id)
    const sha256 = String(row.media_sha256 || '').toLowerCase()
    if (!sha256) {
      invalid.add(scheduleId)
      continue
    }
    mediaManifest.set(mediaId, { mediaId, sha256 })
    schedule.tracks.push({
      trackId: Number(row.track_id), albumId: Number(row.album_id), mediaId, sha256, title: row.title, channel: row.channel,
      thumbnail: row.thumbnail, durationMs: Number(row.duration_ms || 0), sortOrder: Number(row.sort_order || 0),
    })
  }
  const allSchedules = [...schedules.values()]
  for (const schedule of allSchedules) delete schedule._albumIds
  const playable = allSchedules.filter((schedule) => !invalid.has(schedule.scheduleId) && schedule.tracks.length > 0)
  const response = await fetchPlayer('/api/schedule/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        version: Date.now(),
        timezone: 'Asia/Shanghai',
        schedules: playable,
        mediaManifest: [...mediaManifest.values()],
      }),
  })
  if (!response.response.ok) throw new Error(`播放器计划同步 HTTP ${response.response.status}`)
  return { ok: true, scheduleCount: playable.length, excludedScheduleCount: invalid.size, mediaSync }
}

export function createMusicWriteHandler(kind: Kind) {
  return async (event: H3Event) => {
    const rawBody = await readBody(event)
    const body = Array.isArray(rawBody)
      ? { items: rawBody }
      : rawBody && typeof rawBody === 'object' ? rawBody as Record<string, any> : {}
    const requestKey = requestId(event, body)
    return withIdempotentWriteSession(
      event,
      `music:${kind}`,
      permissionFor(kind),
      requestKey,
      auditBody(body, requestKey),
      async (session, connection) => {
        switch (kind) {
          case 'album-add': return albumWrite(event, session, connection, body, false, requestKey)
          case 'album-edit': return albumWrite(event, session, connection, body, true, requestKey)
          case 'album-delete': return albumDelete(event, session, connection, requestKey)
          case 'track-add': return trackAdd(event, session, connection, body, requestKey, false)
          case 'track-batch': return trackAdd(event, session, connection, body, requestKey, true)
          case 'track-order': return trackOrder(event, session, connection, body, requestKey)
          case 'track-delete': return trackDelete(event, session, connection, requestKey, 'one')
          case 'track-group-delete': return trackDelete(event, session, connection, requestKey, 'group')
          case 'track-clear': return trackDelete(event, session, connection, requestKey, 'all')
          case 'schedule-add': return scheduleWrite(event, session, connection, body, false, requestKey)
          case 'schedule-edit': return scheduleWrite(event, session, connection, body, true, requestKey)
          case 'schedule-delete': return scheduleDelete(event, session, connection, requestKey)
          case 'schedule-toggle': return scheduleToggle(event, session, connection, body, requestKey)
        }
      },
      '音乐配置保存失败',
      async () => {
        try {
          await syncMusicPlan()
        } catch (error) {
          console.error('[NitroMusic] player schedule sync failed:', errorMessage(error, 'unknown error'))
        }
      },
    )
  }
}
