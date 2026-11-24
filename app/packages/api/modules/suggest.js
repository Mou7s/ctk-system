export function createSuggestApi(request) {
  return {
    listSuggest(query) {
      return request({
          url: '/tk_custom/suggest/list',
          method: 'get',
          params: query
        })
    },
    getSuggest(id) {
      return request({
          url: '/tk_custom/suggest/' + id,
          method: 'get'
        })
    },
    addSuggest(data) {
      return request({
          url: '/tk_custom/suggest',
          method: 'post',
          data: data
        })
    },
    updateSuggest(data) {
      return request({
          url: '/tk_custom/suggest',
          method: 'put',
          data: data
        })
    },
    delSuggest(id) {
      return request({
          url: '/tk_custom/suggest/' + id,
          method: 'delete'
        })
    },
  };
}
