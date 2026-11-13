export function createTalentApiApi(request) {
  return {
    getListApi(query) {
      return request({
          url: "/tk_custom/talent/getTalentList",
          method: "get",
          params: query,
        });
    },
    getTalentInfoApi(id) {
      return request({
          url: "/tk_custom/talent/getTalentInfo",
          method: "get",
          params: { id },
        });
    },
    addTalentInfoApi(data) {
      return request({
          url: "/tk_custom/talent/addTalentInfo",
          method: "post",
          data,
        });
    },
    editTalentInfoApi(data) {
      return request({
          url: "/tk_custom/talent/editTalentInfo",
          method: "post",
          data
        });
    },
    delByIdsApi(ids) {
      return request({
          url: "/tk_custom/talent/delTalentByIds",
          method: "delete",
          data: ids,
        });
    },
    delByIdApi(id) {
      return request({
          url: `/tk_custom/talent/delTalentById/${id}`,
          method: "delete",
        });
    },
    // 已废弃：服务端 talentPic 已禁用（“正在迁移”），实际上传走 /common/upload（见 ImageUpload 组件），此处保留仅防旧调用报错
    uploadFileApi(data) {
      return request({
          url: "/tk_custom/talent/talentPic",
          method: "post",
          data,
        });
    },
  };
}
