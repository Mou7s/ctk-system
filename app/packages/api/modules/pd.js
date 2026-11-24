export function createPdApi(request) {
  return {
    listPd(query) {
      return request({
          url: "/tk_custom/pd/list",
          method: "get",
          params: query,
        });
    },
    getPd(id) {
      return request({
          url: "/tk_custom/pd/" + id,
          method: "get",
        });
    },
    getPdFromKingdee(id) {
      return request({
          url: "/tk_custom/pd/kingdee/" + id,
          method: "get",
        });
    },
    addPd(data) {
      return request({
          url: "/tk_custom/pd",
          method: "post",
          data: data,
        });
    },
    updatePd(data) {
      return request({
          url: "/tk_custom/pd",
          method: "put",
          data: data,
        });
    },
    delPd(id) {
      return request({
          url: "/tk_custom/pd/" + id,
          method: "delete",
        });
    },
  };
}
