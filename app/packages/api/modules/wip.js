export function createWipApi(request) {
  return {
    getWipList(params) {
      return request({
          url: '/tk_custom/wip/list',
          method: 'get',
          params,
          timeout: 1000 * 60
        })
    },
  };
}
