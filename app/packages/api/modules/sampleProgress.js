export function createSampleProgressApi(request) {
  return {
    listSampleProgress(query) {
      return request({ url: '/tk_custom/sample_progress/list', method: 'get', params: query })
    },
    getSampleProgressOptions() {
      return request({ url: '/tk_custom/sample_progress/options', method: 'get' })
    },
    getSampleProgress(id) {
      return request({ url: `/tk_custom/sample_progress/${id}`, method: 'get' })
    },
    addSampleProgress(data) {
      return request({ url: '/tk_custom/sample_progress', method: 'post', data })
    },
    updateSampleProgress(data) {
      return request({ url: '/tk_custom/sample_progress', method: 'put', data })
    },
    deleteSampleProgress(ids) {
      return request({ url: `/tk_custom/sample_progress/${Array.isArray(ids) ? ids.join(',') : ids}`, method: 'delete' })
    },
    importSampleProgress(file) {
      const formData = new FormData()
      formData.append('file', file)
      return request({ url: '/tk_custom/sample_progress/import', method: 'post', body: formData })
    },
    getSampleProgressSummary(query) {
      return request({ url: '/tk_custom/sample_progress/summary', method: 'get', params: query })
    },
  }
}
