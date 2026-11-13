<template>
  <div class="upload-file">
    <!-- 原生 file input 配合 UButton 触发 -->
    <input
      type="file"
      ref="fileInputRef"
      multiple
      class="hidden"
      @change="handleFileChange"
    />
    
    <UButton
      color="primary"
      icon="i-lucide-cloud-upload"
      @click="triggerUpload"
    >
      选取文件
    </UButton>
    
    <!-- 上传提示 -->
    <div class="text-xs text-gray-500 mt-1 dark:text-gray-400" v-if="showTip">
      请上传
      <template v-if="fileSize"> 大小不超过 <span class="text-red-500 font-semibold">{{ fileSize }}MB</span> </template>
      <template v-if="fileType"> 格式为 <span class="text-red-500 font-semibold">{{ fileType.join("/") }}</span> </template>
      的文件
    </div>
    
    <!-- 文件列表 -->
    <div class="mt-2 space-y-1">
      <div
        v-for="(file, index) in fileList"
        :key="file.uid"
        class="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/60 text-sm animate-fade-in"
      >
        <ImagePreview v-if="isImage(file.url)" :src="file.url" :width="60" :height="60" class="shrink-0 mr-2" />
        <a
          v-else
          :href="file.url"
          target="_blank"
          class="flex items-center gap-1.5 text-primary-600 dark:text-primary-400 hover:underline truncate mr-2"
        >
          <UIcon name="i-lucide-file-text" class="size-4 shrink-0 text-gray-400" />
          <span class="truncate">{{ getFileName(file.name) }}</span>
        </a>
        <a
          v-if="isImage(file.url)"
          :href="file.url"
          target="_blank"
          class="flex-1 flex items-center gap-1.5 text-primary-600 dark:text-primary-400 hover:underline truncate mr-2 text-xs"
        >
          <span class="truncate">{{ getFileName(file.name) }}</span>
        </a>
        <UButton
          color="error"
          variant="ghost"
          size="xs"
          icon="i-lucide-trash-2"
          @click="handleDelete(index)"
        >
          删除
        </UButton>
      </div>
    </div>
  </div>
</template>

<script setup>
import request from "@/utils/request";
const toast = useToast();
const loadingModal = useTkLoading();

const props = defineProps({
  modelValue: [String, Object, Array],
  // 数量限制
  limit: {
    type: Number,
    default: 5,
  },
  // 大小限制(MB)
  fileSize: {
    type: Number,
    default: 5,
  },
  // 文件类型, 例如['png', 'jpg', 'jpeg']
  fileType: {
    type: Array,
    default: () => ["doc", "xls", "ppt", "txt", "pdf"],
  },
  // 是否显示提示
  isShowTip: {
    type: Boolean,
    default: true
  }
});

const emit = defineEmits();
const number = ref(0);
const uploadList = ref([]);
const baseUrl = import.meta.env.VITE_APP_BASE_API;
const uploadFileUrl = ref("/common/upload");
const fileList = ref([]);
const fileInputRef = ref(null);

const showTip = computed(
  () => props.isShowTip && (props.fileType || props.fileSize)
);

function toastError(message) {
  toast.add({ title: message, color: "error" });
}

function triggerUpload() {
  fileInputRef.value?.click();
}

function handleFileChange(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;
  
  if (fileList.value.length + files.length > props.limit) {
    handleExceed();
    event.target.value = '';
    return;
  }
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!handleBeforeUpload(file)) continue;
    
    const formData = new FormData();
    formData.append('file', file);

    request({
      url: uploadFileUrl.value,
      method: 'post',
      data: formData,
    }).then(response => {
      handleUploadSuccess(response, file);
    }).catch(err => {
      handleUploadError(err);
    });
  }
  
  event.target.value = '';
}

watch(() => props.modelValue, val => {
  if (val) {
    let temp = 1;
    const list = Array.isArray(val) ? val : String(props.modelValue).split(',').filter(Boolean);
    fileList.value = list.map(item => {
      if (typeof item === "string") {
        item = { name: item, url: item };
      }
      item.uid = item.uid || new Date().getTime() + temp++;
      return item;
    });
  } else {
    fileList.value = [];
    return [];
  }
},{ deep: true, immediate: true });

// 上传前校检格式和大小
function handleBeforeUpload(file) {
  if (props.fileType.length) {
    const fileName = file.name.split('.');
    const fileExt = fileName[fileName.length - 1];
    const isTypeOk = props.fileType.indexOf(fileExt) >= 0;
    if (!isTypeOk) {
      toastError(`文件格式不正确, 请上传${props.fileType.join("/")}格式文件!`);
      return false;
    }
  }
  if (props.fileSize) {
    const isLt = file.size / 1024 / 1024 < props.fileSize;
    if (!isLt) {
      toastError(`上传文件大小不能超过 ${props.fileSize} MB!`);
      return false;
    }
  }
  loadingModal.start("正在上传文件，请稍候...");
  number.value++;
  return true;
}

// 文件个数超出
function handleExceed() {
  toastError(`上传文件数量不能超过 ${props.limit} 个!`);
}

// 上传失败
function handleUploadError(err) {
  number.value--;
  loadingModal.stop();
  toastError("上传文件失败");
}

// 上传成功回调
function handleUploadSuccess(res, file) {
  const data = res?.data || res;
  const fn = data?.fileName || data?.url || data?.fileName || res?.fileName;
  if (res.code === 200 || data?.code === 200 || fn) {
    const url = fn || data?.fileName || data?.url;
    if (url) uploadList.value.push({ name: url, url: url });
    uploadedSuccessfully();
  } else {
    number.value--;
    loadingModal.stop();
    toastError(res.msg);
    uploadedSuccessfully();
  }
}

// 删除文件
function handleDelete(index) {
  fileList.value.splice(index, 1);
  emit("update:modelValue", listToString(fileList.value));
}

// 上传结束处理
function uploadedSuccessfully() {
  if (number.value > 0 && uploadList.value.length === number.value) {
    fileList.value = fileList.value.filter(f => f.url !== undefined).concat(uploadList.value);
    uploadList.value = [];
    number.value = 0;
    emit("update:modelValue", listToString(fileList.value));
    loadingModal.stop();
  }
}

// 获取文件名称
function isImage(url){ if(!url) return false; const ext = String(url).split('.').pop().toLowerCase().split('?')[0]; return ['jpg','jpeg','png','gif','webp','bmp'].includes(ext) }
function getFileName(name) {
  if (!name) return '';
  if (name.lastIndexOf("/") > -1) {
    return name.slice(name.lastIndexOf("/") + 1);
  } else {
    return name;
  }
}

// 对象转成指定字符串分隔
function listToString(list, separator) {
  let strs = "";
  separator = separator || ",";
  for (let i in list) {
    if (list[i].url) {
      strs += list[i].url + separator;
    }
  }
  return strs != '' ? strs.substr(0, strs.length - 1) : '';
}
</script>

<style scoped>
</style>
