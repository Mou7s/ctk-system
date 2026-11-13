export function createCustomerCardApi(request) {
  const call = (action, method, data) => request({ url: `/tk_custom/customerCard/${action}`, method, ...(method === 'get' ? { params: data } : { data }), timeout: action === 'ocr' ? 60000 : 20000 });
  return {
    listCustomerCards: params => call('list', 'get', params),
    getCustomerCard: id => call('detail', 'get', { id }),
    getCustomerCardPhoto: id => request({ url: '/tk_custom/customerCard/photo', method: 'get', params: { id }, responseType: 'blob' }),
    checkCustomerCard: data => call('check', 'post', data),
    createCustomerCard: data => call('create', 'post', data),
    removeCustomerCard: id => call('remove', 'post', { id }),
    reviewCustomerCard: data => call('review', 'post', data),
    addCustomerFollowup: data => call('followup', 'post', data),
    recognizeCustomerCard: data => call('ocr', 'post', data),
  };
}
