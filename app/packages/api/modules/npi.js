export function createNpiApi(request) {
  return {
    listNpi(query) {
      return request({ url: '/tk_custom/npi/list', method: 'get', params: query })
    },
    getNpi(id) {
      return request({ url: `/tk_custom/npi/${id}`, method: 'get' })
    },
    getNpiOptions() {
      return request({ url: '/tk_custom/npi/options', method: 'get' })
    },
    getNpiSummary(query) {
      return request({ url: '/tk_custom/npi/summary', method: 'get', params: query })
    },
    addNpi(data) {
      return request({ url: '/tk_custom/npi', method: 'post', data })
    },
    updateNpi(data) {
      return request({ url: '/tk_custom/npi', method: 'put', data })
    },
    deleteNpi(ids) {
      return request({ url: `/tk_custom/npi/${Array.isArray(ids) ? ids.join(',') : ids}`, method: 'delete' })
    },
    signNpi(data) {
      return request({ url: '/tk_custom/npi/sign', method: 'post', data })
    },
  }
}
