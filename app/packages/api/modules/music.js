export function createMusicApi(request) {
  return {
    listAlbum(query) {
      return request({ url: '/tk_custom/music/album/list', method: 'get', params: query })
    },
    getAlbum(albumId) {
      return request({ url: '/tk_custom/music/album/' + albumId, method: 'get' })
    },
    addAlbum(data) {
      return request({ url: '/tk_custom/music/album', method: 'post', data })
    },
    updateAlbum(data) {
      return request({ url: '/tk_custom/music/album', method: 'put', data })
    },
    delAlbum(albumIds) {
      return request({ url: '/tk_custom/music/album/' + albumIds, method: 'delete' })
    },
    listTracks(albumId) {
      return request({ url: '/tk_custom/music/album/' + albumId + '/tracks', method: 'get' })
    },
    importTrackFile(albumId, file, metadata = {}, config = {}) {
      const body = new FormData()
      body.append('file', file)
      if (metadata.title) body.append('title', metadata.title)
      if (metadata.artist) body.append('artist', metadata.artist)
      return request.upload('/tk_custom/music/album/' + albumId + '/tracks/import', body, config)
    },
    addTrack(albumId, data) {
      return request({ url: '/tk_custom/music/album/' + albumId + '/tracks', method: 'post', data })
    },
    batchAddTracks(albumId, data) {
      return request({ url: '/tk_custom/music/album/' + albumId + '/tracks/batch', method: 'post', data })
    },
    reorderTracks(albumId, data) {
      return request({ url: '/tk_custom/music/album/' + albumId + '/tracks/order', method: 'put', data })
    },
    delTrack(albumId, trackId) {
      return request({ url: '/tk_custom/music/album/' + albumId + '/tracks/' + trackId, method: 'delete' })
    },
    delTrackGroup(albumId, channel) {
      return request({
        url: '/tk_custom/music/album/' + albumId + '/tracks/group',
        method: 'delete',
        params: { channel },
        timeout: 20000,
      })
    },
    clearTracks(albumId) {
      return request({ url: '/tk_custom/music/album/' + albumId + '/tracks', method: 'delete' })
    },
    listSchedule(query) {
      return request({ url: '/tk_custom/music/schedule/list', method: 'get', params: query })
    },
    getSchedule(scheduleId) {
      return request({ url: '/tk_custom/music/schedule/' + scheduleId, method: 'get' })
    },
    addSchedule(data) {
      return request({ url: '/tk_custom/music/schedule', method: 'post', data })
    },
    updateSchedule(data) {
      return request({ url: '/tk_custom/music/schedule', method: 'put', data })
    },
    delSchedule(scheduleIds) {
      return request({ url: '/tk_custom/music/schedule/' + scheduleIds, method: 'delete' })
    },
    toggleSchedule(scheduleId, enabled) {
      return request({ url: '/tk_custom/music/schedule/' + scheduleId + '/toggle', method: 'put', data: { enabled } })
    },
  };
}
