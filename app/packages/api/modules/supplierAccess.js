export function createSupplierAccessApi(request) {
  return {
    listSupplierAccess(query) {
      return request({ url: '/tk_custom/supplier_access/list', method: 'get', params: query })
    },
    getSupplierAccess(id) {
      return request({ url: `/tk_custom/supplier_access/${id}`, method: 'get' })
    },
    getSupplierAccessOptions() {
      return request({ url: '/tk_custom/supplier_access/options', method: 'get' })
    },
    getSupplierAccessSummary(query) {
      return request({ url: '/tk_custom/supplier_access/summary', method: 'get', params: query })
    },
    addSupplierAccess(data) {
      return request({ url: '/tk_custom/supplier_access', method: 'post', data })
    },
    updateSupplierAccess(data) {
      return request({ url: '/tk_custom/supplier_access', method: 'put', data })
    },
    deleteSupplierAccess(ids) {
      return request({ url: `/tk_custom/supplier_access/${Array.isArray(ids) ? ids.join(',') : ids}`, method: 'delete' })
    },
    signSupplierAccess(data) {
      return request({ url: '/tk_custom/supplier_access/sign', method: 'post', data })
    },
    getAvlSuppliers() {
      return request({ url: '/tk_custom/supplier_access/avl', method: 'get' })
    },
  }
}
