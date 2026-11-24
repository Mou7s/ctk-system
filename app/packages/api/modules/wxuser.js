export function createWxuserApi(request) {
  return {
    listWxuser(query) {
      return request({
          url: '/tk_custom/wxuser/list',
          method: 'get',
          params: query
        })
    },
    getWxuserEmploymentSummary(query) {
      return request({
          url: '/tk_custom/wxuser/employmentSummary',
          method: 'get',
          params: query
        })
    },
    updateWxuserEmploymentLeaveReason(data) {
      return request({
          url: '/tk_custom/wxuser/employmentSummary/reason',
          method: 'put',
          data: data
        })
    },
    getWxuser(userid) {
      return request({
          url: '/tk_custom/wxuser/' + userid,
          method: 'get'
        })
    },
    addWxuser(data) {
      return request({
          url: '/tk_custom/wxuser',
          method: 'post',
          data: data
        })
    },
    updateWxuser(data) {
      return request({
          url: '/tk_custom/wxuser',
          method: 'put',
          data: data
        })
    },
    delWxuser(userid) {
      return request({
          url: '/tk_custom/wxuser/' + userid,
          method: 'delete'
        })
    },
  };
}
