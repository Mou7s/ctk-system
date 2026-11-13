export function createQaShippingApi(request) {
  return {
    getShippingReport(month) {
      return request({
          url: '/tk_custom/qaShipping/report',
          method: 'get',
          params: { month }
        })
    },
  };
}
