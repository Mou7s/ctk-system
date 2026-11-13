export function createWxApproveApi(request) {
  return {
    updateOutTime(spNo) {
      return request({
              url: '/tk_custom/WXApprove/updateOutTime/' + spNo,
              method: 'get'
          })
    },
    updateOutTime1(params) {
      return request({
              url: '/tk_custom/WXApprove/updateOutTime1',
              method: 'post',
              data:params
          })
    },
    updateBackTime(spNo) {
      return request({
              url: '/tk_custom/WXApprove/updateBackTime/' + spNo,
              method: 'get'
          })
    },
    listWXApprove(query) {
      return request({
          url: '/tk_custom/WXApprove/list',
          method: 'get',
          params: query
        })
    },
    queryBA() {
      return request({
              url: '/tk_custom/WXApprove/queryBA',
              method: 'get'
          })
    },
    getCardNumber() {
      return request({
              url: '/tk_custom/WXApprove/getCardNumber',
              method: 'get'
          })
    },
    listWXApproveForOut(query) {
      return request({
              url: '/tk_custom/WXApprove/listForOut',
              method: 'get',
              params: query
          })
    },
    listWXApproveForBack(query) {
      return request({
              url: '/tk_custom/WXApprove/listForBack',
              method: 'get',
              params: query
          })
    },
    listWXApproveForOut1(query) {
      return request({
              url: '/tk_custom/WXApprove/listForOut1',
              method: 'get',
              params: query
          })
    },
    listWXApproveForBack1(query) {
      return request({
              url: '/tk_custom/WXApprove/listForBack1',
              method: 'get',
              params: query
          })
    },
    getWXApprove(spNo) {
      return request({
          url: '/tk_custom/WXApprove/' + spNo,
          method: 'get'
        })
    },
    addWXApprove(data) {
      return request({
          url: '/tk_custom/WXApprove',
          method: 'post',
          data: data
        })
    },
    updateWXApprove(data) {
      return request({
          url: '/tk_custom/WXApprove',
          method: 'put',
          data: data
        })
    },
    delWXApprove(spNo) {
      return request({
          url: '/tk_custom/WXApprove/' + spNo,
          method: 'delete'
        })
    },
  };
}
