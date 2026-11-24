export function createQuotationApi(request) {
  return {
    remindQuotation(id) {
      return request({ url: `/tk_custom/quotation/${id}/remind`, method: 'post' })
    },
    checkQuotationPrices(data, businessType = 'FOREIGN') {
      return request({ url: businessType === 'DOMESTIC' ? '/tk_custom/quotation/domestic/price-check' : '/tk_custom/quotation/price-check', method: 'post', data })
    },
    checkQuotationEndUserConflict(params) {
      return request({ url: '/tk_custom/quotation/end-user-conflict', method: 'get', params })
    },
    listQuotations(query) {
      return request({
        url: '/tk_custom/quotation/list',
        method: 'get',
        params: query,
      })
    },
    getQuotation(id) {
      return request({
        url: '/tk_custom/quotation/' + id,
        method: 'get',
      })
    },
    searchQuotationOptions(params) {
      return request({
        url: '/tk_custom/quotation/options',
        method: 'get',
        params,
        timeout: 30 * 1000,
      })
    },
    getQuotationHistoryPrices(params) {
      return request({
        url: '/tk_custom/quotation/history-prices',
        method: 'get',
        params,
      })
    },
    createQuotation(data) {
      return request({
        url: '/tk_custom/quotation',
        method: 'post',
        data,
      })
    },
    updateQuotation(id, data) {
      return request({
        url: '/tk_custom/quotation/' + id,
        method: 'put',
        data,
      })
    },
    submitQuotation(id) {
      return request({
        url: '/tk_custom/quotation/' + id + '/submit',
        method: 'post',
      })
    },
    withdrawQuotation(id) {
      return request({
        url: '/tk_custom/quotation/' + id + '/withdraw',
        method: 'post',
      })
    },
    deleteQuotation(id) {
      return request({
        url: '/tk_custom/quotation/' + id,
        method: 'delete',
      })
    },
    uploadQuotation(data, options = {}) {
      if (typeof request.upload === 'function') {
        return request.upload('/tk_custom/quotation/upload', data, options)
      }
      return request({
        url: '/tk_custom/quotation/upload',
        method: 'post',
        data,
      })
    },
    reviewQuotation(data) {
      return request({
        url: '/tk_custom/quotation/review',
        method: 'post',
        data,
      })
    },
    getQuotationAnalysis(query) {
      return request({
        url: '/tk_custom/quotation/analysis',
        method: 'get',
        params: query,
      })
    },
    getQuotationDownloadUrl(id) {
      return '/prod-api/tk_custom/quotation/download?id=' + encodeURIComponent(id)
    },
    getQuotationAnalysisExportUrl(query = {}) {
      const params = new URLSearchParams(query)
      return '/prod-api/tk_custom/quotation/analysis-export?' + params.toString()
    },
  }
}
