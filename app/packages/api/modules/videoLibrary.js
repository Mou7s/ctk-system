export function createVideoLibraryApi(request) {
  return {
    listVideoLibrary(query) {
      return request({
        url: '/tk_custom/videoLibrary/list',
        method: 'get',
        params: query,
      })
    },
    getVideoLibrary(id) {
      return request({
        url: '/tk_custom/videoLibrary/' + id,
        method: 'get',
      })
    },
    uploadVideoLibrary(data, options = {}) {
      if (typeof request.upload === 'function') {
        return request.upload('/tk_custom/videoLibrary/upload', data, options)
      }
      return request({
        url: '/tk_custom/videoLibrary/upload',
        method: 'post',
        data,
        timeout: 10 * 60 * 1000,
      })
    },
    updateVideoLibrary(data) {
      return request({
        url: '/tk_custom/videoLibrary',
        method: 'put',
        data,
      })
    },
    deleteVideoLibrary(id) {
      return request({
        url: '/tk_custom/videoLibrary/' + id,
        method: 'delete',
      })
    },
    getVideoPlayToken(id) {
      return request({
        url: '/tk_custom/videoLibrary/' + id + '/play-token',
        method: 'get',
      })
    },
  }
}
