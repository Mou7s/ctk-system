export function createLuckyPkApi(request) {
  return {
    joinRoom(data) {
      return request({
          url: '/tk_custom/lucky/public/pk/join',
          method: 'post',
          data: data
        })
    },
    incrementCount(data) {
      return request({
          url: '/tk_custom/lucky/public/pk/increment',
          method: 'post',
          data: data
        })
    },
    getRoomStatus(activityId) {
      return request({
          url: '/tk_custom/lucky/public/pk/status',
          method: 'get',
          params: { activityId },
          headers: { silentError: true }
        })
    },
    controlRoom(data) {
      return request({
          url: '/tk_custom/lucky/public/pk/control',
          method: 'post',
          data: data
        })
    },
  };
}
