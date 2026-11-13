export function createExceptionApi(request) {
  return {
    listException(query) {
      return request({ url: '/tk_custom/exception/list', method: 'get', params: query });
    },
    getException(id) {
      return request({ url: '/tk_custom/exception/' + id, method: 'get' });
    },
    addException(data) {
      return request({ url: '/tk_custom/exception', method: 'post', data });
    },
    updateException(data) {
      return request({ url: '/tk_custom/exception', method: 'put', data });
    },
    delException(id) {
      return request({ url: '/tk_custom/exception/' + id, method: 'delete' });
    },
    restoreException(id) {
      return request({ url: '/tk_custom/exception/restore/' + id, method: 'put' });
    },
    getGXJHData(billno) {
      return request({ url: '/kingdee/gxjh/' + billno, method: 'get' });
    },
  };
}