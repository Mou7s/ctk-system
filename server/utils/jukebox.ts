import { getRouterParam, readBody } from 'h3'
import type { H3Event } from 'h3'
import { getAuthSession, hasPermission } from './auth'
import { apiError, apiSuccess, errorMessage } from './response'
import { getNitroServerConfig } from './runtime'
import { syncMusicPlan } from './music-write'
import { fetchPlayer, JukeboxRemoteError } from './jukebox-client'
import type { RowDataPacket } from 'mysql2/promise'
import { getMysqlPool, mysqlQueryOptions } from './mysql'
import { JUKEBOX_PERMISSIONS } from './jukebox-permissions'

async function fetchFirstPlayer(paths: string[], init: RequestInit = {}) {
  let lastError: unknown
  for (const path of paths) {
    try {
      return await fetchPlayer(path, init)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new JukeboxRemoteError('播放器接口不可用')
}

async function requirePermission(event: H3Event, permission: string) {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return { error: apiError('登录状态已过期', 401) }
  if (!hasPermission(authenticated.session, permission)) return { error: apiError('没有权限访问该接口', 403) }
  return { session: authenticated.session }
}

function remoteError(label: string, error: unknown) {
  console.error(`[NitroJukebox] ${label}:`, errorMessage(error, 'unknown error'))
  return apiError('播放器连接失败', 502)
}

export async function jukeboxHealth(event: H3Event) {
  const access = await requirePermission(event, JUKEBOX_PERMISSIONS.diagnostics)
  if (access.error) return access.error

  try {
    const [healthResult, scheduleResult, playerResult, mediaResult] = await Promise.allSettled([
      fetchPlayer('/api/health'),
      fetchPlayer('/api/schedule/status'),
      fetchPlayer('/api/player'),
      fetchPlayer('/api/media/status'),
    ])
    const health = healthResult.status === 'fulfilled' ? healthResult.value : null
    const schedule = scheduleResult.status === 'fulfilled' ? scheduleResult.value : null
    const player = playerResult.status === 'fulfilled' ? playerResult.value : null
    const media = mediaResult.status === 'fulfilled' ? mediaResult.value : null
    const apiUp = Boolean(health?.response.ok)
    const playerState = player?.details?.player || player?.details || {}
    const scheduleState = schedule?.details || {}
    let mediaSync: { status: string; ready: number; pending: number; failed: number; lastError: string | null } = {
      status: 'unavailable', ready: 0, pending: 0, failed: 0, lastError: null,
    }
    try {
      const [mediaRows] = await getMysqlPool().query<RowDataPacket[]>(mysqlQueryOptions(
        'SELECT sync_status, COUNT(*) AS total FROM tk_music_media GROUP BY sync_status',
      ))
      const counts = { ready: 0, pending: 0, failed: 0, unknown: 0 }
      for (const row of mediaRows) {
        const status = String(row.sync_status || '')
        if (status === 'ready') counts.ready += Number(row.total || 0)
        else if (status === 'pending_sync') counts.pending += Number(row.total || 0)
        else if (status === 'failed') counts.failed += Number(row.total || 0)
        else counts.unknown += Number(row.total || 0)
      }
      const [errorRows] = await getMysqlPool().query<RowDataPacket[]>(mysqlQueryOptions(
        'SELECT last_sync_error FROM tk_music_media WHERE last_sync_error IS NOT NULL ORDER BY update_time DESC LIMIT 1',
      ))
      mediaSync = { status: 'available', ...counts, lastError: errorRows[0]?.last_sync_error || null }
    } catch {
      // Diagnostics should still report player state if MySQL is unavailable.
    }
    const config = getNitroServerConfig()
    const apiUrl = config.jukeboxEngineMode === 'remote' ? config.jukeboxBaseUrl : 'embedded://ctk-system'
    const serviceUp = health?.details?.service === 'up'
    const serviceError = healthResult.status === 'rejected'
      ? '播放器接口不可达'
      : !serviceUp
        ? (health?.details?.mpvAvailable === false
            ? '未检测到 mpv 播放器'
            : health?.details?.pulseSocketReady === false
              ? '音频套接字未就绪'
              : '播放器音频环境未就绪')
        : ''
    return apiSuccess({
      api: { status: apiUp ? 'up' : 'down', url: apiUrl },
      service: { status: serviceUp ? 'up' : 'down' },
      player: {
        status: player ? (playerState.status || 'idle') : 'unavailable',
        current: playerState.current || null,
        elapsed: playerState.elapsed || 0,
        duration: playerState.duration || 0,
        error: playerState.error || '',
      },
      schedule: {
        status: schedule && Number.isFinite(Number(scheduleState.planVersion))
          ? (scheduleState.syncedAt ? 'synced' : 'unsynced')
          : 'unavailable',
        planVersion: scheduleState.planVersion ?? null,
        syncedAt: scheduleState.syncedAt ?? null,
        scheduleCount: scheduleState.scheduleCount ?? 0,
        timezone: scheduleState.timezone || 'Asia/Shanghai',
      },
      media: {
        mediaCount: media?.details?.mediaCount ?? 0,
        media: media?.details?.media || [],
        sync: mediaSync,
      },
      recentErrors: scheduleState.recentErrors || [],
      serviceError,
      isHealthy: apiUp && serviceUp,
    })
  } catch (error) {
    return remoteError('health failed', error)
  }
}

export async function syncJukeboxSchedule(event: H3Event) {
  const access = await requirePermission(event, JUKEBOX_PERMISSIONS.schedule)
  if (access.error) return access.error

  try {
    const sync = await syncMusicPlan()
    const pull = await fetchPlayer('/api/schedule/status')
    return apiSuccess({ sync, pull: pull.details })
  } catch (error) {
    return remoteError('schedule sync failed', error)
  }
}

export async function jukeboxPlayer(event: H3Event) {
  const access = await requirePermission(event, JUKEBOX_PERMISSIONS.list)
  if (access.error) return access.error

  try {
    const result = await fetchPlayer('/api/player')
    return apiSuccess(result.details)
  } catch (error) {
    return remoteError('player state failed', error)
  }
}

export async function jukeboxPlayerCommand(event: H3Event) {
  const access = await requirePermission(event, JUKEBOX_PERMISSIONS.play)
  if (access.error) return access.error

  const body = await readBody<Record<string, any>>(event)
  const action = String(body?.action || '').trim()
  const commands: Record<string, { path: string; body?: any }> = {
    next: { path: '/api/player/next', body: undefined },
    pause: { path: '/pause', body: undefined },
    resume: { path: '/resume', body: undefined },
    stop: { path: '/api/player/stop', body: undefined },
    play: { path: '/api/player/play', body },
    volume: { path: '/api/player/volume', body: { volume: Number(body?.volume) } },
  }
  const command = commands[action]
  if (!command) return apiError('播放器操作不符合规范', 400)
  if (action === 'volume' && (!Number.isFinite(command.body.volume) || command.body.volume < 0 || command.body.volume > 100)) {
    return apiError('音量必须在 0 到 100 之间', 400)
  }

  try {
    const result = action === 'stop'
      ? await fetchFirstPlayer(['/api/player/stop', '/api/player/play'], {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ queue: [] }),
      })
      : await fetchPlayer(command.path, {
      method: 'POST',
      ...(command.body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(command.body) }),
      })
    return apiSuccess(result.details)
  } catch (error) {
    return remoteError(`player command ${action} failed`, error)
  }
}

export async function jukeboxQueue(event: H3Event) {
  const access = await requirePermission(event, JUKEBOX_PERMISSIONS.list)
  if (access.error) return access.error

  try {
    const result = await fetchFirstPlayer(['/api/queue', '/api/songs', '/api/requests'])
    return apiSuccess(result.details)
  } catch (error) {
    return remoteError('queue read failed', error)
  }
}

export async function addJukeboxQueue(event: H3Event) {
  const access = await requirePermission(event, JUKEBOX_PERMISSIONS.play)
  if (access.error) return access.error
  const body = await readBody<Record<string, any>>(event)

  try {
    const result = await fetchFirstPlayer(['/api/queue', '/api/songs', '/api/request', '/api/requests'], {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return apiSuccess(result.details)
  } catch (error) {
    return remoteError('queue write failed', error)
  }
}

export async function deleteJukeboxQueue(event: H3Event) {
  const access = await requirePermission(event, JUKEBOX_PERMISSIONS.play)
  if (access.error) return access.error
  const id = String(getRouterParam(event, 'id') || '').trim()
  if (!/^\d+$/.test(id)) return apiError('队列歌曲ID不符合规范', 400)

  try {
    const result = await fetchPlayer(`/api/queue/${id}`, { method: 'DELETE' })
    return apiSuccess(result.details)
  } catch (error) {
    return remoteError('queue delete failed', error)
  }
}
