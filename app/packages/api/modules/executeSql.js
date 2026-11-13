function normalizeLegacyExecuteSqlResponse(response, operation) {
  if (response === 1) {
    return {
      code: 200,
      msg: `${operation}成功（旧 Java 接口）`,
      data: { operation, status: 'success', legacyFallback: true },
    }
  }
  return response
}

function post(request, config, operation) {
  return request(config).then((response) => normalizeLegacyExecuteSqlResponse(response, operation))
}

export function createExecuteSqlApi(request) {
  return {
    updateTimeOfGXLL(data) {
      return post(request, {
              url: '/kingdee/updateTimeOfGXLL',
              method: 'post',
              data: data
          }, '更新未领料信息')
    },
    handleCBData(data) {
      return post(request, {
              url: '/kingdee/handleCBData',
              method: 'post',
              data: data
          }, '优化成本数据')
    },
    writeToMO(data) {
      return post(request, {
              url: '/kingdee/writeToMO',
              method: 'post',
              data: data
          }, '更新工序计划单号')
    },
    buildIndexOfKingdee(data) {
      return post(request, {
              url: '/kingdee/buildIndexOfKingdee',
              method: 'post',
              data: data
          }, '重建索引')
    },
    deletePZ(data) {
      return post(request, {
              url: '/kingdee/deletePZ',
              method: 'post',
              data: data
          }, '反审并删除期末成本调整')
    },
  };
}
