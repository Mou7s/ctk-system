export function createSampleTestApi(request) {
  return {
    listSampleTest(query) {
      return request({ url: '/tk_custom/sample_test/list', method: 'get', params: query })
    },
    getSampleTest(id) {
      return request({ url: `/tk_custom/sample_test/${id}`, method: 'get' })
    },
    getSampleTestOptions() {
      return request({ url: '/tk_custom/sample_test/options', method: 'get' })
    },
    getSampleTestSummary(query) {
      return request({ url: '/tk_custom/sample_test/summary', method: 'get', params: query })
    },
    addSampleTest(data) {
      return request({ url: '/tk_custom/sample_test', method: 'post', data })
    },
    updateSampleTest(data) {
      return request({ url: '/tk_custom/sample_test', method: 'put', data })
    },
    deleteSampleTest(ids) {
      return request({ url: `/tk_custom/sample_test/${Array.isArray(ids) ? ids.join(',') : ids}`, method: 'delete' })
    },
    signSampleTest(data) {
      return request({ url: '/tk_custom/sample_test/sign', method: 'post', data })
    },
  }
}
