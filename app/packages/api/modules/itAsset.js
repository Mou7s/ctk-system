export function createItAssetApi(request) {
  return {
    listItAssets(query) {
      return request({ url: '/tk_custom/itAsset/list', method: 'get', params: query })
    },
    getItAsset(id) {
      return request({ url: `/tk_custom/itAsset/${id}`, method: 'get' })
    },
    getItAssetSummary() {
      return request({ url: '/tk_custom/itAsset/summary', method: 'get' })
    },
    getItAssetOptions() {
      return request({ url: '/tk_custom/itAsset/options', method: 'get' })
    },
    addItAsset(data) {
      return request({ url: '/tk_custom/itAsset', method: 'post', data })
    },
    updateItAsset(data) {
      return request({ url: '/tk_custom/itAsset', method: 'put', data })
    },
    deleteItAssets(ids) {
      return request({
        url: `/tk_custom/itAsset/${Array.isArray(ids) ? ids.join(',') : ids}`,
        method: 'delete',
      })
    },
    markItAssetsPrinted(ids) {
      return request({
        url: '/tk_custom/itAsset/print-log',
        method: 'post',
        data: { ids: Array.isArray(ids) ? ids : [ids] },
      })
    },
    importItAssets(file, options = {}) {
      const body = new FormData()
      body.append('file', file)
      if (options.mode) body.append('mode', String(options.mode))
      return request.upload('/tk_custom/itAsset/import', body, options.config)
    },
    exportItAssets(data = {}) {
      return request({
        url: '/tk_custom/itAsset/export',
        method: 'post',
        data,
        responseType: 'blob',
        timeout: 120000,
      })
    },
    downloadItAssetTemplate() {
      return request({
        url: '/tk_custom/itAsset/template',
        method: 'post',
        responseType: 'blob',
        timeout: 60000,
      })
    },
    previewItAssetLvDunSync() {
      return request({
        url: '/tk_custom/itAsset/lvdun-sync/preview',
        method: 'post',
        timeout: 35000,
      })
    },
    applyItAssetLvDunSync(data = {}) {
      return request({
        url: '/tk_custom/itAsset/lvdun-sync/apply',
        method: 'post',
        data,
        timeout: 30000,
      })
    },
  }
}
