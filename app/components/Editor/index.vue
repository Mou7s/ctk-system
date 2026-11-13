<template>
  <div class="editor">
    <Toolbar
      class="editor-toolbar"
      :editor="editorRef"
      :default-config="toolbarConfig"
      mode="default"
    />
    <Editor
      v-model="content"
      class="editor-content"
      :default-config="editorConfig"
      mode="default"
      :style="styles"
      @on-created="handleCreated"
      @custom-alert="handleCustomAlert"
    />
  </div>
</template>

<script setup>
import { shallowRef } from "vue";
import { Editor, Toolbar } from "@wangeditor/editor-for-vue";
import "@wangeditor/editor/dist/css/style.css";

import request from "@/utils/request";
const toast = useToast();

const { proxy } = getCurrentInstance();

const props = defineProps({
  modelValue: {
    type: String,
  },
  height: {
    type: Number,
    default: null,
  },
  minHeight: {
    type: Number,
    default: null,
  },
  readOnly: {
    type: Boolean,
    default: false,
  },
  fileSize: {
    type: Number,
    default: 5,
  },
  type: {
    type: String,
    default: "url",
  },
});

const emit = defineEmits(["update:modelValue"]);

const editorRef = shallowRef();
const content = ref("");

const toolbarConfig = {
  toolbarKeys: [
    "headerSelect",
    "blockquote",
    "|",
    "bold",
    "underline",
    "italic",
    "through",
    "color",
    "bgColor",
    "clearStyle",
    "|",
    "bulletedList",
    "numberedList",
    "justifyLeft",
    "justifyCenter",
    "justifyRight",
    "|",
    "insertLink",
    "uploadImage",
    "insertVideo",
    "insertTable",
    "codeBlock",
    "|",
    "undo",
    "redo",
  ],
};

const styles = computed(() => {
  const style = {};
  if (props.minHeight) {
    style.minHeight = `${props.minHeight}px`;
  }
  if (props.height) {
    style.height = `${props.height}px`;
  }
  return style;
});

const editorConfig = computed(() => ({
  placeholder: "请输入内容",
  readOnly: props.readOnly,
  MENU_CONF: {
    uploadImage: {
      async customUpload(file, insertFn) {
        if (!validateImage(file)) {
          return;
        }

        if (props.type === "base64") {
          const reader = new FileReader();
          reader.onload = () => {
            insertFn(reader.result, file.name, "");
          };
          reader.readAsDataURL(file);
          return;
        }

        const formData = new FormData();
        formData.append("file", file);
        const res = await request({
          url: "/common/upload",
          method: "post",
          data: formData,
        });
        insertFn(import.meta.env.VITE_APP_BASE_API + res.fileName, file.name, "");
      },
    },
  },
}));

watch(
  () => props.modelValue,
  (value) => {
    const normalizedValue = value === undefined ? "<p></p>" : value;
    if (normalizedValue !== content.value) {
      content.value = normalizedValue;
    }
  },
  { immediate: true }
);

watch(content, (value) => {
  emit("update:modelValue", value);
});

function handleCreated(editor) {
  editorRef.value = editor;
}

function handleCustomAlert(message, type) {
  if (type === "error") {
    toast.add({ title: message, color: "error" });
    return;
  }
  toast.add({ title: message, color: "success" });
}

function validateImage(file) {
  const types = ["image/jpeg", "image/jpg", "image/png", "image/svg+xml"];
  const isAllowedType = types.includes(file.type);
  if (!isAllowedType) {
    toast.add({ title: "图片格式错误", color: "error" });
    return false;
  }

  const isAllowedSize = file.size / 1024 / 1024 < props.fileSize;
  if (!isAllowedSize) {
    toast.add({ title: `上传文件大小不能超过 ${props.fileSize} MB!`, color: "error" });
    return false;
  }

  return true;
}

onBeforeUnmount(() => {
  const editor = editorRef.value;
  if (editor == null) {
    return;
  }
  editor.destroy();
});
</script>

<style>
.editor {
  border: 1px solid var(--app-border);
  z-index: 1;
}

.editor-toolbar {
  border-bottom: 1px solid var(--app-border);
}

.editor-content {
  overflow-y: hidden;
}

.editor-content .w-e-text-container {
  line-height: normal;
  white-space: pre-wrap;
}
</style>
