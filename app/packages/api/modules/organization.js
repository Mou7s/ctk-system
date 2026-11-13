export function createOrganizationApi(request) {
  return {
    getOrganizationStructure() {
      return request({
        url: '/tk_custom/organization',
        method: 'get',
      })
    },
  }
}
