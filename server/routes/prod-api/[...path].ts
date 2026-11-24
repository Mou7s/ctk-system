import { getRouterParam } from 'h3'
import { apiError } from '../../utils/response'
import { listMusicTracks } from '../../utils/music-read'
import { createMusicWriteHandler } from '../../utils/music-write'
import { createMusicTrackImportHandler } from '../../utils/music-media'

const musicTrackHandlers = {
  GET: listMusicTracks,
  POST: createMusicWriteHandler('track-add'),
  PUT: createMusicWriteHandler('track-order'),
  DELETE: createMusicWriteHandler('track-clear'),
}

function resolveMusicTrackHandler(event: any, path: string) {
  const segments = path.split('/').filter(Boolean)
  if (segments[0] !== 'tk_custom' || segments[1] !== 'music' || segments[2] !== 'album') return null
  if (!/^\d+$/.test(segments[3] || '') || segments[4] !== 'tracks') return null

  const suffix = segments.slice(5)
  const method = String(event.method || 'GET').toUpperCase()
  const params = { ...(event.context.params || {}), albumId: segments[3] }

  if (suffix.length === 0) {
    event.context.params = params
    return musicTrackHandlers[method as keyof typeof musicTrackHandlers] || null
  }

  if (method === 'POST' && suffix.length === 1 && suffix[0] === 'import') {
    event.context.params = params
    return createMusicTrackImportHandler()
  }

  if (method === 'POST' && suffix.length === 1 && suffix[0] === 'batch') {
    event.context.params = params
    return createMusicWriteHandler('track-batch')
  }
  if (method === 'DELETE' && suffix.length === 1 && suffix[0] === 'group') {
    event.context.params = params
    return createMusicWriteHandler('track-group-delete')
  }
  if (method === 'DELETE' && suffix.length === 1 && suffix[0] === 'unplayable') {
    event.context.params = params
    return createMusicWriteHandler('track-cleanup-unplayable')
  }
  if (method === 'PUT' && suffix.length === 1 && /^\d+$/.test(suffix[0])) {
    event.context.params = { ...params, trackId: suffix[0] }
    return createMusicWriteHandler('track-edit')
  }
  if (method === 'DELETE' && suffix.length === 1 && /^\d+$/.test(suffix[0])) {
    event.context.params = { ...params, trackId: suffix[0] }
    return createMusicWriteHandler('track-delete')
  }
  if (method === 'PUT' && suffix.length === 1 && suffix[0] === 'order') {
    event.context.params = params
    return musicTrackHandlers.PUT
  }
  return null
}

export default defineEventHandler(async (event) => {
  const path = getRouterParam(event, 'path') || ''
  const musicHandler = resolveMusicTrackHandler(event, path)
  if (musicHandler) return musicHandler(event)
  return apiError(`Nitro 尚未登记接口：/${path}`, 404)
})
