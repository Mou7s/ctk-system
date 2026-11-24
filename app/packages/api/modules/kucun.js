export function createKucunApi(request) {
  return {
    listKucun(query) {
      return request({
        url: "/tk_custom/kucun/list",
        method: "get",
        params: query,
      });
    },
    listKucun_sum(query) {
      return request({
        url: "/tk_custom/kucun/list_sum",
        method: "get",
        params: query,
      });
    },
    list_sum_total(query) {
      return request({
        url: "/tk_custom/kucun/list_sum_total",
        method: "get",
        params: query,
      });
    },
    getLastSyncTime() {
      return request({
        url: "/tk_custom/kucun/lastSyncTime",
        method: "get",
      });
    },
    getKucun(id) {
      return request({
        url: "/tk_custom/kucun/" + id,
        method: "get",
      });
    },
    addKucun(data) {
      return request({
        url: "/tk_custom/kucun",
        method: "post",
        data: data,
      });
    },
    updateKucun(data) {
      return request({
        url: "/tk_custom/kucun",
        method: "put",
        data: data,
      });
    },
    delKucun(id) {
      return request({
        url: "/tk_custom/kucun/" + id,
        method: "delete",
      });
    },
    listWarnings() {
      return request({
        url: "/tk_custom/kucun/warnings",
        method: "get",
      });
    },
    syncWarnings() {
      return request({
        url: "/tk_custom/kucun/warnings/sync",
        method: "post",
        timeout: 300000,
      });
    },
    getWarningSyncTime() {
      return request({
        url: "/tk_custom/kucun/warnings/syncTime",
        method: "get",
      });
    },
    updateWarningSafeStock(data) {
      return request({
        url: "/tk_custom/kucun/warnings/safeStock",
        method: "put",
        data,
        timeout: 120000,
      });
    },
    removeWarning(data) {
      return request({
        url: "/tk_custom/kucun/warnings/remove",
        method: "delete",
        data,
        timeout: 120000,
      });
    },
    exportWarnings() {
      return request({
        url: "/tk_custom/kucun/warnings/export",
        method: "post",
        responseType: "blob",
        timeout: 120000,
      });
    },
    sendWarningMsg(data) {
      return request({
        url: "/tk_custom/kucun/sendWarningMsg",
        method: "post",
        data: data,
      });
    },
    getWecomUsers() {
      return request({
        url: "/tk_custom/kucun/wecomUsers",
        method: "get",
      });
    },
    getWarningJob() {
      return request({
        url: "/tk_custom/kucun/warningJob",
        method: "get",
      });
    },
    saveWarningJob(data) {
      return request({
        url: "/tk_custom/kucun/warningJob",
        method: "post",
        data: data,
      });
    },
    enableWarning(data) {
      return request({
        url: "/tk_custom/kucun/warnings/enable",
        method: "post",
        data,
        timeout: 120000,
      });
    },
    batchWarning(data) {
      return request({
        url: "/tk_custom/kucun/warnings/batch",
        method: "put",
        data,
        timeout: 300000,
      });
    },
    searchWarningMaterials(query) {
      return request({
        url: "/tk_custom/kucun/warnings/materials",
        method: "get",
        params: query,
      });
    },
  };
}
