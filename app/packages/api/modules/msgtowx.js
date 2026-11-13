export function createMsgtowxApi(request) {
  return {
    listMsgtowx(query) {
      return request({
          url: '/tk_custom/msgtowx/list',
          method: 'get',
          params: query
        })
    },
    getMsgtowx(id) {
      return request({
          url: '/tk_custom/msgtowx/' + id,
          method: 'get'
        })
    },
    addMsgtowx(data) {
      return request({
          url: '/tk_custom/msgtowx',
          method: 'post',
          data: data
        })
    },
    updateMsgtowx(data) {
      return request({
          url: '/tk_custom/msgtowx',
          method: 'put',
          data: data
        })
    },
    delMsgtowx(id) {
      return request({
          url: '/tk_custom/msgtowx/' + id,
          method: 'delete'
        })
    },
  };
}
