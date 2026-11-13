export function createProductionOrderApi(request) {
  return {
    listProductionOrders(params) {
      return request({
        url: '/tk_custom/productionOrder/list',
        method: 'get',
        params,
        timeout: 60 * 1000
      })
    },
    summarizeProductionOrders(params) {
      return request({
        url: '/tk_custom/productionOrder/summary',
        method: 'get',
        params,
        timeout: 120 * 1000
      })
    }
  }
}
