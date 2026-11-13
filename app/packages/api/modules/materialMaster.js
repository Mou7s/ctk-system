export function createMaterialMasterApi(request) {
  return {
    getMaterialOptions(query) {
      return request({ url: '/tk_custom/material/options', method: 'get', params: query })
    },
  }
}
