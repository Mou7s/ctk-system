export function createMoApi(request) {
  return {
    getData(data) {
      return request({
          url: "/kingdee/getMOData",
          method: "post",
          data: data,
        });
    },
  };
}
