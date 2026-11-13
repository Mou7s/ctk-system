export function createDeliveryAlertApi(request) {
  const get = (action, params = {}, extra = {}) => request({ url: `/tk_custom/deliveryAlert/${action}`, method: 'get', params, timeout: 120000, ...extra })
  return {
    listDeliveryAlerts: params => get('list', params),
    previewDeliveryAlerts: () => get('preview'),
    exportDeliveryAlerts: params => get('export', params, { responseType: 'blob' }),
    getDeliveryAlertSettings: () => get('settings'),
    getDeliveryAlertLogs: () => get('logs'),
    saveDeliveryAlertSettings: data => request({ url: '/tk_custom/deliveryAlert/settings', method: 'post', data }),
  }
}
