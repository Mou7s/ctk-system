export function createPicApi(request) {
  return {
    listPic(query) {
      return request({
          url: '/tk_custom/pic/list',
          method: 'get',
          params: query
        })
    },
    getHandlerList(query) {
      return request({
              url: '/tk_custom/pic/getHandlerList',
              method: 'get',
              params: query
          })
    },
    getMechineList(query) {
      return request({
              url: '/tk_custom/pic/getMechineList',
              method: 'get',
              params: query
          })
    },
    delPicFile(data) {
      return request({
              url: '/tk_custom/pic/deldkPic',
              method: 'post',
              data: data
          })
    },
    getFlowBillInfo(flowno) {
      return request({
              url: '/tk_custom/pic/getFlowBillInfo/' + flowno,
              method: 'get'
          })
    },
    uploadImages(data) {
      return request({
              url: '/tk_custom/pic/dkPic',
              method: 'post',
              data: data,
              timeout: 90 * 1000
          })
    },
    getPic(id) {
      return request({
          url: '/tk_custom/pic/' + id,
          method: 'get'
        })
    },
    addPic(data) {
      return request({
          url: '/tk_custom/pic',
          method: 'post',
          data: data
        })
    },
    updatePic(data) {
      return request({
          url: '/tk_custom/pic',
          method: 'put',
          data: data
        })
    },
    delPic(id) {
      return request({
          url: '/tk_custom/pic/' + id,
          method: 'delete'
        })
    },
  };
}
