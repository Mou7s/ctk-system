export function createLocalStockApi(request) {
  return {
    /** @deprecated 现统一使用金蝶 K3Cloud 即时库存接口 */
    listLocalStock(query) {
      return request({
        url: '/tk_custom/localStock/list',
        method: 'get',
        params: query,
      })
    },
    /** @deprecated 现统一使用金蝶 K3Cloud 即时库存接口 */
    getLocalStockSummary() {
      return request({
        url: '/tk_custom/localStock/summary',
        method: 'get',
      })
    },
    /** @deprecated 现统一使用金蝶 K3Cloud 即时库存接口 */
    listLocalStockTxn(query) {
      return request({
        url: '/tk_custom/localStock/txn/list',
        method: 'get',
        params: query,
      })
    },
    /** @deprecated 现统一使用金蝶 K3Cloud 即时库存接口 */
    inboundLocalStock(data) {
      return request({
        url: '/tk_custom/localStock/inbound',
        method: 'post',
        data,
      })
    },
    getStagingReceipt(billNo) {
      return request({
        url: `/tk_custom/localStock/staging/receipt/${encodeURIComponent(billNo)}`,
        method: 'get',
      })
    },
    getStagingByPlan(planNo) {
      return request({
        url: `/tk_custom/localStock/staging/plan/${encodeURIComponent(planNo)}`,
        method: 'get',
      })
    },
    getStagingByLegacyMaterial(materialCode) {
      return request({
        url: `/tk_custom/localStock/staging/material/${encodeURIComponent(materialCode)}`,
        method: 'get',
        headers: { silentError: 'true' },
      })
    },
    getMaterialInventory(materialCode) {
      return request({
        url: `/tk_custom/localStock/staging/inventory/${encodeURIComponent(materialCode)}`,
        method: 'get',
        headers: { silentError: 'true' },
        timeout: 120 * 1000,
      })
    },
    transferStagingStock(data) {
      return request({
        url: '/tk_custom/localStock/staging/transfer',
        method: 'post',
        data,
        headers: { silentError: 'true' },
        timeout: 120 * 1000,
      })
    },
    suggestLocalStockLocation(params) {
      return request({
        url: '/tk_custom/localStock/suggest',
        method: 'get',
        params,
        headers: { silentError: 'true' },
      })
    },
  }
}
