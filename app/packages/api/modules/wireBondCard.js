export function createWireBondCardApi(request) {
  return {
    listWireBondUsers(query) {
      return request({
        url: '/tk_custom/wire-bond-card/users',
        method: 'get',
        params: query,
      })
    },
    generatePasswords(data) {
      return request({
        url: '/tk_custom/wire-bond-card/passwords/generate',
        method: 'post',
        data,
      })
    },
    updatePassword(data) {
      return request({
        url: '/tk_custom/wire-bond-card/passwords/update',
        method: 'put',
        data,
      })
    },
  }
}
