export function createExceptionStatsApi(request) {
  return {
    getExceptionStats() {
      return request({
          url: '/tk_custom/exception/stats',
          method: 'get'
        })
    },
    getExceptionDashboard(days = 30) {
      return request({
        url: '/tk_custom/exception/dashboard',
        method: 'get',
        params: { days },
      })
    },
  };
}
