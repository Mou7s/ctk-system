<template>
  <div class="min-w-32">
    <template v-if="readonly">
      <span class="block max-w-56 truncate text-sm text-default" :title="displayValue">{{ displayValue || '-' }}</span>
    </template>
    <USelect
      v-else-if="type === 'select'"
      :model-value="modelValue ?? ''"
      :items="items"
      value-key="value"
      label-key="label"
      size="sm"
      class="h-7 w-full min-w-32"
      :placeholder="placeholder"
      @update:model-value="handleSelect"
    />
    <UPopover v-else-if="type === 'date'" v-model:open="dateOpen">
      <UButton color="neutral" variant="outline" icon="i-lucide-calendar" class="min-w-32 max-w-full justify-start font-normal">
        <span :class="modelValue ? '' : 'text-dimmed'">{{ modelValue || '选择日期' }}</span>
      </UButton>
      <template #content>
        <div class="p-2">
          <div class="flex pb-2">
            <UButton v-if="modelValue" size="xs" color="neutral" variant="ghost" @click="clearEditableDate">清除</UButton>
          </div>
          <UCalendar :default-value="dateStringToCalendar(modelValue)" locale="zh-CN" @update:model-value="handleDatePick" />
        </div>
      </template>
    </UPopover>
    <UTextarea
      v-else-if="type === 'textarea'"
      :model-value="modelValue ?? ''"
      :rows="2"
      size="sm"
      class="min-w-48"
      :placeholder="placeholder"
      @update:model-value="handleTextInput"
      @blur="commit"
    />
    <UInput
      v-else
      :model-value="modelValue ?? ''"
      size="sm"
      class="min-w-32"
      :class="inputClass"
      :placeholder="placeholder"
      @update:model-value="handleTextInput"
      @blur="commit"
      @keydown.enter.prevent="commitAndBlur"
    />
  </div>
</template>

<script setup>
import { calendarToDateString, dateStringToCalendar } from '@/packages/shared/dateRange'

const dateOpen = ref(false)
function handleDatePick(value) {
  const ymd = calendarToDateString(value)
  if (ymd) {
    handleDate(ymd)
    dateOpen.value = false
  }
}
function clearEditableDate() {
  handleDate(null)
  dateOpen.value = false
}

const props = defineProps({
  modelValue: { type: [String, Number], default: null },
  type: { type: String, default: 'text' },
  items: { type: Array, default: () => [] },
  readonly: { type: Boolean, default: false },
  placeholder: { type: String, default: '' },
  inputClass: { type: [String, Array, Object], default: '' },
})

const emit = defineEmits(['update:modelValue', 'commit'])

const displayValue = computed(() => {
  if (props.type === 'select') {
    return props.items.find((item) => item.value === props.modelValue)?.label || props.modelValue || ''
  }
  return String(props.modelValue ?? '')
})

function handleTextInput(value) {
  emit('update:modelValue', value === '' ? null : value)
}

function handleSelect(value) {
  emit('update:modelValue', value === '' ? null : value)
  emit('commit')
}

function handleDate(value) {
  emit('update:modelValue', value || null)
  emit('commit')
}

function commit() {
  emit('commit')
}

function commitAndBlur(event) {
  event.target?.blur?.()
}
</script>
