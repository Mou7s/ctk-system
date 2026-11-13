<template>
  <div class="app-container p-6 pb-4 space-y-6 bg-gray-50 dark:bg-gray-900 absolute inset-0 overflow-y-auto flex flex-col lg:flex-row gap-6">
    
    <!-- 左侧：待放行列表 -->
    <div class="flex-1 flex flex-col min-h-0 space-y-4">
      <!-- 列表头部 -->
      <div class="flex items-center justify-between bg-gradient-to-r from-blue-500/10 to-indigo-500/5 text-blue-600 dark:text-blue-400 border-l-4 border-blue-500 px-4 py-3 rounded-xl font-semibold shadow-sm">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-users" class="size-5" />
          <span class="text-base font-semibold">待放行列表 (人员)</span>
        </div>
        <UBadge color="primary" variant="subtle" size="sm">{{ WXApproveListForOut.length }}</UBadge>
      </div>

      <!-- 列表内容区 -->
      <div class="flex-1 space-y-4">
        <!-- 无数据占位 -->
        <div v-if="WXApproveListForOut.length === 0" class="flex flex-col items-center justify-center p-12 border border-dashed border-gray-200 dark:border-gray-800 rounded-2xl bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-550">
          <UIcon name="i-lucide-users" class="size-12 mb-3 opacity-60" />
          <span class="text-sm">暂无待人员放行单据</span>
        </div>

        <!-- 卡片 -->
        <UCard
          v-else
          v-for="(o, index) in WXApproveListForOut"
          :key="o.spno"
          class="border border-gray-100 dark:border-gray-800/60 rounded-2xl bg-white dark:bg-gray-800 shadow-sm transition-all duration-300 hover:shadow-md"
        >
          <div class="flex flex-col sm:flex-row gap-5">
            <!-- 左侧修饰区 -->
            <div class="w-full sm:w-[120px] flex-shrink-0 flex items-center justify-center bg-blue-50 dark:bg-blue-950/20 rounded-xl py-6 sm:py-0 border border-blue-100/50 dark:border-blue-900/30">
              <div class="text-center">
                <UIcon name="i-lucide-user" class="size-10 text-blue-500 mb-1 opacity-80" />
                <div class="text-xs font-semibold text-blue-600 dark:text-blue-400">人员离厂</div>
              </div>
            </div>

            <!-- 字段列表区 -->
            <div class="flex-1 flex flex-col justify-between">
              <div class="grid grid-cols-1 gap-2.5 text-sm">
                <div class="flex items-start border-b border-gray-50 dark:border-gray-800/40 pb-2">
                  <span class="w-[85px] font-semibold text-gray-400 dark:text-gray-550 flex-shrink-0">外出人：</span>
                  <span class="text-gray-900 dark:text-white font-bold text-base">{{ o["applyuser"] }}</span>
                </div>
                <div class="flex items-start border-b border-gray-50 dark:border-gray-800/40 pb-2">
                  <span class="w-[85px] font-semibold text-gray-400 dark:text-gray-550 flex-shrink-0">外出地点：</span>
                  <span class="text-gray-800 dark:text-gray-200 font-semibold">{{ o["外出地点"] }}</span>
                </div>
                <div class="flex items-start border-b border-gray-50 dark:border-gray-800/40 pb-2">
                  <span class="w-[85px] font-semibold text-gray-400 dark:text-gray-550 flex-shrink-0">开始时间：</span>
                  <span class="font-mono text-gray-700 dark:text-gray-300">{{ o["外出"]?.["starttime"] }}</span>
                </div>
                <div class="flex items-start border-b border-gray-50 dark:border-gray-800/40 pb-2">
                  <span class="w-[85px] font-semibold text-gray-400 dark:text-gray-550 flex-shrink-0">结束时间：</span>
                  <span class="font-mono text-gray-700 dark:text-gray-300">{{ o["外出"]?.["endtime"] }}</span>
                </div>
                <div class="flex items-start border-b border-gray-50 dark:border-gray-800/40 pb-2">
                  <span class="w-[85px] font-semibold text-gray-400 dark:text-gray-550 flex-shrink-0">外出时长：</span>
                  <span class="text-gray-800 dark:text-gray-200 font-mono font-semibold">{{ o["外出"]?.["time"] }}</span>
                </div>
                <div class="flex items-start">
                  <span class="w-[85px] font-semibold text-gray-400 dark:text-gray-550 flex-shrink-0">审核人：</span>
                  <span class="text-gray-700 dark:text-gray-300 font-mono">{{ o["autiduser"] }}</span>
                </div>
              </div>

              <!-- 放行按钮 -->
              <div class="flex justify-end mt-4">
                <UButton
                  color="primary"
                  icon="i-lucide-check"
                  class="px-5 shadow-sm transition-all hover:scale-[1.02] active:scale-95"
                  @click="outFactory(o.spno)"
                >确认放行</UButton>
              </div>
            </div>
          </div>
        </UCard>
      </div>
    </div>

    <!-- 右侧：待确认返厂列表 -->
    <div class="flex-1 flex flex-col min-h-0 space-y-4">
      <!-- 列表头部 -->
      <div class="flex items-center justify-between bg-gradient-to-r from-amber-500/10 to-orange-500/5 text-amber-600 dark:text-amber-400 border-l-4 border-amber-500 px-4 py-3 rounded-xl font-semibold shadow-sm">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-refresh-cw" class="size-5" />
          <span class="text-base font-semibold">待确认返厂列表 (人员)</span>
        </div>
        <UBadge color="warning" variant="subtle" size="sm">{{ WXApproveListForBack.length }}</UBadge>
      </div>

      <!-- 列表内容区 -->
      <div class="flex-1 space-y-4">
        <!-- 无数据占位 -->
        <div v-if="WXApproveListForBack.length === 0" class="flex flex-col items-center justify-center p-12 border border-dashed border-gray-200 dark:border-gray-800 rounded-2xl bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-550">
          <UIcon name="i-lucide-undo-2" class="size-12 mb-3 opacity-60" />
          <span class="text-sm">暂无待确认返厂单据</span>
        </div>

        <!-- 卡片 -->
        <UCard
          v-else
          v-for="(o, index) in WXApproveListForBack"
          :key="o.spno"
          class="border border-gray-100 dark:border-gray-800/60 rounded-2xl bg-white dark:bg-gray-800 shadow-sm transition-all duration-300 hover:shadow-md"
        >
          <div class="flex flex-col sm:flex-row gap-5">
            <!-- 左侧修饰区 -->
            <div class="w-full sm:w-[120px] flex-shrink-0 flex items-center justify-center bg-amber-50 dark:bg-amber-950/20 rounded-xl py-6 sm:py-0 border border-amber-100/50 dark:border-amber-900/30">
              <div class="text-center">
                <UIcon name="i-lucide-log-out" class="size-10 text-amber-500 mb-1 opacity-80" />
                <div class="text-xs font-semibold text-amber-600 dark:text-amber-400">待确认返厂</div>
              </div>
            </div>

            <!-- 字段列表区 -->
            <div class="flex-1 flex flex-col justify-between">
              <div class="grid grid-cols-1 gap-2.5 text-sm">
                <div class="flex items-start border-b border-gray-50 dark:border-gray-800/40 pb-2">
                  <span class="w-[85px] font-semibold text-gray-400 dark:text-gray-550 flex-shrink-0">外出人：</span>
                  <span class="text-gray-900 dark:text-white font-bold text-base">{{ o["applyuser"] }}</span>
                </div>
                <div class="flex items-start border-b border-gray-50 dark:border-gray-800/40 pb-2">
                  <span class="w-[85px] font-semibold text-gray-400 dark:text-gray-550 flex-shrink-0">外出地点：</span>
                  <span class="text-gray-800 dark:text-gray-200 font-semibold">{{ o["外出地点"] }}</span>
                </div>
                <div class="flex items-start border-b border-gray-50 dark:border-gray-800/40 pb-2">
                  <span class="w-[85px] font-semibold text-gray-400 dark:text-gray-550 flex-shrink-0">开始时间：</span>
                  <span class="font-mono text-gray-700 dark:text-gray-300">{{ o["外出"]?.["starttime"] }}</span>
                </div>
                <div class="flex items-start border-b border-gray-50 dark:border-gray-800/40 pb-2">
                  <span class="w-[85px] font-semibold text-gray-400 dark:text-gray-550 flex-shrink-0">结束时间：</span>
                  <span class="font-mono text-gray-700 dark:text-gray-300">{{ o["外出"]?.["endtime"] }}</span>
                </div>
                <div class="flex items-start border-b border-gray-50 dark:border-gray-800/40 pb-2">
                  <span class="w-[85px] font-semibold text-gray-400 dark:text-gray-550 flex-shrink-0">外出时长：</span>
                  <span class="text-gray-800 dark:text-gray-200 font-mono font-semibold">{{ o["外出"]?.["time"] }}</span>
                </div>
                <div class="flex items-start">
                  <span class="w-[85px] font-semibold text-gray-400 dark:text-gray-550 flex-shrink-0">审核人：</span>
                  <span class="text-gray-700 dark:text-gray-300 font-mono">{{ o["autiduser"] }}</span>
                </div>
              </div>

              <!-- 返厂按钮 -->
              <div class="flex justify-end mt-4">
                <UButton
                  color="warning"
                  icon="i-lucide-refresh-cw"
                  class="px-5 shadow-sm transition-all hover:scale-[1.02] active:scale-95"
                  @click="backFactory(o.spno)"
                >确认返厂</UButton>
              </div>
            </div>
          </div>
        </UCard>
      </div>
    </div>
  </div>
</template>

<script setup name="WXApprove">
const toast = useToast();

const { proxy } = getCurrentInstance();
const autoRefresh = ref(true);
const WXApproveListForOut = ref([]);
const WXApproveListForOutImg = ref([]);
const WXApproveListForBack = ref([]);
const WXApproveListForBackImg = ref([]);

const queryParams = reactive({
    pageNum: 1,
    pageSize: 100,
});

function getList() {
    if(!autoRefresh.value) return;
    listWXApproveForBack1(queryParams).then(response => {
        WXApproveListForBack.value = [];
        WXApproveListForBackImg.value = [];
        var list = response.rows;
        for(var i=0;i<list.length;i++){
            var json = JSON.parse(list[i].applyDataContents);
            json.spno = list[i].spNo;
            json.applyuser = list[i].applyerUserid;
            json.autiduser = list[i].auditerid;
            json["外出"] = JSON.parse(json["外出"]);
            var listImg = [];
            if(json.filepaths.length > 0){
                var arr = json.filepaths.split(",");
                for(var j=0;j<arr.length;j++){
                    listImg.push("/prod-api/profile/wx_pic/" + arr[j] + ".png");
                }
                json.filepaths = listImg[0].replace("/wx_pic/","/pic_zip/");
            }
            json.imgList = listImg;
            WXApproveListForBack.value.push(json);
        }
    });
    listWXApproveForOut1(queryParams).then(response => {
        WXApproveListForOut.value = [];
        WXApproveListForOutImg.value = [];
        var list = response.rows;
        for(var i=0;i<list.length;i++){
            var json = JSON.parse(list[i].applyDataContents);
            json.spno = list[i].spNo;
            json.applyuser = list[i].applyerUserid;
            json.autiduser = list[i].auditerid;
            json["外出"] = JSON.parse(json["外出"]);
            var listImg = [];
            if(json.filepaths.length > 0){
                var arr = json.filepaths.split(",");
                for(var j=0;j<arr.length;j++){
                    listImg.push("/prod-api/profile/wx_pic/" + arr[j] + ".png");
                }
                json.filepaths = listImg[0].replace("/wx_pic/","/pic_zip/");
            }
            json.imgList = listImg;
            WXApproveListForOut.value.push(json);
        }
    });
}

function backFactory(spno) {
    autoRefresh.value = false;
    useModalConfirm().confirm("是否确认返厂？","警告",{
        confirmButtonText:"确认",
        cancelButtonText:"取消",
        showclose:true,
        type:"warning"
    }).then(function () {
        updateBackTime(spno).then(response=>{
            autoRefresh.value = true;
            if(response.code!=200){
                toast.add({ title: "更新失败！", color: "error" });
            }else{
                toast.add({ title: "更新成功", color: "success" });
                getList();
            }
        });
    }).catch(function () {
        autoRefresh.value = true;
    });
}

function outFactory(spno) {
    autoRefresh.value = false;
    useModalConfirm().confirm("是否确认出厂？","警告",{
        confirmButtonText:"确认",
        cancelButtonText:"取消",
        showclose:true,
        type:"warning"
    }).then(function () {
        updateOutTime(spno).then(response=>{
            autoRefresh.value = true;
            if(response.code!=200){
                toast.add({ title: "更新失败！", color: "error" });
            }else{
                toast.add({ title: "更新成功", color: "success" });
                getList();
            }
        });
    }).catch(function () {
        autoRefresh.value = true;
    });
}

getList();
var h = setInterval(function () { getList(); }, 1000*3);
</script>

<style scoped>
.app-container {
  min-height: 100%;
}
</style>
