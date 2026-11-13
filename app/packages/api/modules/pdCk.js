export function createPdCkApi(request) {
  return {
    listPd_ck(query) {
      return request({
          url: '/tk_custom/pd_ck/list',
          method: 'get',
          params: query
        })
    },
    getPd_ck(id) {
      return request({
          url: '/tk_custom/pd_ck/' + id,
          method: 'get'
        })
    },
    addPd_ck(data) {
      return request({
          url: '/tk_custom/pd_ck',
          method: 'post',
          data: data
        })
    },
    updatePd_ck(data) {
      return request({
          url: '/tk_custom/pd_ck',
          method: 'put',
          data: data
        })
    },
    delPd_ck(id) {
      return request({
          url: '/tk_custom/pd_ck/' + id,
          method: 'delete'
        })
    },
  };
}
