import type { H3Event } from 'h3'
import { getQuery, getRouterParam } from 'h3'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { apiError, apiSuccess, apiSuccessFields } from './response'
import { mysqlQueryOptions } from './mysql'
import { camelizeRows, pageRequest, queryPage, queryText, withReadPermissionSession } from './read'
import { JUKEBOX_PERMISSIONS } from './jukebox-permissions'

type Query = Record<string, unknown>

const ALBUM_COLUMNS = `album_id, name, description, source_type, source_url, track_count,
  status, create_by, create_time, update_by, update_time, remark`
const TRACK_COLUMNS = `t.track_id, t.album_id, t.video_id, t.media_id, t.title, t.url, t.channel, t.thumbnail,
  t.duration, t.sort_order, t.create_time, t.update_time, m.sha256 AS media_sha256,
  m.duration_ms AS media_duration_ms, m.sync_status AS media_sync_status,
  m.player_sha256, m.last_sync_error, m.file_name AS media_file_name`
const SCHEDULE_COLUMNS = `s.broadcast_schedule_id AS schedule_id, s.name, s.schedule_type, s.weekdays,
  s.start_time, s.end_time, s.play_order, s.\`loop\`, s.enabled, s.last_played,
  s.create_by, s.create_time, s.update_by, s.update_time, s.remark`

function like(conditions: string[], params: unknown[], column: string, value: unknown) {
  const text = queryText(value)
  if (text) {
    conditions.push(`${column} LIKE CONCAT('%', ?, '%')`)
    params.push(text)
  }
}

function equal(conditions: string[], params: unknown[], column: string, value: unknown) {
  const text = queryText(value)
  if (text) {
    conditions.push(`${column} = ?`)
    params.push(text)
  }
}

function id(event: H3Event, name: string): number | null {
  const value = Number(queryText(getRouterParam(event, name)))
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

function where(conditions: string[]) {
  return conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''
}

export async function listMusicAlbums(event: H3Event) {
  return withReadPermissionSession(event, 'MusicAlbumList', JUKEBOX_PERMISSIONS.list, async (_, pool: Pool) => {
    const query = getQuery(event) as Query
    const page = pageRequest(query)
    const conditions: string[] = []
    const params: unknown[] = []
    like(conditions, params, 'name', query.name)
    equal(conditions, params, 'source_type', query.sourceType)
    equal(conditions, params, 'status', query.status)
    const filter = where(conditions)
    const result = await queryPage(
      pool,
      `SELECT COUNT(*) AS total FROM tk_music_album${filter}`,
      `SELECT ${ALBUM_COLUMNS} FROM tk_music_album${filter} ORDER BY album_id DESC LIMIT ?, ?`,
      params,
      [...params, page.offset, page.pageSize],
    )
    return apiSuccessFields({ rows: camelizeRows(result.rows), total: result.total }, '查询成功')
  }, '获取音乐专辑列表失败')
}

export async function getMusicAlbum(event: H3Event) {
  return withReadPermissionSession(event, 'MusicAlbumDetail', JUKEBOX_PERMISSIONS.list, async (_, pool: Pool) => {
    const albumId = id(event, 'albumId')
    if (!albumId) return apiError('专辑ID不符合规范')
    const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`SELECT ${ALBUM_COLUMNS} FROM tk_music_album WHERE album_id = ? LIMIT 1`), [albumId])
    return apiSuccess(camelizeRows(rows)[0] || null)
  }, '获取音乐专辑详情失败')
}

export async function listMusicTracks(event: H3Event) {
  return withReadPermissionSession(event, 'MusicTrackList', JUKEBOX_PERMISSIONS.list, async (_, pool: Pool) => {
    const albumId = id(event, 'albumId')
    if (!albumId) return apiError('专辑ID不符合规范')
    const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`SELECT ${TRACK_COLUMNS} FROM tk_music_track t LEFT JOIN tk_music_media m ON m.media_id = t.media_id WHERE t.album_id = ? ORDER BY t.sort_order, t.track_id`), [albumId])
    return apiSuccess(camelizeRows(rows))
  }, '获取音乐曲目失败')
}

export async function listMusicSchedules(event: H3Event) {
  return withReadPermissionSession(event, 'MusicScheduleList', JUKEBOX_PERMISSIONS.list, async (_, pool: Pool) => {
    const query = getQuery(event) as Query
    const page = pageRequest(query)
    const conditions: string[] = []
    const params: unknown[] = []
    const albumId = Number(queryText(query.albumId))
    if (Number.isSafeInteger(albumId) && albumId > 0) {
      conditions.push('EXISTS (SELECT 1 FROM tk_music_broadcast_schedule_album sa WHERE sa.broadcast_schedule_id = s.broadcast_schedule_id AND sa.album_id = ?)')
      params.push(albumId)
    }
    like(conditions, params, 's.name', query.name)
    equal(conditions, params, 's.schedule_type', query.scheduleType)
    equal(conditions, params, 's.enabled', query.enabled)
    const filter = where(conditions)
    const result = await queryPage(
      pool,
      `SELECT COUNT(*) AS total FROM tk_music_broadcast_schedule s${filter}`,
      `SELECT ${SCHEDULE_COLUMNS} FROM tk_music_broadcast_schedule s${filter} ORDER BY s.start_time, s.play_order, s.broadcast_schedule_id LIMIT ?, ?`,
      params,
      [...params, page.offset, page.pageSize],
    )
    const schedules = camelizeRows(result.rows) as Array<Record<string, any>>
    if (!schedules.length) return apiSuccessFields({ rows: schedules, total: result.total }, '查询成功')
    const scheduleIds = schedules.map((schedule) => Number(schedule.scheduleId))
    const [albumRows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`
      SELECT sa.broadcast_schedule_id AS schedule_id, sa.album_id, a.name AS album_name
      FROM tk_music_broadcast_schedule_album sa
      INNER JOIN tk_music_album a ON a.album_id = sa.album_id
      WHERE sa.broadcast_schedule_id IN (${scheduleIds.map(() => '?').join(',')})
      ORDER BY sa.broadcast_schedule_id, sa.sort_order, sa.album_id
    `), scheduleIds)
    const albumsBySchedule = new Map<number, Array<{ albumId: number; albumName: string }>>()
    for (const row of albumRows) {
      const id = Number(row.schedule_id)
      const selected = albumsBySchedule.get(id) || []
      selected.push({ albumId: Number(row.album_id), albumName: String(row.album_name || '') })
      albumsBySchedule.set(id, selected)
    }
    return apiSuccessFields({
      rows: schedules.map((schedule) => {
        const selected = albumsBySchedule.get(Number(schedule.scheduleId)) || []
        return { ...schedule, albumIds: selected.map((album) => album.albumId), albumNames: selected.map((album) => album.albumName) }
      }),
      total: result.total,
    }, '查询成功')
  }, '获取音乐计划列表失败')
}

export async function getMusicSchedule(event: H3Event) {
  return withReadPermissionSession(event, 'MusicScheduleDetail', JUKEBOX_PERMISSIONS.list, async (_, pool: Pool) => {
    const scheduleId = id(event, 'scheduleId')
    if (!scheduleId) return apiError('计划ID不符合规范')
    const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`SELECT ${SCHEDULE_COLUMNS} FROM tk_music_broadcast_schedule s WHERE s.broadcast_schedule_id = ? LIMIT 1`), [scheduleId])
    const schedule = camelizeRows(rows)[0]
    if (!schedule) return apiSuccess(null)
    const [albumRows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`
      SELECT sa.album_id, a.name AS album_name
      FROM tk_music_broadcast_schedule_album sa
      INNER JOIN tk_music_album a ON a.album_id = sa.album_id
      WHERE sa.broadcast_schedule_id = ?
      ORDER BY sa.sort_order, sa.album_id
    `), [scheduleId])
    const selected = camelizeRows(albumRows) as Array<Record<string, any>>
    return apiSuccess({
      ...schedule,
      albumIds: selected.map((album) => Number(album.albumId)),
      albumNames: selected.map((album) => String(album.albumName || '')),
    })
  }, '获取音乐计划详情失败')
}
