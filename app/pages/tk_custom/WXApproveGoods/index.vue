<template>
  <div class="app-container p-6 pb-4 space-y-6 bg-gray-50 dark:bg-gray-900 absolute inset-0 overflow-y-auto flex flex-col lg:flex-row gap-6">
    
    <!-- 左侧：待放行列表 -->
    <div class="flex-1 flex flex-col min-h-0 space-y-4">
      <!-- 列表头部 -->
      <div class="flex items-center justify-between bg-gradient-to-r from-blue-500/10 to-indigo-500/5 text-blue-600 dark:text-blue-400 border-l-4 border-blue-500 px-4 py-3 rounded-xl font-semibold shadow-sm">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-inbox" class="size-5" />
          <span class="text-base font-semibold">待放行列表 (物品)</span>
        </div>
        <UBadge color="primary" variant="subtle" size="sm">{{ WXApproveListForOut.length }}</UBadge>
      </div>

      <!-- 列表内容区 -->
      <div class="flex-1 space-y-4">
        <!-- 无数据占位 -->
        <div v-if="WXApproveListForOut.length === 0" class="flex flex-col items-center justify-center p-12 border border-dashed border-gray-200 dark:border-gray-800 rounded-2xl bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-550">
          <UIcon name="i-lucide-file-text" class="size-12 mb-3 opacity-60" />
          <span class="text-sm">暂无待放行物品单据</span>
        </div>

        <!-- 物品单卡片 -->
        <UCard
          v-else
          v-for="(o, index) in WXApproveListForOut"
          :key="o.spno"
          class="border border-gray-100 dark:border-gray-800/60 rounded-2xl bg-white dark:bg-gray-800 shadow-sm transition-all duration-300 hover:shadow-md"
        >
          <div class="flex flex-col sm:flex-row gap-5">
            <!-- 图片区域 -->
            <div class="w-full sm:w-[200px] flex-shrink-0 flex flex-col items-center">
              <div v-if="o.filepaths && !o.imageError" class="relative group rounded-xl overflow-hidden shadow-inner border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 w-full aspect-video sm:aspect-square flex items-center justify-center">
                <img
                  :src="o.filepaths"
                  class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 cursor-pointer"
                  @error="o.imageError = true"
                  @click="previewImages(o.imgList)"
                />
                <div class="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1 backdrop-blur-sm">
                  <UIcon name="i-lucide-image" class="size-3.5" />
                  <span>{{ o.imgList.length }} 张照片</span>
                </div>
              </div>
              <div v-else class="w-full aspect-video sm:aspect-square rounded-xl border border-dashed border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40 flex flex-col items-center justify-center text-gray-450 dark:text-gray-500 p-4">
                <UIcon name="i-lucide-ban" class="size-8 mb-2 opacity-50" />
                <span class="text-xs font-semibold">无放行照片</span>
                <span v-if="o.imageError" class="text-[10px] text-gray-400 mt-1">(本地无此图片资源)</span>
              </div>
            </div>

            <!-- 字段列表区 -->
            <div class="flex-1 flex flex-col justify-between">
              <div class="grid grid-cols-1 gap-2.5 text-sm">
                <div class="flex items-start border-b border-gray-50 dark:border-gray-800/40 pb-2">
                  <span class="w-[85px] font-semibold text-gray-400 dark:text-gray-550 flex-shrink-0">放行时间：</span>
                  <span class="font-mono text-gray-700 dark:text-gray-300 font-semibold">{{ o["放行时间"] }}</span>
                </div>
                <div class="flex items-start border-b border-gray-50 dark:border-gray-800/40 pb-2">
                  <span class="w-[85px] font-semibold text-gray-400 dark:text-gray-550 flex-shrink-0">所属部门：</span>
                  <span class="text-gray-800 dark:text-gray-200">{{ o["所属部门"] }}</span>
                </div>
                <div class="flex items-start border-b border-gray-50 dark:border-gray-800/40 pb-2">
                  <span class="w-[85px] font-semibold text-gray-400 dark:text-gray-550 flex-shrink-0">携带物品：</span>
                  <span class="text-gray-900 dark:text-white font-bold">{{ o["携带物品"] }}</span>
                </div>
                <div class="flex items-start border-b border-gray-50 dark:border-gray-800/40 pb-2">
                  <span class="w-[85px] font-semibold text-gray-400 dark:text-gray-550 flex-shrink-0">携带人：</span>
                  <span class="text-gray-800 dark:text-gray-200 font-semibold">{{ o["携带人"] }}</span>
                </div>
                <div class="flex items-start border-b border-gray-50 dark:border-gray-800/40 pb-2">
                  <span class="w-[85px] font-semibold text-gray-400 dark:text-gray-550 flex-shrink-0">审核人：</span>
                  <span class="text-gray-700 dark:text-gray-300 font-mono">{{ o["autiduser"] }}</span>
                </div>
                <div class="flex items-start">
                  <span class="w-[85px] font-semibold text-gray-400 dark:text-gray-550 flex-shrink-0">补充说明：</span>
                  <span class="text-gray-600 dark:text-gray-400">{{ o["补充说明"] || '无' }}</span>
                </div>
              </div>

              <!-- 放行按钮 -->
              <div class="flex justify-end mt-4">
                <UButton
                  color="primary"
                  icon="i-lucide-check"
                  class="px-5 shadow-sm transition-all hover:scale-[1.02] active:scale-95"
                  @click="fangxing(o.spno)"
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
          <UIcon name="i-lucide-refresh-cw" class="size-5 animate-spin duration-3000" />
          <span class="text-base font-semibold">待确认返厂列表 (物品)</span>
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

        <!-- 物品单卡片 -->
        <UCard
          v-else
          v-for="(o, index) in WXApproveListForBack"
          :key="o.spno"
          class="border border-gray-100 dark:border-gray-800/60 rounded-2xl bg-white dark:bg-gray-800 shadow-sm transition-all duration-300 hover:shadow-md"
        >
          <div class="flex flex-col sm:flex-row gap-5">
            <!-- 图片区域 -->
            <div class="w-full sm:w-[200px] flex-shrink-0 flex flex-col items-center">
              <div v-if="o.filepaths && !o.imageError" class="relative group rounded-xl overflow-hidden shadow-inner border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 w-full aspect-video sm:aspect-square flex items-center justify-center">
                <img
                  :src="o.filepaths"
                  class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 cursor-pointer"
                  @error="o.imageError = true"
                  @click="previewImages(o.imgList)"
                />
                <div class="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1 backdrop-blur-sm">
                  <UIcon name="i-lucide-image" class="size-3.5" />
                  <span>{{ o.imgList.length }} 张照片</span>
                </div>
              </div>
              <div v-else class="w-full aspect-video sm:aspect-square rounded-xl border border-dashed border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40 flex flex-col items-center justify-center text-gray-450 dark:text-gray-500 p-4">
                <UIcon name="i-lucide-ban" class="size-8 mb-2 opacity-50" />
                <span class="text-xs font-semibold">无放行照片</span>
                <span v-if="o.imageError" class="text-[10px] text-gray-400 mt-1">(本地无此图片资源)</span>
              </div>
            </div>

            <!-- 字段列表区 -->
            <div class="flex-1 flex flex-col justify-between">
              <div class="grid grid-cols-1 gap-2.5 text-sm">
                <div class="flex items-start border-b border-gray-50 dark:border-gray-800/40 pb-2">
                  <span class="w-[85px] font-semibold text-gray-400 dark:text-gray-550 flex-shrink-0">放行时间：</span>
                  <span class="font-mono text-gray-700 dark:text-gray-300 font-semibold">{{ o["放行时间"] }}</span>
                </div>
                <div class="flex items-start border-b border-gray-50 dark:border-gray-800/40 pb-2">
                  <span class="w-[85px] font-semibold text-gray-400 dark:text-gray-550 flex-shrink-0">所属部门：</span>
                  <span class="text-gray-800 dark:text-gray-200">{{ o["所属部门"] }}</span>
                </div>
                <div class="flex items-start border-b border-gray-50 dark:border-gray-800/40 pb-2">
                  <span class="w-[85px] font-semibold text-gray-400 dark:text-gray-550 flex-shrink-0">携带物品：</span>
                  <span class="text-gray-900 dark:text-white font-bold">{{ o["携带物品"] }}</span>
                </div>
                <div class="flex items-start border-b border-gray-50 dark:border-gray-800/40 pb-2">
                  <span class="w-[85px] font-semibold text-gray-400 dark:text-gray-550 flex-shrink-0">携带人：</span>
                  <span class="text-gray-800 dark:text-gray-200 font-semibold">{{ o["携带人"] }}</span>
                </div>
                <div class="flex items-start border-b border-gray-50 dark:border-gray-800/40 pb-2">
                  <span class="w-[85px] font-semibold text-gray-400 dark:text-gray-550 flex-shrink-0">审核人：</span>
                  <span class="text-gray-700 dark:text-gray-300 font-mono">{{ o["autiduser"] }}</span>
                </div>
                <div class="flex items-start">
                  <span class="w-[85px] font-semibold text-gray-400 dark:text-gray-550 flex-shrink-0">补充说明：</span>
                  <span class="text-gray-600 dark:text-gray-400">{{ o["补充说明"] || '无' }}</span>
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

    <ClientOnly>
      <VueEasyLightbox
        :visible="lightboxVisible"
        :imgs="lightboxImgs"
        :index="lightboxIndex"
        @hide="lightboxVisible = false"
      />
    </ClientOnly>

    <!-- 保安出厂确认对话框 -->
    <UModal v-model:open="dialogVisible" title="出厂确认">
      <template #body>
        <div class="p-5 flex flex-col gap-2">
          <UFormField label="选择当前值班放行保安" name="baoan" required class="text-sm font-semibold">
            <USelectMenu
              v-model="form.baoan"
              placeholder="点击选择放行保安..."
              :items="selectOptions"
              value-attribute="value"
              option-attribute="label"
              class="w-full"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex items-center justify-end gap-2 w-full">
          <UButton color="neutral" variant="outline" @click="dialogVisible = false">取消</UButton>
          <UButton color="primary" @click="outFactory">确认放行出厂</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup name="WXApprove">

const toast = useToast();
const { proxy } = getCurrentInstance();

const autoRefresh = ref(true);
const dialogVisible = ref(false);
const WXApproveListForOut = ref([]);
const WXApproveListForOutImg = ref([]);
const WXApproveListForBack = ref([]);
const WXApproveListForBackImg = ref([]);

const lightboxVisible = ref(false);
const lightboxImgs = ref([]);
const lightboxIndex = ref(0);

const form = reactive({
  baoan: "",
  spno: "",
});

const queryParams = reactive({
  pageNum: 1,
  pageSize: 100,
  spName: null,
  spStatus: null,
  templateId: null,
  applyTime: null,
  applyerUserid: null,
  applyerPartyid: null,
  applyDataContents: null,
  filePath: null,
  fileType: null,
});

// 提取数据库中真实的放行保安值班名字
const selectOptions = [
  { label: "刘锡华", value: "刘锡华" },
  { label: "聂明辉", value: "聂明辉" },
  { label: "李梦杰", value: "李梦杰" },
  { label: "谢士武", value: "谢士武" },
  { label: "王子保", value: "王子保" },
  { label: "徐代忆", value: "徐代忆" },
  { label: "张小亮", value: "张小亮" },
  { label: "杨道仪", value: "杨道仪" },
  { label: "保安1", value: "保安1" },
  { label: "保安2", value: "保安2" },
  { label: "保安3", value: "保安3" }
];

function previewImages(imgList, index = 0) {
  if (!imgList || imgList.length === 0) return;
  lightboxImgs.value = imgList.filter(Boolean);
  lightboxIndex.value = Math.min(index, lightboxImgs.value.length - 1);
  lightboxVisible.value = true;
}

function fangxing(spno) {
  form.spno = spno;
  dialogVisible.value = true;
}

function getList() {
  if (!autoRefresh.value) return;
  listWXApproveForBack(queryParams).then((response) => {
    WXApproveListForBack.value = [];
    WXApproveListForBackImg.value = [];
    var list = response.rows;
    var returnArr = [];
    for (var i = 0; i < list.length; i++) {
      var json = JSON.parse(list[i].applyDataContents);
      json.spno = list[i].spNo;
      json.applyuser = list[i].applyerUserid;
      json.autiduser = list[i].auditerid;
      var listImg = [];
      if (json.filepaths.length > 0) {
        var arr = json.filepaths.split(",");
        for (var j = 0; j < arr.length; j++) {
          listImg.push("/prod-api/profile/wx_pic/" + arr[j] + ".png");
        }
        json.filepaths = listImg[0].replace("/wx_pic/", "/pic_zip/");
      }
      json.imgList = listImg;
      returnArr.push(json);
    }
    WXApproveListForBack.value = returnArr;
  });
  listWXApproveForOut(queryParams).then((response) => {
    WXApproveListForOut.value = [];
    WXApproveListForOutImg.value = [];
    var list = response.rows;
    var returnArr = [];
    for (var i = 0; i < list.length; i++) {
      var json = JSON.parse(list[i].applyDataContents);
      json.spno = list[i].spNo;
      json.autiduser = list[i].auditerid;
      var listImg = [];
      if (json.filepaths.length > 0) {
        var arr = json.filepaths.split(",");
        for (var j = 0; j < arr.length; j++) {
          listImg.push("/prod-api/profile/wx_pic/" + arr[j] + ".png");
        }
        json.filepaths = listImg[0].replace("/wx_pic/", "/pic_zip/");
      }
      json.imgList = listImg;
      returnArr.push(json);
    }
    WXApproveListForOut.value = returnArr;
  });
}

function backFactory(spno) {
  autoRefresh.value = false;
  useModalConfirm()
    .confirm("是否确认返厂？", "警告", {
      confirmButtonText: "确认",
      cancelButtonText: "取消",
      showclose: true,
      type: "warning",
    })
    .then(function () {
      updateBackTime(spno).then((response) => {
        autoRefresh.value = true;
        if (response.code != 200) {
          toast.add({ title: "更新失败！", color: "error" });
        } else {
          toast.add({ title: "更新成功", color: "success" });
          getList();
        }
      });
    })
    .catch(function () {
      autoRefresh.value = true;
    });
}

function outFactory() {
  autoRefresh.value = false;
  updateOutTime1(form).then((response) => {
    autoRefresh.value = true;
    if (response.code != 200) {
      toast.add({ title: "更新失败！", color: "error" });
    } else {
      toast.add({ title: "更新成功", color: "success" });
      dialogVisible.value = false;
      getList();
    }
  });
}

getList();
var h = setInterval(function () {
  getList();
}, 1000 * 60);
</script>

<style scoped>
.app-container {
  min-height: 100%;
}
</style>
