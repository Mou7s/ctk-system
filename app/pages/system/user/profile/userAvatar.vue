<template>
  <div>
    <button type="button" class="group relative block size-20 shrink-0 rounded-full ring-4 ring-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary sm:size-24" aria-label="更换头像" @click="editCropper()">
      <img :src="userStore.avatar" alt="个人头像" class="size-full rounded-full object-cover" />
      <span class="absolute bottom-0 right-0 grid size-7 place-items-center rounded-full border-2 border-default bg-primary text-inverted shadow-sm transition-transform group-hover:scale-110"><UIcon name="i-lucide-camera" class="size-3.5" /></span>
    </button>
    <UModal :title="title" v-model:open="open" :ui="{ content: 'max-w-3xl' }" @after:enter="modalOpened" @after:leave="closeDialog">
      <template #body>
        <div class="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_180px] gap-4" style="min-height: 350px">
          <vue-cropper
            ref="cropper"
            :img="options.img"
            :info="true"
            :autoCrop="options.autoCrop"
            :autoCropWidth="options.autoCropWidth"
            :autoCropHeight="options.autoCropHeight"
            :fixedBox="options.fixedBox"
            :outputType="options.outputType"
            @realTime="realTime"
            v-if="visible"
            style="height: 350px"
          />
          <div class="flex flex-col items-center gap-3">
            <p class="text-xs text-muted">头像预览</p>
            <div class="size-28 overflow-hidden rounded-full border border-default bg-elevated/50">
              <img v-if="options.previews.url" :src="options.previews.url" :style="options.previews.img" class="max-w-none" />
              <div v-else class="grid size-full place-items-center text-xs text-muted">暂无预览</div>
            </div>
            <p class="text-xs text-muted text-center leading-relaxed">圆形为最终<br />显示效果</p>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2 mt-4">
          <input
            ref="avatarInputRef"
            type="file"
            accept="image/*"
            class="hidden"
            @change="handleFileChange"
          />
          <UButton icon="i-lucide-upload" @click="avatarInputRef?.click()">选择图片</UButton>
          <UButton variant="outline" icon="i-lucide-plus" aria-label="放大" @click="changeScale(1)" />
          <UButton variant="outline" icon="i-lucide-minus" aria-label="缩小" @click="changeScale(-1)" />
          <UButton variant="outline" icon="i-lucide-rotate-ccw" aria-label="左旋" @click="rotateLeft()" />
          <UButton variant="outline" icon="i-lucide-rotate-cw" aria-label="右旋" @click="rotateRight()" />
          <div class="ml-auto flex items-center gap-2">
            <UButton color="neutral" variant="outline" @click="open = false">取 消</UButton>
            <UButton color="primary" @click="uploadImg()">提 交</UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup>
import "vue-cropper/dist/index.css";
import { VueCropper } from "vue-cropper";
import { uploadAvatar } from "@/api/system/user";
import useUserStore from "@/store/modules/user";
const toast = useToast();

const userStore = useUserStore();
const { proxy } = getCurrentInstance();

const open = ref(false);
const visible = ref(false);
const title = ref("修改头像");
const avatarInputRef = ref(null);

//图片裁剪数据
const options = reactive({
  img: userStore.avatar,     // 裁剪图片的地址
  autoCrop: true,            // 是否默认生成截图框
  autoCropWidth: 200,        // 默认生成截图框宽度
  autoCropHeight: 200,       // 默认生成截图框高度
  fixedBox: true,            // 固定截图框大小 不允许改变
  outputType: "png",         // 默认生成截图为PNG格式
  filename: 'avatar',        // 文件名称
  previews: {}               //预览数据
});

/** 编辑头像 */
function editCropper() {
  open.value = true;
}

/** 打开弹出层结束时的回调 */
function modalOpened() {
  visible.value = true;
}

/** 选择本地图片（原生 input，不走通用 UFileUpload） */
function handleFileChange(event) {
  const file = event?.target?.files?.[0]
  if (avatarInputRef.value) avatarInputRef.value.value = ''
  if (!file) return
  if (String(file.type || '').indexOf('image/') === -1) {
    toast.add({ title: '文件格式错误，请上传图片类型,如：JPG，PNG后缀的文件。', color: 'error' })
    return
  }
  const reader = new FileReader()
  reader.readAsDataURL(file)
  reader.onload = () => {
    options.img = reader.result
    options.filename = file.name
  }
}

/** 向左旋转 */
function rotateLeft() {
  proxy.$refs.cropper.rotateLeft();
}

/** 向右旋转 */
function rotateRight() {
  proxy.$refs.cropper.rotateRight();
}

/** 图片缩放 */
function changeScale(num) {
  num = num || 1;
  proxy.$refs.cropper.changeScale(num);
}

/** 上传图片 */
function uploadImg() {
  proxy.$refs.cropper.getCropBlob(data => {
    let formData = new FormData();
    formData.append("avatarfile", data, options.filename);
    uploadAvatar(formData).then(response => {
      open.value = false;
      // 后端返回的 imgUrl 已是 /profile/** 可访问路径，不要再拼 base 前缀
      options.img = response.imgUrl;
      userStore.avatar = options.img;
      toast.add({ title: "修改成功", color: "success" });
      visible.value = false;
    });
  });
}

/** 实时预览 */
function realTime(data) {
  options.previews = data;
}

/** 关闭窗口 */
function closeDialog() {
  options.img = userStore.avatar;
  options.visible = false;
}
</script>
