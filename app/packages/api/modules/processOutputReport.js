export function createProcessOutputReportApi(request) {
  return {
    getProcessOutputSummary(query) {
      return request({ url: '/tk_custom/processOutputReport/summary', method: 'get', params: query });
    },
    listProcessOutputTarget(query) {
      return request({ url: '/tk_custom/processOutputReport/target', method: 'get', params: query });
    },
    addProcessOutputTarget(data) {
      return request({ url: '/tk_custom/processOutputReport/target', method: 'post', data });
    },
    updateProcessOutputTarget(data) {
      return request({ url: '/tk_custom/processOutputReport/target', method: 'put', data });
    },
    delProcessOutputTarget(id) {
      return request({ url: `/tk_custom/processOutputReport/target/${id}`, method: 'delete' });
    },
    listProcessOutputStaff(query) {
      return request({ url: '/tk_custom/processOutputReport/staff', method: 'get', params: query });
    },
    addProcessOutputStaff(data) {
      return request({ url: '/tk_custom/processOutputReport/staff', method: 'post', data });
    },
    updateProcessOutputStaff(data) {
      return request({ url: '/tk_custom/processOutputReport/staff', method: 'put', data });
    },
  };
}
