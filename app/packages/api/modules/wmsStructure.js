export function createWmsStructureApi(request) {
  return {
    getWmsStructureOverview() {
      return request({
        url: '/tk_custom/wmsStructure/overview',
        method: 'get',
        headers: { silentError: 'true' },
      })
    },
    getWmsLocation(locationCode) {
      return request({
        url: `/tk_custom/wmsStructure/location/${encodeURIComponent(locationCode)}`,
        method: 'get',
      })
    },
    updateWmsLocationStatus(data) {
      return request({
        url: '/tk_custom/wmsStructure/location/status',
        method: 'put',
        data,
      })
    },
  }
}
