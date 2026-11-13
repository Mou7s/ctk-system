export function createDomesticQuotationApi(request) {
  const baseUrl = '/tk_custom/quotation/domestic'
  return {
    remindDomesticQuotation(id) {
      return request({ url: `${baseUrl}/${id}/remind`, method: 'post' })
    },
    getDomesticQuotationMonthlyReport() {
      return request({ url: `${baseUrl}/monthly-report`, method: 'get' })
    },
    getDomesticQuotationMonthlyExportUrl() {
      return `/prod-api${baseUrl}/monthly-report-export`
    },
    listDomesticQuotations(query) {
      return request({ url: `${baseUrl}/list`, method: 'get', params: query })
    },
    getDomesticQuotationAnalysis(query) {
      return request({ url: `${baseUrl}/analysis`, method: 'get', params: query })
    },
    getDomesticQuotationAnalysisExportUrl(query = {}) {
      const params = new URLSearchParams(query)
      return `/prod-api${baseUrl}/analysis-export?${params.toString()}`
    },
    getDomesticQuotation(id) {
      return request({ url: `${baseUrl}/${id}`, method: 'get' })
    },
    createDomesticQuotation(data) {
      return request({ url: baseUrl, method: 'post', data })
    },
    updateDomesticQuotationDraft(id, data) {
      return request({ url: `${baseUrl}/${id}`, method: 'put', data })
    },
    uploadDomesticQuotation(data, options = {}) {
      if (typeof request.upload === 'function') return request.upload(`${baseUrl}/upload`, data, options)
      return request({ url: `${baseUrl}/upload`, method: 'post', data })
    },
    reviewDomesticQuotation(data) {
      return request({ url: `${baseUrl}/review`, method: 'post', data })
    },
    submitDomesticQuotation(id) {
      return request({ url: `${baseUrl}/${id}/submit`, method: 'post' })
    },
    withdrawDomesticQuotation(id) {
      return request({ url: `${baseUrl}/${id}/withdraw`, method: 'post' })
    },
    deleteDomesticQuotation(id) {
      return request({ url: `${baseUrl}/${id}`, method: 'delete' })
    },
    getDomesticQuotationTemplateUrl() {
      return `/prod-api${baseUrl}/template`
    },
    getDomesticQuotationDownloadUrl(id) {
      return `/prod-api${baseUrl}/download?id=${encodeURIComponent(id)}`
    },
  }
}
