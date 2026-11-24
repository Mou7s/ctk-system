export function createSalesPriceTrendApi(request) {
  return {
    searchSalesPriceTrendOptions(params) {
      return request({
        url: '/tk_custom/salesPriceTrend/options',
        method: 'get',
        params,
        timeout: 30 * 1000,
      })
    },
    getSalesPriceTrend(params) {
      return request({
        url: '/tk_custom/salesPriceTrend/trend',
        method: 'get',
        params,
        timeout: 120 * 1000,
      })
    },
  }
}
