export function createCustomerOverdueArApi(request) {
  return {
    getOverdueAlertSettings() { return request({ url: '/tk_custom/customerOverdueAr/alertSettings', method: 'get' }) },
    saveOverdueAlertSettings(data) { return request({ url: '/tk_custom/customerOverdueAr/alertSettings', method: 'put', data }) },
    previewOverdueAlert() { return request({ url: '/tk_custom/customerOverdueAr/alertPreview', method: 'get' }) },
    getOverdueAlertLogs() { return request({ url: '/tk_custom/customerOverdueAr/alertLogs', method: 'get' }) },
    exportOverdueAlert(params) { return request({ url: '/tk_custom/customerOverdueAr/alertExport', method: 'get', params, responseType: 'blob' }) },
    listCustomerOverdueAr(params) {
      return request({
        url: '/tk_custom/customerOverdueAr/list',
        method: 'get',
        params,
        timeout: 120 * 1000,
      })
    },
    listCustomerOverdueArBills(params) {
      return request({
        url: '/tk_custom/customerOverdueAr/bills',
        method: 'get',
        params,
        timeout: 120 * 1000,
      })
    },
    saveCustomerOverdueArRemark(data) {
      return request({
        url: '/tk_custom/customerOverdueAr/remark',
        method: 'put',
        data,
        timeout: 30 * 1000,
      })
    },
    freezeCustomerOutStock(params) {
      return request({
        url: '/tk_custom/customerOverdueAr/freezeOutStock',
        method: 'post',
        params,
        timeout: 60 * 1000,
      })
    },
    unfreezeCustomerOutStock(params) {
      return request({
        url: '/tk_custom/customerOverdueAr/unfreezeOutStock',
        method: 'post',
        params,
        timeout: 60 * 1000,
      })
    },
  }
}
