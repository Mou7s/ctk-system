export function createLuckyDrawApi(request) {
  return {
    listActivity(query) {
      return request({
          url: '/tk_custom/lucky/admin/activity/list',
          method: 'get',
          params: query
        })
    },
    getActivity(id) {
      return request({
          url: '/tk_custom/lucky/admin/activity/' + id,
          method: 'get'
        })
    },
    addActivity(data) {
      return request({
          url: '/tk_custom/lucky/admin/activity',
          method: 'post',
          data: data
        })
    },
    updateActivity(data) {
      return request({
          url: '/tk_custom/lucky/admin/activity',
          method: 'put',
          data: data
        })
    },
    delActivity(id) {
      return request({
          url: '/tk_custom/lucky/admin/activity/' + id,
          method: 'delete'
        })
    },
    listPrize(query) {
      return request({
          url: '/tk_custom/lucky/admin/prize/list',
          method: 'get',
          params: query
        })
    },
    getPrize(id) {
      return request({
          url: '/tk_custom/lucky/admin/prize/' + id,
          method: 'get'
        })
    },
    addPrize(data) {
      return request({
          url: '/tk_custom/lucky/admin/prize',
          method: 'post',
          data: data
        })
    },
    updatePrize(data) {
      return request({
          url: '/tk_custom/lucky/admin/prize',
          method: 'put',
          data: data
        })
    },
    delPrize(id) {
      return request({
          url: '/tk_custom/lucky/admin/prize/' + id,
          method: 'delete'
        })
    },
    listRecord(query) {
      return request({
          url: '/tk_custom/lucky/admin/record/list',
          method: 'get',
          params: query
        })
    },
    redeemPrize(data) {
      return request({
          url: '/tk_custom/lucky/admin/record/redeem',
          method: 'post',
          data: data
        })
    },
    getScreenConfig(activityId) {
      return request({
          url: '/tk_custom/lucky/public/screenConfig',
          method: 'get',
          params: { activityId },
          headers: { silentError: true }
        })
    },
    getPublicActivityDetail(activityId) {
      return request({
          url: '/tk_custom/lucky/public/activity/' + activityId,
          method: 'get'
        })
    },
    publicMyPrizes(activityId, phone) {
      return request({
          url: '/tk_custom/lucky/public/myPrizes',
          method: 'get',
          params: {
            activityId,
            phone
          }
        })
    },
    publicRecentWinners(activityId) {
      return request({
          url: '/tk_custom/lucky/public/recentWinners',
          method: 'get',
          params: {
            activityId
          }
        })
    },
    resetPrizeQty(activityId) {
      return request({
          url: '/tk_custom/lucky/admin/prize/resetQty/' + activityId,
          method: 'post'
        })
    },
  };
}
