export function createDummyPieceApi(request) {
  return {
    listDummyPieceMonthly(query) {
      return request({ url: '/tk_custom/dummyPiece/monthly/list', method: 'get', params: query });
    },
    getDummyPieceMonthly(id) {
      return request({ url: '/tk_custom/dummyPiece/monthly/' + id, method: 'get' });
    },
    addDummyPieceMonthly(data) {
      return request({ url: '/tk_custom/dummyPiece/monthly', method: 'post', data });
    },
    batchSaveDummyPieceMonthly(data) {
      return request({ url: '/tk_custom/dummyPiece/monthly/batch', method: 'post', data });
    },
    updateDummyPieceMonthly(data) {
      return request({ url: '/tk_custom/dummyPiece/monthly', method: 'put', data });
    },
    delDummyPieceMonthly(ids) {
      return request({ url: '/tk_custom/dummyPiece/monthly/' + ids, method: 'delete' });
    },
    listDummyPieceWeight(query) {
      return request({ url: '/tk_custom/dummyPiece/weight/list', method: 'get', params: query });
    },
    updateDummyPieceWeight(data) {
      return request({ url: '/tk_custom/dummyPiece/weight/update', method: 'put', data });
    },
  };
}