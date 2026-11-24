<template>
  <div class="component-upload-image">
    <div class="flex items-center gap-2">
      <UButton color="primary" @click="triggerUpload" :disabled="uploading" size="sm">
        <UIcon name="i-lucide-plus" class="mr-1" />
        选取图片
      </UButton>
      <input ref="fileInputRef" type="file" :multiple="limit !== 1" :accept="acceptType" class="hidden" @change="handleFileSelect" />
    </div>

    <div class="text-sm text-gray-500 mt-1" v-if="showTip">
      请上传
      <template v-if="fileSize">大小不超过 <b class="text-red-500">{{ fileSize }}MB</b></template>
      <template v-if="fileType">格式为 <b class="text-red-500">{{ fileType.join("/") }}</b></template>
      的图片
    </div>

    <!-- 图片列表 -->
    <div class="flex flex-wrap gap-2 mt-2" v-if="displayFiles.length">
      <div v-for="(file, index) in displayFiles" :key="file.uid || index" class="relative group">
        <img :src="file.url" :alt="file.name" class="w-20 h-20 object-cover rounded border border-gray-200 dark:border-gray-700 cursor-pointer"
          @click="handlePictureCardPreview(index)" />
        <UButton variant="solid" color="error" size="2xs" class="absolute -top-1.5 -right-1.5 !p-0 !w-5 !h-5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          @click="handleDelete(index)" icon="i-lucide-x">
        </UButton>
      </div>
    </div>

    <!-- 预览对话框 -->
    <ClientOnly>
      <VueEasyLightbox
        :visible="lightboxVisible"
        :imgs="lightboxImgs"
        :index="lightboxIndex"
        @hide="lightboxVisible = false"
      />
    </ClientOnly>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue"
import request from "@/utils/request"
import { resolveProfileImageUrl } from "@/utils/image-url"
const toast = useToast();
const loadingModal = useTkLoading();

const props = defineProps({
  modelValue: [String, Object, Array],
  // 图片数量限制
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
    default: () => ["png", "jpg", "jpeg"],
  },
  // 是否显示提示
  isShowTip: {
    type: Boolean,
    default: true,
  },
})

const emit = defineEmits()

const fileInputRef = ref(null)
const uploading = ref(false)
const existingFiles = ref([])
const lightboxVisible = ref(false)
const lightboxIndex = ref(0)
const lightboxImgs = computed(() => displayFiles.value.map(f => f.url))

const baseUrl = import.meta.env.VITE_APP_BASE_API || ""

const showTip = computed(() => props.isShowTip && (props.fileType.length || props.fileSize))

const acceptType = computed(() => {
  if (props.fileType.length) {
    return props.fileType.map((ext) => "." + ext).join(",")
  }
  return "image/*"
})

const displayFiles = computed(() => existingFiles.value)

// 从 modelValue 初始化图片列表
function initFiles(val) {
  if (val) {
    const list = Array.isArray(val) ? val : String(val).split(",")
    existingFiles.value = list
      .filter((item) => item && String(item).trim())
      .map((item, i) => {
        if (typeof item === "string") {
          const trimmed = String(item).trim()
          const url = resolveProfileImageUrl(trimmed)
          return { name: trimmed, url, uid: Date.now() + i }
        }
        if (item && item.url) {
          return { ...item, url: resolveProfileImageUrl(item.url), uid: item.uid || Date.now() + i }
        }
        return null
      })
      .filter(Boolean)
  } else {
    existingFiles.value = []
  }
}

watch(
  () => props.modelValue,
  (val) => {
    initFiles(val)
  },
  { deep: true, immediate: true }
)

function triggerUpload() {
  fileInputRef.value?.click()
}

async function handleFileSelect(event) {
  const files = event.target.files
  if (!files || !files.length) return

  const remaining = props.limit - existingFiles.value.length
  if (remaining <= 0) {
    toast.add({ title: `上传图片数量不能超过 ${props.limit} 个`, color: "error" })
    event.target.value = ""
    return
  }

  const toUpload = Array.from(files).slice(0, remaining)
  uploading.value = true

  for (const file of toUpload) {
    // 校验图片类型
    let isImg = false
    if (props.fileType.length) {
      const fileExtension = file.name.split(".").pop()?.toLowerCase() || ""
      isImg = props.fileType.some((t) => t.toLowerCase() === fileExtension || file.type.indexOf(t) > -1)
    } else {
      isImg = file.type.indexOf("image") > -1
    }
    if (!isImg) {
      toast.add({ title: `文件格式不正确, 请上传 ${props.fileType.join("/")} 格式图片!`, color: "error" })
      continue
    }

    // 校验文件大小
    if (props.fileSize) {
      if (file.size / 1024 / 1024 > props.fileSize) {
        toast.add({ title: `上传图片大小不能超过 ${props.fileSize} MB!`, color: "error" })
        continue
      }
    }

    // 上传
    try {
      loadingModal.start("正在上传图片, 请稍候...")
      const formData = new FormData()
      formData.append("file", file)

      const res = await request({
        url: "/common/upload",
        method: "post",
        data: formData,
      })

      if (res.code === 200) {
        const fileName = res.fileName || res.data?.fileName || file.name
        const url = resolveProfileImageUrl(fileName)
        existingFiles.value.push({
          name: fileName,
          url: url,
          uid: Date.now(),
        })
      } else {
        toast.add({ title: res.msg || "上传失败", color: "error" })
      }
    } catch (err) {
      toast.add({ title: "上传图片失败: " + (err.message || "未知错误"), color: "error" })
    } finally {
      loadingModal.stop()
    }
  }

  uploading.value = false
  emit("update:modelValue", listToString(existingFiles.value))
  event.target.value = ""
}

function handleDelete(index) {
  existingFiles.value.splice(index, 1)
  emit("update:modelValue", listToString(existingFiles.value))
}

function handlePictureCardPreview(index) {
  lightboxIndex.value = index
  lightboxVisible.value = true
}

function getFileName(name) {
  if (!name) return ""
  if (name.lastIndexOf("/") > -1) {
    return name.slice(name.lastIndexOf("/") + 1)
  }
  return name
}

function listToString(list, separator) {
  separator = separator || ","
  const items = list
    .map((f) => {
      if (!f || !f.url) return null
      let url = String(f.url)
      if (url.startsWith(baseUrl)) {
        url = url.slice(baseUrl.length)
      }
      if (!url.startsWith("/")) {
        url = "/" + url
      }
      return url
    })
    .filter(Boolean)
  return items.join(separator)
}
</script>

<style scoped>
.hidden {
  display: none;
}
</style>

<style>
.my-custom-preview-content {
  max-width: min(1200px, 95vw) !important;
  width: auto !important;
  min-width: 320px !important;
}
.my-custom-preview-content img {
  max-height: 85vh !important;
  width: auto !important;
}
</style>
