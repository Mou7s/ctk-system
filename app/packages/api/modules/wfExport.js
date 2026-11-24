export function createWfExportApi(request) {
  return {
    previewWfExport(billNos) {
      return request({
          url: "/kingdee/exportWFData/preview",
          method: "post",
          data: { billNos }
        });
    },
  };
}
