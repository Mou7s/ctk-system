<template>
  <div
    class="tk-segmented"
    :class="`tk-segmented--${size}`"
    role="group"
    :aria-label="label || undefined"
    :style="{ '--tk-segmented-count': Math.max(items.length, 1) }"
  >
    <span class="tk-segmented__thumb" :style="{ '--i': activeIndex }" aria-hidden="true" />
    <button
      v-for="item in items"
      :key="item.value"
      type="button"
      class="tk-segmented__option"
      :class="{ 'is-active': item.value === modelValue }"
      :aria-pressed="item.value === modelValue"
      :disabled="item.disabled"
      @click="emit('update:modelValue', item.value)"
    >
      <UIcon v-if="item.icon" :name="item.icon" class="tk-segmented__icon" aria-hidden="true" />
      <span class="tk-segmented__label">{{ item.label }}</span>
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: {
    type: [String, Number],
    default: ''
  },
  items: {
    type: Array,
    default: () => []
  },
  /** 无障碍分组名，如「视图」「矩阵行轴」 */
  label: {
    type: String,
    default: ''
  },
  size: {
    type: String,
    default: 'sm'
  }
})

const emit = defineEmits(['update:modelValue'])

const activeIndex = computed(() => Math.max(props.items.findIndex((item) => item.value === props.modelValue), 0))
</script>

<style scoped>
/* 苹果式分段控件：等宽选项 + 滑块走弹簧曲线。
   CSS transition 天然从「当前屏幕值」出发，所以来回点也能从中途折返，不会跳变。 */
.tk-segmented {
  /* damping 0.8 / response 0.3s 编译成的停靠曲线（允许 1.5% 过冲） */
  --tk-segmented-spring: linear(0, 0.0434 3.7%, 0.1402 7.4%, 0.2627 11.1%, 0.3922 14.8%, 0.5165 18.5%, 0.6285 22.2%, 0.7247 25.9%, 0.8041 29.6%, 0.8673 33.3%, 0.9159 37%, 0.9519 40.7%, 0.9774 44.4%, 0.9947 48.1%, 1.0055 51.9%, 1.0115 55.6%, 1.0143 59.3%, 1.015 63%, 1.0143 66.7%, 1.0128 70.4%, 1.0109 74.1%, 1.009 77.8%, 1.0071 81.5%, 1.0054 85.2%, 1.004 88.9%, 1.0028 92.6%, 1.0019 96.3%, 1.0012 100%);
  --tk-segmented-hairline: color-mix(in srgb, var(--app-text) 8%, transparent);

  position: relative;
  display: inline-grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  padding: 2px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--app-text) 6%, var(--app-surface));
  box-shadow: inset 0 0 0 1px var(--tk-segmented-hairline);
}

.tk-segmented__thumb {
  position: absolute;
  top: 2px;
  bottom: 2px;
  left: 2px;
  width: calc((100% - 4px) / var(--tk-segmented-count, 2));
  border-radius: 7px;
  background: var(--app-surface);
  box-shadow: 0 1px 3px var(--app-shadow), 0 0 0 1px var(--tk-segmented-hairline);
  transform: translateX(calc(var(--i, 0) * 100%));
  transition: transform 300ms var(--tk-segmented-spring);
  will-change: transform;
}

.tk-segmented__option {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 4px 12px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  color: var(--app-text-secondary);
  white-space: nowrap;
  cursor: pointer;
  transition: color 180ms ease, transform 120ms ease;
}

.tk-segmented--md .tk-segmented__option {
  padding: 6px 14px;
  font-size: 13px;
}

/* 按下即反馈，不等 click */
.tk-segmented__option:active:not(:disabled) {
  transform: scale(0.96);
}

.tk-segmented__option:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.tk-segmented__option.is-active {
  /* 选中的一项用正文色 + 加粗，而不是蓝色：苹果分段控件里选中是「更实」，不是「变色」 */
  color: var(--app-text);
  font-weight: 600;
}

.tk-segmented__option:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--app-text) 45%, transparent);
  outline-offset: 1px;
}

.tk-segmented__icon {
  font-size: 14px;
}

@media (prefers-reduced-motion: reduce) {
  .tk-segmented__thumb {
    transition: transform 120ms linear;
  }

  .tk-segmented__option:active:not(:disabled) {
    transform: none;
  }
}

@media (prefers-contrast: more) {
  .tk-segmented {
    box-shadow: inset 0 0 0 1px var(--app-text);
  }

  .tk-segmented__thumb {
    box-shadow: 0 0 0 1px var(--app-text);
  }
}
</style>
