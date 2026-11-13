<template>
  <UModal
    :title="title || '系统提示'"
    :description="description"
    :dismissible="dismissible"
    :close="showClose"
    :ui="{ content: 'max-w-md' }"
  >
    <template #body>
      <div class="space-y-4">
        <div class="flex gap-3">
          <UIcon
            v-if="iconName"
            :name="iconName"
            :class="iconClass"
            class="mt-0.5 size-5 shrink-0"
          />
          <p class="whitespace-pre-line text-sm leading-6 text-default">
            {{ message }}
          </p>
        </div>

        <UFormField v-if="needsInput" :error="inputError">
          <UInput
            v-model="inputValue"
            autofocus
            class="w-full"
            :placeholder="inputPlaceholder"
            @keyup.enter="submit"
          />
        </UFormField>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="outline"
          @click="emit('close', false)"
        >
          {{ cancelLabel || "取消" }}
        </UButton>
        <UButton :color="confirmColor" @click="submit">
          {{ confirmLabel || "确定" }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup>
import { ref, computed } from "vue";

const props = defineProps({
  title: {
    type: String,
    default: "系统提示",
  },
  description: {
    type: String,
    default: undefined,
  },
  message: {
    type: String,
    required: true,
  },
  confirmLabel: {
    type: String,
    default: "确定",
  },
  cancelLabel: {
    type: String,
    default: "取消",
  },
  color: {
    type: String,
    default: "primary",
  },
  icon: {
    type: String,
    default: undefined,
  },
  showClose: {
    type: Boolean,
    default: true,
  },
  dismissible: {
    type: Boolean,
    default: true,
  },
  inputPattern: {
    type: RegExp,
    default: undefined,
  },
  inputRequiredText: {
    type: String,
    default: undefined,
  },
  inputPlaceholder: {
    type: String,
    default: "请输入确认内容",
  },
  inputErrorMessage: {
    type: String,
    default: "输入内容不正确",
  },
});

const emit = defineEmits(["close"]);

const inputValue = ref("");
const inputError = ref("");

const needsInput = computed(() =>
  Boolean(props.inputPattern || props.inputRequiredText),
);
const confirmColor = computed(() => props.color || "primary");
const iconName = computed(() => {
  if (props.icon) return props.icon;
  if (props.color === "error") return "i-lucide-circle-x";
  if (props.color === "warning") return "i-lucide-triangle-alert";
  if (props.color === "success") return "i-lucide-circle-check";
  if (props.color === "info") return "i-lucide-info";
  return undefined;
});
const iconClass = computed(() => {
  if (props.color === "error") return "text-error";
  if (props.color === "warning") return "text-warning";
  if (props.color === "success") return "text-success";
  if (props.color === "info") return "text-info";
  return "text-primary";
});

function inputIsValid() {
  if (props.inputPattern) {
    props.inputPattern.lastIndex = 0;
    return props.inputPattern.test(inputValue.value);
  }
  if (props.inputRequiredText) {
    return inputValue.value === props.inputRequiredText;
  }
  return true;
}

function submit() {
  if (needsInput.value && !inputIsValid()) {
    inputError.value = props.inputErrorMessage;
    return;
  }
  inputError.value = "";
  emit("close", true);
}
</script>
