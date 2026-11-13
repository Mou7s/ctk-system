<!--
  Converted: el-descriptions → div grid layout
-->
<template>
    <div style="font-size: 30px;
    background: cornflowerblue;
    display: flex
;
    align-items: center;
    justify-content: center;
    color: white;">审批详情
    </div>
    <div class="app-container absolute inset-0 overflow-y-auto">
        <div class="listmain">
            <div class="desc-grid">
                <div class="desc-row">
                    <span class="desc-label">申请人:</span>
                    <span class="desc-value">{{approveDetail["applyerUserid"]}}</span>
                </div>
                <div class="desc-row">
                    <span class="desc-label">携带人:</span>
                    <span class="desc-value">{{approveDetail["携带人"]}}</span>
                </div>
                <div class="desc-row">
                    <span class="desc-label">审核人:</span>
                    <span class="desc-value">{{approveDetail["auditerid"]}}</span>
                </div>
                <div class="desc-row">
                    <span class="desc-label">放行保安:</span>
                    <span class="desc-value">{{approveDetail["baoan"]}}</span>
                </div>
                <div class="desc-row">
                    <span class="desc-label">申请时间:</span>
                    <span class="desc-value">{{approveDetail["放行时间"]}}</span>
                </div>
                <div class="desc-row">
                    <span class="desc-label">外出时间:</span>
                    <span class="desc-value">{{approveDetail["outtime"]}}</span>
                </div>
                <div class="desc-row">
                    <span class="desc-label">返厂时间:</span>
                    <span class="desc-value">{{approveDetail["backtime"]}}</span>
                </div>
                <div class="desc-row">
                    <span class="desc-label">所属部门:</span>
                    <span class="desc-value">{{approveDetail["所属部门"]}}</span>
                </div>
                <div class="desc-row">
                    <span class="desc-label">补充说明:</span>
                    <span class="desc-value">{{approveDetail["补充说明"]}}</span>
                </div>
                <div class="desc-row">
                    <span class="desc-label">携带物品:</span>
                    <span class="desc-value">{{approveDetail["携带物品"]}}</span>
                </div>
                <div class="desc-row">
                    <span class="desc-label">车牌号:</span>
                    <span class="desc-value">{{approveDetail["carNumber"]}}</span>
                </div>
            </div>
        </div>
        <div v-for="(item, index) in imgList" :key="item">
            <img
                    class="w-[350px] max-w-full cursor-zoom-in rounded-lg object-contain shadow-sm"
                    :src="item"
                    alt="审批附件"
                    @click="showLightbox(index)">

        </div>
        <ClientOnly>
            <VueEasyLightbox
                    :visible="lightboxVisible"
                    :imgs="imgList"
                    :index="lightboxIndex"
                    @hide="lightboxVisible = false" />
        </ClientOnly>
    </div>
</template>

<script setup name="WXApprove">

    const { proxy } = getCurrentInstance();

    const approveDetail = ref({});
    const imgList = ref([]);
    const lightboxVisible = ref(false);
    const lightboxIndex = ref(0);

    function showLightbox(index = 0) {
        if (!imgList.value.length) return;
        lightboxIndex.value = Math.min(index, imgList.value.length - 1);
        lightboxVisible.value = true;
    }

    function getQueryVariable(variable) {
        var query = window.location.search.substring(1);
        var vars = query.split("&");
        for (var i = 0; i < vars.length; i++) {
            var pair = vars[i].split("=");
            if (pair[0] == variable) { return pair[1]; }
        }
        return (false);
    }

    function getList() {
        getWXApprove(getQueryVariable("spno")).then(response => {
            if (response && response.code == '200' && response.data) {
                var detail = response.data;
                var content = detail.applyDataContents;
                if (content) {
                    var obj = JSON.parse(content);
                    approveDetail.value = obj;
                    approveDetail.value.outtime = detail.outtime;
                    approveDetail.value.backtime = detail.backtime;
                    approveDetail.value.applyerUserid = detail.applyerUserid;
                    approveDetail.value.auditerid = detail.auditerid;
                    if (obj.filepaths && obj.filepaths.length > 0) {
                        var list1 = obj.filepaths.split(",");
                        for (var i = 0; i < list1.length; i++) {
                            imgList.value.push("/prod-api/profile/wx_pic/" + list1[i] + ".png");
                        }
                    }
                }
            }
        });
    }

    getList();
</script>

<style scoped>
    .content { border: 5px solid darkseagreen; margin: 5px; border-radius: 10px; height: 90vh; overflow: auto; padding: 5px; }
    .title { display: flex; align-items: center; justify-content: center; font-size: 30px; background: cornflowerblue; color: white; height: 60px; }
    .app-container { display: flex; flex-direction: column; align-items: stretch; justify-content: flex-start; }
    .app-container div { flex: 1; margin-top: 3px; }
    .listmain { position: relative; padding: 5px; display: flex; flex-direction: column; justify-content: center; font-size: 24px; font-weight: bold; }
    .listmain div { margin-top: 3px; }
    .desc-grid {
        display: flex;
        flex-direction: column;
        gap: 6px;
        border: 1px solid #ddd;
        border-radius: 4px;
        padding: 8px;
    }
    .desc-row {
        display: flex;
        border-bottom: 1px solid #eee;
        padding-bottom: 4px;
        margin-bottom: 2px;
    }
    .desc-row:last-child {
        border-bottom: none;
        margin-bottom: 0;
        padding-bottom: 0;
    }
    .desc-label {
        width: 120px;
        font-weight: bold;
        font-size: 20px;
        flex-shrink: 0;
    }
    .desc-value {
        flex: 1;
        font-size: 20px;
        font-weight: bold;
    }
</style>
