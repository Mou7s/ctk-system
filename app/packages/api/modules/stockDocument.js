export function createStockDocumentApi(request) {
  return {
    listKingdeeWarehouses() {
      return request({
        url: '/tk_custom/stockDocument/warehouses',
        method: 'get',
        timeout: 120 * 1000
      })
    },
    listKingdeeLocations(params) {
      return request({
        url: '/tk_custom/stockDocument/locations',
        method: 'get',
        ...(params && Object.keys(params).length ? { params } : {}),
        timeout: 120 * 1000
      })
    },
    listKingdeeInventory(params) {
      return request({
        url: '/tk_custom/stockDocument/inventory',
        method: 'get',
        params,
        timeout: 120 * 1000
      })
    },
    listSalesOutbound(params) {
      return request({
        url: '/tk_custom/stockDocument/salesOutbound',
        method: 'get',
        params,
        timeout: 120 * 1000
      })
    },
    getSalesOutboundPicking(billNo) {
      return request({
        url: `/tk_custom/stockDocument/salesOutbound/picking/${encodeURIComponent(billNo)}`,
        method: 'get',
        timeout: 120 * 1000
      })
    },
    listProductionReceipt(params) {
      return request({
        url: '/tk_custom/stockDocument/productionReceipt',
        method: 'get',
        params,
        timeout: 120 * 1000
      })
    },
    exportProductionReceiptMatrix(params) {
      return request({
        url: '/tk_custom/stockDocument/exportProductionReceiptMatrix',
        method: 'get',
        params,
        responseType: 'blob',
        timeout: 180 * 1000
      })
    },
    exportSalesOutboundMatrix(params) {
      return request({
        url: '/tk_custom/stockDocument/exportSalesOutboundMatrix',
        method: 'get',
        params,
        responseType: 'blob',
        timeout: 180 * 1000
      })
    },
    completeSalesOutbound(data) {
      return request({
        url: '/tk_custom/stockDocument/salesOutbound/complete',
        method: 'post',
        data,
        timeout: 120 * 1000
      })
    },
    listPurchaseOrder(params) {
      return request({
        url: '/tk_custom/stockDocument/purchaseOrder',
        method: 'get',
        params,
        timeout: 120 * 1000
      })
    },
    listPurchaseInbound(params) {
      return request({
        url: '/tk_custom/stockDocument/purchaseInbound',
        method: 'get',
        params,
        timeout: 120 * 1000
      })
    },
    completePurchaseInbound(data) {
      return request({
        url: '/tk_custom/stockDocument/purchaseOrder/inbound',
        method: 'post',
        data,
        timeout: 120 * 1000
      })
    }
  }
}
